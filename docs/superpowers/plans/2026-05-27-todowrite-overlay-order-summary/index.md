# TodoWrite Overlay Order and Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix TodoWrite so todo order is stable, completed items stay visible, the overlay has an optional summary title plus `completed/total` count, and blocked todo behavior is not part of the public API.

**Architecture:** Keep TodoWrite as a replace-snapshot tool. Add a small replayable `TodoStateSnapshot` boundary for `summary` plus `todos`, keep pure formatting in `src/todo/render.ts`, and use `src/todo/overlay.ts` only for Pi widget styling and registration.

**Tech Stack:** TypeScript ESM, Node 22+, Vitest, `typebox`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.

---

## Source Documents

- Spec: [2026-05-27-todowrite-overlay-order-summary-design.md](../../specs/2026-05-27-todowrite-overlay-order-summary-design.md)
- Existing schema: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/schema.ts`
- Existing state logic: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/state.ts`
- Existing replay logic: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/replay.ts`
- Existing renderer: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/render.ts`
- Existing overlay integration: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/overlay.ts`
- Existing tool registration: `/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/tool.ts`
- Pi widget API: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/extensions/types.ts`
- Pi widget implementation: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Pi plan-mode styling example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/plan-mode/index.ts`

## File Structure

Modify:

```text
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/schema.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/state.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/replay.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/render.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/overlay.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/src/todo/tool.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/tests/todo/schema.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/tests/todo/state.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/tests/todo/replay.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/tests/todo/render.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/.worktrees/plan-workflow-task-tool/tests/todo/tool.test.ts
```

Responsibilities:

- `schema.ts`: public TodoWrite parameter schema, replayable details schema, `TodoStateSnapshot`.
- `state.ts`: normalize `summary`, normalize todos, compute stats, build replayable details.
- `replay.ts`: rebuild `{ summary, todos }` from the latest valid TodoWrite details.
- `render.ts`: pure text representation for tests and non-styled fallbacks.
- `overlay.ts`: Pi widget placement plus styled title/count/completed rows.
- `tool.ts`: runtime state, tool execution, details, and user-facing tool result summary.
- `tests/todo/*.test.ts`: focused coverage for each boundary and the requested lifecycle.

## Execution Mode

Execute tasks in order. Each task is self-contained and ends with a commit. Use `rtk` before shell commands.

## Tasks

1. [Task 1: Add Summary Snapshot Schema](task-01-schema-state.md)
2. [Task 2: Replay Summary State](task-02-replay-runtime.md)
3. [Task 3: Render Stable Ordered Todos](task-03-render-overlay.md)
4. [Task 4: Wire Styled Overlay And Tool Output](task-04-tool-overlay.md)
5. [Task 5: Add Lifecycle Regression Coverage And Verify](task-05-lifecycle-verification.md)

## Execution Notes

- Do not add incremental todo patch operations.
- Do not add dependency scheduling.
- Do not advertise `blockedBy` in `TodoWriteParamsSchema`.
- Ignore raw `blockedBy` values during normalization and store `blockedBy: []` for new snapshots.
- Keep old details replayable when they already contain `blockedBy`.
- Use Pi widget component factory for visual styling: title in `warning` color, completed icon in `success`, completed text with `theme.strikethrough`.
- Keep the pure text formatter deterministic so tests do not depend on ANSI escape output.
- Run `rtk npm run check` before the final commit in Task 5.
