import { Type, type Static } from "typebox";

export const TodoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);

export const InternalTodoStatusSchema = Type.Union([
  TodoStatusSchema,
  Type.Literal("deleted"),
]);

export const TodoPrioritySchema = Type.Union([
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

export const TodoWriteItemSchema = Type.Object({
  id: Type.String({ description: "Unique identifier for the todo item" }),
  content: Type.String({ description: "The content/description of the todo item" }),
  status: TodoStatusSchema,
  priority: Type.Optional(TodoPrioritySchema),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  deleted: Type.Optional(Type.Boolean()),
});

export const TodoWriteParamsSchema = Type.Object({
  todos: Type.Array(TodoWriteItemSchema),
});

export type TodoStatus = Static<typeof TodoStatusSchema>;
export type InternalTodoStatus = Static<typeof InternalTodoStatusSchema>;
export type TodoPriority = Static<typeof TodoPrioritySchema>;
export type TodoWriteItemInput = Static<typeof TodoWriteItemSchema>;
export type TodoWriteParams = Static<typeof TodoWriteParamsSchema>;

export interface TaskSnapshot {
  id: string;
  content: string;
  status: InternalTodoStatus;
  priority?: TodoPriority;
  blockedBy: string[];
  metadata: Record<string, unknown>;
  updatedAtTurn?: number;
}

export interface TodoStats {
  pending: number;
  inProgress: number;
  completed: number;
  deleted: number;
}

export interface TodoWriteDetails {
  version: 1;
  action: "replace";
  todos: TaskSnapshot[];
  stats: TodoStats;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskSnapshot(value: unknown): value is TaskSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.content !== "string") return false;
  if (!["pending", "in_progress", "completed", "deleted"].includes(String(value.status))) return false;
  if (value.priority !== undefined && !["high", "medium", "low"].includes(String(value.priority))) return false;
  if (!Array.isArray(value.blockedBy) || !value.blockedBy.every((id) => typeof id === "string")) return false;
  if (!isRecord(value.metadata)) return false;
  if (value.updatedAtTurn !== undefined && typeof value.updatedAtTurn !== "number") return false;
  return true;
}

function isTodoStats(value: unknown): value is TodoStats {
  if (!isRecord(value)) return false;
  return (
    typeof value.pending === "number" &&
    typeof value.inProgress === "number" &&
    typeof value.completed === "number" &&
    typeof value.deleted === "number"
  );
}

export function isTodoWriteDetails(value: unknown): value is TodoWriteDetails {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.action !== "replace") return false;
  if (!Array.isArray(value.todos) || !value.todos.every(isTaskSnapshot)) return false;
  if (!isTodoStats(value.stats)) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  return true;
}
