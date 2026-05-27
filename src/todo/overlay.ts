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
