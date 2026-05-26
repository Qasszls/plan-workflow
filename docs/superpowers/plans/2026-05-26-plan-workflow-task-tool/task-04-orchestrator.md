# Task 4: Orchestrate single and parallel tasks

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/orchestrator.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/orchestrator.test.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/orchestrator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TaskAgentConfig } from "../../src/task/discovery.ts";
import { executeTaskRequests } from "../../src/task/orchestrator.ts";
import type { TaskRequest, TaskRunResult } from "../../src/task/schema.ts";

function resultFor(request: TaskRequest, status: TaskRunResult["status"], output: string): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent: request.subagent_type ?? "default",
    status,
    finalOutput: output,
    messages: [],
    stderr: status === "failed" ? "failed" : "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    exitCode: status === "completed" ? 0 : 1,
  };
}

const reviewer: TaskAgentConfig = {
  name: "reviewer",
  description: "Review code",
  body: "Review carefully.",
  filePath: "/tmp/reviewer.md",
};

describe("task orchestration", () => {
  it("runs a default task when subagent_type is omitted", async () => {
    const request = { description: "Default review", prompt: "Review this." };
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: [request],
      agents: [],
      runTask: async ({ request }) => resultFor(request, "completed", "done"),
    });

    expect(execution.isError).toBe(false);
    expect(execution.details.results[0].agent).toBe("default");
  });

  it("uses a named agent when subagent_type matches discovery", async () => {
    const request = { description: "Review", prompt: "Review this.", subagent_type: "reviewer" };
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: [request],
      agents: [reviewer],
      runTask: async ({ request, agent, appendSystemPromptPath }) => ({
        ...resultFor(request, "completed", "reviewed"),
        agent: agent?.name ?? "default",
        agentFilePath: agent?.filePath,
        stderr: appendSystemPromptPath ?? "",
      }),
    });

    expect(execution.details.results[0]).toMatchObject({
      agent: "reviewer",
      agentFilePath: "/tmp/reviewer.md",
      finalOutput: "reviewed",
    });
    expect(execution.details.results[0].stderr).toBe("/tmp/reviewer.md");
  });

  it("marks an unknown named agent as failed and continues", async () => {
    const requests = [
      { description: "Missing", prompt: "Do missing.", subagent_type: "missing" },
      { description: "Default", prompt: "Do default." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => resultFor(request, "completed", "done"),
    });

    expect(execution.isError).toBe(true);
    expect(execution.details.results.map((result) => [result.description, result.status])).toEqual([
      ["Missing", "failed"],
      ["Default", "completed"],
    ]);
  });

  it("preserves input order when parallel tasks finish out of order", async () => {
    const requests = [
      { description: "First", prompt: "First." },
      { description: "Second", prompt: "Second." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => {
        if (request.description === "First") await new Promise((resolve) => setTimeout(resolve, 10));
        return resultFor(request, "completed", request.description);
      },
    });

    expect(execution.details.results.map((result) => result.description)).toEqual(["First", "Second"]);
  });

  it("marks the whole execution as error when any child fails", async () => {
    const requests = [
      { description: "Good", prompt: "Good." },
      { description: "Bad", prompt: "Bad." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) =>
        request.description === "Bad" ? resultFor(request, "failed", "bad") : resultFor(request, "completed", "good"),
    });

    expect(execution.isError).toBe(true);
    expect(execution.details.results).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run orchestrator tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/orchestrator.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/orchestrator.ts'
```

- [ ] **Step 3: Implement orchestrator**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/orchestrator.ts`:

```ts
import type { TaskAgentConfig } from "./discovery.ts";
import { runTaskChildProcess, type RunTaskOptions } from "./runner.ts";
import {
  MAX_CONCURRENCY,
  type TaskDetails,
  type TaskRequest,
  type TaskRunResult,
  buildEmptyTaskDetails,
  emptyUsageStats,
  isFailedTaskRunResult,
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

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function unknownAgentResult(request: TaskRequest): TaskRunResult {
  const agent = request.subagent_type ?? "default";
  return {
    description: request.description,
    prompt: request.prompt,
    agent,
    status: "failed",
    finalOutput: "",
    messages: [],
    stderr: `Unknown subagent_type "${agent}"`,
    usage: emptyUsageStats(),
    exitCode: 1,
    errorMessage: `Unknown subagent_type "${agent}"`,
  };
}

export async function executeTaskRequests(options: ExecuteTaskRequestsOptions): Promise<TaskExecution> {
  const runTask = options.runTask ?? runTaskChildProcess;
  const byName = new Map(options.agents.map((agent) => [agent.name, agent]));
  const partialDetails = buildEmptyTaskDetails();

  const results = await mapWithConcurrencyLimit(options.tasks, MAX_CONCURRENCY, async (request, index) => {
    const agent = request.subagent_type ? byName.get(request.subagent_type) : undefined;
    if (request.subagent_type && !agent) {
      const result = unknownAgentResult(request);
      partialDetails.results[index] = result;
      options.onUpdate?.({ version: 1, results: partialDetails.results.filter(Boolean) });
      return result;
    }

    const result = await runTask({
      defaultCwd: options.cwd,
      request,
      agentName: request.subagent_type ?? "default",
      ...(agent ? { agent, appendSystemPromptPath: agent.filePath } : {}),
      signal: options.signal,
      onUpdate: (partial) => {
        partialDetails.results[index] = partial;
        options.onUpdate?.({ version: 1, results: partialDetails.results.filter(Boolean) });
      },
    });
    partialDetails.results[index] = result;
    options.onUpdate?.({ version: 1, results: partialDetails.results.filter(Boolean) });
    return result;
  });

  return {
    details: { version: 1, results },
    isError: results.some(isFailedTaskRunResult),
  };
}
```

- [ ] **Step 4: Run orchestrator tests**

Run:

```bash
npm test -- tests/task/orchestrator.test.ts
```

Expected:

```text
PASS tests/task/orchestrator.test.ts
```

- [ ] **Step 5: Commit orchestrator**

Run:

```bash
git add src/task/orchestrator.ts tests/task/orchestrator.test.ts
git commit -m "feat: orchestrate Task runs"
```
