import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverSkills,
  parseSkillFile,
  type DiscoverSkillsOptions,
} from "../../src/skill/registry.ts";

describe("skill registry", () => {
  let root: string;
  let homeDir: string;
  let cwd: string;

  beforeEach(() => {
    root = join(tmpdir(), `plan-workflow-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    homeDir = join(root, "home");
    cwd = join(root, "repo", "packages", "app");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSkill(filePath: string, name: string, description = "Use for tests."): void {
    mkdirSync(filePath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
    writeFileSync(filePath, `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
  }

  function discover(extra: Partial<DiscoverSkillsOptions> = {}) {
    return discoverSkills({ cwd, homeDir, now: () => 10, ...extra });
  }

  it("discovers SKILL.md directories and root .md files in .pi skill roots", () => {
    writeSkill(join(cwd, ".pi", "skills", "brainstorming", "SKILL.md"), "brainstorming");
    writeSkill(join(cwd, ".pi", "skills", "single.md"), "single-file");

    const snapshot = discover();

    expect([...snapshot.skills.keys()].sort()).toEqual(["brainstorming", "single-file"]);
    expect(snapshot.skills.get("brainstorming")?.baseDir).toBe(join(cwd, ".pi", "skills", "brainstorming"));
    expect(snapshot.skills.get("single-file")?.baseDir).toBe(join(cwd, ".pi", "skills"));
  });

  it("ignores root .md files in .agents skill roots", () => {
    writeSkill(join(cwd, ".agents", "skills", "ignored.md"), "ignored-root");
    writeSkill(join(cwd, ".agents", "skills", "valid", "SKILL.md"), "valid-agent");

    const snapshot = discover();

    expect([...snapshot.skills.keys()]).toEqual(["valid-agent"]);
  });

  it("walks ancestor .agents skills up to the git root", () => {
    writeSkill(join(root, "repo", ".agents", "skills", "repo-skill", "SKILL.md"), "repo-skill");
    writeSkill(join(root, ".agents", "skills", "outside-skill", "SKILL.md"), "outside-skill");

    const snapshot = discover();

    expect(snapshot.skills.has("repo-skill")).toBe(true);
    expect(snapshot.skills.has("outside-skill")).toBe(false);
  });

  it("discovers installed package cache skills", () => {
    writeSkill(join(homeDir, ".pi", "agent", "git", "github.com", "obra", "superpowers", "skills", "brainstorming", "SKILL.md"), "brainstorming");
    writeSkill(join(homeDir, ".pi", "agent", "npm", "node_modules", "pi-web-access", "skills", "web-search", "SKILL.md"), "web-search");

    const snapshot = discover();

    expect(snapshot.skills.get("brainstorming")?.source).toBe("package-git");
    expect(snapshot.skills.get("web-search")?.source).toBe("package-npm");
  });

  it("respects ignore files and skips node_modules", () => {
    mkdirSync(join(cwd, ".pi", "skills"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "skills", ".ignore"), "ignored-skill/\n");
    writeSkill(join(cwd, ".pi", "skills", "ignored-skill", "SKILL.md"), "ignored-skill");
    writeSkill(join(cwd, ".pi", "skills", "node_modules", "bad", "SKILL.md"), "bad-node");
    writeSkill(join(cwd, ".pi", "skills", "kept", "SKILL.md"), "kept");

    const snapshot = discover();

    expect([...snapshot.skills.keys()]).toEqual(["kept"]);
  });

  it("rejects missing name, missing description, and invalid names", () => {
    const missingName = parseSkillFile({
      filePath: join(root, "missing-name.md"),
      baseDir: root,
      source: "project-pi",
      content: "---\ndescription: Missing name\n---\n# Body\n",
    });
    const missingDescription = parseSkillFile({
      filePath: join(root, "missing-description.md"),
      baseDir: root,
      source: "project-pi",
      content: "---\nname: missing-description\n---\n# Body\n",
    });
    const invalidName = parseSkillFile({
      filePath: join(root, "invalid-name.md"),
      baseDir: root,
      source: "project-pi",
      content: "---\nname: BadName\ndescription: Invalid name\n---\n# Body\n",
    });

    expect(missingName.entry).toBeUndefined();
    expect(missingName.diagnostics[0].message).toBe("skill frontmatter name is required");
    expect(missingDescription.entry).toBeUndefined();
    expect(missingDescription.diagnostics[0].message).toBe("skill frontmatter description is required");
    expect(invalidName.entry).toBeUndefined();
    expect(invalidName.diagnostics[0].message).toContain("invalid skill name");
  });

  it("keeps the first duplicate skill and records a collision diagnostic", () => {
    writeSkill(join(homeDir, ".pi", "agent", "skills", "first", "SKILL.md"), "same-name", "First wins.");
    writeSkill(join(cwd, ".pi", "skills", "second", "SKILL.md"), "same-name", "Second loses.");

    const snapshot = discover();

    expect(snapshot.skills.get("same-name")?.description).toBe("First wins.");
    expect(snapshot.diagnostics.some((diagnostic) => diagnostic.type === "collision")).toBe(true);
  });
});
