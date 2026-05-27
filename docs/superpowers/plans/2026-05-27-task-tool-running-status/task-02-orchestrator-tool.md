# Task 2: Preserve Running Only In Partial Updates

**Files:**
- Modify: `src/task/orchestrator.ts`
- Modify: `src/task/tool.ts`
- Test: `tests/task/orchestrator.test.ts`
- Test: `tests/task/tool.test.ts`

## Goal

Allow `running` in partial updates, forbid it from causing Task runtime errors, and guarantee final Task execution details remain terminal-only.

- [ ] **Step 1: Write failing orchestrator tests**

In `tests/task/orchestrator.test.ts`, add this helper below `resultFor()`:

```ts
function runningResultFor(request: TaskRequest, output = ""): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent: request.subagent_type ?? "default",
    status: "running",
    finalOutput: output,
    messages: [],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    exitCode: -1,
  };
}
```

Then replace the current `"emits partial updates for child progress, unknown agents, and completions"` test with:

```ts
  it("emits running partial updates but returns only terminal final results", async () => {
    const requests = [{ description: "Default", prompt: "Do default." }];
    const updates: TaskDetails[] = [];

    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      onUpdate: (details) => updates.push(details),
      runTask: async ({ request, onUpdate }) => {
        onUpdate?.(runningResultFor(request, "working"));
        return resultFor(request, "completed", "done");
      },
    });

    expect(updates[0].results[0].status).toBe("running");
    expect(updates[0].results[0].finalOutput).toBe("working");
    expect(execution.details.results[0].status).toBe("completed");
    expect(execution.details.results.some((result) => result.status === "running")).toBe(false);
  });
```

- [ ] **Step 2: Run orchestrator tests and verify failure**

Run:

```bash
rtk npm test -- tests/task/orchestrator.test.ts
```

Expected: FAIL because partial `running` results are still treated as final failures or are not represented correctly in the execution flow.

- [ ] **Step 3: Implement orchestrator behavior**

In `src/task/orchestrator.ts`, keep `emitUpdate()` unchanged:

```ts
  const emitUpdate = () => {
    onUpdate?.({ version: 1, results: results.filter((result): result is TaskRunResult => Boolean(result)) });
  };
```

Do not add any filtering to partial updates.

Keep the final result path terminal-only by preserving the existing final assignment pattern:

```ts
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
```

The important implementation rule is behavioral: `runTask()` now returns terminal results, so the final `completedResults` array must not contain `running`. No extra code is needed beyond preserving that contract after Task 1.

- [ ] **Step 4: Run orchestrator tests and verify pass**

Run:

```bash
rtk npm test -- tests/task/orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tool tests**

In `tests/task/tool.test.ts`, add this helper below `failedResultFor()`:

```ts
function runningResultFor(request: TaskRequest): TaskRunResult {
  return {
    ...resultFor(request),
    status: "running",
    finalOutput: "working",
    exitCode: -1,
  };
}
```

Replace `"passes partial updates through onUpdate"` with:

```ts
  it("passes running partial updates through onUpdate without marking them as errors", async () => {
    const tools: any[] = [];
    const updates: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool) } as never, {
      discoverAgents: () => ({ agents: [], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ onUpdate, tasks }) => {
        const runningDetails = { version: 1 as const, results: tasks.map((task) => runningResultFor(task)) };
        const finalDetails = { version: 1 as const, results: tasks.map((task) => resultFor(task)) };
        onUpdate?.(runningDetails);
        return { isError: false, details: finalDetails };
      },
    });

    await tools[0].execute(
      "tool-1",
      { tasks: [{ description: "Default", prompt: "Do it." }] },
      undefined,
      (update: unknown) => updates.push(update),
      { cwd: "/tmp/project" },
    );

    expect(updates[0].details.results[0].status).toBe("running");
    expect(updates[0].isError).toBeUndefined();
  });
```

Add this test before `"promotes Task normalization errors to runtime errors"`:

```ts
  it("does not promote running-only Task tool_result events to runtime errors", async () => {
    const handlers: Record<string, Function[]> = {};
    registerTaskTool({
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = [...(handlers[event] ?? []), handler];
      },
    } as never);

    const result = await handlers.tool_result[0]({
      toolName: "Task",
      content: [{ type: "text", text: "Task results:" }],
      details: {
        version: 1,
        results: [runningResultFor({ description: "Default", prompt: "Do it." })],
      },
    });

    expect(result).toEqual({ isError: false });
  });
```

- [ ] **Step 6: Run tool tests and verify failure**

Run:

```bash
rtk npm test -- tests/task/tool.test.ts
```

Expected: FAIL because `buildTaskResult()` and the `tool_result` hook still classify `running` as failed.

- [ ] **Step 7: Implement tool error-semantics changes**

In `src/task/tool.ts`, keep `isTaskErrorContent()` unchanged and replace `isFailedTaskDetails()` with:

```ts
function isFailedTaskDetails(details: TaskDetails): boolean {
  return details.results.some((result) => result.status !== "running" && isFailedTaskRunResult(result));
}
```

Keep `buildTaskResult()` as:

```ts
function buildTaskResult(details: TaskDetails, isError = isFailedTaskDetails(details)): TaskToolResult {
  return {
    content: [{ type: "text", text: formatTaskExecutionContent(details) }],
    details,
    ...(isError ? { isError: true as const } : {}),
  };
}
```

Keep the `tool_result` hook, but rely on the narrowed failure predicate:

```ts
  pi.on?.("tool_result", (event) => {
    if (event.toolName !== "Task" || !isTaskDetails(event.details)) return undefined;
    return { isError: isFailedTaskDetails(event.details) || isTaskErrorContent(event.content) };
  });
```

- [ ] **Step 8: Run focused tests and verify pass**

Run:

```bash
rtk npm test -- tests/task/orchestrator.test.ts tests/task/tool.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
rtk git add src/task/orchestrator.ts src/task/tool.ts tests/task/orchestrator.test.ts tests/task/tool.test.ts
rtk git commit -m "fix: keep running task updates non-fatal"
```

Expected: commit succeeds with orchestrator/tool lifecycle changes only.
