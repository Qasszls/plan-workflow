import { describe, expect, it } from "vitest";
import {
  buildDetails,
  normalizeTodoWrite,
  summarizeStats,
} from "../../src/todo/state.ts";

describe("todo state", () => {
  it("normalizes Superpowers-compatible input", () => {
    const result = normalizeTodoWrite({
      todos: [
        {
          id: "a",
          content: "Write tests",
          status: "pending",
          priority: "high",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.todos).toEqual([
      {
        id: "a",
        content: "Write tests",
        status: "pending",
        priority: "high",
        blockedBy: [],
        metadata: {},
      },
    ]);
  });

  it("uses status deleted as the deletion signal", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "Remove old task", status: "deleted" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.todos[0].status).toBe("deleted");
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

  it("normalizes optional summary into the snapshot", () => {
    const result = normalizeTodoWrite({
      summary: "  早会  ",
      todos: [{ id: "a", content: "One", status: "pending" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.summary).toBe("早会");
  });

  it("omits blank summary from the snapshot", () => {
    const result = normalizeTodoWrite({
      summary: "   ",
      todos: [{ id: "a", content: "One", status: "pending" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.summary).toBeUndefined();
  });

  it("ignores raw blockedBy input while normalizing new snapshots", () => {
    const result = normalizeTodoWrite({
      todos: [
        {
          id: "a",
          content: "One",
          status: "pending",
          blockedBy: ["missing"],
        } as never,
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.todos[0].blockedBy).toEqual([]);
  });

  it("rejects non-object metadata", () => {
    const result = normalizeTodoWrite({
      todos: [
        {
          id: "a",
          content: "One",
          status: "pending",
          metadata: [] as unknown as Record<string, unknown>,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: 'Todo "a" metadata must be an object',
    });
  });

  it("computes stats", () => {
    const result = normalizeTodoWrite({
      todos: [
        { id: "a", content: "One", status: "pending" },
        { id: "b", content: "Two", status: "in_progress" },
        { id: "c", content: "Three", status: "completed" },
        { id: "d", content: "Four", status: "deleted" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeStats(result.snapshot.todos)).toEqual({
      pending: 1,
      inProgress: 1,
      completed: 1,
      deleted: 1,
    });
  });

  it("builds replayable details", () => {
    const result = normalizeTodoWrite({
      todos: [{ id: "a", content: "One", status: "pending" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildDetails(result.snapshot)).toEqual({
      version: 1,
      action: "replace",
      todos: result.snapshot.todos,
      stats: { pending: 1, inProgress: 0, completed: 0, deleted: 0 },
    });
  });
});
