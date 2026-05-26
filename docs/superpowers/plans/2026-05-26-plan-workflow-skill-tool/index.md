# plan-workflow Skill Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-visible `Skill` tool to `plan-workflow` that loads Superpowers-compatible skill files by name, returns full skill content to the model, and avoids rescanning the filesystem on every invocation.

**Architecture:** Follow the existing TodoWrite module style with focused files under `src/skill/`. Keep the model-facing tool contract stable while isolating discovery behind a registry/cache boundary so a future Pi `ctx.getSkills()` API can replace filesystem discovery without changing the tool.

**Tech Stack:** TypeScript ESM, Node 22+, Vitest, `typebox`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`.

---

## Source Documents

- Spec: [2026-05-26-plan-workflow-skill-tool-design.md](../../specs/2026-05-26-plan-workflow-skill-tool-design.md)
- Isolated Pi smoke test environment: [verification.md](verification.md)
- Existing TodoWrite module: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/`
- Pi skill docs used as design reference only: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/docs/skills.md`
- Compatibility package used as design reference only: `/Users/liusahngzuo/.pi/agent/npm/node_modules/@uadgj/pi-superpowers-support/src/index.ts`

## File Structure

Create:

```text
/Users/liusahngzuo/code/learn/plan-workflow/src/skill/
  cache.ts
  content.ts
  registry.ts
  schema.ts
  tool.ts

/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/
  cache.test.ts
  content.test.ts
  registry.test.ts
  schema.test.ts
  tool.test.ts
```

Modify:

```text
/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts
```

Responsibilities:

- `schema.ts`: TypeBox params schema and runtime normalization for `Skill({ skill })`.
- `registry.ts`: filesystem discovery, ignore handling, frontmatter parsing, validation, and diagnostics.
- `cache.ts`: process-local `Map<resolvedCwd, SkillRegistrySnapshot>`.
- `content.ts`: file reading and model-visible `<skill>` block formatting.
- `tool.ts`: Pi tool registration, execution, details, and compact TUI rendering.
- `src/index.ts`: register TodoWrite and Skill.

## Execution Mode

This plan is written for autonomous execution. The implementing agent should make the changes, run the focused tests, commit each task, and finish with full verification. Do not modify `/Users/liusahngzuo/code/learn/pi`; this package must work against the published Pi package APIs already in `package.json`.

## Tasks

Execute in order:

1. [Task 1: Define Skill schema and normalized params](task-01-schema.md)
2. [Task 2: Discover and validate skill files](task-02-registry.md)
3. [Task 3: Add cwd-keyed registry cache](task-03-cache.md)
4. [Task 4: Load and format skill content](task-04-content.md)
5. [Task 5: Register the Skill tool](task-05-tool.md)
6. [Task 6: Wire extension entrypoint and verify](task-06-integration.md)

## Execution Notes

- Do not implement automatic `using-superpowers` prompt injection in this plan.
- Do not add a `/skill-reload` command.
- Do not parse Pi settings or run package installation commands.
- Do not import source from `/Users/liusahngzuo/code/learn/pi`.
- Keep discovery cache in memory only.
- Return full skill file content, including frontmatter.
- Commit after each task.
- Run `rtk npm run check` before final completion.
