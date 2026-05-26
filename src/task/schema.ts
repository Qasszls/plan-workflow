import type { Message } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

export const MAX_TASKS = 8;
export const MAX_CONCURRENCY = 4;

export const TaskRequestSchema = Type.Object({
  description: Type.String({ description: "Short label for this delegated task" }),
  prompt: Type.String({ description: "Complete prompt to send to the child Pi agent" }),
  subagent_type: Type.Optional(Type.String({ description: "Optional Pi agent name to run" })),
});

export const TaskParamsSchema = Type.Object({
  tasks: Type.Array(TaskRequestSchema, {
    description: "One or more delegated child-agent tasks",
    minItems: 1,
    maxItems: MAX_TASKS,
  }),
});

export type TaskRequest = Static<typeof TaskRequestSchema>;
export type TaskParams = Static<typeof TaskParamsSchema>;

export type TaskRunStatus = "completed" | "failed" | "aborted";

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface TaskRunResult {
  description: string;
  prompt: string;
  agent: string;
  agentFilePath?: string;
  status: TaskRunStatus;
  finalOutput: string;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
}

export interface TaskDetails {
  version: 1;
  results: TaskRunResult[];
}

export type NormalizeTaskParamsResult =
  | { ok: true; tasks: TaskRequest[] }
  | { ok: false; error: string };

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeTaskParams(params: TaskParams): NormalizeTaskParamsResult {
  if (params.tasks.length === 0) {
    return { ok: false, error: "Task requires at least one task request" };
  }
  if (params.tasks.length > MAX_TASKS) {
    return { ok: false, error: `Task accepts at most ${MAX_TASKS} task requests` };
  }

  const tasks: TaskRequest[] = [];
  for (let index = 0; index < params.tasks.length; index++) {
    const task = params.tasks[index];
    const description = task.description.trim();
    const prompt = task.prompt.trim();
    if (!description) return { ok: false, error: `Task ${index + 1} description must not be blank` };
    if (!prompt) return { ok: false, error: `Task ${index + 1} prompt must not be blank` };
    const subagentType = normalizeOptionalString(task.subagent_type);

    tasks.push({
      description,
      prompt,
      ...(subagentType ? { subagent_type: subagentType } : {}),
    });
  }

  return { ok: true, tasks };
}

export function emptyUsageStats(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

export function buildEmptyTaskDetails(): TaskDetails {
  return { version: 1, results: [] };
}

export function isFailedTaskRunResult(result: TaskRunResult): boolean {
  return result.status !== "completed" || result.exitCode !== 0 || result.stopReason === "error";
}
