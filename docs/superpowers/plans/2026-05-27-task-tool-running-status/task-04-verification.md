# Task 4: Run Full Verification And Final Regression Review

**Files:**
- Modify: `src/task/schema.ts`
- Modify: `src/task/runner.ts`
- Modify: `src/task/orchestrator.ts`
- Modify: `src/task/render.ts`
- Modify: `src/task/tool.ts`
- Test: `tests/task/schema.test.ts`
- Test: `tests/task/runner.test.ts`
- Test: `tests/task/orchestrator.test.ts`
- Test: `tests/task/render.test.ts`
- Test: `tests/task/tool.test.ts`

## Goal

Verify the full running-status slice together, patch any integration mismatches, and finish with a clean regression pass.

- [ ] **Step 1: Run the full Task test suite**

Run:

```bash
rtk npm test -- tests/task/schema.test.ts tests/task/runner.test.ts tests/task/orchestrator.test.ts tests/task/render.test.ts tests/task/tool.test.ts
```

Expected: PASS.

- [ ] **Step 2: Fix any cross-file integration mismatch discovered by the full suite**

If any test fails, limit fixes to the Task lifecycle files in this plan. The expected settled code shape is:

```ts
// src/task/schema.ts
export type TaskRunStatus = "running" | "completed" | "failed" | "aborted";
```

```ts
// src/task/runner.ts
status: "running",
```

```ts
// src/task/tool.ts
return details.results.some((result) => result.status !== "running" && isFailedTaskRunResult(result));
```

```ts
// src/task/render.ts
if (counts.running > 0) {
  return `Task running: ${counts.running} running.`;
}
```

- [ ] **Step 3: Run project-wide verification**

Run:

```bash
rtk npm run check
```

Expected: PASS with `typecheck` and `test` both succeeding.

- [ ] **Step 4: Inspect git diff for unintended changes**

Run:

```bash
rtk git diff -- src/task/schema.ts src/task/runner.ts src/task/orchestrator.ts src/task/render.ts src/task/tool.ts tests/task/schema.test.ts tests/task/runner.test.ts tests/task/orchestrator.test.ts tests/task/render.test.ts tests/task/tool.test.ts
```

Expected: diff contains only the running-status lifecycle changes from this plan.

- [ ] **Step 5: Commit final verification fixes**

Run:

```bash
rtk git add src/task/schema.ts src/task/runner.ts src/task/orchestrator.ts src/task/render.ts src/task/tool.ts tests/task/schema.test.ts tests/task/runner.test.ts tests/task/orchestrator.test.ts tests/task/render.test.ts tests/task/tool.test.ts
rtk git commit -m "test: verify task running status lifecycle"
```

Expected: commit succeeds if Task 4 required follow-up edits. If there are no new changes after verification, skip this commit.
