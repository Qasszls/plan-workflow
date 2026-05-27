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
});
