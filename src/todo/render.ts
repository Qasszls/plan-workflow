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
}
