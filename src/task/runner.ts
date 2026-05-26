import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Readable } from "node:stream";
import type { Message } from "@earendil-works/pi-ai";
import type { TaskAgentConfig } from "./discovery.ts";
import {
  emptyUsageStats,
  type TaskRequest,
  type TaskRunResult,
  type TaskRunStatus,
} from "./schema.ts";

export interface BuildPiArgsOptions {
  request: TaskRequest;
  agent?: TaskAgentConfig;
  appendSystemPromptPath?: string;
}

export interface RunTaskOptions {
  request: TaskRequest;
  agent?: TaskAgentConfig;
  agentName?: string;
  appendSystemPromptPath?: string;
  defaultCwd: string;
  cwd?: string;
  signal?: AbortSignal;
  onUpdate?: (result: TaskRunResult) => void;
  spawnChild?: (command: string, args: string[], cwd: string) => TaskChildProcess;
}

type PiInvocation = {
  command: string;
  args: string[];
};

type TaskChildProcess = ChildProcessByStdio<null, Readable, Readable>;

type JsonEvent = {
  type?: unknown;
  message?: unknown;
};

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const role = (value as { role?: unknown }).role;
  const content = (value as { content?: unknown }).content;
  if (role === "user") return Array.isArray(content) || typeof content === "string";
  if (role === "assistant" || role === "toolResult") return Array.isArray(content);
  return false;
}

function getPiInvocation(args: string[]): PiInvocation {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: "pi", args };
}

export function createInitialTaskRunResult(
  request: TaskRequest,
  agent: string,
  agentFilePath?: string,
): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent,
    ...(agentFilePath ? { agentFilePath } : {}),
    status: "failed",
    finalOutput: "",
    messages: [],
    stderr: "",
    usage: emptyUsageStats(),
    exitCode: -1,
  };
}

export function getFinalOutput(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (text) return text;
  }
  return "";
}

export function processPiJsonLine(line: string, result: TaskRunResult): void {
  if (!line.trim()) return;

  let event: JsonEvent;
  try {
    event = JSON.parse(line) as JsonEvent;
  } catch {
    return;
  }

  if ((event.type !== "message_end" && event.type !== "tool_result_end") || !isMessage(event.message)) {
    return;
  }

  result.messages.push(event.message);
  result.finalOutput = getFinalOutput(result.messages);
  if (event.message.role !== "assistant") return;

  result.usage.turns++;
  const usage = event.message.usage;
  if (usage) {
    result.usage.input += usage.input || 0;
    result.usage.output += usage.output || 0;
    result.usage.cacheRead += usage.cacheRead || 0;
    result.usage.cacheWrite += usage.cacheWrite || 0;
    result.usage.cost += usage.cost?.total || 0;
    result.usage.contextTokens = usage.totalTokens || 0;
  }
  if (event.message.stopReason) result.stopReason = event.message.stopReason;
  if (event.message.errorMessage) result.errorMessage = event.message.errorMessage;
}

export function toCompletedStatus(
  exitCode: number,
  wasAborted: boolean,
  stopReason: string | undefined,
): TaskRunStatus {
  if (wasAborted || stopReason === "aborted") return "aborted";
  if (exitCode !== 0 || stopReason === "error") return "failed";
  return "completed";
}

export function buildPiArgs({
  request,
  agent,
  appendSystemPromptPath,
}: BuildPiArgsOptions): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  if (agent?.model) args.push("--model", agent.model);
  if (agent?.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
  if (appendSystemPromptPath) args.push("--append-system-prompt", appendSystemPromptPath);
  args.push(`Task: ${request.prompt}`);
  return args;
}

export async function runTaskChildProcess({
  request,
  agent,
  agentName,
  appendSystemPromptPath,
  defaultCwd,
  cwd,
  signal,
  onUpdate,
  spawnChild = (command, args, childCwd) =>
    spawn(command, args, {
      cwd: childCwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    }),
}: RunTaskOptions): Promise<TaskRunResult> {
  const result = createInitialTaskRunResult(
    request,
    agent?.name ?? agentName ?? request.subagent_type ?? "default",
    agent?.filePath,
  );
  const args = buildPiArgs({ request, agent, appendSystemPromptPath: appendSystemPromptPath ?? agent?.filePath });
  const invocation = getPiInvocation(args);
  let wasAborted = false;
  let childClosed = false;
  let killTimer: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawnChild(invocation.command, invocation.args, cwd ?? defaultCwd);
    let stdoutBuffer = "";

    const processLine = (line: string) => {
      const before = result.messages.length;
      processPiJsonLine(line, result);
      if (result.messages.length > before) onUpdate?.(result);
    };

    const removeAbortListener = () => {
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
      if (killTimer) clearTimeout(killTimer);
    };

    child.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    child.stderr.on("data", (data) => {
      result.stderr += data.toString();
    });

    child.on("close", (code, signalName) => {
      childClosed = true;
      removeAbortListener();
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      if (signalName && !wasAborted && !result.errorMessage) {
        result.errorMessage = `Task process exited from signal ${signalName}`;
      }
      resolve(code ?? (signalName ? 1 : 0));
    });

    child.on("error", (error) => {
      removeAbortListener();
      result.errorMessage = error.message;
      resolve(1);
    });

    abortHandler = () => {
      wasAborted = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!childClosed) child.kill("SIGKILL");
      }, 5000);
    };
    if (signal?.aborted) abortHandler();
    else signal?.addEventListener("abort", abortHandler, { once: true });
  });

  result.exitCode = exitCode;
  result.finalOutput = getFinalOutput(result.messages);
  result.status = toCompletedStatus(exitCode, wasAborted, result.stopReason);
  if (wasAborted && !result.errorMessage) result.errorMessage = "Task was aborted";
  if (result.status === "failed" && !result.errorMessage && result.stderr.trim()) {
    result.errorMessage = result.stderr.trim();
  }
  onUpdate?.(result);

  return result;
}
