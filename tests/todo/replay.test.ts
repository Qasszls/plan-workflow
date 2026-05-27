import { describe, expect, it } from "vitest";
import type { TodoWriteDetails } from "../../src/todo/schema.ts";
import { replayTodoStateFromEntries } from "../../src/todo/replay.ts";

function todoDetails(
  id: string,
  content: string,
  summary?: string,
): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
    ...(summary ? { summary } : {}),
    todos: [{ id, content, status: "pending", blockedBy: [], metadata: {} }],
    stats: { pending: 1, inProgress: 0, completed: 0, deleted: 0 },
  };
}

function toolResult(toolName: string, details: unknown) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName,
      details,
    },
  };
}

function morningDetails(
  summary: string,
  statuses: Record<string, "pending" | "completed">,
): TodoWriteDetails {
  const todos = [
    {
      id: "sync",
      content: "同步昨日工作进展与已完成事项",
      status: statuses.sync,
      blockedBy: [],
      metadata: {},
    },
    {
      id: "focus",
      content: "确认今日重点任务与负责人",
      status: statuses.focus,
      blockedBy: [],
      metadata: {},
    },
    {
      id: "blockers",
      content: "识别阻塞问题并约定解决方案/跟进人",
      status: statuses.blockers,
      blockedBy: [],
      metadata: {},
    },
  ] satisfies TodoWriteDetails["todos"];

  return {
    version: 1,
    action: "replace",
    summary,
    todos,
    stats: {
      pending: todos.filter((todo) => todo.status === "pending").length,
      inProgress: 0,
      completed: todos.filter((todo) => todo.status === "completed").length,
      deleted: 0,
    },
  };
}

describe("todo replay", () => {
  it("returns empty state for an empty branch", () => {
    expect(replayTodoStateFromEntries([])).toEqual({ todos: [] });
  });

  it("uses the latest valid TodoWrite snapshot", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old", "旧计划")),
      toolResult("TodoWrite", todoDetails("b", "New", "早会")),
    ]);

    expect(result).toEqual({
      summary: "早会",
      todos: [
        {
          id: "b",
          content: "New",
          status: "pending",
          blockedBy: [],
          metadata: {},
        },
      ],
    });
  });

  it("ignores invalid details", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old", "旧计划")),
      toolResult("TodoWrite", { version: 2, todos: "bad" }),
    ]);

    expect(result).toEqual({
      summary: "旧计划",
      todos: [
        {
          id: "a",
          content: "Old",
          status: "pending",
          blockedBy: [],
          metadata: {},
        },
      ],
    });
  });

  it("ignores other tool results", () => {
    const result = replayTodoStateFromEntries([
      toolResult("OtherTool", todoDetails("a", "Other")),
      toolResult("TodoWrite", todoDetails("b", "Todo")),
    ]);

    expect(result).toEqual({
      todos: [
        {
          id: "b",
          content: "Todo",
          status: "pending",
          blockedBy: [],
          metadata: {},
        },
      ],
    });
  });

  it("uses branch order as authoritative", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "First")),
      toolResult("TodoWrite", todoDetails("b", "Second")),
    ]);

    expect(result).toEqual({
      todos: [
        {
          id: "b",
          content: "Second",
          status: "pending",
          blockedBy: [],
          metadata: {},
        },
      ],
    });
  });

  it("rebuilds the latest morning todo lifecycle snapshot", () => {
    const result = replayTodoStateFromEntries([
      toolResult(
        "TodoWrite",
        morningDetails("早会", {
          sync: "pending",
          focus: "pending",
          blockers: "pending",
        }),
      ),
      toolResult(
        "TodoWrite",
        morningDetails("早会", {
          sync: "completed",
          focus: "pending",
          blockers: "completed",
        }),
      ),
    ]);

    expect(result.summary).toBe("早会");
    expect(result.todos.map((todo) => todo.content)).toEqual([
      "同步昨日工作进展与已完成事项",
      "确认今日重点任务与负责人",
      "识别阻塞问题并约定解决方案/跟进人",
    ]);
    expect(result.todos.map((todo) => todo.status)).toEqual([
      "completed",
      "pending",
      "completed",
    ]);
  });
});
