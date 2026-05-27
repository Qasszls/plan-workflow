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

  it("renders the first read failure as error text when no skill loaded", async () => {
    rmSync(brainstormingPath);
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

    expect(rendered.text).toContain(
      'Error loading skill "brainstorming": failed to read skill file:',
    );
  });

  it("renders parameter errors through the existing error text path", async () => {
    const tool = registerWithSnapshot();

    const blankArray = await tool.execute(
      "call-1",
      { skills: [] },
      undefined,
      undefined,
      { cwd: root },
    );

    const rendered = tool.renderResult(blankArray, undefined, testTheme(), {
      isError: true,
    });

    expect(rendered.text).toContain(
      "Skill error: skills must contain at least one skill name",
    );
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
