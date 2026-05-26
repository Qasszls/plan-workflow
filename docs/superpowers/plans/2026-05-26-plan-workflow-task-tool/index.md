# plan-workflow Task Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-visible `Task` tool to `plan-workflow` that dispatches one or more isolated Pi child agents and returns markdown `content` plus structured `details`.

**Architecture:** Follow the existing TodoWrite module style: keep schema, discovery, child process runner, orchestration, rendering, and tool registration in separate focused files under `src/task/`. Reuse Pi native behavior for `--append-system-prompt`, `--tools`, `--model`, `--mode json`, and `--no-session` instead of rebuilding Pi's system prompt.

**Tech Stack:** TypeScript ESM, Node 22+, Vitest, `typebox`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.

---

## Source Documents

- Spec: [2026-05-26-plan-workflow-task-tool-design.md](../../specs/2026-05-26-plan-workflow-task-tool-design.md)
- Pi subagent example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/subagent/index.ts`
- Pi agent discovery example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/subagent/agents.ts`
- Pi system prompt builder: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/system-prompt.ts`
- Pi CLI args: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/cli/args.ts`
- Pi initial message builder: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/cli/initial-message.ts`
- Pi print/json mode runner: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/modes/print-mode.ts`
- Existing TodoWrite module: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/`

## File Structure

Create:

```text
/Users/liusahngzuo/code/learn/plan-workflow/src/task/
  schema.ts
  discovery.ts
  runner.ts
  orchestrator.ts
  render.ts
  tool.ts

/Users/liusahngzuo/code/learn/plan-workflow/tests/task/
  schema.test.ts
  discovery.test.ts
  runner.test.ts
  orchestrator.test.ts
  render.test.ts
  tool.test.ts
```

Modify:

```text
/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts
```

Responsibilities:

- `schema.ts`: Typebox params, runtime types, constants, validation helpers.
- `discovery.ts`: Pi-native `.md` agent discovery, `.git` boundary, project-over-global merge, frontmatter normalization.
- `runner.ts`: child Pi process invocation, `--append-system-prompt <agent.md absolute path>`, JSON line parsing, message/usage aggregation, abort cleanup.
- `orchestrator.ts`: task-array validation, named/default agent resolution, blocking parallel execution with concurrency limit.
- `render.ts`: model-visible markdown content and TUI render helpers.
- `tool.ts`: `pi.registerTool("Task", ...)`.

## Execution Mode

This plan is written for autonomous execution. The implementing agent should make the changes, run the focused tests, commit each task, and finish with full verification. Do not pause for human-owned coding checkpoints unless a test or local API contract proves the plan is wrong.

## Tasks

Execute in order:

1. [Task 1: Define Task schema and result types](task-01-schema.md)
2. [Task 2: Discover Pi-native agents](task-02-discovery.md)
3. [Task 3: Parse child Pi JSON streams](task-03-runner.md)
4. [Task 4: Orchestrate single and parallel tasks](task-04-orchestrator.md)
5. [Task 5: Render markdown and TUI results](task-05-render.md)
6. [Task 6: Register Task tool and verify integration](task-06-tool.md)

## Execution Notes

- Do not implement `Agent` alias in this slice.
- Do not add chain mode.
- Do not add `cwd` support.
- Do not copy `ctx.getSystemPrompt()` into child args.
- For named agents, pass the discovered `agent.md` absolute path directly to `--append-system-prompt`.
- Do not generate temporary prompt files.
- Do not rebuild or inline `agent.md` content in the parent process.
- Pass the delegated task itself as the normal `-p` prompt string. Pi routes that CLI string through `messages` -> `initialMessage` -> `session.prompt(initialMessage)`.
- Use Pi native `--tools` and `--model` when declared by an agent file.
- Leave the existing uncommitted `tsconfig.json` change untouched unless the user explicitly asks.
- Run focused tests after each task and `npm run check` before final verification.
- Commit after each task.
