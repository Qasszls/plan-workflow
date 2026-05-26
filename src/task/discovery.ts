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

type AgentFrontmatter = {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  tools?: unknown;
};

type AgentKind = "user" | "project";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeNonblankString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTools(value: unknown): string[] | undefined {
  const tools =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value.filter((tool): tool is string => typeof tool === "string")
        : [];
  const normalized = tools.map((tool) => tool.trim()).filter((tool) => tool.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseAgentFile(filePath: string, _kind: AgentKind): TaskAgentConfig | undefined {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: ReturnType<typeof parseFrontmatter<AgentFrontmatter>>;
  try {
    parsed = parseFrontmatter<AgentFrontmatter>(content);
  } catch {
    return undefined;
  }

  const { frontmatter, body } = parsed;
  const name = normalizeNonblankString(frontmatter.name);
  const description = normalizeNonblankString(frontmatter.description);
  if (!name || !description) return undefined;

  const model = normalizeNonblankString(frontmatter.model);
  const tools = normalizeTools(frontmatter.tools);

  return {
    name,
    description,
    ...(model ? { model } : {}),
    ...(tools ? { tools } : {}),
    body: body.trim(),
    filePath,
  };
}

function loadAgentsFromDir(dir: string, kind: AgentKind): TaskAgentConfig[] {
  if (!existsSync(dir)) return [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: TaskAgentConfig[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const agent = parseAgentFile(join(dir, entry.name), kind);
    if (agent) agents.push(agent);
  }
  return agents;
}

export function findProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd;

  while (true) {
    const candidate = join(currentDir, ".pi", "agents");
    if (isDirectory(candidate)) return candidate;
    if (existsSync(join(currentDir, ".git"))) return null;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function getDefaultGlobalAgentsDir(): string {
  try {
    return join(getAgentDir(), "agents");
  } catch {
    return join(homedir(), ".pi", "agent", "agents");
  }
}

export function discoverTaskAgents(
  cwd: string,
  globalAgentsDir = getDefaultGlobalAgentsDir(),
): TaskAgentDiscoveryResult {
  const projectAgentsDir = findProjectAgentsDir(cwd);
  const agentsByName = new Map<string, TaskAgentConfig>();

  for (const agent of loadAgentsFromDir(globalAgentsDir, "user")) {
    agentsByName.set(agent.name, agent);
  }
  if (projectAgentsDir) {
    for (const agent of loadAgentsFromDir(projectAgentsDir, "project")) {
      agentsByName.set(agent.name, agent);
    }
  }

  return {
    agents: Array.from(agentsByName.values()),
    projectAgentsDir,
    globalAgentsDir,
  };
}
