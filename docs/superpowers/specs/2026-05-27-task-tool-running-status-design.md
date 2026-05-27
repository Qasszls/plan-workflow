# Task Tool Running Status Design

## Goal

Fix the Task tool's misleading in-progress state so a child task that has started running is never shown as failed before it reaches a terminal outcome.

The immediate user problem is specific:

- a Task child process starts
- the UI receives partial updates while the child is still running
- the child result currently defaults to `status: "failed"`
- the user sees failure immediately, even though nothing has failed yet

This spec introduces an explicit transient `running` state for partial updates only, while preserving the existing final-result contract of `completed`, `failed`, and `aborted`.

## Confirmed Decisions

These decisions were explicitly confirmed during brainstorming and should be treated as resolved requirements:

1. `aborted` remains a separate final outcome and continues to be counted separately.
2. `running` is a lifecycle state, not a final result category.
3. `running` is allowed only in partial updates emitted while child tasks are still executing.
4. Final Task tool results must continue to contain only terminal statuses:
   - `completed`
   - `failed`
   - `aborted`
5. While work is still running, the collapsed Task summary must not classify unfinished work as failed.
6. A child result object should enter the world as `running`, not `failed`.

## Problem Analysis

Current runtime behavior mixes two different concepts:

- lifecycle state: the child process has started and is still running
- terminal outcome: the child process finished as completed, failed, or aborted

Today those are collapsed into one field with a bad default:

- `createInitialTaskRunResult()` initializes `status: "failed"`
- streaming child output can trigger `onUpdate` before the child process closes
- that partial snapshot is rendered to the user

This creates a false failure signal before any terminal outcome exists.

## Compatibility Audit Summary

### Already Aligned

- Pi already has a dedicated partial-update channel for in-progress tool execution.
- Expanded Task rendering already prints the per-result status verbatim and does not assume terminal-only content structure.
- Existing terminal failure paths such as unknown agents, spawn failures, process failures, and aborts remain valid as final outcomes.

### Can Be Aligned Cleanly

- Partial updates can carry `running` without requiring Pi runtime changes.
- Collapsed summary rendering can switch between a running summary and the existing finished summary.
- Tests can be updated to distinguish partial lifecycle state from final outcome state.

### Requires Explicit Contract Changes

- The Task schema and spec currently define `status` as terminal-only.
- Current failure predicates treat anything other than `completed` as an error.
- The collapsed summary currently assumes an exhaustive three-state set.

This spec resolves those conflicts by separating partial-update semantics from final-result semantics.

## Scope

In scope:

- introduce `running` for in-flight child task snapshots
- restrict `running` to partial updates only
- preserve final Task result statuses as terminal-only
- prevent running tasks from being classified as failed in collapsed summaries
- update runtime error-promotion rules so `running` does not imply failure
- update tests and docs to reflect the split between lifecycle state and terminal outcome

Out of scope:

- changing Task execution ordering or concurrency
- changing final failure definitions for real terminal failures
- redesigning expanded Task output beyond status correctness
- introducing richer progress percentages or timestamps

## Design

### 1. Status Contract

`TaskRunStatus` becomes:

```ts
"running" | "completed" | "failed" | "aborted"
```

But the contract is intentionally asymmetric:

- partial update `details` may contain `running`
- final returned `details` may not contain `running`

This preserves the current meaning of the final tool result while fixing the meaning of in-progress updates.

### 2. Runner Lifecycle

`createInitialTaskRunResult()` must initialize child runs as:

```ts
status: "running"
```

This initial object is the one reused throughout child execution and forwarded through `onUpdate`.

Lifecycle:

1. child task is created as `running`
2. zero or more partial updates emit that same result object while still `running`
3. once the child process closes, the runner computes the terminal status
4. the final emitted child result becomes exactly one of:
   - `completed`
   - `failed`
   - `aborted`

There is no valid path where a final child result remains `running`.

### 3. Orchestrator Contract

The orchestrator continues to forward partial `details` snapshots during execution.

Rules:

- partial snapshots may contain a mix of:
  - terminal results from completed children
  - `running` results from in-flight children
- final execution output must contain no `running` entries
- final `isError` remains derived only from terminal failure conditions

This keeps the current execution model intact:

- partial updates describe progress
- final return describes settled results

### 4. Error Semantics

Current logic effectively treats `status !== "completed"` as failure.

That is no longer correct once `running` exists.

New rule:

- `running` is non-terminal and non-error
- `failed` and `aborted` remain non-success terminal outcomes
- only final terminal failure states should set Task `isError`

Operationally this means:

- partial updates containing `running` must not be promoted to runtime errors
- final tool results may still be promoted to errors when they contain:
  - `failed`
  - `aborted`, if existing behavior already treats aborted final runs as error-like
- normalization errors remain real Task tool errors

The implementation may continue counting `aborted` separately while leaving its higher-level error treatment unchanged from today.

### 5. Rendering

#### Collapsed Summary

Collapsed rendering needs two modes.

Running mode:

- used when any partial-update result is still `running`
- must not describe the overall Task as finished
- must not count unfinished work as failed

Recommended summary shape:

```text
Task running: <running-count> running.
```

Alternate acceptable shape:

```text
Task running: <finished-count>/<total-count> finished.
```

Implementation can choose the exact wording, but it must satisfy both constraints:

- no `finished` wording for unsettled overall execution unless clearly scoped to a fraction
- no unfinished work classified as `failed`

Finished mode:

- used only when all child results are terminal
- keeps the current summary shape:

```text
Task finished: X completed, Y failed, Z aborted.
```

#### Expanded Result

Expanded rendering can keep its current structure:

- one section per child result
- `Status: running` shown verbatim for in-flight child tasks

No special in-progress decoration is required for the first iteration.

### 6. Tool Result and Hook Semantics

The Task tool currently participates in runtime error promotion through its `tool_result` handler.

This spec defines the intended split:

- partial update path:
  - may contain `running`
  - must not be marked as error because of `running`
- final tool result path:
  - must contain only terminal statuses
  - may still be marked error according to existing final-outcome rules

This avoids conflating lifecycle progress with settled failure.

### 7. Documentation Contract

All Task documentation should explicitly distinguish:

- transient child lifecycle state during execution
- final child outcome after execution

Required doc changes:

- the Task details contract must describe `running` as partial-update-only
- render behavior must describe separate running and finished collapsed summaries
- tests and examples must stop implying that initial child state is failed

## Testing

Update or add tests to verify:

1. initial child results start as `running`
2. partial updates emitted before child completion preserve `running`
3. partial updates with `running` do not set Task `isError`
4. final child results are still mapped only to `completed`, `failed`, or `aborted`
5. final Task execution details contain no `running` entries
6. collapsed summary uses running wording while any child is still `running`
7. collapsed summary reverts to terminal counts once all children finish
8. expanded rendering prints `Status: running` for in-flight children
9. existing terminal failure and abort behavior remains intact

## Acceptance Criteria

- Starting a child task no longer causes the UI to show it as failed before completion.
- A running child task appears as `running` in partial Task updates.
- Partial Task updates that contain `running` are not treated as Task errors.
- Final Task results contain only `completed`, `failed`, or `aborted`.
- Collapsed summaries do not classify unfinished tasks as failed.
- `aborted` continues to be counted separately in final summaries.

## Recommended Implementation Direction

This design should be implemented as a contract-preserving adjustment, not a workflow redesign:

1. extend the type to include `running`
2. change runner initialization from `failed` to `running`
3. narrow failure predicates so `running` is not treated as failure
4. keep `running` out of final execution results
5. split collapsed rendering into running-mode and finished-mode summaries
6. update tests and docs together

That is the smallest change that fixes the misleading UI while preserving the current Task execution model.
