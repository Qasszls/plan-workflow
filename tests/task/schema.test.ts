import { describe, expect, it } from "vitest";
import {
  MAX_TASKS,
  TaskParamsSchema,
  buildEmptyTaskDetails,
  isFailedTaskRunResult,
  normalizeTaskParams,
  type TaskDetails,
  type TaskRequest,
  type TaskRunResult,
} from "../../src/task/schema.ts";

describe("task schema", () => {
  it("accepts one task without subagent_type", () => {
    const normalized = normalizeTaskParams({
      tasks: [{ description: "Review code", prompt: "Review the current diff." }],
    });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks).toEqual([
      { description: "Review code", prompt: "Review the current diff." },
    ]);
  });

  it("accepts one task with subagent_type", () => {
    const task: TaskRequest = {
      description: "Review code",
      prompt: "Review the current diff.",
      subagent_type: "code-reviewer",
    };

    const normalized = normalizeTaskParams({ tasks: [task] });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks[0].subagent_type).toBe("code-reviewer");
  });

  it("trims task fields and drops blank subagent_type", () => {
    const normalized = normalizeTaskParams({
      tasks: [
        {
          description: "  Review code  ",
          prompt: "  Review the current diff.  ",
          subagent_type: "  ",
        },
      ],
    });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks).toEqual([
      { description: "Review code", prompt: "Review the current diff." },
    ]);
  });

  it("rejects empty tasks", () => {
    expect(normalizeTaskParams({ tasks: [] })).toEqual({
      ok: false,
      error: "Task requires at least one task request",
    });
  });

  it("rejects more than MAX_TASKS", () => {
    const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, index) => ({
      description: `Task ${index + 1}`,
      prompt: "Do work.",
    }));

    expect(normalizeTaskParams({ tasks })).toEqual({
      ok: false,
      error: `Task accepts at most ${MAX_TASKS} task requests`,
    });
  });

  it("rejects blank description or prompt", () => {
    expect(normalizeTaskParams({ tasks: [{ description: "", prompt: "Do work." }] })).toEqual({
      ok: false,
      error: "Task 1 description must not be blank",
    });
    expect(normalizeTaskParams({ tasks: [{ description: "Do work", prompt: "   " }] })).toEqual({
      ok: false,
      error: "Task 1 prompt must not be blank",
    });
  });

  it("defines replay/debug details shape", () => {
    const result: TaskRunResult = {
      description: "Review code",
      prompt: "Review the current diff.",
      agent: "default",
      status: "completed",
      finalOutput: "Looks good.",
      messages: [],
      stderr: "",
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 3, turns: 1 },
      exitCode: 0,
    };

    const details: TaskDetails = { version: 1, results: [result] };
    expect(details.results[0].finalOutput).toBe("Looks good.");
    expect(buildEmptyTaskDetails()).toEqual({ version: 1, results: [] });
  });

  it("allows running in TaskRunResult details", () => {
    const details: TaskDetails = {
      version: 1,
      results: [
        {
          description: "Review code",
          prompt: "Review the current diff.",
          agent: "default",
          status: "running",
          finalOutput: "",
          messages: [],
          stderr: "",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
          exitCode: -1,
        },
      ],
    };

    expect(details.results[0].status).toBe("running");
  });

  it("does not treat running as a failed final result", () => {
    expect(
      isFailedTaskRunResult({
        description: "Review code",
        prompt: "Review the current diff.",
        agent: "default",
        status: "running",
        finalOutput: "",
        messages: [],
        stderr: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
        exitCode: -1,
      }),
    ).toBe(false);
  });

  it("exports a Typebox params schema", () => {
    expect(TaskParamsSchema.type).toBe("object");
    const tasksSchema = TaskParamsSchema.properties.tasks as { minItems?: number; maxItems?: number };
    expect(tasksSchema.minItems).toBe(1);
    expect(tasksSchema.maxItems).toBe(MAX_TASKS);
  });
});
