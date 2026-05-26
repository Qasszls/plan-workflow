import type { TaskSnapshot } from "./schema.ts";
import { isTodoWriteDetails } from "./schema.ts";

const TODO_TOOL_NAME = "TodoWrite";

interface MaybeSessionEntry {
  type?: unknown;
  message?: {
    role?: unknown;
    toolName?: unknown;
    details?: unknown;
  };
}

export function replayTodoStateFromEntries(
  entries: readonly unknown[],
): TaskSnapshot[] {
  let latest: TaskSnapshot[] = [];

  for (const entry of entries) {
    const candidate = entry as MaybeSessionEntry;
    if (candidate.type !== "message") continue;

    const message = candidate.message;
    if (
      !message ||
      message.role !== "toolResult" ||
      message.toolName !== TODO_TOOL_NAME
    )
      continue;
    if (!isTodoWriteDetails(message.details)) continue;

    latest = message.details.todos.map((todo) => ({
      ...todo,
      blockedBy: [...todo.blockedBy],
      metadata: { ...todo.metadata },
    }));
  }

  return latest;
}
