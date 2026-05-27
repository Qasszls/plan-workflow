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

const morningTodos: TaskSnapshot[] = [
  {
    id: "sync",
    content: "同步昨日工作进展与已完成事项",
    status: "pending",
    blockedBy: [],
    metadata: {},
  },
  {
    id: "focus",
    content: "确认今日重点任务与负责人",
    status: "pending",
    blockedBy: [],
    metadata: {},
  },
  {
    id: "blockers",
    content: "识别阻塞问题并约定解决方案/跟进人",
    status: "pending",
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

  it("formats overlay with summary, count, and input order", () => {
    expect(formatTodosForOverlay("早会", morningTodos)).toEqual([
      "早会",
      "0/3",
      "- 同步昨日工作进展与已完成事项",
      "- 确认今日重点任务与负责人",
      "- 识别阻塞问题并约定解决方案/跟进人",
    ]);
  });

  it("keeps completed todos visible in their original position", () => {
    const todos = morningTodos.map((todo) =>
      todo.id === "sync" ? { ...todo, status: "completed" as const } : todo,
    );

    expect(formatTodosForOverlay("早会", todos)).toEqual([
      "早会",
      "1/3",
      "✓ ~~同步昨日工作进展与已完成事项~~",
      "- 确认今日重点任务与负责人",
      "- 识别阻塞问题并约定解决方案/跟进人",
    ]);
  });

  it("uses Todos as the fallback summary", () => {
    expect(formatTodosForOverlay(undefined, morningTodos)?.slice(0, 2)).toEqual(
      ["Todos", "0/3"],
    );
  });

  it("ignores deleted todos in overlay count and rows", () => {
    const lines = formatTodosForOverlay("早会", [
      ...morningTodos,
      {
        id: "old",
        content: "旧任务",
        status: "deleted",
        blockedBy: [],
        metadata: {},
      },
    ]);

    expect(lines).not.toContain("- 旧任务");
    expect(lines?.[1]).toBe("0/3");
  });
});
