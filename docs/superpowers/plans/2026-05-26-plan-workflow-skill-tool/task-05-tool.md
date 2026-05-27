# Task 5: Register The Skill Tool

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/tool.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/tool.test.ts`

- [ ] **Step 1: Write failing tool tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/tool.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerSkillTool } from "../../src/skill/tool.ts";
import type { SkillRegistrySnapshot } from "../../src/skill/registry.ts";

describe("Skill tool", () => {
  let root: string;
  let skillPath: string;

  beforeEach(() => {
    root = join(tmpdir(), `plan-workflow-skill-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const skillDir = join(root, "skills", "brainstorming");
    mkdirSync(skillDir, { recursive: true });
    skillPath = join(skillDir, "SKILL.md");
    writeFileSync(skillPath, "---\nname: brainstorming\ndescription: Use when designing.\n---\n# Brainstorming\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function snapshot(): SkillRegistrySnapshot {
    return {
      cwd: root,
      scannedAt: 1,
      diagnostics: [],
      skills: new Map([
        ["brainstorming", {
          name: "brainstorming",
          description: "Use when designing.",
          filePath: skillPath,
          baseDir: join(root, "skills", "brainstorming"),
          source: "project-pi",
        }],
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

  it("registers a Skill tool with strict params", () => {
    const tool = registerWithSnapshot();

    expect(tool.name).toBe("Skill");
    expect(tool.description).toContain("Load");
    expect(tool.parameters.additionalProperties).toBe(false);
  });

  it("returns formatted skill content for a found skill", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute("call-1", { skill: " brainstorming " }, undefined, undefined, { cwd: root });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(`<skill name="brainstorming" location="${skillPath}">`);
    expect(result.content[0].text).toContain("---\nname: brainstorming");
    expect(result.details.skillName).toBe("brainstorming");
    expect(result.details.skillPath).toBe(skillPath);
  });

  it("returns available skill names when the requested skill is missing", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute("call-1", { skill: "missing" }, undefined, undefined, { cwd: root });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Skill "missing" not found.');
    expect(result.content[0].text).toContain("- brainstorming");
    expect(result.details.availableSkills).toEqual(["brainstorming"]);
  });

  it("returns an error for blank skill names", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute("call-1", { skill: " " }, undefined, undefined, { cwd: root });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Skill error: Skill name must not be blank");
  });

  it("returns a read error when the skill file cannot be loaded", async () => {
    rmSync(skillPath);
    const tool = registerWithSnapshot();

    const result = await tool.execute("call-1", { skill: "brainstorming" }, undefined, undefined, { cwd: root });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error loading skill "brainstorming"');
    expect(result.details.skillPath).toBe(skillPath);
  });
});
```

- [ ] **Step 2: Run tool tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/tool.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/skill/tool.ts'
```

- [ ] **Step 3: Implement tool registration**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/tool.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { createSkillRegistryCache, type SkillRegistryCache } from "./cache.ts";
import { loadSkillContent } from "./content.ts";
import { discoverSkills } from "./registry.ts";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "./schema.ts";

export interface RegisterSkillToolOptions {
  cache?: SkillRegistryCache;
}

export function createDefaultSkillRegistryCache(): SkillRegistryCache {
  return createSkillRegistryCache((cwd) => discoverSkills({ cwd }));
}

export function registerSkillTool(
  pi: ExtensionAPI,
  options: RegisterSkillToolOptions = {},
): SkillRegistryCache {
  const cache = options.cache ?? createDefaultSkillRegistryCache();

  pi.registerTool({
    name: "Skill",
    label: "Skill",
    description:
      "Load and invoke a skill by name. Skills provide specialized workflow instructions.",
    promptSnippet: "Load specialized skill instructions by name",
    promptGuidelines: [
      "Use Skill when a task matches an available skill's description or the user explicitly names a skill.",
      "Use the Skill tool instead of reading skill files directly.",
    ],
    parameters: SkillParamsSchema,
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
      const skill = snapshot.skills.get(normalized.skill);
      if (!skill) {
        const availableSkills = [...snapshot.skills.keys()].sort();
        const diagnostics = summarizeDiagnostics(snapshot.diagnostics);
        return {
          content: [{
            type: "text",
            text: [
              `Skill "${normalized.skill}" not found.`,
              "",
              "Available skills:",
              ...availableSkills.map((name) => `- ${name}`),
            ].join("\n"),
          }],
          isError: true,
          details: { requestedSkill: normalized.skill, availableSkills, diagnostics },
        };
      }

      const loaded = loadSkillContent(skill);
      if (!loaded.ok) {
        return {
          content: [{
            type: "text",
            text: `Error loading skill "${skill.name}": ${loaded.error}`,
          }],
          isError: true,
          details: { requestedSkill: skill.name, skillPath: skill.filePath, error: loaded.error },
        };
      }

      return {
        content: [{ type: "text", text: loaded.formattedContent }],
        details: {
          skillName: skill.name,
          skillPath: skill.filePath,
          description: skill.description,
          baseDir: skill.baseDir,
          lineCount: loaded.lineCount,
        },
      };
    },
    renderResult(result, _options, theme, context) {
      if (context.isError) {
        const text = result.content[0]?.type === "text" ? result.content[0].text : "Skill failed.";
        return new Text(theme.fg("error", text), 0, 0);
      }

      const details = result.details as { skillName?: string; lineCount?: number } | undefined;
      const skillName = details?.skillName ?? "unknown";
      const lineCount = details?.lineCount ?? 0;
      const label = theme.fg("customMessageLabel", "\x1b[1m[skill]\x1b[22m");
      const name = theme.fg("customMessageText", skillName);
      const lines = theme.fg("dim", ` (${lineCount} lines)`);
      const box = new Box(1, 0, (text: string) => theme.bg("customMessageBg", text));
      box.addChild(new Text(`${label} ${name}${lines}`, 0, 0));
      return box;
    },
  });

  return cache;
}

function summarizeDiagnostics(diagnostics: unknown[]): unknown[] {
  return diagnostics.slice(0, 10);
}
```

- [ ] **Step 4: Run tool tests to verify pass**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/tool.test.ts
```

Expected:

```text
PASS tests/skill/tool.test.ts
```

- [ ] **Step 5: Commit Task 5**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/skill/tool.ts tests/skill/tool.test.ts
rtk proxy git commit -m "feat: register Skill tool"
```
