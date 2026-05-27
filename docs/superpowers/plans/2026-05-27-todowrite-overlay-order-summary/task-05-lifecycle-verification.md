# Task 5: Add Lifecycle Regression Coverage And Verify

**Files:**
- Modify: `tests/todo/render.test.ts`
- Modify: `tests/todo/replay.test.ts`
- Modify: `src/todo/state.ts`
- Modify: `src/todo/tool.ts`

## Goal

Add the exact requested lifecycle regression, remove unused recent-completion code, and run full verification.

- [ ] **Step 1: Add lifecycle render regression**

In `tests/todo/render.test.ts`, add this helper near `morningTodos`:

```ts
function withStatuses(
  statuses: Record<string, TaskSnapshot["status"]>,
): TaskSnapshot[] {
  return morningTodos.map((todo) => ({
    ...todo,
    status: statuses[todo.id] ?? todo.status,
  }));
}
```

Add this test inside `describe("todo rendering", () => { ... })`:

```ts
  it("covers create, complete first, complete third, rebuild, complete second and restore first", () => {
    const created = formatTodosForOverlay("早会", morningTodos);
    expect(created).toEqual([
      "早会",
      "0/3",
      "- 同步昨日工作进展与已完成事项",
      "- 确认今日重点任务与负责人",
      "- 识别阻塞问题并约定解决方案/跟进人",
    ]);

    const firstCompletedTodos = withStatuses({ sync: "completed" });
    expect(formatTodosForOverlay("早会", firstCompletedTodos)).toEqual([
      "早会",
      "1/3",
      "✓ ~~同步昨日工作进展与已完成事项~~",
      "- 确认今日重点任务与负责人",
      "- 识别阻塞问题并约定解决方案/跟进人",
    ]);

    const thirdCompletedTodos = withStatuses({
      sync: "completed",
      blockers: "completed",
    });
    const rebuilt = formatTodosForOverlay("早会", thirdCompletedTodos);
    expect(rebuilt).toEqual([
      "早会",
      "2/3",
      "✓ ~~同步昨日工作进展与已完成事项~~",
      "- 确认今日重点任务与负责人",
      "✓ ~~识别阻塞问题并约定解决方案/跟进人~~",
    ]);

    const secondCompletedFirstRestored = withStatuses({
      focus: "completed",
      blockers: "completed",
    });
    expect(formatTodosForOverlay("早会", secondCompletedFirstRestored)).toEqual([
      "早会",
      "2/3",
      "- 同步昨日工作进展与已完成事项",
      "✓ ~~确认今日重点任务与负责人~~",
      "✓ ~~识别阻塞问题并约定解决方案/跟进人~~",
    ]);
  });
```

- [ ] **Step 2: Add lifecycle replay regression**

In `tests/todo/replay.test.ts`, add this helper:

```ts
function morningDetails(
  summary: string,
  statuses: Record<string, "pending" | "completed">,
): TodoWriteDetails {
  const todos = [
    {
      id: "sync",
      content: "同步昨日工作进展与已完成事项",
      status: statuses.sync,
      blockedBy: [],
      metadata: {},
    },
    {
      id: "focus",
      content: "确认今日重点任务与负责人",
      status: statuses.focus,
      blockedBy: [],
      metadata: {},
    },
    {
      id: "blockers",
      content: "识别阻塞问题并约定解决方案/跟进人",
      status: statuses.blockers,
      blockedBy: [],
      metadata: {},
    },
  ] satisfies TodoWriteDetails["todos"];

  return {
    version: 1,
    action: "replace",
    summary,
    todos,
    stats: {
      pending: todos.filter((todo) => todo.status === "pending").length,
      inProgress: 0,
      completed: todos.filter((todo) => todo.status === "completed").length,
      deleted: 0,
    },
  };
}
```

Add this test:

```ts
  it("rebuilds the latest morning todo lifecycle snapshot", () => {
    const result = replayTodoStateFromEntries([
      toolResult(
        "TodoWrite",
        morningDetails("早会", {
          sync: "pending",
          focus: "pending",
          blockers: "pending",
        }),
      ),
      toolResult(
        "TodoWrite",
        morningDetails("早会", {
          sync: "completed",
          focus: "pending",
          blockers: "completed",
        }),
      ),
    ]);

    expect(result.summary).toBe("早会");
    expect(result.todos.map((todo) => todo.content)).toEqual([
      "同步昨日工作进展与已完成事项",
      "确认今日重点任务与负责人",
      "识别阻塞问题并约定解决方案/跟进人",
    ]);
    expect(result.todos.map((todo) => todo.status)).toEqual([
      "completed",
      "pending",
      "completed",
    ]);
  });
```

- [ ] **Step 3: Run lifecycle tests and verify pass**

Run:

```bash
rtk npm test -- tests/todo/render.test.ts tests/todo/replay.test.ts
```

Expected: PASS.

- [ ] **Step 4: Remove unused recent-completed state code**

In `src/todo/state.ts`, delete `computeRecentCompletedIds`.

In `tests/todo/state.test.ts`, remove `computeRecentCompletedIds` from the import and delete the `"detects newly completed ids"` test.

In `src/todo/tool.ts`, confirm there are no references to:

```ts
recentCompletedIds
computeRecentCompletedIds
clearRecentCompletedAndUpdateOverlay
```

Run:

```bash
rtk rg -n "recentCompletedIds|computeRecentCompletedIds|clearRecentCompletedAndUpdateOverlay" src tests
```

Expected: no matches.

- [ ] **Step 5: Run full verification**

Run:

```bash
rtk npm run check
```

Expected: typecheck passes and all Vitest tests pass.

- [ ] **Step 6: Review final diff**

Run:

```bash
rtk git diff -- src/todo tests/todo
```

Expected diff characteristics:

- `summary` is optional in params and details.
- New snapshots use `blockedBy: []`.
- Replay returns `{ summary, todos }`.
- Overlay renders in input order.
- Completed todos are always visible.
- Tool output says `Todos updated: <completed>/<total> completed.`

- [ ] **Step 7: Commit**

Run:

```bash
rtk git add src/todo tests/todo
rtk git commit -m "test: cover TodoWrite lifecycle ordering"
```

Expected: commit succeeds.
