import type {
  TaskSnapshot,
  TodoStateSnapshot,
  TodoStats,
  TodoWriteDetails,
  TodoWriteParams,
} from "./schema.ts";

export type NormalizeResult =
  | { ok: true; snapshot: TodoStateSnapshot }
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

function normalizeSummary(summary: string | undefined): string | undefined {
  const trimmed = summary?.trim();
  return trimmed ? trimmed : undefined;
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
