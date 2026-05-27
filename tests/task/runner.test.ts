import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  buildPiArgs,
  createInitialTaskRunResult,
  getFinalOutput,
  processPiJsonLine,
  runTaskChildProcess,
  toCompletedStatus,
} from "../../src/task/runner.ts";
import type { TaskRequest } from "../../src/task/schema.ts";

const request: TaskRequest = {
  description: "Review code",
  prompt: "Review the diff.",
  subagent_type: "reviewer",
};

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killedSignals: string[] = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killedSignals.push(String(signal));
    return true;
  }

  writeStdout(text: string): void {
    this.stdout.emit("data", Buffer.from(text));
  }

  writeStderr(text: string): void {
    this.stderr.emit("data", Buffer.from(text));
  }

  close(code: number | null, signal?: NodeJS.Signals): void {
    this.emit("close", code, signal);
  }
}

describe("task runner JSON parsing", () => {
  it("creates an initial task result", () => {
    expect(createInitialTaskRunResult(request, "reviewer", "/tmp/reviewer.md")).toMatchObject({
      description: "Review code",
      prompt: "Review the diff.",
      agent: "reviewer",
      agentFilePath: "/tmp/reviewer.md",
      status: "running",
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
    result.messages.push({ role: "assistant", content: [{ type: "text", text: "Final answer" }] } as never);
    result.finalOutput = "";

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

    expect(result.messages).toHaveLength(2);
    expect(result.usage.turns).toBe(0);
    expect(result.finalOutput).toBe("Final answer");
  });

  it("collects message_end toolResult messages without counting an assistant turn", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    result.messages.push({ role: "assistant", content: [{ type: "text", text: "Final answer" }] } as never);

    processPiJsonLine(
      JSON.stringify({
        type: "message_end",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "tool output" }],
        },
      }),
      result,
    );

    expect(result.messages).toHaveLength(2);
    expect(result.usage.turns).toBe(0);
    expect(result.finalOutput).toBe("Final answer");
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

  it("joins all text blocks from the last assistant message", () => {
    const result = createInitialTaskRunResult(request, "reviewer");
    result.messages.push({
      role: "assistant",
      content: [
        { type: "text", text: "First " },
        { type: "text", text: "Second" },
      ],
    } as never);

    expect(getFinalOutput(result.messages)).toBe("First Second");
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

  it("parses child JSONL output and marks successful child process completed", async () => {
    const child = new FakeChildProcess();
    const updates: string[] = [];
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "reviewer",
      spawnChild: () => child as never,
      onUpdate: (result) => updates.push(result.finalOutput),
    });

    child.writeStdout(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: 0.1 }, totalTokens: 3 },
          stopReason: "end",
        },
      })}\n`,
    );
    child.close(0);

    const result = await execution;
    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.finalOutput).toBe("done");
    expect(updates.at(-1)).toBe("done");
  });

  it("emits running partial updates before child completion", async () => {
    const child = new FakeChildProcess();
    const updates: Array<{ status: string; finalOutput: string }> = [];
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "reviewer",
      spawnChild: () => child as never,
      onUpdate: (result) => updates.push({ status: result.status, finalOutput: result.finalOutput }),
    });

    child.writeStdout(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "working" }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 }, totalTokens: 2 },
          stopReason: "toolUse",
        },
      })}\n`,
    );

    expect(updates).toEqual([{ status: "running", finalOutput: "working" }]);

    child.close(0);
    const result = await execution;
    expect(result.status).toBe("completed");
  });

  it("marks signal-only child exits as failed", async () => {
    const child = new FakeChildProcess();
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      spawnChild: () => child as never,
    });

    child.close(null, "SIGTERM");

    const result = await execution;
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBe("Task process exited from signal SIGTERM");
  });

  it("escalates aborted child processes until they close", async () => {
    vi.useFakeTimers();
    const child = new FakeChildProcess();
    const controller = new AbortController();
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      signal: controller.signal,
      spawnChild: () => child as never,
    });

    controller.abort();
    vi.advanceTimersByTime(5000);
    child.close(null, "SIGKILL");

    const result = await execution;
    expect(child.killedSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(result.status).toBe("aborted");
    expect(result.errorMessage).toBe("Task was aborted");
    vi.useRealTimers();
  });
});
