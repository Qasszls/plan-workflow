import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import planWorkflow from "../../src/index.ts";
import { registerSkillTool } from "../../src/skill/tool.ts";
import type { SkillRegistrySnapshot } from "../../src/skill/registry.ts";

describe("Skill tool", () => {
  let root: string;
  let skillPath: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `plan-workflow-skill-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const skillDir = join(root, "skills", "brainstorming");
    mkdirSync(skillDir, { recursive: true });
    skillPath = join(skillDir, "SKILL.md");
    writeFileSync(
      skillPath,
      "---\nname: brainstorming\ndescription: Use when designing.\n---\n# Brainstorming\n",
    );
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
        [
          "brainstorming",
          {
            name: "brainstorming",
            description: "Use when designing.",
            filePath: skillPath,
            baseDir: join(root, "skills", "brainstorming"),
            source: "project-pi",
          },
        ],
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

    const result = await tool.execute(
      "call-1",
      { skill: " brainstorming " },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      `<skill name="brainstorming" location="${skillPath}">`,
    );
    expect(result.content[0].text).toContain("---\nname: brainstorming");
    expect(result.details.skillName).toBe("brainstorming");
    expect(result.details.skillPath).toBe(skillPath);
  });

  it("returns available skill names when the requested skill is missing", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skill: "missing" },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Skill "missing" not found.');
    expect(result.content[0].text).toContain("- brainstorming");
    expect(result.details.availableSkills).toEqual(["brainstorming"]);
  });

  it("returns an error for blank skill names", async () => {
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skill: " " },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Skill error: Skill name must not be blank",
    );
  });

  it("returns a read error when the skill file cannot be loaded", async () => {
    rmSync(skillPath);
    const tool = registerWithSnapshot();

    const result = await tool.execute(
      "call-1",
      { skill: "brainstorming" },
      undefined,
      undefined,
      { cwd: root },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Error loading skill "brainstorming"',
    );
    expect(result.details.skillPath).toBe(skillPath);
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
