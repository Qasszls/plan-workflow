import { describe, expect, it } from "vitest";
import type { TodoWriteDetails } from "../../src/todo/schema.ts";
import { replayTodoStateFromEntries } from "../../src/todo/replay.ts";

function todoDetails(id: string, content: string): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
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
    expect(replayTodoStateFromEntries([])).toEqual([]);
  });

  it("uses the latest valid TodoWrite snapshot", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old")),
      toolResult("TodoWrite", todoDetails("b", "New")),
    ]);

    expect(result).toEqual([
      {
        id: "b",
        content: "New",
        status: "pending",
        blockedBy: [],
        metadata: {},
      },
    ]);
  });

  it("ignores invalid details", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old")),
      toolResult("TodoWrite", { version: 2, todos: "bad" }),
    ]);

    expect(result).toEqual([
      {
        id: "a",
        content: "Old",
        status: "pending",
        blockedBy: [],
        metadata: {},
      },
    ]);
  });

  it("ignores other tool results", () => {
    const result = replayTodoStateFromEntries([
      toolResult("OtherTool", todoDetails("a", "Other")),
      toolResult("TodoWrite", todoDetails("b", "Todo")),
    ]);

    expect(result).toEqual([
      {
        id: "b",
        content: "Todo",
        status: "pending",
        blockedBy: [],
        metadata: {},
      },
    ]);
  });

  it("uses branch order as authoritative", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "First")),
      toolResult("TodoWrite", todoDetails("b", "Second")),
    ]);

    expect(result).toEqual([
      {
        id: "b",
        content: "Second",
        status: "pending",
        blockedBy: [],
        metadata: {},
      },
    ]);
  });
});
