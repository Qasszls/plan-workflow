# Task 4: Wire Styled Overlay And Tool Output

**Files:**
- Modify: `src/todo/overlay.ts`
- Modify: `src/todo/tool.ts`
- Test: `tests/todo/tool.test.ts`

## Goal

Use the new summary-aware formatter in the runtime overlay, add Pi TUI styling for title and completed rows, and keep the tool result summary compact.

- [ ] **Step 1: Add tool execution test for summary details**

In `tests/todo/tool.test.ts`, replace the existing test file content with:

```ts
import { describe, expect, it } from "vitest";
import { registerTodoWrite } from "../../src/todo/tool.ts";

describe("TodoWrite tool registration", () => {
  it("registers a TodoWrite tool", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const pi = {
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    registerTodoWrite(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools[0].description).toContain("todo");
  });

  it("stores summary in details and updates the overlay widget", async () => {
    const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
    const widgets: Array<{ key: string; content: unknown }> = [];
    const pi = {
      registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    registerTodoWrite(pi as never);

    const result = await tools[0].execute(
      "call-1",
      {
        summary: "早会",
        todos: [
          {
            id: "sync",
            content: "同步昨日工作进展与已完成事项",
            status: "completed",
          },
          {
            id: "focus",
            content: "确认今日重点任务与负责人",
            status: "pending",
          },
        ],
      },
      new AbortController().signal,
      () => {},
      {
        ui: {
          setWidget(key: string, content: unknown) {
            widgets.push({ key, content });
          },
        },
      },
    );

    expect(result).toMatchObject({
      details: {
        summary: "早会",
        stats: { pending: 1, inProgress: 0, completed: 1, deleted: 0 },
      },
    });
    expect(String((result as { content: Array<{ text: string }> }).content[0].text)).toContain(
      "Todos updated: 1/2 completed.",
    );
    expect(widgets).toHaveLength(1);
    expect(widgets[0].key).toBe("plan-workflow-todos");
    expect(typeof widgets[0].content).toBe("function");
  });
});
```

- [ ] **Step 2: Run tool tests and verify failure**

Run:

```bash
rtk npm test -- tests/todo/tool.test.ts
```

Expected: FAIL because tool execution and overlay signatures still do not match the new summary-aware design.

- [ ] **Step 3: Implement styled overlay widget**

In `src/todo/overlay.ts`, replace the file with:

```ts
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { formatTodosForOverlay } from "./render.ts";
import type { TaskSnapshot } from "./schema.ts";
import type { TodoRuntimeState } from "./tool.ts";

const WIDGET_KEY = "plan-workflow-todos";

function formatStyledTodoLine(todo: TaskSnapshot, theme: Theme): string {
  switch (todo.status) {
    case "in_progress":
      return `${theme.fg("accent", "> ")}${todo.content}`;
    case "completed":
      return `${theme.fg("success", "✓ ")}${theme.fg(
        "muted",
        theme.strikethrough(todo.content),
      )}`;
    case "pending":
      return `${theme.fg("muted", "- ")}${todo.content}`;
    case "deleted":
      return "";
  }
}

function renderTodoOverlayComponent(
  summary: string | undefined,
  todos: TaskSnapshot[],
  theme: Theme,
): Container {
  const lines = formatTodosForOverlay(summary, todos);
  const container = new Container();
  if (!lines) return container;

  const visible = todos.filter((todo) => todo.status !== "deleted");
  container.addChild(new Text(theme.fg("warning", theme.bold(lines[0])), 1, 0));
  container.addChild(new Text(theme.fg("muted", lines[1]), 1, 0));

  const maxLines = 12;
  const headerLines = 2;
  const maxTodoLines = maxLines - headerLines;
  const displayedTodos =
    visible.length > maxTodoLines ? visible.slice(0, maxTodoLines - 1) : visible;

  for (const todo of displayedTodos) {
    container.addChild(new Text(formatStyledTodoLine(todo, theme), 1, 0));
  }

  if (visible.length > displayedTodos.length) {
    container.addChild(
      new Text(
        theme.fg("muted", `... ${visible.length - displayedTodos.length} more`),
        1,
        0,
      ),
    );
  }

  return container;
}

export function updateTodoOverlay(
  ctx: ExtensionContext,
  state: TodoRuntimeState,
): void {
  const lines = formatTodosForOverlay(state.summary, state.todos);
  if (!lines) {
    ctx.ui.setWidget(WIDGET_KEY, undefined, {
      placement: "aboveEditor",
    });
    return;
  }

  ctx.ui.setWidget(
    WIDGET_KEY,
    (_tui, theme) => renderTodoOverlayComponent(state.summary, state.todos, theme),
    {
      placement: "aboveEditor",
    },
  );
}
```

This uses `warning` as the dark-gold-compatible theme color. The pure formatter still returns plain strings for tests and non-styled consumers.

- [ ] **Step 4: Remove recent-completed overlay clearing**

In `src/todo/overlay.ts`, delete `clearRecentCompletedAndUpdateOverlay`.

In `src/todo/tool.ts`, remove the import:

```ts
  clearRecentCompletedAndUpdateOverlay,
```

Replace it with:

```ts
  updateTodoOverlay,
```

Delete this event handler from `registerTodoWrite`:

```ts
  pi.on("agent_start", async (_event, ctx) =>
    clearRecentCompletedAndUpdateOverlay(ctx, state),
  );
```

- [ ] **Step 5: Update tool execution summary**

In `src/todo/tool.ts`, update the success result to use the new details call:

```ts
      const details = buildDetails({ summary: state.summary, todos: state.todos });
      return {
        content: [
          { type: "text", text: formatTodoWriteSummary(details.stats, state.todos) },
        ],
        details,
      };
```

Replace `formatTodoWriteSummary` with:

```ts
function formatTodoWriteSummary(
  stats: ReturnType<typeof buildDetails>["stats"],
  todos: TaskSnapshot[],
): string {
  const total = todos.filter((todo) => todo.status !== "deleted").length;
  const lines = [`Todos updated: ${stats.completed}/${total} completed.`];
  const current = todos.filter((todo) => todo.status !== "deleted").slice(0, 8);

  if (current.length > 0) {
    lines.push("Current:");
    for (const todo of current) {
      const marker = todo.status === "completed" ? "✓" : "-";
      lines.push(`${marker} ${todo.content}`);
    }
  }
  return lines.join("\n");
}
```

Check that error details use:

```ts
buildDetails({ summary: state.summary, todos: state.todos }, normalized.error)
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
rtk npm test -- tests/todo/tool.test.ts tests/todo/render.test.ts
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
rtk git add src/todo/overlay.ts src/todo/tool.ts tests/todo/tool.test.ts
rtk git commit -m "feat: wire styled TodoWrite overlay"
```

Expected: commit succeeds.
