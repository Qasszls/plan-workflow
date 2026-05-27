import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatSkillBlock,
  loadSkillContent,
} from "../../src/skill/content.ts";
import type { SkillEntry } from "../../src/skill/registry.ts";

describe("skill content", () => {
  let root: string;
  let entry: SkillEntry;

  beforeEach(() => {
    root = join(tmpdir(), `plan-workflow-skill-content-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const skillDir = join(root, "brainstorming");
    mkdirSync(skillDir, { recursive: true });
    const filePath = join(skillDir, "SKILL.md");
    writeFileSync(filePath, "---\nname: brainstorming\ndescription: Use when designing.\n---\n# Brainstorming\nBody\n");
    entry = {
      name: "brainstorming",
      description: "Use when designing.",
      filePath,
      baseDir: skillDir,
      source: "project-pi",
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads full skill content including frontmatter", () => {
    const loaded = loadSkillContent(entry);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.rawContent).toContain("---\nname: brainstorming");
    expect(loaded.lineCount).toBe(6);
  });

  it("formats a model-visible skill block", () => {
    const text = formatSkillBlock(entry, "---\nname: brainstorming\n---\n# Body\n");

    expect(text).toContain(`<skill name="brainstorming" location="${entry.filePath}">`);
    expect(text).toContain(`References are relative to ${entry.baseDir}.`);
    expect(text).toContain("---\nname: brainstorming\n---");
    expect(text).toContain("</skill>");
  });

  it("returns a read error for missing files", () => {
    const missing = { ...entry, filePath: join(root, "missing", "SKILL.md") };
    const loaded = loadSkillContent(missing);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain("failed to read skill file");
  });
});
