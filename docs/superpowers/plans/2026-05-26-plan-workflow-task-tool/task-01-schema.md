# Task 1: Define Task schema and result types

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/schema.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_TASKS,
  TaskParamsSchema,
  buildEmptyTaskDetails,
  normalizeTaskParams,
  type TaskDetails,
  type TaskRequest,
  type TaskRunResult,
} from "../../src/task/schema.ts";

describe("task schema", () => {
  it("accepts one task without subagent_type", () => {
    const normalized = normalizeTaskParams({
      tasks: [{ description: "Review code", prompt: "Review the current diff." }],
    });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks).toEqual([
      { description: "Review code", prompt: "Review the current diff." },
    ]);
  });

  it("accepts one task with subagent_type", () => {
    const task: TaskRequest = {
      description: "Review code",
      prompt: "Review the current diff.",
      subagent_type: "code-reviewer",
    };

    const normalized = normalizeTaskParams({ tasks: [task] });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks[0].subagent_type).toBe("code-reviewer");
  });

  it("rejects empty tasks", () => {
    expect(normalizeTaskParams({ tasks: [] })).toEqual({
      ok: false,
      error: "Task requires at least one task request",
    });
  });

  it("rejects more than MAX_TASKS", () => {
    const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, index) => ({
      description: `Task ${index + 1}`,
      prompt: "Do work.",
    }));

    expect(normalizeTaskParams({ tasks })).toEqual({
      ok: false,
      error: `Task accepts at most ${MAX_TASKS} task requests`,
    });
  });

  it("rejects blank description or prompt", () => {
    expect(normalizeTaskParams({ tasks: [{ description: "", prompt: "Do work." }] })).toEqual({
      ok: false,
      error: "Task 1 description must not be blank",
    });
    expect(normalizeTaskParams({ tasks: [{ description: "Do work", prompt: "   " }] })).toEqual({
      ok: false,
      error: "Task 1 prompt must not be blank",
    });
  });

  it("defines replay/debug details shape", () => {
    const result: TaskRunResult = {
      description: "Review code",
      prompt: "Review the current diff.",
      agent: "default",
      status: "completed",
      finalOutput: "Looks good.",
      messages: [],
      stderr: "",
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 3, turns: 1 },
      exitCode: 0,
    };

    const details: TaskDetails = { version: 1, results: [result] };
    expect(details.results[0].finalOutput).toBe("Looks good.");
    expect(buildEmptyTaskDetails()).toEqual({ version: 1, results: [] });
  });

  it("exports a Typebox params schema", () => {
    expect(TaskParamsSchema.type).toBe("object");
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/schema.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/schema.ts'
```

- [ ] **Step 3: Implement schema and normalization**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/schema.ts`:

```ts
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

    tasks.push({
      description,
      prompt,
      ...(normalizeOptionalString(task.subagent_type) ? { subagent_type: normalizeOptionalString(task.subagent_type) } : {}),
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
```

- [ ] **Step 4: Run schema tests**

Run:

```bash
npm test -- tests/task/schema.test.ts
```

Expected:

```text
PASS tests/task/schema.test.ts
```

- [ ] **Step 5: Commit schema**

Run:

```bash
git add src/task/schema.ts tests/task/schema.test.ts
git commit -m "feat: define Task schema"
```
