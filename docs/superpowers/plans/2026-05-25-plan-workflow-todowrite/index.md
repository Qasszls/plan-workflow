# plan-workflow TodoWrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first `plan-workflow` Pi package slice: a Superpowers-compatible `TodoWrite` tool with branch replay, full details snapshots, `/todos`, and an above-editor overlay.

**Architecture:** Create a new local Pi package at `/Users/liusahngzuo/code/learn/plan-workflow`. Keep the package modular: `src/index.ts` registers the extension, and `src/todo/*` owns schema, pure state logic, replay, tool registration, rendering, overlay, and commands. Use TDD for pure logic first, then wire Pi runtime behavior around the tested core.

**Tech Stack:** TypeScript ESM, Node 22+, Vitest, `typebox`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.

---

## Source Documents

- Spec: [2026-05-25-plan-workflow-todowrite-design.md](../../specs/2026-05-25-plan-workflow-todowrite-design.md)
- Pi todo example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/todo.ts`
- Pi extension docs source: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/docs/extensions.md`
- Existing Superpowers support: `/Users/liusahngzuo/.pi/agent/npm/node_modules/@uadgj/pi-superpowers-support/src/index.ts`
- rpiv-todo notes: `/Users/liusahngzuo/.pi/docs/pi-extension-hooks-and-rpiv-todo.md`

## Teaching Split

The agent is the implementation lead, but each task file contains explicit learn-mode steps. The agent must follow those steps literally: create the surrounding context first, stop at the human-owned code block, show the exact file location, wait for the human to write or discuss the marked 5-10 lines, then run the listed verification command before continuing.

- Task 1: guided trace of package entry and `src/index.ts`.
- Task 2: `TaskSnapshot` and `TodoWriteDetails` type review or edits.
- Task 3: one validation rule, preferably `blockedBy` missing-reference or cycle detection.
- Task 4: one replay fixture/test.
- Task 5: one `promptGuidelines` line and a guided trace of the `execute` flow.
- Task 6: one overlay formatting helper, plus guided traces of overlay and command wiring.
- Task 7: manual Pi verification, with the human explaining which surface proved each runtime path.

Do not replace these pauses with a separate overview document. The pauses are part of the implementation plan so an execution agent must open a deliberate coding surface for the human.

## Learning Outcomes

This slice should teach a reusable Pi tool development pattern:

- package entry and extension registration: `package.json`, `src/index.ts`
- model-facing tool contract: `src/todo/schema.ts`, `src/todo/tool.ts`
- runtime state and validation: `src/todo/state.ts`
- branch persistence through tool result snapshots: `src/todo/replay.ts`
- human/TUI rendering: `src/todo/render.ts`, `src/todo/overlay.ts`, `src/todo/commands.ts`

The implementation should still prioritize a working `TodoWrite` v2. Teaching checkpoints are short pauses, not separate side projects.

## File Structure

Create:

```text
/Users/liusahngzuo/code/learn/plan-workflow/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    index.ts
    todo/
      schema.ts
      state.ts
      replay.ts
      render.ts
      tool.ts
      overlay.ts
      commands.ts
  test/
    todo/
      state.test.ts
      replay.test.ts
      render.test.ts
```

Responsibilities:

- `src/index.ts`: Pi extension entry; calls `registerTodoWrite(pi)`.
- `src/todo/schema.ts`: Typebox schemas and TypeScript types.
- `src/todo/state.ts`: Pure normalization, validation, stats, and state transitions.
- `src/todo/replay.ts`: Branch replay from Pi session entries.
- `src/todo/render.ts`: Text formatting for model-visible summaries, `/todos`, and overlay lines.
- `src/todo/tool.ts`: `pi.registerTool("TodoWrite", ...)`.
- `src/todo/overlay.ts`: above-editor widget lifecycle.
- `src/todo/commands.ts`: `/todos` command.
- `test/todo/*`: focused tests for pure state, replay, and rendering.

## Tasks

Execute in order:

1. [Task 1: Scaffold the local Pi package](task-01-scaffold.md)
2. [Task 2: Define TodoWrite schema and types](task-02-schema.md)
3. [Task 3: Implement state normalization and validation](task-03-state.md)
4. [Task 4: Implement replay from branch snapshots](task-04-replay.md)
5. [Task 5: Register the TodoWrite tool](task-05-tool.md)
6. [Task 6: Add rendering, overlay, and `/todos`](task-06-ui.md)
7. [Task 7: Install locally and verify in Pi](task-07-install-verify.md)

## Execution Notes

- Do not modify `/Users/liusahngzuo/code/learn/pi` for this slice.
- Do not modify existing installed package `@uadgj/pi-superpowers-support`; `plan-workflow` supersedes the TodoWrite part during testing.
- Prefer `npm test -- --run` inside `plan-workflow` for quick verification.
- Commit after each task in the `plan-workflow` repository once it exists.
