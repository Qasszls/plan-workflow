# Task 3: Render Stable Ordered Todos

**Files:**
- Modify: `src/todo/render.ts`
- Test: `tests/todo/render.test.ts`

## Goal

Make the pure overlay formatter preserve input order, keep completed todos visible, use a summary title, and show `completed/total`.

- [ ] **Step 1: Replace render overlay tests with order-focused coverage**

In `tests/todo/render.test.ts`, keep the `/todos` command tests and replace the overlay tests with:

```ts
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
```

Add these tests inside `describe("todo rendering", () => { ... })`:

```ts
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
    expect(formatTodosForOverlay(undefined, morningTodos)?.slice(0, 2)).toEqual([
      "Todos",
      "0/3",
    ]);
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
```

Update the old call sites from:

```ts
formatTodosForOverlay(tasks, new Set(["a"]))
```

to:

```ts
formatTodosForOverlay("Todos", tasks)
```

Remove assertions that completed items appear only when their id is in `recentCompletedIds`.

- [ ] **Step 2: Run render tests and verify failure**

Run:

```bash
rtk npm test -- tests/todo/render.test.ts
```

Expected: FAIL because `formatTodosForOverlay` still accepts `(todos, recentCompletedIds)`, groups by status, and hides completed todos.

- [ ] **Step 3: Implement pure overlay formatting**

In `src/todo/render.ts`, add:

```ts
export const DEFAULT_TODO_SUMMARY = "Todos";
```

Add these helpers below `formatTodosForCommand`:

```ts
function formatOverlayTitle(summary: string | undefined): string {
  const trimmed = summary?.trim();
  return trimmed ? trimmed : DEFAULT_TODO_SUMMARY;
}

function formatOverlayTodo(todo: TaskSnapshot): string {
  switch (todo.status) {
    case "in_progress":
      return `> ${todo.content}`;
    case "completed":
      return `✓ ~~${todo.content}~~`;
    case "pending":
      return `- ${todo.content}`;
    case "deleted":
      return "";
  }
}
```

Replace `formatTodosForOverlay` with:

```ts
export function formatTodosForOverlay(
  summary: string | undefined,
  todos: TaskSnapshot[],
): string[] | undefined {
  const visible = todos.filter((todo) => todo.status !== "deleted");
  if (visible.length === 0) return undefined;

  const completed = visible.filter((todo) => todo.status === "completed").length;
  const lines = [
    formatOverlayTitle(summary),
    `${completed}/${visible.length}`,
    ...visible.map(formatOverlayTodo),
  ];

  const maxLines = 12;
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, maxLines - 1),
    `... ${lines.length - maxLines + 1} more`,
  ];
}
```

Keep `groupByStatus` because `/todos` still uses it.

- [ ] **Step 4: Run render tests and verify pass**

Run:

```bash
rtk npm test -- tests/todo/render.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add src/todo/render.ts tests/todo/render.test.ts
rtk git commit -m "feat: render ordered TodoWrite overlay"
```

Expected: commit succeeds.
