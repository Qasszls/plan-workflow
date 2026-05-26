# Task 6: Add rendering, overlay, and `/todos`

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/render.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/overlay.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/commands.ts`
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/tool.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/render.test.ts`

**Learn-mode rule for this task:** The agent writes command and overlay wiring, but must leave small human-owned edits in `render.ts`, `overlay.ts`, and `commands.ts`. This task teaches the human-facing side of Pi tools.

- [ ] **Step 1: Write render tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TaskSnapshot } from "../../src/todo/schema.ts";
import { formatTodosForCommand, formatTodosForOverlay } from "../../src/todo/render.ts";

const tasks: TaskSnapshot[] = [
  { id: "a", content: "Implement state", status: "completed", blockedBy: [], metadata: {} },
  { id: "b", content: "Wire overlay", status: "in_progress", blockedBy: [], metadata: {} },
  { id: "c", content: "Add command", status: "pending", blockedBy: ["b"], metadata: {} },
  { id: "d", content: "Old task", status: "deleted", blockedBy: [], metadata: {} },
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
    expect(lines.join("\n")).toContain("Wire overlay");
    expect(lines.join("\n")).toContain("Add command");
    expect(lines.join("\n")).toContain("Implement state");
    expect(lines.join("\n")).not.toContain("Old task");
  });

  it("returns undefined overlay content when nothing is visible", () => {
    expect(formatTodosForOverlay([{ id: "a", content: "Done", status: "completed", blockedBy: [], metadata: {} }], new Set())).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement render helpers with a human-owned overlay function**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/render.ts`:

```ts
import type { TaskSnapshot } from "./schema.ts";

function groupByStatus(todos: TaskSnapshot[]): Record<TaskSnapshot["status"], TaskSnapshot[]> {
  return {
    in_progress: todos.filter((todo) => todo.status === "in_progress"),
    pending: todos.filter((todo) => todo.status === "pending"),
    completed: todos.filter((todo) => todo.status === "completed"),
    deleted: todos.filter((todo) => todo.status === "deleted"),
  };
}

export function formatTodosForCommand(todos: TaskSnapshot[], includeDeleted = false): string {
  const visible = includeDeleted ? todos : todos.filter((todo) => todo.status !== "deleted");
  if (visible.length === 0) return "No todos.";

  const groups = groupByStatus(visible);
  const lines: string[] = [];
  for (const status of ["in_progress", "pending", "completed", "deleted"] as const) {
    const items = groups[status];
    if (items.length === 0) continue;
    lines.push(`${status}:`);
    for (const todo of items) {
      const blocked = todo.blockedBy.length > 0 ? ` (blocked by ${todo.blockedBy.join(", ")})` : "";
      lines.push(`- ${todo.content}${blocked}`);
    }
  }
  return lines.join("\n");
}

export function formatTodosForOverlay(todos: TaskSnapshot[], recentCompletedIds: Set<string>): string[] | undefined {
  // LEARN-MODE: human-owned section.
  // Write the overlay projection:
  // - visible: in_progress, pending, or recent completed
  // - return undefined when no lines should be shown
  // - output "Plan" header
  // - in_progress uses "> ", pending uses "- ", recent completed uses "x "
  // - cap output to 12 lines with a final overflow line
  return undefined;
}
```

- [ ] **Step 3: Learn-mode pause: human implements overlay projection**

Stop and show the human `formatTodosForOverlay` in `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/render.ts`.

Ask the human to replace only the function body with:

```ts
const visible = todos.filter(
  (todo) => todo.status === "in_progress" || todo.status === "pending" || recentCompletedIds.has(todo.id),
);
if (visible.length === 0) return undefined;

const groups = groupByStatus(visible);
const lines = ["Plan"];
for (const todo of groups.in_progress) lines.push(`> ${todo.content}`);
for (const todo of groups.pending) lines.push(`- ${todo.content}`);
for (const todo of groups.completed) lines.push(`x ${todo.content}`);

const maxLines = 12;
if (lines.length <= maxLines) return lines;
return [...lines.slice(0, maxLines - 1), `... ${lines.length - maxLines + 1} more`];
```

Teaching point to explain before they edit:

- `render.ts` is deliberately pure: it knows nothing about Pi APIs.
- Overlay rules are a UX policy over runtime state, not persistence.
- Completed items appear only when `recentCompletedIds` says they are newly completed.

- [ ] **Step 4: Run render tests**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- test/todo/render.test.ts
```

Expected:

```text
PASS test/todo/render.test.ts
```

- [ ] **Step 5: Implement overlay**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/overlay.ts`:

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TodoRuntimeState } from "./tool.ts";
import { formatTodosForOverlay } from "./render.ts";

const WIDGET_KEY = "plan-workflow-todos";

export function updateTodoOverlay(ctx: ExtensionContext, state: TodoRuntimeState): void {
  const lines = formatTodosForOverlay(state.todos, state.recentCompletedIds);
  ctx.ui.setWidget(WIDGET_KEY, lines, {
    // LEARN-MODE: human-owned line.
    // Choose the widget placement used by this tool.
  });
}

export function clearRecentCompletedAndUpdateOverlay(ctx: ExtensionContext, state: TodoRuntimeState): void {
  state.recentCompletedIds.clear();
  updateTodoOverlay(ctx, state);
}
```

- [ ] **Step 6: Learn-mode pause: human sets overlay placement**

After creating `src/todo/overlay.ts`, stop and show the human:

```ts
ctx.ui.setWidget(WIDGET_KEY, lines, {
  // LEARN-MODE: human-owned line.
});
```

Ask the human to replace the comment with:

```ts
placement: "aboveEditor",
```

Teaching point to explain before they edit:

- `setWidget` is TUI rendering, not a hook.
- `lines === undefined` hides the widget.
- The overlay reads runtime state and should never become the storage source.

- [ ] **Step 7: Implement `/todos` command**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/commands.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatTodosForCommand } from "./render.ts";
import type { TodoRuntimeState } from "./tool.ts";

export function registerTodoCommands(pi: ExtensionAPI, state: TodoRuntimeState): void {
  pi.registerCommand("todos", {
    description: "Show current TodoWrite tasks",
    handler: async (args, ctx) => {
      // LEARN-MODE: human-owned line.
      // Parse args so `/todos --all` includes deleted items.
      ctx.ui.notify(formatTodosForCommand(state.todos, includeDeleted), "info");
    },
  });
}
```

- [ ] **Step 8: Learn-mode pause: human parses command args**

After creating `src/todo/commands.ts`, stop and show the human:

```ts
pi.registerCommand("todos", {
  description: "Show current TodoWrite tasks",
  handler: async (args, ctx) => {
    // LEARN-MODE: human-owned line.
    ctx.ui.notify(formatTodosForCommand(state.todos, includeDeleted), "info");
  },
});
```

Ask the human to replace the comment with:

```ts
const includeDeleted = args.split(/\s+/).includes("--all");
```

Teaching point to explain before they edit:

- `registerCommand` creates a human slash command.
- It does not expose a model-callable tool.
- `/todos` is useful for debugging current in-memory state without asking the model to reason.

- [ ] **Step 9: Wire overlay, command, and replay lifecycle**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/tool.ts` to include command, overlay, and replay:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerTodoCommands } from "./commands.ts";
import { updateTodoOverlay, clearRecentCompletedAndUpdateOverlay } from "./overlay.ts";
import { replayTodoStateFromEntries } from "./replay.ts";
import { TodoWriteParamsSchema, type TaskSnapshot, type TodoWriteParams } from "./schema.ts";
import { buildDetails, computeRecentCompletedIds, normalizeTodoWrite } from "./state.ts";

export interface TodoRuntimeState {
  todos: TaskSnapshot[];
  recentCompletedIds: Set<string>;
}

export function createTodoRuntimeState(): TodoRuntimeState {
  return { todos: [], recentCompletedIds: new Set() };
}

export function setTodos(state: TodoRuntimeState, todos: TaskSnapshot[]): void {
  state.todos = todos.map((todo) => ({
    ...todo,
    blockedBy: [...todo.blockedBy],
    metadata: { ...todo.metadata },
  }));
}

function restoreFromBranch(ctx: ExtensionContext, state: TodoRuntimeState): void {
  setTodos(state, replayTodoStateFromEntries(ctx.sessionManager.getBranch()));
  updateTodoOverlay(ctx, state);
}

export function registerTodoWriteTool(pi: ExtensionAPI, state: TodoRuntimeState, updateOverlay: (ctx: ExtensionContext) => void): void {
  pi.registerTool({
    name: "TodoWrite",
    label: "TodoWrite",
    description: "Create, update, or replace the todo list for tracking task progress.",
    promptSnippet: "Track tasks with status (pending, in_progress, completed)",
    promptGuidelines: [
      "Use TodoWrite when starting a multi-step task to track progress.",
      "Update todo status as you work through tasks: mark in_progress when starting, completed when done.",
    ],
    parameters: TodoWriteParamsSchema,
    async execute(_toolCallId, params: TodoWriteParams, _signal, _onUpdate, ctx) {
      const normalized = normalizeTodoWrite(params);
      if (!normalized.ok) {
        const details = buildDetails(state.todos, normalized.error);
        return {
          content: [{ type: "text", text: `TodoWrite error: ${normalized.error}` }],
          isError: true,
          details,
        };
      }

      const newlyCompleted = computeRecentCompletedIds(state.todos, normalized.todos);
      setTodos(state, normalized.todos);
      for (const id of newlyCompleted) state.recentCompletedIds.add(id);
      updateOverlay(ctx);

      const details = buildDetails(state.todos);
      return {
        content: [{ type: "text", text: formatTodoWriteSummary(details.stats, state.todos) }],
        details,
      };
    },
  });
}

function formatTodoWriteSummary(stats: ReturnType<typeof buildDetails>["stats"], todos: TaskSnapshot[]): string {
  const lines = [
    `Todos updated: ${stats.inProgress} in progress, ${stats.pending} pending, ${stats.completed} completed.`,
  ];
  const current = todos.filter((todo) => todo.status === "in_progress" || todo.status === "pending").slice(0, 8);
  if (current.length > 0) {
    lines.push("Current:");
    for (const todo of current) lines.push(`- ${todo.status}: ${todo.content}`);
  }
  return lines.join("\n");
}

export function registerTodoWrite(pi: ExtensionAPI): TodoRuntimeState {
  const state = createTodoRuntimeState();
  registerTodoWriteTool(pi, state, (ctx) => updateTodoOverlay(ctx, state));
  registerTodoCommands(pi, state);

  pi.on("session_start", async (_event, ctx) => restoreFromBranch(ctx, state));
  pi.on("session_tree", async (_event, ctx) => restoreFromBranch(ctx, state));
  pi.on("session_compact", async (_event, ctx) => restoreFromBranch(ctx, state));
  pi.on("agent_start", async (_event, ctx) => clearRecentCompletedAndUpdateOverlay(ctx, state));

  return state;
}
```

- [ ] **Step 10: Run all tests and typecheck**

Run:

```bash
npm run check
```

Expected:

```text
PASS ...
Found 0 errors.
```

- [ ] **Step 11: Commit UI work**

Run:

```bash
git add src/todo/render.ts src/todo/overlay.ts src/todo/commands.ts src/todo/tool.ts test/todo/render.test.ts
git commit -m "feat: add TodoWrite UI"
```
