# Task 3: Implement state normalization and validation

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/state.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/state.test.ts`

**Learn-mode rule for this task:** The agent writes the tests and most pure state logic, but must leave one validation function incomplete. The human writes the selected validation rule before the passing test run.

- [ ] **Step 1: Write failing state tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/state.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- test/todo/state.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/todo/state.ts'
```

- [ ] **Step 3: Implement state logic scaffold with one human-owned validation function**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/state.ts`:

```ts
import type { TaskSnapshot, TodoStats, TodoWriteDetails, TodoWriteParams } from "./schema.ts";

export type NormalizeResult = { ok: true; todos: TaskSnapshot[] } | { ok: false; error: string };

function isPlainMetadata(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function summarizeStats(todos: TaskSnapshot[]): TodoStats {
  return {
    pending: todos.filter((todo) => todo.status === "pending").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    completed: todos.filter((todo) => todo.status === "completed").length,
    deleted: todos.filter((todo) => todo.status === "deleted").length,
  };
}

function validateBlockedBy(todos: TaskSnapshot[]): string | undefined {
  // LEARN-MODE: human-owned section.
  // Write 5-10 lines:
  // - collect valid todo ids
  // - check every blockedBy id
  // - return `Todo "${todo.id}" is blocked by unknown todo "${dependencyId}"` on the first bad reference
  // - return undefined when all references are valid
  return undefined;
}

function hasDependencyCycle(todos: TaskSnapshot[]): boolean {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const todo = byId.get(id);
    if (todo) {
      for (const dependencyId of todo.blockedBy) {
        if (visit(dependencyId)) return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return todos.some((todo) => visit(todo.id));
}

export function normalizeTodoWrite(params: TodoWriteParams): NormalizeResult {
  const seen = new Set<string>();
  const todos: TaskSnapshot[] = [];

  for (const item of params.todos) {
    if (seen.has(item.id)) {
      return { ok: false, error: `Duplicate todo id "${item.id}"` };
    }
    seen.add(item.id);

    if (item.metadata !== undefined && !isPlainMetadata(item.metadata)) {
      return { ok: false, error: `Todo "${item.id}" metadata must be an object` };
    }

    todos.push({
      id: item.id,
      content: item.content,
      status: item.deleted ? "deleted" : item.status,
      priority: item.priority,
      blockedBy: item.blockedBy ? [...item.blockedBy] : [],
      metadata: item.metadata ? { ...item.metadata } : {},
    });
  }

  const blockedByError = validateBlockedBy(todos);
  if (blockedByError) return { ok: false, error: blockedByError };
  if (hasDependencyCycle(todos)) return { ok: false, error: "Todo dependencies contain a cycle" };

  return { ok: true, todos };
}

export function computeRecentCompletedIds(previous: TaskSnapshot[], next: TaskSnapshot[]): string[] {
  const previousStatus = new Map(previous.map((todo) => [todo.id, todo.status]));
  return next
    .filter((todo) => todo.status === "completed" && previousStatus.get(todo.id) !== "completed")
    .map((todo) => todo.id);
}

export function buildDetails(todos: TaskSnapshot[], error?: string): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
    todos,
    stats: summarizeStats(todos),
    ...(error ? { error } : {}),
  };
}
```

- [ ] **Step 4: Learn-mode pause: human implements dependency-reference validation**

Stop and show the human this exact function in `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/state.ts`:

```ts
function validateBlockedBy(todos: TaskSnapshot[]): string | undefined {
  // LEARN-MODE: human-owned section.
  return undefined;
}
```

Ask the human to replace only the function body with:

```ts
const ids = new Set(todos.map((todo) => todo.id));
for (const todo of todos) {
  for (const dependencyId of todo.blockedBy) {
    if (!ids.has(dependencyId)) {
      return `Todo "${todo.id}" is blocked by unknown todo "${dependencyId}"`;
    }
  }
}
return undefined;
```

Teaching point to explain before they edit:

- This validation happens before `state.todos` is replaced.
- That means a bad tool call can return `isError: true` without corrupting the last good todo state.
- Future Task/Agent workflow can trust `blockedBy` as a real graph only if this rule exists.

- [ ] **Step 5: Run state tests**

Run:

```bash
npm test -- test/todo/state.test.ts
```

Expected:

```text
PASS test/todo/state.test.ts
```

- [ ] **Step 6: Commit state logic**

Run:

```bash
git add src/todo/state.ts test/todo/state.test.ts
git commit -m "feat: add TodoWrite state validation"
```
