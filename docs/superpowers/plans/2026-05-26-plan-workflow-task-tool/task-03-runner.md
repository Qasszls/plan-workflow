# Task 3: Parse child Pi JSON streams

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/runner.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/runner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPiArgs,
  createInitialTaskRunResult,
  getFinalOutput,
  processPiJsonLine,
  toCompletedStatus,
} from "../../src/task/runner.ts";
import type { TaskRequest } from "../../src/task/schema.ts";

const request: TaskRequest = {
  description: "Review code",
  prompt: "Review the diff.",
  subagent_type: "reviewer",
};

describe("task runner JSON parsing", () => {
  it("creates an initial task result", () => {
    expect(createInitialTaskRunResult(request, "reviewer", "/tmp/reviewer.md")).toMatchObject({
      description: "Review code",
      prompt: "Review the diff.",
      agent: "reviewer",
      agentFilePath: "/tmp/reviewer.md",
      status: "failed",
      finalOutput: "",
      messages: [],
      stderr: "",
      exitCode: -1,
    });
  });

  it("collects message_end assistant messages and usage", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    processPiJsonLine(
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Final answer" }],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 2,
            cacheWrite: 1,
            cost: { total: 0.01 },
            totalTokens: 17,
          },
          stopReason: "end",
        },
      }),
      result,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.finalOutput).toBe("Final answer");
    expect(result.usage).toEqual({
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      cost: 0.01,
      contextTokens: 17,
      turns: 1,
    });
    expect(result.stopReason).toBe("end");
  });

  it("collects tool_result_end messages without counting an assistant turn", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    processPiJsonLine(
      JSON.stringify({
        type: "tool_result_end",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "tool output" }],
        },
      }),
      result,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.usage.turns).toBe(0);
  });

  it("ignores malformed JSON lines", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    processPiJsonLine("{not json", result);
    expect(result.messages).toEqual([]);
  });

  it("extracts the last assistant text as final output", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    result.messages.push(
      { role: "assistant", content: [{ type: "text", text: "First" }] } as never,
      { role: "assistant", content: [{ type: "text", text: "Second" }] } as never,
    );

    expect(getFinalOutput(result.messages)).toBe("Second");
  });

  it("converts exit codes and abort state to statuses", () => {
    expect(toCompletedStatus(0, false, undefined)).toBe("completed");
    expect(toCompletedStatus(1, false, undefined)).toBe("failed");
    expect(toCompletedStatus(0, true, undefined)).toBe("aborted");
    expect(toCompletedStatus(0, false, "error")).toBe("failed");
  });

  it("passes agent.md path as append system prompt and task prompt as normal -p message", () => {
    const args = buildPiArgs({
      request,
      agent: {
        name: "reviewer",
        description: "Review code",
        body: "Review carefully.",
        model: "test-model",
        tools: ["read", "grep"],
        filePath: "/tmp/reviewer.md",
      },
      appendSystemPromptPath: "/tmp/reviewer.md",
    });

    expect(args).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "test-model",
      "--tools",
      "read,grep",
      "--append-system-prompt",
      "/tmp/reviewer.md",
      "Task: Review the diff.",
    ]);
  });
});
```

- [ ] **Step 2: Run runner tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/runner.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/runner.ts'
```

- [ ] **Step 3: Implement JSON parsing helpers and runner shell**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/runner.ts`:

```ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { TaskAgentConfig } from "./discovery.ts";
import { emptyUsageStats, type TaskRequest, type TaskRunResult, type TaskRunStatus } from "./schema.ts";

export interface RunTaskOptions {
  defaultCwd: string;
  request: TaskRequest;
  agentName: string;
  agent?: TaskAgentConfig;
  appendSystemPromptPath?: string;
  signal?: AbortSignal;
  onUpdate?: (result: TaskRunResult) => void;
}

export interface BuildPiArgsOptions {
  request: TaskRequest;
  agent?: TaskAgentConfig;
  appendSystemPromptPath?: string;
}

export function createInitialTaskRunResult(
  request: TaskRequest,
  agentName: string,
  agentFilePath?: string,
): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent: agentName,
    ...(agentFilePath ? { agentFilePath } : {}),
    status: "failed",
    finalOutput: "",
    messages: [],
    stderr: "",
    usage: emptyUsageStats(),
    exitCode: -1,
  };
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "role" in value && "content" in value;
}

export function getFinalOutput(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

function applyAssistantUsage(message: Message, result: TaskRunResult): void {
  if (message.role !== "assistant") return;
  result.usage.turns += 1;
  const usage = message.usage;
  if (!usage) return;
  result.usage.input += usage.input || 0;
  result.usage.output += usage.output || 0;
  result.usage.cacheRead += usage.cacheRead || 0;
  result.usage.cacheWrite += usage.cacheWrite || 0;
  result.usage.cost += usage.cost?.total || 0;
  result.usage.contextTokens = usage.totalTokens || result.usage.contextTokens;
  if (message.stopReason) result.stopReason = message.stopReason;
  if (message.errorMessage) result.errorMessage = message.errorMessage;
}

export function processPiJsonLine(line: string, result: TaskRunResult): void {
  if (!line.trim()) return;
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  const candidate = event as { type?: unknown; message?: unknown };
  if ((candidate.type === "message_end" || candidate.type === "tool_result_end") && isMessage(candidate.message)) {
    result.messages.push(candidate.message);
    applyAssistantUsage(candidate.message, result);
    result.finalOutput = getFinalOutput(result.messages);
  }
}

export function toCompletedStatus(exitCode: number, wasAborted: boolean, stopReason: string | undefined): TaskRunStatus {
  if (wasAborted || stopReason === "aborted") return "aborted";
  if (exitCode !== 0 || stopReason === "error") return "failed";
  return "completed";
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

export function buildPiArgs(options: BuildPiArgsOptions): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  if (options.agent?.model) args.push("--model", options.agent.model);
  if (options.agent?.tools && options.agent.tools.length > 0) args.push("--tools", options.agent.tools.join(","));
  if (options.appendSystemPromptPath) args.push("--append-system-prompt", options.appendSystemPromptPath);
  args.push(`Task: ${options.request.prompt}`);
  return args;
}

export async function runTaskChildProcess(options: RunTaskOptions): Promise<TaskRunResult> {
  const result = createInitialTaskRunResult(options.request, options.agentName, options.agent?.filePath);
  const args = buildPiArgs(options);
  let wasAborted = false;

  const exitCode = await new Promise<number>((resolve) => {
    const invocation = getPiInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.defaultCwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processPiJsonLine(line, result);
        options.onUpdate?.(result);
      }
    });

    child.stderr.on("data", (chunk) => {
      result.stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (buffer.trim()) processPiJsonLine(buffer, result);
      resolve(code ?? 0);
    });

    child.on("error", (error) => {
      result.errorMessage = error.message;
      resolve(1);
    });

    if (options.signal) {
      const abort = () => {
        wasAborted = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000).unref();
      };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener("abort", abort, { once: true });
    }
  });

  result.exitCode = exitCode;
  result.status = toCompletedStatus(exitCode, wasAborted, result.stopReason);
  if (!result.finalOutput) result.finalOutput = getFinalOutput(result.messages);
  return result;
}
```

- [ ] **Step 4: Run runner tests**

Run:

```bash
npm test -- tests/task/runner.test.ts
```

Expected:

```text
PASS tests/task/runner.test.ts
```

- [ ] **Step 5: Commit runner**

Run:

```bash
git add src/task/runner.ts tests/task/runner.test.ts
git commit -m "feat: parse Task child output"
```
