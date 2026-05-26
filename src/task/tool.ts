import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { discoverTaskAgents, type TaskAgentDiscoveryResult } from "./discovery.ts";
import {
  executeTaskRequests,
  type ExecuteTaskRequestsOptions,
  type TaskExecution,
} from "./orchestrator.ts";
import {
  formatTaskExecutionContent,
  renderTaskCall,
  renderTaskResult,
} from "./render.ts";
import {
  buildEmptyTaskDetails,
  isFailedTaskRunResult,
  normalizeTaskParams,
  TaskParamsSchema,
  type TaskDetails,
  type TaskParams,
} from "./schema.ts";

type TaskToolResult = AgentToolResult<TaskDetails> & { isError?: true };

export interface RegisterTaskToolDeps {
  discoverAgents?: (cwd: string) => TaskAgentDiscoveryResult;
  executeTasks?: (options: ExecuteTaskRequestsOptions) => Promise<TaskExecution>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTaskDetails(value: unknown): value is TaskDetails {
  return isRecord(value) && value.version === 1 && Array.isArray(value.results);
}

function isFailedTaskDetails(details: TaskDetails): boolean {
  return details.results.some(isFailedTaskRunResult);
}

function isTaskErrorContent(content: AgentToolResult<TaskDetails>["content"]): boolean {
  return content.some((part) => part.type === "text" && part.text.startsWith("Task error:"));
}

function buildTaskResult(details: TaskDetails, isError = isFailedTaskDetails(details)): TaskToolResult {
  return {
    content: [{ type: "text", text: formatTaskExecutionContent(details) }],
    details,
    ...(isError ? { isError: true as const } : {}),
  };
}

export function registerTaskTool(
  pi: ExtensionAPI,
  deps: RegisterTaskToolDeps = {},
): void {
  const discoverAgents = deps.discoverAgents ?? discoverTaskAgents;
  const executeTasks = deps.executeTasks ?? executeTaskRequests;

  pi.on?.("tool_result", (event) => {
    if (event.toolName !== "Task" || !isTaskDetails(event.details)) return undefined;
    return { isError: isFailedTaskDetails(event.details) || isTaskErrorContent(event.content) };
  });

  pi.registerTool({
    name: "Task",
    label: "Task",
    description:
      "Delegate one or more tasks to child Pi agents, optionally selecting a named subagent.",
    promptSnippet: "Delegate focused work to child agents with Task",
    promptGuidelines: [
      "Use Task for independent work that can run in child agents.",
      "Provide each task with a short description and a complete prompt.",
      "Set subagent_type only when a matching project or global agent is available.",
    ],
    parameters: TaskParamsSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: TaskParams, signal, onUpdate, ctx) {
      const normalized = normalizeTaskParams(params);
      if (!normalized.ok) {
        const details = buildEmptyTaskDetails();
        return {
          content: [{ type: "text", text: `Task error: ${normalized.error}` }],
          isError: true,
          details,
        };
      }

      const discovered = discoverAgents(ctx.cwd);
      const execution = await executeTasks({
        cwd: ctx.cwd,
        tasks: normalized.tasks,
        agents: discovered.agents,
        signal,
        onUpdate: (details) => {
          onUpdate?.(buildTaskResult(details));
        },
      });

      return buildTaskResult(execution.details, execution.isError);
    },
    renderCall(args) {
      return renderTaskCall(args);
    },
    renderResult(result, options) {
      const details = result.details as TaskDetails | undefined;
      return renderTaskResult(details ?? buildEmptyTaskDetails(), options.expanded);
    },
  });
}
