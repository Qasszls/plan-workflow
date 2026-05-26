import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../src/todo/schema.ts";
import {
  formatTodosForCommand,
  formatTodosForOverlay,
} from "../../src/todo/render.ts";

const tasks: TaskSnapshot[] = [
  {
    id: "a",
    content: "Implement state",
    status: "completed",
    blockedBy: [],
    metadata: {},
  },
  {
    id: "b",
    content: "Wire overlay",
    status: "in_progress",
    blockedBy: [],
    metadata: {},
  },
  {
    id: "c",
    content: "Add command",
    status: "pending",
    blockedBy: ["b"],
    metadata: {},
  },
  {
    id: "d",
    content: "Old task",
    status: "deleted",
    blockedBy: [],
    metadata: {},
  },
];

describe("todo rendering", () => {
  it("formats /todos output without deleted tasks by default", () => {
    expect(formatTodosForCommand(tasks)).toContain("in_progress");
    expect(formatTodosForCommand(tasks)).toContain("Wire overlay");
    expect(formatTodosForCommand(tasks)).toContain("completed");
    expect(formatTodosForCommand(tasks)).not.toContain("Old task");
  });

  it("formats overlay with active and recent completed tasks", () => {
    const lines = formatTodosForOverlay(tasks, new Set(["a"]));
    expect(lines?.join("\n")).toContain("Wire overlay");
    expect(lines?.join("\n")).toContain("Add command");
    expect(lines?.join("\n")).toContain("Implement state");
    expect(lines?.join("\n")).not.toContain("Old task");
  });

  it("returns undefined overlay content when nothing is visible", () => {
    expect(
      formatTodosForOverlay(
        [
          {
            id: "a",
            content: "Done",
            status: "completed",
            blockedBy: [],
            metadata: {},
          },
        ],
        new Set(),
      ),
    ).toBeUndefined();
  });
});
