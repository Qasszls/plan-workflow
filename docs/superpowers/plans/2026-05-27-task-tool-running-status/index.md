# Task Tool Running Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Task so in-progress child work is represented as `running` during partial updates, never preclassified as failed, while final Task results remain terminal-only with `completed`, `failed`, and `aborted`.

**Architecture:** Keep the existing `src/task/` split. Extend the shared schema to distinguish transient `running` state from terminal outcomes, update the runner/orchestrator/tool pipeline so `running` exists only in partial updates, and split collapsed rendering into running-mode versus finished-mode summaries.

**Tech Stack:** TypeScript ESM, Node 22+, Vitest, `typebox`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.

---

## Source Documents

- Spec: [2026-05-27-task-tool-running-status-design.md](../../specs/2026-05-27-task-tool-running-status-design.md)
- Existing schema: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/schema.ts`
- Existing runner: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/runner.ts`
- Existing orchestrator: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/orchestrator.ts`
- Existing renderer: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/render.ts`
- Existing tool registration: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/tool.ts`
- Existing task tests: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/`
- Pi partial-update handling: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts`

## File Structure

Modify:

```text
/Users/liusahngzuo/code/learn/plan-workflow/src/task/schema.ts
/Users/liusahngzuo/code/learn/plan-workflow/src/task/runner.ts
/Users/liusahngzuo/code/learn/plan-workflow/src/task/orchestrator.ts
/Users/liusahngzuo/code/learn/plan-workflow/src/task/render.ts
/Users/liusahngzuo/code/learn/plan-workflow/src/task/tool.ts
/Users/liusahngzuo/code/learn/plan-workflow/tests/task/schema.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/tests/task/runner.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/tests/task/orchestrator.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/tests/task/render.test.ts
/Users/liusahngzuo/code/learn/plan-workflow/tests/task/tool.test.ts
```

Responsibilities:

- `schema.ts`: shared status vocabulary and failure predicates.
- `runner.ts`: initial child lifecycle state and final terminal mapping.
- `orchestrator.ts`: partial-update forwarding and final terminal-only guarantees.
- `render.ts`: running-vs-finished collapsed summaries and status display.
- `tool.ts`: partial/final error semantics for Task tool updates and tool results.
- `tests/task/*.test.ts`: regression coverage for lifecycle, rendering, and runtime error behavior.

## Execution Mode

Execute tasks in order. Each task ends with focused verification and a commit. Use `rtk` before shell commands.

## Tasks

1. [Task 1: Add Running Status To Shared Contracts](task-01-schema-runner.md)
2. [Task 2: Preserve Running Only In Partial Updates](task-02-orchestrator-tool.md)
3. [Task 3: Render Running And Finished Summaries Correctly](task-03-render.md)
4. [Task 4: Run Full Verification And Final Regression Review](task-04-verification.md)

## Execution Notes

- `running` is partial-update-only. Final `TaskDetails` must not contain `running`.
- Keep `aborted` as a separate final category and preserve its current higher-level error treatment unless tests prove otherwise.
- Do not redesign expanded Task markdown beyond showing `Status: running` when present.
- Do not add progress percentages, timestamps, or extra status fields in this slice.
- Prefer the smallest change that fixes the misleading initial failed state.
- Run focused tests after each task and `rtk npm run check` in the final task.
