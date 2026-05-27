import { describe, expect, it } from "vitest";
import {
  isTodoWriteDetails,
  type TaskSnapshot,
  type TodoWriteDetails,
  type TodoWriteItemInput,
  type TodoWriteParams,
} from "../../src/todo/schema.ts";

describe("todo schema", () => {
  it("defines the internal task snapshot shape", () => {
    const task: TaskSnapshot = {
      id: "write-tests",
      content: "Write replay tests",
      status: "pending",
      priority: "high",
      blockedBy: [],
      metadata: {},
    };

    expect(task.id).toBe("write-tests");
    expect(task.status).toBe("pending");
  });

  it("uses status deleted as the deletion signal", () => {
    const input: TodoWriteItemInput = {
      id: "old-task",
      content: "Remove obsolete task",
      status: "deleted",
    };
    const task: TaskSnapshot = {
      ...input,
      blockedBy: [],
      metadata: {},
    };

    expect(task.status).toBe("deleted");
  });

  it("allows TodoWrite params to include an optional summary", () => {
    const params: TodoWriteParams = {
      summary: "早会",
      todos: [
        {
          id: "sync",
          content: "同步昨日工作进展与已完成事项",
          status: "pending",
        },
      ],
    };

    expect(params.summary).toBe("早会");
  });

  it("recognizes details snapshots with summary", () => {
    const details: TodoWriteDetails = {
      version: 1,
      action: "replace",
      summary: "早会",
      todos: [],
      stats: { pending: 0, inProgress: 0, completed: 0, deleted: 0 },
    };

    expect(isTodoWriteDetails(details)).toBe(true);
  });

  it("rejects details snapshots with non-string summary", () => {
    expect(
      isTodoWriteDetails({
        version: 1,
        action: "replace",
        summary: 12,
        todos: [],
        stats: { pending: 0, inProgress: 0, completed: 0, deleted: 0 },
      }),
    ).toBe(false);
  });

  it("recognizes valid TodoWrite details snapshots", () => {
    const details: TodoWriteDetails = {
      version: 1,
      action: "replace",
      todos: [],
      stats: { pending: 0, inProgress: 0, completed: 0, deleted: 0 },
    };

    expect(isTodoWriteDetails(details)).toBe(true);
  });

  it("rejects invalid details snapshots", () => {
    expect(isTodoWriteDetails({ version: 2, todos: [] })).toBe(false);
    expect(isTodoWriteDetails(null)).toBe(false);
    expect(isTodoWriteDetails({ version: 1, action: "replace", todos: "bad" })).toBe(false);
  });
});
