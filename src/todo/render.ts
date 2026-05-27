import type { TaskSnapshot } from "./schema.ts";

export const DEFAULT_TODO_SUMMARY = "Todos";

function groupByStatus(
  todos: TaskSnapshot[],
): Record<TaskSnapshot["status"], TaskSnapshot[]> {
  return {
    in_progress: todos.filter((todo) => todo.status === "in_progress"),
    pending: todos.filter((todo) => todo.status === "pending"),
    completed: todos.filter((todo) => todo.status === "completed"),
    deleted: todos.filter((todo) => todo.status === "deleted"),
  };
}

export function formatTodosForCommand(
  todos: TaskSnapshot[],
  includeDeleted = false,
): string {
  const visible = includeDeleted
    ? todos
    : todos.filter((todo) => todo.status !== "deleted");
  if (visible.length === 0) return "No todos.";

  const groups = groupByStatus(visible);
  const lines: string[] = [];
  for (const status of [
    "in_progress",
    "pending",
    "completed",
    "deleted",
  ] as const) {
    const items = groups[status];
    if (items.length === 0) continue;
    lines.push(`${status}:`);
    for (const todo of items) {
      const blocked =
        todo.blockedBy.length > 0
          ? ` (blocked by ${todo.blockedBy.join(", ")})`
          : "";
      lines.push(`- ${todo.content}${blocked}`);
    }
  }
  return lines.join("\n");
}

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
