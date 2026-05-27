# Task 1: Add Summary Snapshot Schema

**Files:**
- Modify: `src/todo/schema.ts`
- Modify: `src/todo/state.ts`
- Modify: `src/todo/tool.ts`
- Test: `tests/todo/schema.test.ts`
- Test: `tests/todo/state.test.ts`

## Goal

Add `summary?: string` to TodoWrite input and replayable details, introduce a `TodoStateSnapshot` boundary, and stop public blocked-todo validation from rejecting writes.

- [ ] **Step 1: Write failing schema tests**

In `tests/todo/schema.test.ts`, add `TodoWriteParams` to the import list and add these tests inside `describe("todo schema", () => { ... })`:

```ts
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
```

Update the import block at the top of `tests/todo/schema.test.ts` to include:

```ts
  type TodoWriteParams,
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
rtk npm test -- tests/todo/schema.test.ts
```

Expected: FAIL because `TodoWriteParams` has no `summary` property and `TodoWriteDetails` has no `summary` property.

- [ ] **Step 3: Implement schema changes**

In `src/todo/schema.ts`, replace `TodoWriteItemSchema` and `TodoWriteParamsSchema` with:

```ts
export const TodoWriteItemSchema = Type.Object({
  id: Type.String({ description: "Unique identifier for the todo item" }),
  content: Type.String({
    description: "The content/description of the todo item",
  }),
  status: TodoStatusSchema,
  priority: Type.Optional(TodoPrioritySchema),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const TodoWriteParamsSchema = Type.Object({
  summary: Type.Optional(
    Type.String({
      description: "Short title for the todo group, such as '早会'",
    }),
  ),
  todos: Type.Array(TodoWriteItemSchema),
});
```

In `src/todo/schema.ts`, add this interface after `TaskSnapshot`:

```ts
export interface TodoStateSnapshot {
  summary?: string;
  todos: TaskSnapshot[];
}
```

In `src/todo/schema.ts`, add `summary?: string;` to `TodoWriteDetails`:

```ts
export interface TodoWriteDetails {
  version: 1;
  action: "replace";
  summary?: string;
  todos: TaskSnapshot[];
  stats: TodoStats;
  error?: string;
}
```

In `isTodoWriteDetails`, add the summary validation before the todos validation:

```ts
  if (value.summary !== undefined && typeof value.summary !== "string")
    return false;
```

- [ ] **Step 4: Run schema tests and verify pass**

Run:

```bash
rtk npm test -- tests/todo/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing state tests**

In `tests/todo/state.test.ts`, change successful result assertions to use `result.snapshot.todos` after implementation. Before doing the broad update, add these tests:

```ts
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
```

Replace the current tests named `"rejects missing blockedBy references"` and `"rejects dependency cycles"` with the single `"ignores raw blockedBy input while normalizing new snapshots"` test above.

Update existing successful state test references:

```ts
result.todos
```

to:

```ts
result.snapshot.todos
```

Update existing `buildDetails` assertions to call:

```ts
buildDetails(result.snapshot)
```

instead of:

```ts
buildDetails(result.todos)
```

Update the existing `"detects newly completed ids"` test to call:

```ts
computeRecentCompletedIds(previous.snapshot.todos, next.snapshot.todos)
```

instead of:

```ts
computeRecentCompletedIds(previous.todos, next.todos)
```

- [ ] **Step 6: Run state tests and verify failure**

Run:

```bash
rtk npm test -- tests/todo/state.test.ts
```

Expected: FAIL because `normalizeTodoWrite` still returns `todos`, still validates `blockedBy`, and `buildDetails` still accepts only a todo array.

- [ ] **Step 7: Implement state changes**

In `src/todo/state.ts`, update imports to include `TodoStateSnapshot`:

```ts
import type {
  TaskSnapshot,
  TodoStateSnapshot,
  TodoStats,
  TodoWriteDetails,
  TodoWriteParams,
} from "./schema.ts";
```

Replace `NormalizeResult` with:

```ts
export type NormalizeResult =
  | { ok: true; snapshot: TodoStateSnapshot }
  | { ok: false; error: string };
```

Delete `validateBlockedBy` and `hasDependencyCycle` from `src/todo/state.ts`.

Add this helper above `normalizeTodoWrite`:

```ts
function normalizeSummary(summary: string | undefined): string | undefined {
  const trimmed = summary?.trim();
  return trimmed ? trimmed : undefined;
}
```

In `normalizeTodoWrite`, set every new snapshot todo to `blockedBy: []`, remove the blocked validation block, and return a snapshot:

```ts
export function normalizeTodoWrite(params: TodoWriteParams): NormalizeResult {
  const seen = new Set<string>();
  const todos: TaskSnapshot[] = [];

  for (const item of params.todos) {
    if (seen.has(item.id)) {
      return { ok: false, error: `Duplicate todo id "${item.id}"` };
    }
    seen.add(item.id);

    if (item.metadata !== undefined && !isPlainMetadata(item.metadata)) {
      return {
        ok: false,
        error: `Todo "${item.id}" metadata must be an object`,
      };
    }

    todos.push({
      id: item.id,
      content: item.content,
      status: item.status,
      priority: item.priority,
      blockedBy: [],
      metadata: item.metadata ? { ...item.metadata } : {},
    });
  }

  return {
    ok: true,
    snapshot: {
      summary: normalizeSummary(params.summary),
      todos,
    },
  };
}
```

Replace `buildDetails` with:

```ts
export function buildDetails(
  snapshot: TodoStateSnapshot,
  error?: string,
): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
    ...(snapshot.summary ? { summary: snapshot.summary } : {}),
    todos: snapshot.todos,
    stats: summarizeStats(snapshot.todos),
    ...(error ? { error } : {}),
  };
}
```

The `computeRecentCompletedIds` function itself can remain for now; it will be removed from runtime usage in a later task.

- [ ] **Step 8: Run focused tests and verify pass**

Before running tests, update `src/todo/tool.ts` minimally for the new state API so this commit typechecks.

In the error branch, replace:

```ts
const details = buildDetails(state.todos, normalized.error);
```

with:

```ts
const details = buildDetails({ todos: state.todos }, normalized.error);
```

In the success branch, replace:

```ts
const newlyCompleted = computeRecentCompletedIds(
  state.todos,
  normalized.todos,
);
setTodos(state, normalized.todos);
```

with:

```ts
const newlyCompleted = computeRecentCompletedIds(
  state.todos,
  normalized.snapshot.todos,
);
setTodos(state, normalized.snapshot.todos);
```

Replace:

```ts
const details = buildDetails(state.todos);
```

with:

```ts
const details = buildDetails({
  summary: normalized.snapshot.summary,
  todos: state.todos,
});
```

Run:

```bash
rtk npm test -- tests/todo/schema.test.ts tests/todo/state.test.ts
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
rtk git add src/todo/schema.ts src/todo/state.ts src/todo/tool.ts tests/todo/schema.test.ts tests/todo/state.test.ts
rtk git commit -m "feat: add TodoWrite summary snapshot"
```

Expected: commit succeeds.
