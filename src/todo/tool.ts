import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { registerTodoCommands } from "./commands.ts";
import {
  clearRecentCompletedAndUpdateOverlay,
  updateTodoOverlay,
} from "./overlay.ts";
import { replayTodoStateFromEntries } from "./replay.ts";
import {
  TodoWriteParamsSchema,
  type TaskSnapshot,
  type TodoStateSnapshot,
  type TodoWriteParams,
} from "./schema.ts";
import {
  buildDetails,
  normalizeTodoWrite,
} from "./state.ts";

export interface TodoRuntimeState {
  summary?: string;
  todos: TaskSnapshot[];
}

export function createTodoRuntimeState(): TodoRuntimeState {
  return { todos: [] };
}

export function setTodoSnapshot(
  state: TodoRuntimeState,
  snapshot: TodoStateSnapshot,
): void {
  state.summary = snapshot.summary;
  state.todos = snapshot.todos.map((todo) => ({
    ...todo,
    blockedBy: [...todo.blockedBy],
    metadata: { ...todo.metadata },
  }));
}

function restoreFromBranch(ctx: ExtensionContext, state: TodoRuntimeState): void {
  setTodoSnapshot(
    state,
    replayTodoStateFromEntries(ctx.sessionManager.getBranch()),
  );
  updateTodoOverlay(ctx, state);
}

export function registerTodoWriteTool(
  pi: ExtensionAPI,
  state: TodoRuntimeState,
  updateOverlay: (ctx: ExtensionContext) => void,
): void {
  pi.registerTool({
    name: "TodoWrite",
    label: "TodoWrite",
    description:
      "Create, update, or replace the todo list for tracking task progress.",
    promptSnippet: "Track tasks with status (pending, in_progress, completed)",
    promptGuidelines: [
      "Use TodoWrite when starting a multi-step task to track progress.",
      "Update todo status as you work through tasks: mark in_progress when starting, completed when done.",
    ],
    parameters: TodoWriteParamsSchema,
    async execute(_toolCallId, params: TodoWriteParams, _signal, _onUpdate, ctx) {
      const normalized = normalizeTodoWrite(params);
      if (!normalized.ok) {
        const details = buildDetails(
          { summary: state.summary, todos: state.todos },
          normalized.error,
        );
        return {
          content: [
            { type: "text", text: `TodoWrite error: ${normalized.error}` },
          ],
          isError: true,
          details,
        };
      }

      setTodoSnapshot(state, normalized.snapshot);
      updateOverlay(ctx);

      const details = buildDetails({ summary: state.summary, todos: state.todos });
      return {
        content: [
          { type: "text", text: formatTodoWriteSummary(details.stats, state.todos) },
        ],
        details,
      };
    },
  });
}

function formatTodoWriteSummary(
  stats: ReturnType<typeof buildDetails>["stats"],
  todos: TaskSnapshot[],
): string {
  const lines = [
    `Todos updated: ${stats.inProgress} in progress, ${stats.pending} pending, ${stats.completed} completed.`,
  ];
  const current = todos
    .filter(
      (todo) => todo.status === "in_progress" || todo.status === "pending",
    )
    .slice(0, 8);

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

  return state;
}
