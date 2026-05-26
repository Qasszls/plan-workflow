import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTodosForOverlay } from "./render.ts";
import type { TodoRuntimeState } from "./tool.ts";

const WIDGET_KEY = "plan-workflow-todos";

export function updateTodoOverlay(ctx: ExtensionContext, state: TodoRuntimeState): void {
  const lines = formatTodosForOverlay(state.todos, state.recentCompletedIds);
  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
}

export function clearRecentCompletedAndUpdateOverlay(ctx: ExtensionContext, state: TodoRuntimeState): void {
  state.recentCompletedIds.clear();
  updateTodoOverlay(ctx, state);
}
