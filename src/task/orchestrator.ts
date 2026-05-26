import type { TaskAgentConfig } from "./discovery.ts";
import { type RunTaskOptions, runTaskChildProcess } from "./runner.ts";
import {
  emptyUsageStats,
  isFailedTaskRunResult,
  MAX_CONCURRENCY,
  type TaskDetails,
  type TaskRequest,
  type TaskRunResult,
} from "./schema.ts";

export interface TaskExecution {
  details: TaskDetails;
  isError: boolean;
}

export interface ExecuteTaskRequestsOptions {
  cwd: string;
  tasks: TaskRequest[];
  agents: TaskAgentConfig[];
  signal?: AbortSignal;
  onUpdate?: (details: TaskDetails) => void;
  runTask?: (options: RunTaskOptions) => Promise<TaskRunResult>;
}

function createUnknownAgentResult(request: TaskRequest, agentName: string): TaskRunResult {
  const message = `Unknown subagent_type "${agentName}"`;
  return {
    description: request.description,
    prompt: request.prompt,
    agent: agentName,
    status: "failed",
    finalOutput: "",
    messages: [],
    stderr: message,
    usage: emptyUsageStats(),
    exitCode: 1,
    errorMessage: message,
  };
}

function createFailedRunResult(request: TaskRequest, agentName: string, error: unknown): TaskRunResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    description: request.description,
    prompt: request.prompt,
    agent: agentName,
    status: "failed",
    finalOutput: "",
    messages: [],
    stderr: message,
    usage: emptyUsageStats(),
    exitCode: 1,
    errorMessage: message,
  };
}

export async function executeTaskRequests({
  cwd,
  tasks,
  agents,
  signal,
  onUpdate,
  runTask = runTaskChildProcess,
}: ExecuteTaskRequestsOptions): Promise<TaskExecution> {
  const agentsByName = new Map(agents.map((agent) => [agent.name, agent]));
  const results: Array<TaskRunResult | undefined> = new Array(tasks.length);
  let nextIndex = 0;

  const emitUpdate = () => {
    onUpdate?.({ version: 1, results: results.filter((result): result is TaskRunResult => Boolean(result)) });
  };

  const runNext = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      const request = tasks[index];
      const agentName = request.subagent_type ?? "default";
      const agent = request.subagent_type ? agentsByName.get(request.subagent_type) : undefined;

      if (request.subagent_type && !agent) {
        results[index] = createUnknownAgentResult(request, request.subagent_type);
        emitUpdate();
        continue;
      }

      try {
        results[index] = await runTask({
          request,
          agent,
          agentName,
          appendSystemPromptPath: agent?.filePath,
          defaultCwd: cwd,
          signal,
          onUpdate: (result) => {
            results[index] = result;
            emitUpdate();
          },
        });
      } catch (error) {
        results[index] = createFailedRunResult(request, agentName, error);
      }
      emitUpdate();
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, () => runNext()));

  const completedResults = results.filter((result): result is TaskRunResult => Boolean(result));
  return {
    details: { version: 1, results: completedResults },
    isError: completedResults.some(isFailedTaskRunResult),
  };
}
