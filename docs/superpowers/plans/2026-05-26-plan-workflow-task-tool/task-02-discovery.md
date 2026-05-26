# Task 2: Discover Pi-native agents

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/discovery.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/discovery.test.ts`

- [ ] **Step 1: Write failing discovery tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/discovery.test.ts`:

```ts
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

  it("normalizes tools from YAML arrays", () => {
    const root = tempRoot();
    const filePath = join(root, "array-tools.md");
    writeAgent(filePath, "name: reviewer\ndescription: Review code\ntools:\n  - read\n  - grep");

    expect(parseAgentFile(filePath, "user")?.tools).toEqual(["read", "grep"]);
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
```

- [ ] **Step 2: Run discovery tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/discovery.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/discovery.ts'
```

- [ ] **Step 3: Implement discovery**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/discovery.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export interface TaskAgentConfig {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  body: string;
  filePath: string;
}

export interface TaskAgentDiscoveryResult {
  agents: TaskAgentConfig[];
  projectAgentsDir: string | null;
  globalAgentsDir: string;
}

interface AgentFrontmatter {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  tools?: unknown;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeTools(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const tools = value.split(",").map((tool) => tool.trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  if (Array.isArray(value)) {
    const tools = value.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  return undefined;
}

export function parseAgentFile(filePath: string, _kind: "project" | "user"): TaskAgentConfig | undefined {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }

  const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
  if (typeof frontmatter.name !== "string" || !frontmatter.name.trim()) return undefined;
  if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) return undefined;

  const model = typeof frontmatter.model === "string" && frontmatter.model.trim() ? frontmatter.model.trim() : undefined;
  return {
    name: frontmatter.name.trim(),
    description: frontmatter.description.trim(),
    ...(model ? { model } : {}),
    ...(normalizeTools(frontmatter.tools) ? { tools: normalizeTools(frontmatter.tools) } : {}),
    body: body.trim(),
    filePath,
  };
}

function loadAgentsFromDir(dir: string, kind: "project" | "user"): TaskAgentConfig[] {
  if (!isDirectory(dir)) return [];

  const agents: TaskAgentConfig[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const agent = parseAgentFile(join(dir, entry.name), kind);
    if (agent) agents.push(agent);
  }
  return agents;
}

export function findProjectAgentsDir(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi", "agents");
    if (isDirectory(candidate)) return candidate;

    // Stop upward search once the nearest .git boundary is reached.
    if (existsSync(join(current, ".git"))) return null;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function getDefaultGlobalAgentsDir(): string {
  try {
    return join(getAgentDir(), "agents");
  } catch {
    return join(homedir(), ".pi", "agent", "agents");
  }
}

export function discoverTaskAgents(cwd: string, globalAgentsDir = getDefaultGlobalAgentsDir()): TaskAgentDiscoveryResult {
  const projectAgentsDir = findProjectAgentsDir(cwd);
  const globalAgents = loadAgentsFromDir(globalAgentsDir, "user");
  const projectAgents = projectAgentsDir ? loadAgentsFromDir(projectAgentsDir, "project") : [];
  const byName = new Map<string, TaskAgentConfig>();

  for (const agent of globalAgents) byName.set(agent.name, agent);
  for (const agent of projectAgents) byName.set(agent.name, agent);

  return {
    agents: Array.from(byName.values()),
    projectAgentsDir,
    globalAgentsDir,
  };
}
```

- [ ] **Step 4: Run discovery tests**

Run:

```bash
npm test -- tests/task/discovery.test.ts
```

Expected:

```text
PASS tests/task/discovery.test.ts
```

- [ ] **Step 5: Commit discovery**

Run:

```bash
git add src/task/discovery.ts tests/task/discovery.test.ts
git commit -m "feat: discover Task agents"
```
