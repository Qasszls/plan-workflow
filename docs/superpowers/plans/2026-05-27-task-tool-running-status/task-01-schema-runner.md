# Task 1: Add Running Status To Shared Contracts

**Files:**
- Modify: `src/task/schema.ts`
- Modify: `src/task/runner.ts`
- Test: `tests/task/schema.test.ts`
- Test: `tests/task/runner.test.ts`

## Goal

Extend the shared Task status vocabulary with `running`, make the runner initialize child tasks as `running`, and keep final status conversion terminal-only.

- [ ] **Step 1: Write failing schema tests**

In `tests/task/schema.test.ts`, add `isFailedTaskRunResult` to the import block and append these tests inside `describe("task schema", () => { ... })`:

```ts
  it("allows running in TaskRunResult details", () => {
    const details: TaskDetails = {
      version: 1,
      results: [
        {
          description: "Review code",
          prompt: "Review the current diff.",
          agent: "default",
          status: "running",
          finalOutput: "",
          messages: [],
          stderr: "",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
          exitCode: -1,
        },
      ],
    };

    expect(details.results[0].status).toBe("running");
  });

  it("does not treat running as a failed final result", () => {
    expect(
      isFailedTaskRunResult({
        description: "Review code",
        prompt: "Review the current diff.",
        agent: "default",
        status: "running",
        finalOutput: "",
        messages: [],
        stderr: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
        exitCode: -1,
      }),
    ).toBe(false);
  });
```

Update the import list to include:

```ts
  isFailedTaskRunResult,
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
rtk npm test -- tests/task/schema.test.ts
```

Expected: FAIL because `TaskRunStatus` does not include `running` and `isFailedTaskRunResult()` currently treats every non-`completed` status as failed.

- [ ] **Step 3: Implement schema changes**

In `src/task/schema.ts`, change `TaskRunStatus` to:

```ts
export type TaskRunStatus = "running" | "completed" | "failed" | "aborted";
```

In the same file, replace `isFailedTaskRunResult` with:

```ts
export function isFailedTaskRunResult(result: TaskRunResult): boolean {
  if (result.status === "running") return false;
  return result.status !== "completed" || result.exitCode !== 0 || result.stopReason === "error";
}
```

- [ ] **Step 4: Run schema tests and verify pass**

Run:

```bash
rtk npm test -- tests/task/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing runner tests**

In `tests/task/runner.test.ts`, update `"creates an initial task result"` so it expects:

```ts
      status: "running",
```

Then add this test below `"parses child JSONL output and marks successful child process completed"`:

```ts
  it("emits running partial updates before child completion", async () => {
    const child = new FakeChildProcess();
    const updates: Array<{ status: string; finalOutput: string }> = [];
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "reviewer",
      spawnChild: () => child as never,
      onUpdate: (result) => updates.push({ status: result.status, finalOutput: result.finalOutput }),
    });

    child.writeStdout(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "working" }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 }, totalTokens: 2 },
          stopReason: "toolUse",
        },
      })}\n`,
    );

    expect(updates).toEqual([{ status: "running", finalOutput: "working" }]);

    child.close(0);
    const result = await execution;
    expect(result.status).toBe("completed");
  });
```

- [ ] **Step 6: Run runner tests and verify failure**

Run:

```bash
rtk npm test -- tests/task/runner.test.ts
```

Expected: FAIL because the initial runner status is still `failed` and partial updates still expose that value.

- [ ] **Step 7: Implement runner changes**

In `src/task/runner.ts`, replace the body of `createInitialTaskRunResult()` with:

```ts
export function createInitialTaskRunResult(
  request: TaskRequest,
  agent: string,
  agentFilePath?: string,
): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent,
    ...(agentFilePath ? { agentFilePath } : {}),
    status: "running",
    finalOutput: "",
    messages: [],
    stderr: "",
    usage: emptyUsageStats(),
    exitCode: -1,
  };
}
```

Do not change `toCompletedStatus()`. It should stay terminal-only:

```ts
export function toCompletedStatus(
  exitCode: number,
  wasAborted: boolean,
  stopReason: string | undefined,
): TaskRunStatus {
  if (wasAborted || stopReason === "aborted") return "aborted";
  if (exitCode !== 0 || stopReason === "error") return "failed";
  return "completed";
}
```

- [ ] **Step 8: Run focused tests and verify pass**

Run:

```bash
rtk npm test -- tests/task/schema.test.ts tests/task/runner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
rtk git add src/task/schema.ts src/task/runner.ts tests/task/schema.test.ts tests/task/runner.test.ts
rtk git commit -m "feat: add running task lifecycle state"
```

Expected: commit succeeds with schema/runner lifecycle changes only.
