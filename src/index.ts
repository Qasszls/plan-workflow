import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTaskTool } from "./task/tool.ts";
import { registerTodoWrite } from "./todo/tool.ts";

export default function planWorkflow(pi: ExtensionAPI): void {
  registerTodoWrite(pi);
  registerTaskTool(pi);
}
