# plan-workflow Append System Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native append-system-prompt bootstrap launcher for `plan-workflow` and make the `Skill` tool accept Superpowers-style single-skill arguments.

**Architecture:** Keep the bootstrap static and composable: a root `APPEND_SYSTEM.md` is passed through Pi's native `--append-system-prompt` path by a minimal hard-coded Node wrapper. Keep `Skill` batch-first internally while adding a compatibility layer through `prepareArguments` and defensive normalization.

**Tech Stack:** TypeScript, Node.js ESM, Pi extension API, TypeBox, Vitest.

---

## File Structure

- `APPEND_SYSTEM.md` — new root append-system prompt with a short Superpowers bootstrap instruction.
- `scripts/pi-plan-workflow.mjs` — new minimal Node wrapper around the fixed `pi --extension ... --append-system-prompt ...` command.
- `src/skill/schema.ts` — modify normalization so direct `{ skill: string }` inputs normalize to batch form while strict batch schema remains unchanged.
- `src/skill/tool.ts` — add `prepareArguments` to convert Claude Code/Superpowers-style `{ skill }` tool calls into `{ skills: [skill] }` before schema validation.
- `tests/skill/schema.test.ts` — add failing tests for single-skill normalization and ambiguous mixed params.
- `tests/skill/tool.test.ts` — add failing tests for `prepareArguments` and execution after prepared single-skill input.

## Task 1: Add Single-Skill Normalization

**Files:**
- Modify: `tests/skill/schema.test.ts`
- Modify: `src/skill/schema.ts`

- [ ] **Step 1: Write failing schema tests for single-skill compatibility**

Add these tests inside the existing `describe("skill schema", ...)` block in `tests/skill/schema.test.ts`, after the `trims and deduplicates skill names during normalization` test:

```ts
  it("normalizes Claude Code-style single skill params", () => {
    expect(normalizeSkillParams({ skill: "brainstorming" })).toEqual({
      ok: true,
      skills: ["brainstorming"],
    });
    expect(normalizeSkillParams({ skill: "  using-superpowers  " })).toEqual({
      ok: true,
      skills: ["using-superpowers"],
    });
  });

  it("rejects invalid Claude Code-style single skill params", () => {
    expect(normalizeSkillParams({ skill: "" })).toEqual({
      ok: false,
      error: "skills[0] must not be blank",
    });
    expect(normalizeSkillParams({ skill: "   " })).toEqual({
      ok: false,
      error: "skills[0] must not be blank",
    });
    expect(normalizeSkillParams({ skill: 1 })).toEqual({
      ok: false,
      error: "skills[0] must be a string",
    });
  });
```

Replace the existing `rejects extra properties` test with this version so ambiguous mixed params are explicit:

```ts
  it("rejects extra and ambiguous properties", () => {
    expect(
      normalizeSkillParams({ skills: ["brainstorming"], skill: "old" }),
    ).toEqual({
      ok: false,
      error: "skills params must not include extra properties",
    });
    expect(normalizeSkillParams({ skill: "old", extra: true })).toEqual({
      ok: false,
      error: "skills params must not include extra properties",
    });
  });
```

- [ ] **Step 2: Run schema tests to verify they fail**

Run:

```bash
npm test -- tests/skill/schema.test.ts
```

Expected: FAIL. The new `normalizes Claude Code-style single skill params` test should fail because `normalizeSkillParams({ skill: "brainstorming" })` currently returns an error.

- [ ] **Step 3: Extract shared array normalization in `src/skill/schema.ts`**

Replace the current `normalizeSkillParams()` implementation and `isRecord()` helper in `src/skill/schema.ts` with this code:

```ts
export function normalizeSkillParams(
  params: unknown,
): NormalizeSkillParamsResult {
  if (!isRecord(params)) {
    return { ok: false, error: "skills must be an array of skill names" };
  }

  const keys = Object.keys(params);
  const hasSkills = Object.hasOwn(params, "skills");
  const hasSkill = Object.hasOwn(params, "skill");

  if (hasSkill && !hasSkills && keys.length === 1) {
    return normalizeSkillArray([params.skill]);
  }

  if (!hasSkills || !Array.isArray(params.skills)) {
    if (keys.some((key) => key !== "skills")) {
      return { ok: false, error: "skills params must not include extra properties" };
    }
    return { ok: false, error: "skills must be an array of skill names" };
  }

  if (keys.some((key) => key !== "skills")) {
    return { ok: false, error: "skills params must not include extra properties" };
  }

  return normalizeSkillArray(params.skills);
}

function normalizeSkillArray(values: unknown[]): NormalizeSkillParamsResult {
  if (values.length === 0) {
    return {
      ok: false,
      error: "skills must contain at least one skill name",
    };
  }

  const skills: string[] = [];
  const seen = new Set<string>();

  for (const [index, value] of values.entries()) {
    if (typeof value !== "string") {
      return { ok: false, error: `skills[${index}] must be a string` };
    }

    const skill = value.trim();
    if (!skill) {
      return { ok: false, error: `skills[${index}] must not be blank` };
    }

    if (!seen.has(skill)) {
      seen.add(skill);
      skills.push(skill);
    }
  }

  return { ok: true, skills };
}

function isRecord(value: unknown): value is { skills?: unknown; skill?: unknown } {
  return typeof value === "object" && value !== null;
}
```

Leave `SkillParamsSchema` and `SkillParams` unchanged so the model-facing primary schema remains batch-first.

- [ ] **Step 4: Run schema tests to verify they pass**

Run:

```bash
npm test -- tests/skill/schema.test.ts
```

Expected: PASS for `tests/skill/schema.test.ts`.

- [ ] **Step 5: Commit schema compatibility**

Run:

```bash
git add src/skill/schema.ts tests/skill/schema.test.ts
git commit -m "feat: accept single Skill param"
```

## Task 2: Add Skill Tool Argument Preparation

**Files:**
- Modify: `tests/skill/tool.test.ts`
- Modify: `src/skill/tool.ts`

- [ ] **Step 1: Write failing tool tests for `prepareArguments`**

In `tests/skill/tool.test.ts`, add this test after `registers a Skill tool with strict batch params`:

```ts
  it("prepares Claude Code-style single skill params as batch params", () => {
    const tool = registerWithSnapshot();

    expect(tool.prepareArguments).toBeTypeOf("function");
    expect(tool.prepareArguments({ skill: "brainstorming" })).toEqual({
      skills: ["brainstorming"],
    });
    expect(tool.prepareArguments({ skills: ["brainstorming"] })).toEqual({
      skills: ["brainstorming"],
    });
    expect(
      tool.prepareArguments({ skill: "old", skills: ["brainstorming"] }),
    ).toEqual({ skill: "old", skills: ["brainstorming"] });
  });
```

Add this test after `returns formatted skill content for a single found skill`:

```ts
  it("loads a skill after preparing Claude Code-style single skill params", async () => {
    const tool = registerWithSnapshot();
    const prepared = tool.prepareArguments({ skill: " brainstorming " });

    const result = await tool.execute(
      "call-1",
      prepared,
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill] brainstorming (5 lines)");
    expect(result.details.requestedSkills).toEqual(["brainstorming"]);
  });
```

- [ ] **Step 2: Run tool tests to verify they fail**

Run:

```bash
npm test -- tests/skill/tool.test.ts
```

Expected: FAIL because `tool.prepareArguments` is currently undefined.

- [ ] **Step 3: Implement `prepareArguments` in `src/skill/tool.ts`**

Add this helper near `createDefaultSkillRegistryCache()` in `src/skill/tool.ts`:

```ts
export function prepareSkillArguments(args: unknown): unknown {
  if (!isRecord(args)) {
    return args;
  }

  if (Object.hasOwn(args, "skill") && !Object.hasOwn(args, "skills")) {
    return { skills: [args.skill] };
  }

  return args;
}

function isRecord(value: unknown): value is { skill?: unknown; skills?: unknown } {
  return typeof value === "object" && value !== null;
}
```

Then add `prepareArguments` to the `pi.registerTool({ ... })` definition immediately before `async execute(...)`:

```ts
    prepareArguments: prepareSkillArguments,
```

The surrounding block should look like this:

```ts
    parameters: SkillParamsSchema,
    prepareArguments: prepareSkillArguments,
    async execute(_toolCallId, params: SkillParams, _signal, _onUpdate, ctx) {
```

- [ ] **Step 4: Run tool tests to verify they pass**

Run:

```bash
npm test -- tests/skill/tool.test.ts
```

Expected: PASS for `tests/skill/tool.test.ts`.

- [ ] **Step 5: Run all skill tests**

Run:

```bash
npm test -- tests/skill
```

Expected: PASS for all skill test files.

- [ ] **Step 6: Commit tool compatibility**

Run:

```bash
git add src/skill/tool.ts tests/skill/tool.test.ts
git commit -m "feat: prepare single Skill arguments"
```

## Task 3: Add Root Append System Prompt

**Files:**
- Create: `APPEND_SYSTEM.md`

- [ ] **Step 1: Create the root append prompt**

Create `APPEND_SYSTEM.md` with exactly this content:

```md
# Plan Workflow Superpowers Bootstrap

At the start of each conversation, use the Skill tool to load the `using-superpowers` skill before responding or taking actions.

Use the Skill tool, not the read tool, to load skill files.

If a task matches an available skill, invoke the relevant skill before answering or acting.
```

- [ ] **Step 2: Verify the file content**

Run:

```bash
node -e 'const fs=require("node:fs"); const text=fs.readFileSync("APPEND_SYSTEM.md","utf8"); if (!text.includes("using-superpowers")) process.exit(1); if (!text.includes("Skill tool")) process.exit(1); console.log("APPEND_SYSTEM.md ok")'
```

Expected output:

```text
APPEND_SYSTEM.md ok
```

- [ ] **Step 3: Commit the append prompt**

Run:

```bash
git add APPEND_SYSTEM.md
git commit -m "docs: add plan workflow append prompt"
```

## Task 4: Add Minimal Node Launcher

**Files:**
- Create: `scripts/pi-plan-workflow.mjs`

- [ ] **Step 1: Create the scripts directory and launcher**

Create `scripts/pi-plan-workflow.mjs` with exactly this content:

```js
#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn(
  "pi",
  [
    "--extension",
    "/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts",
    "--append-system-prompt",
    "/Users/liusahngzuo/code/learn/plan-workflow/APPEND_SYSTEM.md",
  ],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
```

- [ ] **Step 2: Make the launcher executable**

Run:

```bash
chmod +x scripts/pi-plan-workflow.mjs
```

- [ ] **Step 3: Verify the launcher has the fixed command arguments**

Run:

```bash
node -e 'const fs=require("node:fs"); const text=fs.readFileSync("scripts/pi-plan-workflow.mjs","utf8"); for (const needle of ["--extension", "/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts", "--append-system-prompt", "/Users/liusahngzuo/code/learn/plan-workflow/APPEND_SYSTEM.md"]) { if (!text.includes(needle)) { console.error("missing", needle); process.exit(1); } } console.log("launcher args ok")'
```

Expected output:

```text
launcher args ok
```

- [ ] **Step 4: Commit the launcher**

Run:

```bash
git add scripts/pi-plan-workflow.mjs
git commit -m "feat: add plan workflow launcher"
```

## Task 5: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/skill/schema.test.ts tests/skill/tool.test.ts
```

Expected: PASS for `tests/skill/schema.test.ts` and `tests/skill/tool.test.ts`.

- [ ] **Step 2: Run the full check**

Run:

```bash
npm run check
```

Expected: PASS for TypeScript typecheck and the full Vitest suite.

- [ ] **Step 3: Verify the launcher starts Pi far enough to show help**

Because the launcher intentionally accepts no arguments, do not pass `--help` through it. Instead verify the script is syntactically valid and references an available `pi` command:

```bash
node --check scripts/pi-plan-workflow.mjs
command -v pi
```

Expected output:

```text
/absolute/path/to/pi
```

`node --check` prints no output on success.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes from this implementation. If unrelated pre-existing changes are present, do not modify or commit them.

- [ ] **Step 5: Report completion**

Report:

```text
Implemented append-system bootstrap launcher.
Verification:
- npm test -- tests/skill/schema.test.ts tests/skill/tool.test.ts: PASS
- npm run check: PASS
- node --check scripts/pi-plan-workflow.mjs: PASS
```

## Self-Review Notes

Spec coverage:

- Root `APPEND_SYSTEM.md`: Task 3.
- Minimal hard-coded Node launcher: Task 4.
- No arguments accepted by the launcher: Task 4 creates no `process.argv` handling.
- Single-skill compatibility: Tasks 1 and 2.
- Tests for compatibility: Tasks 1, 2, and 5.
- Native append-system-prompt rather than runtime prompt mutation: Task 4 passes `--append-system-prompt`; no `before_agent_start` work is included.

Placeholder scan: no placeholder implementation steps remain.

Type consistency: `normalizeSkillParams()` returns the existing `NormalizeSkillParamsResult`; `prepareSkillArguments()` returns `unknown` for Pi's `prepareArguments` hook and leaves the public `SkillParamsSchema` unchanged.
