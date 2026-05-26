import { describe, expect, it } from "vitest";
import {
  isTodoWriteDetails,
  type TaskSnapshot,
  type TodoWriteDetails,
  type TodoWriteItemInput,
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
