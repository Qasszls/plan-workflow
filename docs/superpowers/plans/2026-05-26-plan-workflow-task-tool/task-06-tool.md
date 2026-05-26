# Task 6: Register Task tool and verify integration

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/tool.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/tool.test.ts`
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`

- [ ] **Step 1: Write failing tool registration tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/tool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import planWorkflow from "../../src/index.ts";
import { registerTaskTool } from "../../src/task/tool.ts";
import type { TaskAgentConfig } from "../../src/task/discovery.ts";
import type { TaskRequest, TaskRunResult } from "../../src/task/schema.ts";

function resultFor(request: TaskRequest, agent = request.subagent_type ?? "default"): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent,
    status: "completed",
    finalOutput: "done",
    messages: [],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    exitCode: 0,
  };
}

const reviewer: TaskAgentConfig = {
  name: "reviewer",
  description: "Review code",
  body: "Review carefully.",
  filePath: "/tmp/reviewer.md",
};

describe("Task tool registration", () => {
  it("registers Task from the package entrypoint", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const pi = {
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    planWorkflow(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools.map((tool) => tool.name)).toContain("Task");
  });

  it("executes Task and returns markdown content plus details", async () => {
    const tools: any[] = [];
    const pi = {
      registerTool(tool: unknown) {
        tools.push(tool);
      },
    };

    registerTaskTool(pi as never, {
      discoverAgents: () => ({ agents: [reviewer], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ tasks }) => ({
        isError: false,
        details: { version: 1, results: tasks.map((task) => resultFor(task)) },
      }),
    });

    const tool = tools.find((candidate) => candidate.name === "Task");
    const result = await tool.execute(
      "tool-1",
      { tasks: [{ description: "Review", prompt: "Review this.", subagent_type: "reviewer" }] },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Task results:");
    expect(result.details.results[0]).toMatchObject({ description: "Review", agent: "reviewer" });
  });

  it("returns an error result when params fail normalization", async () => {
    const tools: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool) } as never);

    const result = await tools[0].execute(
      "tool-1",
      { tasks: [] },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Task error: Task requires at least one task request");
    expect(result.details).toEqual({ version: 1, results: [] });
  });

  it("passes partial updates through onUpdate", async () => {
    const tools: any[] = [];
    const updates: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool) } as never, {
      discoverAgents: () => ({ agents: [], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ onUpdate, tasks }) => {
        const details = { version: 1 as const, results: tasks.map((task) => resultFor(task)) };
        onUpdate?.(details);
        return { isError: false, details };
      },
    });

    await tools[0].execute(
      "tool-1",
      { tasks: [{ description: "Default", prompt: "Do it." }] },
      undefined,
      (update: unknown) => updates.push(update),
      { cwd: "/tmp/project" },
    );

    expect(updates[0].content[0].text).toContain("Task results:");
    expect(updates[0].details.results[0].description).toBe("Default");
  });
});
```

- [ ] **Step 2: Run tool tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/tool.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/tool.ts'
```

- [ ] **Step 3: Implement Task tool registration**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/tool.ts`:

```ts
import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TaskAgentConfig, TaskAgentDiscoveryResult } from "./discovery.ts";
import { discoverTaskAgents } from "./discovery.ts";
import { executeTaskRequests, type ExecuteTaskRequestsOptions, type TaskExecution } from "./orchestrator.ts";
import { formatTaskExecutionContent, renderTaskCall, renderTaskResult } from "./render.ts";
import {
  TaskParamsSchema,
  type TaskDetails,
  type TaskParams,
  type TaskRequest,
  buildEmptyTaskDetails,
  normalizeTaskParams,
} from "./schema.ts";

export interface RegisterTaskToolDeps {
  discoverAgents?: (cwd: string) => TaskAgentDiscoveryResult;
  executeTasks?: (options: ExecuteTaskRequestsOptions) => Promise<TaskExecution>;
}

function buildToolResult(details: TaskDetails, isError?: boolean) {
  return {
    content: [{ type: "text" as const, text: formatTaskExecutionContent(details) }],
    ...(isError ? { isError: true } : {}),
    details,
  };
}

export function registerTaskTool(pi: ExtensionAPI, deps: RegisterTaskToolDeps = {}): void {
  const discoverAgents = deps.discoverAgents ?? discoverTaskAgents;
  const executeTasks = deps.executeTasks ?? executeTaskRequests;

  pi.registerTool({
    name: "Task",
    label: "Task",
    description: "Delegate one or more tasks to isolated Pi child agents.",
    promptSnippet: "Delegate tasks to isolated child agents with optional subagent_type",
    promptGuidelines: [
      "Use Task for independent investigation, review, or implementation subtasks that benefit from a fresh context.",
      "Pass tasks as an array. Use subagent_type only when a named project or global agent is required.",
    ],
    parameters: TaskParamsSchema,
    executionMode: "parallel",
    async execute(
      _toolCallId,
      params: TaskParams,
      signal,
      onUpdate: AgentToolUpdateCallback<TaskDetails> | undefined,
      ctx,
    ) {
      const normalized = normalizeTaskParams(params);
      if (!normalized.ok) {
        return {
          content: [{ type: "text" as const, text: `Task error: ${normalized.error}` }],
          isError: true,
          details: buildEmptyTaskDetails(),
        };
      }

      const discovery = discoverAgents(ctx.cwd);
      const execution = await executeTasks({
        cwd: ctx.cwd,
        tasks: normalized.tasks as TaskRequest[],
        agents: discovery.agents as TaskAgentConfig[],
        signal,
        onUpdate: (details) => onUpdate?.(buildToolResult(details)),
      });

      return buildToolResult(execution.details, execution.isError);
    },
    renderCall(args) {
      return renderTaskCall(args);
    },
    renderResult(result, options) {
      const details = result.details ?? buildEmptyTaskDetails();
      return renderTaskResult(details, options.expanded);
    },
  });
}
```

- [ ] **Step 4: Wire package entrypoint**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTaskTool } from "./task/tool.ts";
import { registerTodoWrite } from "./todo/tool.ts";

export default function planWorkflow(pi: ExtensionAPI): void {
  registerTodoWrite(pi);
  registerTaskTool(pi);
}
```

- [ ] **Step 5: Run tool tests**

Run:

```bash
npm test -- tests/task/tool.test.ts
```

Expected:

```text
PASS tests/task/tool.test.ts
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run check
```

Expected:

```text
> plan-workflow@0.1.0 check
> npm run typecheck && npm test

PASS ...
```

- [ ] **Step 7: Commit tool registration**

Run:

```bash
git add src/task/tool.ts tests/task/tool.test.ts src/index.ts
git commit -m "feat: register Task tool"
```
