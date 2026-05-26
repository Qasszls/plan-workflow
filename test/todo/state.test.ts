import { describe, expect, it } from "vitest";
import {
  buildDetails,
  computeRecentCompletedIds,
  normalizeTodoWrite,
  summarizeStats,
} from "../../src/todo/state.ts";

describe("todo state", () => {
  it("normalizes Superpowers-compatible input", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "Write tests", status: "pending", priority: "high" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.todos).toEqual([
      { id: "a", content: "Write tests", status: "pending", priority: "high", blockedBy: [], metadata: {} },
    ]);
  });

  it("converts deleted true to deleted status", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "Remove old task", status: "completed", deleted: true }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.todos[0].status).toBe("deleted");
  });

  it("rejects duplicate ids", () => {
    const result = normalizeTodoWrite({
      todos: [
        { id: "a", content: "One", status: "pending" },
        { id: "a", content: "Two", status: "pending" },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'Duplicate todo id "a"' });
  });

  it("rejects missing blockedBy references", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "pending", blockedBy: ["missing"] }],
    });

    expect(result).toEqual({ ok: false, error: 'Todo "a" is blocked by unknown todo "missing"' });
  });

  it("rejects dependency cycles", () => {
    const result = normalizeTodoWrite({
      todos: [
        { id: "a", content: "One", status: "pending", blockedBy: ["b"] },
        { id: "b", content: "Two", status: "pending", blockedBy: ["a"] },
      ],
    });

    expect(result).toEqual({ ok: false, error: "Todo dependencies contain a cycle" });
  });

  it("rejects non-object metadata", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "pending", metadata: [] as unknown as Record<string, unknown> }],
    });

    expect(result).toEqual({ ok: false, error: 'Todo "a" metadata must be an object' });
  });

  it("computes stats", () => {
    const result = normalizeTodoWrite({
      todos: [
        { id: "a", content: "One", status: "pending" },
        { id: "b", content: "Two", status: "in_progress" },
        { id: "c", content: "Three", status: "completed" },
        { id: "d", content: "Four", status: "completed", deleted: true },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeStats(result.todos)).toEqual({ pending: 1, inProgress: 1, completed: 1, deleted: 1 });
  });

  it("detects newly completed ids", () => {
    const previous = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "in_progress" }],
    });
    const next = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "completed" }],
    });

    expect(previous.ok && next.ok ? computeRecentCompletedIds(previous.todos, next.todos) : []).toEqual(["a"]);
  });

  it("builds replayable details", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "pending" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildDetails(result.todos)).toEqual({
      version: 1,
      action: "replace",
      todos: result.todos,
      stats: { pending: 1, inProgress: 0, completed: 0, deleted: 0 },
    });
  });
});
