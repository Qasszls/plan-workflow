# Task 3: Render Running And Finished Summaries Correctly

**Files:**
- Modify: `src/task/render.ts`
- Test: `tests/task/render.test.ts`

## Goal

Make collapsed Task summaries distinguish running versus finished execution, while leaving expanded per-task rendering structurally unchanged.

- [ ] **Step 1: Write failing render tests**

In `tests/task/render.test.ts`, add this test above `"formats result summaries for collapsed TUI display"`:

```ts
  it("formats running summaries for collapsed TUI display", () => {
    const summary = formatTaskResultSummary({
      version: 1,
      results: [result({ status: "running", exitCode: -1, finalOutput: "" })],
    });

    expect(summary).toBe("Task running: 1 running.");
  });
```

Update `"formats result summaries for collapsed TUI display"` so it keeps the finished expectation:

```ts
    expect(summary).toBe("Task finished: 1 completed, 1 failed, 0 aborted.");
```

Add this expanded-render assertion inside `"formats model-visible markdown with one section per result"` after the existing expectation block:

```ts
    expect(
      formatTaskExecutionContent({
        version: 1,
        results: [result({ status: "running", exitCode: -1, finalOutput: "Working..." })],
      }),
    ).toContain("- Status: running");
```

- [ ] **Step 2: Run render tests and verify failure**

Run:

```bash
rtk npm test -- tests/task/render.test.ts
```

Expected: FAIL because `formatTaskResultSummary()` only knows the finished three-state summary.

- [ ] **Step 3: Implement running-vs-finished summary rendering**

In `src/task/render.ts`, replace `formatTaskResultSummary()` with:

```ts
export function formatTaskResultSummary(details: TaskDetails): string {
  const counts = { running: 0, completed: 0, failed: 0, aborted: 0 };
  for (const result of details.results) counts[result.status] += 1;

  if (counts.running > 0) {
    return `Task running: ${counts.running} running.`;
  }

  return `Task finished: ${counts.completed} completed, ${counts.failed} failed, ${counts.aborted} aborted.`;
}
```

Do not change `formatTaskExecutionContent()` beyond continuing to print:

```ts
      `- Status: ${result.status}`,
```

- [ ] **Step 4: Run render tests and verify pass**

Run:

```bash
rtk npm test -- tests/task/render.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add src/task/render.ts tests/task/render.test.ts
rtk git commit -m "fix: render running task summaries"
```

Expected: commit succeeds with render-only changes.
