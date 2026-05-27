# Task 2: Replay Summary State

**Files:**
- Modify: `src/todo/replay.ts`
- Modify: `src/todo/tool.ts`
- Test: `tests/todo/replay.test.ts`

## Goal

Replay TodoWrite details as `{ summary, todos }` and make runtime state store the same snapshot shape.

- [ ] **Step 1: Write failing replay tests**

In `tests/todo/replay.test.ts`, update expectations so `replayTodoStateFromEntries` returns a snapshot object.

Change `todoDetails` to accept optional `summary`:

```ts
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
```

Update `"returns empty state for an empty branch"`:

```ts
  it("returns empty state for an empty branch", () => {
    expect(replayTodoStateFromEntries([])).toEqual({ todos: [] });
  });
```

Update the latest snapshot test:

```ts
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
```

Update invalid and other-tool expectations to object form:

```ts
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
```

For tests without a summary, expect:

```ts
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
```

- [ ] **Step 2: Run replay tests and verify failure**

Run:

```bash
rtk npm test -- tests/todo/replay.test.ts
```

Expected: FAIL because replay currently returns `TaskSnapshot[]`.

- [ ] **Step 3: Implement replay snapshot return**

In `src/todo/replay.ts`, update imports:

```ts
import type { TaskSnapshot, TodoStateSnapshot } from "./schema.ts";
```

Change the function signature and initial state:

```ts
export function replayTodoStateFromEntries(
  entries: readonly unknown[],
): TodoStateSnapshot {
  let latest: TodoStateSnapshot = { todos: [] };
```

Inside the valid details branch, replace the assignment with:

```ts
    const todos: TaskSnapshot[] = message.details.todos.map((todo) => ({
      ...todo,
      blockedBy: [...todo.blockedBy],
      metadata: { ...todo.metadata },
    }));
    latest = {
      ...(message.details.summary ? { summary: message.details.summary } : {}),
      todos,
    };
```

Keep the final return:

```ts
  return latest;
```

- [ ] **Step 4: Run replay tests and verify pass**

Run:

```bash
rtk npm test -- tests/todo/replay.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update runtime state shape**

In `src/todo/tool.ts`, update imports from schema:

```ts
  type TodoStateSnapshot,
```

Change `TodoRuntimeState`:

```ts
export interface TodoRuntimeState {
  summary?: string;
  todos: TaskSnapshot[];
}
```

Change `createTodoRuntimeState`:

```ts
export function createTodoRuntimeState(): TodoRuntimeState {
  return { todos: [] };
}
```

Replace `setTodos` with `setTodoSnapshot`:

```ts
export function setTodoSnapshot(
  state: TodoRuntimeState,
  snapshot: TodoStateSnapshot,
): void {
  state.summary = snapshot.summary;
  state.todos = snapshot.todos.map((todo) => ({
    ...todo,
    blockedBy: [...todo.blockedBy],
    metadata: { ...todo.metadata },
  }));
}
```

Update `restoreFromBranch`:

```ts
function restoreFromBranch(ctx: ExtensionContext, state: TodoRuntimeState): void {
  setTodoSnapshot(state, replayTodoStateFromEntries(ctx.sessionManager.getBranch()));
  updateTodoOverlay(ctx, state);
}
```

Temporarily update execute to use the new normalized shape while leaving render behavior unchanged:

```ts
      const normalized = normalizeTodoWrite(params);
      if (!normalized.ok) {
        const details = buildDetails(
          { summary: state.summary, todos: state.todos },
          normalized.error,
        );
        return {
          content: [
            { type: "text", text: `TodoWrite error: ${normalized.error}` },
          ],
          isError: true,
          details,
        };
      }

      setTodoSnapshot(state, normalized.snapshot);
      updateOverlay(ctx);

      const details = buildDetails({ summary: state.summary, todos: state.todos });
```

Remove `recentCompletedIds` writes from `src/todo/tool.ts`. Remove the `computeRecentCompletedIds` import from `src/todo/tool.ts`.

- [ ] **Step 6: Update overlay call for current signature**

This task has not changed `src/todo/overlay.ts` yet. Make it compile by passing an empty set until Task 3 rewrites rendering:

```ts
const lines = formatTodosForOverlay(state.todos, new Set());
```

This line is temporary and will be replaced in Task 3.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
rtk npm test -- tests/todo/replay.test.ts tests/todo/tool.test.ts
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
rtk git add src/todo/replay.ts src/todo/tool.ts src/todo/overlay.ts tests/todo/replay.test.ts
rtk git commit -m "feat: replay TodoWrite summary state"
```

Expected: commit succeeds.
