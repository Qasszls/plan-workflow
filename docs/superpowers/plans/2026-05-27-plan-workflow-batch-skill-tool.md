# Batch Skill Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Skill` tool's single `skill` parameter with batch `skills` loading and aggregate per-skill outcomes in one result.

**Architecture:** Keep the existing `src/skill/` boundaries. `schema.ts` owns runtime-safe parameter normalization, `tool.ts` owns registry lookup, per-skill outcome aggregation, markdown rendering, result details, and compact TUI rendering. `content.ts`, `registry.ts`, and cache behavior stay unchanged.

**Tech Stack:** TypeScript, TypeBox, Vitest, Pi extension API, `@earendil-works/pi-tui`.

---

## File Structure

- Modify: `src/skill/schema.ts`
  - Change `SkillParamsSchema` from `{ skill: string }` to `{ skills: string[] }`.
  - Change `normalizeSkillParams` to accept `unknown`, validate shape defensively, trim names, reject invalid items with stable messages, and deduplicate while preserving first-seen order.
- Modify: `src/skill/tool.ts`
  - Replace single-skill execution with per-skill outcome aggregation.
  - Return `isError: true` only for invalid parameters.
  - Build markdown sections in normalized request order.
  - Emit aggregate `details` with `requestedSkills`, `loaded`, `failed`, optional `availableSkills`, and optional `diagnostics`.
  - Update TUI rendering: single success keeps the current `[skill] name (n lines)` style; mixed/multiple success summarizes counts; no loaded skills uses the first failure's old-style error message.
- Modify: `tests/skill/schema.test.ts`
  - Update schema and normalization tests for `skills`.
- Modify: `tests/skill/tool.test.ts`
  - Update tool tests for batch loading, partial failures, failure-only non-error results, read failures, deduplication, details, and TUI render output.

## Task 1: Update Skill Parameter Schema

**Files:**
- Modify: `tests/skill/schema.test.ts`
- Modify: `src/skill/schema.ts`

- [ ] **Step 1: Replace schema tests with the new `skills` contract**

Edit `tests/skill/schema.test.ts` to:

```ts
import { describe, expect, it } from "vitest";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "../../src/skill/schema.ts";

interface JsonObjectSchemaShape {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: {
    skills?: {
      type?: string;
      items?: {
        type?: string;
      };
      minItems?: number;
    };
  };
}

describe("skill schema", () => {
  it("defines a strict object schema for batch skill params", () => {
    const schema = SkillParamsSchema as JsonObjectSchemaShape;

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["skills"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.skills?.type).toBe("array");
    expect(schema.properties?.skills?.items?.type).toBe("string");
    expect(schema.properties?.skills?.minItems).toBe(1);
  });

  it("trims and deduplicates skill names during normalization", () => {
    expect(
      normalizeSkillParams({
        skills: ["  brainstorming  ", "vitest", "brainstorming"],
      }),
    ).toEqual({
      ok: true,
      skills: ["brainstorming", "vitest"],
    });
  });

  it("rejects missing or non-array skills", () => {
    expect(normalizeSkillParams({})).toEqual({
      ok: false,
      error: "skills must be an array of skill names",
    });
    expect(normalizeSkillParams({ skills: "brainstorming" })).toEqual({
      ok: false,
      error: "skills must be an array of skill names",
    });
  });

  it("rejects empty skill arrays", () => {
    expect(normalizeSkillParams({ skills: [] })).toEqual({
      ok: false,
      error: "skills must contain at least one skill name",
    });
  });

  it("rejects invalid skill array items", () => {
    expect(normalizeSkillParams({ skills: ["brainstorming", 1] })).toEqual({
      ok: false,
      error: "skills[1] must be a string",
    });
    expect(normalizeSkillParams({ skills: ["brainstorming", "   "] })).toEqual({
      ok: false,
      error: "skills[1] must not be blank",
    });
  });

  it("supports the SkillParams type", () => {
    const params: SkillParams = { skills: ["test-driven-development"] };

    expect(params.skills).toEqual(["test-driven-development"]);
  });
});
```

- [ ] **Step 2: Run schema tests to verify they fail**

Run:

```bash
rtk npm test -- tests/skill/schema.test.ts
```

Expected: FAIL because `SkillParamsSchema` still requires `skill`, and `normalizeSkillParams` still returns `{ skill }`.

- [ ] **Step 3: Implement the new schema and normalization**

Replace `src/skill/schema.ts` with:

```ts
import { Type, type Static } from "typebox";

export const SkillParamsSchema = Type.Object(
  {
    skills: Type.Array(
      Type.String({
        description: "Name of a skill to load, such as brainstorming",
        minLength: 1,
      }),
      {
        description: "Names of the skills to load",
        minItems: 1,
      },
    ),
  },
  { additionalProperties: false },
);

export type SkillParams = Static<typeof SkillParamsSchema>;

export type NormalizeSkillParamsResult =
  | { ok: true; skills: string[] }
  | { ok: false; error: string };

export function normalizeSkillParams(
  params: unknown,
): NormalizeSkillParamsResult {
  if (!isRecord(params) || !Array.isArray(params.skills)) {
    return { ok: false, error: "skills must be an array of skill names" };
  }

  if (params.skills.length === 0) {
    return {
      ok: false,
      error: "skills must contain at least one skill name",
    };
  }

  const skills: string[] = [];
  const seen = new Set<string>();

  for (const [index, value] of params.skills.entries()) {
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

function isRecord(value: unknown): value is { skills?: unknown } {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 4: Run schema tests to verify they pass**

Run:

```bash
rtk npm test -- tests/skill/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit schema changes**

Run:

```bash
rtk git add src/skill/schema.ts tests/skill/schema.test.ts
rtk git commit -m "feat: accept batch Skill params"
```

Expected: commit succeeds.

## Task 2: Aggregate Skill Tool Outcomes

**Files:**
- Modify: `tests/skill/tool.test.ts`
- Modify: `src/skill/tool.ts`

- [ ] **Step 1: Replace tool execution tests with batch behavior**

Edit `tests/skill/tool.test.ts` to:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import planWorkflow from "../../src/index.ts";
import { registerSkillTool } from "../../src/skill/tool.ts";
import type { SkillEntry, SkillRegistrySnapshot } from "../../src/skill/registry.ts";

describe("Skill tool", () => {
  let root: string;
  let brainstormingPath: string;
  let vitestPath: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `plan-workflow-skill-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    brainstormingPath = writeSkill(
      "brainstorming",
      "Use when designing.",
      "# Brainstorming",
    );
    vitestPath = writeSkill("vitest", "Use when testing.", "# Vitest");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSkill(name: string, description: string, body: string): string {
    const skillDir = join(root, "skills", name);
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, "SKILL.md");
    writeFileSync(
      skillPath,
      `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`,
    );
    return skillPath;
  }

  function skillEntry(
    name: string,
    description: string,
    filePath: string,
  ): SkillEntry {
    return {
      name,
      description,
      filePath,
      baseDir: join(root, "skills", name),
      source: "project-pi",
    };
  }

  function snapshot(): SkillRegistrySnapshot {
    return {
      cwd: root,
      scannedAt: 1,
      diagnostics: [],
      skills: new Map([
        [
          "brainstorming",
          skillEntry("brainstorming", "Use when designing.", brainstormingPath),
        ],
        ["vitest", skillEntry("vitest", "Use when testing.", vitestPath)],
      ]),
    };
  }

  function registerWithSnapshot(registrySnapshot = snapshot()) {
    const tools: any[] = [];
    const pi = {
      registerTool(tool: any) {
        tools.push(tool);
      },
    };

    registerSkillTool(pi as never, {
      cache: { get: () => registrySnapshot, clear: () => {} },
    });

    return tools[0];
  }

  it("registers a Skill tool with strict batch params", () => {
    const tool = registerWithSnapshot();

    expect(tool.name).toBe("Skill");
    expect(tool.description).toContain("Load");
    expect(tool.parameters.required).toEqual(["skills"]);
    expect(tool.parameters.additionalProperties).toBe(false);
  });

  it("returns formatted skill content for a single found skill", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: [" brainstorming "] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill] brainstorming (5 lines)");
    expect(result.content[0].text).toContain(
      `<skill name="brainstorming" location="${brainstormingPath}">`,
    );
    expect(result.content[0].text).toContain("---\nname: brainstorming");
    expect(result.details.requestedSkills).toEqual(["brainstorming"]);
    expect(result.details.loaded).toEqual([
      {
        skillName: "brainstorming",
        skillPath: brainstormingPath,
        description: "Use when designing.",
        baseDir: join(root, "skills", "brainstorming"),
        lineCount: 5,
      },
    ]);
    expect(result.details.failed).toEqual([]);
  });

  it("returns multiple found skills in request order", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["vitest", "brainstorming"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill] vitest (5 lines)");
    expect(result.content[0].text).toContain("[skill] brainstorming (5 lines)");
    expect(result.content[0].text.indexOf("[skill] vitest")).toBeLessThan(
      result.content[0].text.indexOf("[skill] brainstorming"),
    );
    expect(result.content[0].text).toContain("\n---\n\n[skill] brainstorming");
    expect(result.details.requestedSkills).toEqual(["vitest", "brainstorming"]);
    expect(result.details.loaded.map((entry: any) => entry.skillName)).toEqual([
      "vitest",
      "brainstorming",
    ]);
  });

  it("loads duplicate skill names once", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming", " vitest ", "brainstorming"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.details.requestedSkills).toEqual(["brainstorming", "vitest"]);
    expect(result.content[0].text.match(/\[skill\] brainstorming/g)).toHaveLength(
      1,
    );
  });

  it("returns an error for invalid params", async () => {
    const tool = registerWithSnapshot();

    const blankArray = await tool.execute(
      "call-1",
      { skills: [] },
      undefined,
      undefined,
      { cwd: root },
    );
    expect(blankArray.isError).toBe(true);
    expect(blankArray.content[0].text).toBe(
      "Skill error: skills must contain at least one skill name",
    );

    const blankItem = await tool.execute(
      "call-2",
      { skills: ["brainstorming", " "] },
      undefined,
      undefined,
      { cwd: root },
    );
    expect(blankItem.isError).toBe(true);
    expect(blankItem.content[0].text).toBe(
      "Skill error: skills[1] must not be blank",
    );
  });

  it("returns partial failures inline without marking the tool call as an error", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming", "missing", "vitest"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill] brainstorming (5 lines)");
    expect(result.content[0].text).toContain("[skill:error] missing");
    expect(result.content[0].text).toContain('Skill "missing" not found.');
    expect(result.content[0].text).toContain("- brainstorming");
    expect(result.content[0].text).toContain("[skill] vitest (5 lines)");
    expect(result.content[0].text.indexOf("[skill:error] missing")).toBeLessThan(
      result.content[0].text.indexOf("[skill] vitest"),
    );
    expect(result.details.availableSkills).toEqual(["brainstorming", "vitest"]);
    expect(result.details.failed).toEqual([
      {
        skillName: "missing",
        reason: "not_found",
        error: 'Skill "missing" not found.',
      },
    ]);
  });

  it("returns missing-only requests as non-error skill outcomes", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["missing"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill:error] missing");
    expect(result.details.loaded).toEqual([]);
    expect(result.details.failed[0]).toEqual({
      skillName: "missing",
      reason: "not_found",
      error: 'Skill "missing" not found.',
    });
  });

  it("returns read failures inline without marking valid requests as tool errors", async () => {
    rmSync(brainstormingPath);
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming", "vitest"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill:error] brainstorming");
    expect(result.content[0].text).toContain(
      'Error loading skill "brainstorming": failed to read skill file:',
    );
    expect(result.content[0].text).toContain("[skill] vitest (5 lines)");
    expect(result.details.failed[0].skillName).toBe("brainstorming");
    expect(result.details.failed[0].reason).toBe("read_error");
    expect(result.details.failed[0].skillPath).toBe(brainstormingPath);
  });

  it("returns read-failure-only requests as non-error skill outcomes", async () => {
    rmSync(brainstormingPath);
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming"] },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[skill:error] brainstorming");
    expect(result.details.loaded).toEqual([]);
    expect(result.details.failed[0].reason).toBe("read_error");
  });
});

describe("Skill entrypoint integration", () => {
  it("registers both TodoWrite and Skill tools", () => {
    const tools: Array<{ name: string }> = [];
    const pi = {
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    planWorkflow(pi as never);

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["TodoWrite", "Skill"]),
    );
  });
});
```

- [ ] **Step 2: Run tool tests to verify they fail**

Run:

```bash
rtk npm test -- tests/skill/tool.test.ts
```

Expected: FAIL because the tool still expects `{ skill }`, returns flat details, and marks missing/read failures as errors.

- [ ] **Step 3: Implement aggregate types and helpers in `tool.ts`**

In `src/skill/tool.ts`, after `RegisterSkillToolOptions`, add:

```ts
interface LoadedSkillDetail {
  skillName: string;
  skillPath: string;
  description: string;
  baseDir: string;
  lineCount: number;
}

interface FailedSkillDetail {
  skillName: string;
  reason: "not_found" | "read_error";
  error: string;
  skillPath?: string;
}

interface SkillToolDetails {
  requestedSkills: string[];
  loaded: LoadedSkillDetail[];
  failed: FailedSkillDetail[];
  availableSkills?: string[];
  diagnostics?: unknown[];
}

type SkillOutcome =
  | {
      type: "loaded";
      detail: LoadedSkillDetail;
      formattedContent: string;
    }
  | {
      type: "failed";
      detail: FailedSkillDetail;
      text: string;
    };
```

Then add these helper functions above `summarizeDiagnostics`:

```ts
function renderLoadedOutcome(detail: LoadedSkillDetail, formattedContent: string): string {
  return [
    `[skill] ${detail.skillName} (${detail.lineCount} lines)`,
    "",
    formattedContent,
  ].join("\n");
}

function renderMissingOutcome(skillName: string, availableSkills: string[]): string {
  return [
    `[skill:error] ${skillName}`,
    "",
    `Skill "${skillName}" not found.`,
    "Available skills:",
    ...availableSkills.map((name) => `- ${name}`),
  ].join("\n");
}

function renderReadErrorOutcome(skillName: string, error: string): string {
  return [
    `[skill:error] ${skillName}`,
    "",
    `Error loading skill "${skillName}": ${error}`,
  ].join("\n");
}

function joinOutcomes(outcomes: SkillOutcome[]): string {
  return outcomes
    .map((outcome) =>
      outcome.type === "loaded"
        ? renderLoadedOutcome(outcome.detail, outcome.formattedContent)
        : outcome.text,
    )
    .join("\n\n---\n\n");
}
```

- [ ] **Step 4: Replace `execute` with batch aggregation**

Replace the current `execute` body inside `pi.registerTool({ ... })` with:

```ts
async execute(_toolCallId, params: SkillParams, _signal, _onUpdate, ctx) {
  const normalized = normalizeSkillParams(params);
  if (!normalized.ok) {
    return {
      content: [{ type: "text", text: `Skill error: ${normalized.error}` }],
      isError: true,
      details: { error: normalized.error },
    };
  }

  const snapshot = cache.get(ctx.cwd);
  const availableSkills = [...snapshot.skills.keys()].sort();
  const outcomes: SkillOutcome[] = [];
  const loaded: LoadedSkillDetail[] = [];
  const failed: FailedSkillDetail[] = [];
  let hasMissingSkill = false;

  for (const skillName of normalized.skills) {
    const skill = snapshot.skills.get(skillName);
    if (!skill) {
      hasMissingSkill = true;
      const detail: FailedSkillDetail = {
        skillName,
        reason: "not_found",
        error: `Skill "${skillName}" not found.`,
      };
      failed.push(detail);
      outcomes.push({
        type: "failed",
        detail,
        text: renderMissingOutcome(skillName, availableSkills),
      });
      continue;
    }

    const result = loadSkillContent(skill);
    if (!result.ok) {
      const detail: FailedSkillDetail = {
        skillName: skill.name,
        reason: "read_error",
        error: result.error,
        skillPath: skill.filePath,
      };
      failed.push(detail);
      outcomes.push({
        type: "failed",
        detail,
        text: renderReadErrorOutcome(skill.name, result.error),
      });
      continue;
    }

    const detail: LoadedSkillDetail = {
      skillName: skill.name,
      skillPath: skill.filePath,
      description: skill.description,
      baseDir: skill.baseDir,
      lineCount: result.lineCount,
    };
    loaded.push(detail);
    outcomes.push({
      type: "loaded",
      detail,
      formattedContent: result.formattedContent,
    });
  }

  const details: SkillToolDetails = {
    requestedSkills: normalized.skills,
    loaded,
    failed,
  };

  if (hasMissingSkill) {
    details.availableSkills = availableSkills;
    details.diagnostics = summarizeDiagnostics(snapshot.diagnostics);
  }

  return {
    content: [{ type: "text", text: joinOutcomes(outcomes) }],
    details,
  };
},
```

- [ ] **Step 5: Update tool description and prompt snippet**

In `src/skill/tool.ts`, change:

```ts
description:
  "Load and invoke a skill by name. Skills provide specialized workflow instructions.",
promptSnippet: "Load specialized skill instructions by name",
```

to:

```ts
description:
  "Load and invoke one or more skills by name. Skills provide specialized workflow instructions.",
promptSnippet: "Load specialized skill instructions by name",
```

Keep `promptSnippet` singular because it describes the concept, not the parameter shape.

- [ ] **Step 6: Run tool tests to verify execution behavior passes**

Run:

```bash
rtk npm test -- tests/skill/tool.test.ts
```

Expected: PASS because render-specific tests are added in Task 3. If execution tests fail, fix `src/skill/tool.ts` before continuing.

- [ ] **Step 7: Commit aggregation changes**

Run:

```bash
rtk git add src/skill/tool.ts tests/skill/tool.test.ts
rtk git commit -m "feat: aggregate batch Skill results"
```

Expected: commit succeeds.

## Task 3: Render Batch Skill Results

**Files:**
- Modify: `tests/skill/tool.test.ts`
- Modify: `src/skill/tool.ts`

- [ ] **Step 1: Add render tests**

Add these tests inside the first `describe("Skill tool", () => { ... })` block in `tests/skill/tool.test.ts`, before its closing `});`:

```ts
  it("renders a single loaded skill with the existing compact label", async () => {
    const tool = registerWithSnapshot();
    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming"] },
      undefined,
      undefined,
      { cwd: root },
    );

    const rendered = tool.renderResult(result, undefined, testTheme(), {
      isError: false,
    });

    expect(rendered.children[0].text).toBe("[skill] brainstorming (5 lines)");
  });

  it("renders multiple outcomes with a loaded/failed summary when something loaded", async () => {
    const tool = registerWithSnapshot();
    const result = await tool.execute(
      "call-1",
      { skills: ["brainstorming", "missing", "vitest"] },
      undefined,
      undefined,
      { cwd: root },
    );

    const rendered = tool.renderResult(result, undefined, testTheme(), {
      isError: false,
    });

    expect(rendered.children[0].text).toBe(
      "[skill] 3 requested, 2 loaded, 1 failed",
    );
  });

  it("renders the first failure as error text when no skill loaded", async () => {
    const tool = registerWithSnapshot();
    const result = await tool.execute(
      "call-1",
      { skills: ["missing"] },
      undefined,
      undefined,
      { cwd: root },
    );

    const rendered = tool.renderResult(result, undefined, testTheme(), {
      isError: false,
    });

    expect(rendered.text).toContain('Skill "missing" not found.');
  });
```

Add this helper below `registerWithSnapshot`:

```ts
  function testTheme() {
    return {
      fg(_name: string, text: string) {
        return text.replace(/\x1b\[[0-9;]*m/g, "");
      },
      bg(_name: string, text: string) {
        return text;
      },
    };
  }
```

- [ ] **Step 2: Run render tests to verify they fail**

Run:

```bash
rtk npm test -- tests/skill/tool.test.ts
```

Expected: FAIL because `renderResult` still reads flat `details.skillName` and `details.lineCount`.

- [ ] **Step 3: Replace `renderResult` with aggregate-aware rendering**

In `src/skill/tool.ts`, replace the `renderResult` method with:

```ts
renderResult(result, _options, theme, context) {
  const details = result.details as SkillToolDetails | undefined;

  if (details?.loaded || details?.failed) {
    const label = theme.fg("customMessageLabel", "\x1b[1m[skill]\x1b[22m");
    const box = new Box(1, 0, (text: string) =>
      theme.bg("customMessageBg", text),
    );

    if (details.loaded.length === 1 && details.failed.length === 0) {
      const loaded = details.loaded[0];
      const name = theme.fg("customMessageText", loaded.skillName);
      const lines = theme.fg("dim", ` (${loaded.lineCount} lines)`);
      box.addChild(new Text(`${label} ${name}${lines}`, 0, 0));
      return box;
    }

    if (details.loaded.length > 0) {
      const requested = details.requestedSkills.length;
      const loadedCount = details.loaded.length;
      const failedCount = details.failed.length;
      const summary = theme.fg(
        "customMessageText",
        `${requested} requested, ${loadedCount} loaded, ${failedCount} failed`,
      );
      box.addChild(new Text(`${label} ${summary}`, 0, 0));
      return box;
    }

    const firstFailure = details.failed[0];
    const text = firstFailure
      ? renderFailureText(firstFailure)
      : "Skill failed.";
    return new Text(theme.fg("error", text), 0, 0);
  }

  if (context.isError) {
    const text =
      result.content[0]?.type === "text"
        ? result.content[0].text
        : "Skill failed.";
    return new Text(theme.fg("error", text), 0, 0);
  }

  return new Text(theme.fg("error", "Skill result missing details."), 0, 0);
},
```

Add this helper above `summarizeDiagnostics`:

```ts
function renderFailureText(detail: FailedSkillDetail): string {
  if (detail.reason === "read_error") {
    return `Error loading skill "${detail.skillName}": ${detail.error}`;
  }

  return detail.error;
}
```

- [ ] **Step 4: Run tool tests to verify they pass**

Run:

```bash
rtk npm test -- tests/skill/tool.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit render changes**

Run:

```bash
rtk git add src/skill/tool.ts tests/skill/tool.test.ts
rtk git commit -m "feat: render batch Skill outcomes"
```

Expected: commit succeeds.

## Task 4: Full Verification And Cleanup

**Files:**
- Modify only if verification exposes type or test issues:
  - `src/skill/schema.ts`
  - `src/skill/tool.ts`
  - `tests/skill/schema.test.ts`
  - `tests/skill/tool.test.ts`

- [ ] **Step 1: Run all skill tests**

Run:

```bash
rtk npm test -- tests/skill
```

Expected: PASS for `cache`, `content`, `registry`, `schema`, and `tool` skill tests.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
rtk npm test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
rtk git diff --stat
rtk git diff -- src/skill/schema.ts src/skill/tool.ts tests/skill/schema.test.ts tests/skill/tool.test.ts
```

Expected:

- `src/skill/schema.ts` uses `skills: string[]` and `normalizeSkillParams(params: unknown)`.
- `src/skill/tool.ts` has aggregate details and returns `isError` only for invalid parameters.
- Tests cover schema, aggregation, partial failures, failure-only outcomes, read failures, and TUI rendering.

- [ ] **Step 5: Commit final fixes if needed**

If Step 1, 2, 3, or 4 required changes, run:

```bash
rtk git add src/skill/schema.ts src/skill/tool.ts tests/skill/schema.test.ts tests/skill/tool.test.ts
rtk git commit -m "fix: verify batch Skill behavior"
```

Expected: commit succeeds if there were final fixes. If no files changed, do not create an empty commit.
