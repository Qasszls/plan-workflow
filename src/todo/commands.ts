import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatTodosForCommand } from "./render.ts";
import type { TodoRuntimeState } from "./tool.ts";

export function registerTodoCommands(pi: ExtensionAPI, state: TodoRuntimeState): void {
  pi.registerCommand("todos", {
    description: "Show current TodoWrite tasks",
    handler: async (args, ctx) => {
      const includeDeleted = args.split(/\s+/).includes("--all");
      ctx.ui.notify(formatTodosForCommand(state.todos, includeDeleted), "info");
    },
  });
}
