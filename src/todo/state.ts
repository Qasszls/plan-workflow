import type {
  TaskSnapshot,
  TodoStats,
  TodoWriteDetails,
  TodoWriteParams,
} from "./schema.ts";

export type NormalizeResult =
  | { ok: true; todos: TaskSnapshot[] }
  | { ok: false; error: string };

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
  const ids = new Set(todos.map((item) => item.id));

  for (const todo of todos) {
    for (const dependencyId of todo.blockedBy) {
      if (!ids.has(dependencyId)) {
        return `Todo "${todo.id}" is blocked by unknown todo "${dependencyId}"`;
      }
    }
  }
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
      blockedBy: item.blockedBy ? [...item.blockedBy] : [],
      metadata: item.metadata ? { ...item.metadata } : {},
    });
  }

  const blockedByError = validateBlockedBy(todos);
  if (blockedByError) return { ok: false, error: blockedByError };
  if (hasDependencyCycle(todos)) {
    return { ok: false, error: "Todo dependencies contain a cycle" };
  }

  return { ok: true, todos };
}

export function computeRecentCompletedIds(
  previous: TaskSnapshot[],
  next: TaskSnapshot[],
): string[] {
  const previousStatus = new Map(
    previous.map((todo) => [todo.id, todo.status]),
  );
  return next
    .filter(
      (todo) =>
        todo.status === "completed" &&
        previousStatus.get(todo.id) !== "completed",
    )
    .map((todo) => todo.id);
}

export function buildDetails(
  todos: TaskSnapshot[],
  error?: string,
): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
    todos,
    stats: summarizeStats(todos),
    ...(error ? { error } : {}),
  };
}
