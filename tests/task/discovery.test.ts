import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverTaskAgents,
  findProjectAgentsDir,
  parseAgentFile,
  type TaskAgentConfig,
} from "../../src/task/discovery.ts";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "plan-workflow-agents-"));
  roots.push(root);
  return root;
}

function writeAgent(filePath: string, frontmatter: string, body = "Agent body."): void {
  writeFileSync(filePath, `---\n${frontmatter}\n---\n\n${body}\n`, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("task agent discovery", () => {
  it("parses a Pi-native agent markdown file", () => {
    const root = tempRoot();
    const filePath = join(root, "reviewer.md");
    writeAgent(filePath, "name: code-reviewer\ndescription: Review code\nmodel: test-model\ntools: read,grep,bash", "Review carefully.");

    expect(parseAgentFile(filePath, "user")).toEqual<TaskAgentConfig>({
      name: "code-reviewer",
      description: "Review code",
      model: "test-model",
      tools: ["read", "grep", "bash"],
      body: "Review carefully.",
      filePath,
    });
  });

  it("ignores files missing name or description", () => {
    const root = tempRoot();
    const missingName = join(root, "missing-name.md");
    const missingDescription = join(root, "missing-description.md");
    writeAgent(missingName, "description: Missing name");
    writeAgent(missingDescription, "name: missing-description");

    expect(parseAgentFile(missingName, "user")).toBeUndefined();
    expect(parseAgentFile(missingDescription, "user")).toBeUndefined();
  });

  it("ignores files with malformed frontmatter", () => {
    const root = tempRoot();
    const filePath = join(root, "malformed.md");
    writeFileSync(filePath, "---\nname: [broken\n---\n\nAgent body.\n", "utf8");

    expect(parseAgentFile(filePath, "user")).toBeUndefined();
  });

  it("normalizes tools from YAML arrays", () => {
    const root = tempRoot();
    const filePath = join(root, "array-tools.md");
    writeAgent(filePath, "name: reviewer\ndescription: Review code\ntools:\n  - read\n  - grep");

    expect(parseAgentFile(filePath, "user")?.tools).toEqual(["read", "grep"]);
  });

  it("loads agents from each directory in deterministic filename order", () => {
    const root = tempRoot();
    const agentsDir = join(root, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeAgent(join(agentsDir, "z-writer.md"), "name: writer\ndescription: Writer", "Writer body.");
    writeAgent(join(agentsDir, "a-reviewer.md"), "name: reviewer\ndescription: Reviewer", "Reviewer body.");

    const result = discoverTaskAgents(root, agentsDir);

    expect(result.agents.map((agent) => agent.name)).toEqual(["reviewer", "writer"]);
  });

  it("finds project agents at or below the nearest git root", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    mkdirSync(join(root, "packages", "app"), { recursive: true });

    expect(findProjectAgentsDir(join(root, "packages", "app"))).toBe(join(root, ".pi", "agents"));
  });

  it("stops project agent search above the nearest git root", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
    mkdirSync(join(root, "repo", "src"), { recursive: true });

    expect(findProjectAgentsDir(join(root, "repo", "src"))).toBeNull();
  });

  it("merges global and project agents with project override", () => {
    const root = tempRoot();
    const globalDir = join(root, "global-agents");
    const projectRoot = join(root, "project");
    const projectDir = join(projectRoot, ".pi", "agents");
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectRoot, ".git"));
    writeAgent(join(globalDir, "reviewer.md"), "name: reviewer\ndescription: Global reviewer", "Global body.");
    writeAgent(join(projectDir, "reviewer.md"), "name: reviewer\ndescription: Project reviewer", "Project body.");
    writeAgent(join(globalDir, "writer.md"), "name: writer\ndescription: Global writer", "Writer body.");

    const result = discoverTaskAgents(projectRoot, globalDir);

    expect(result.projectAgentsDir).toBe(projectDir);
    expect(result.agents.map((agent) => [agent.name, agent.description, agent.body])).toEqual([
      ["reviewer", "Project reviewer", "Project body."],
      ["writer", "Global writer", "Writer body."],
    ]);
  });
});
