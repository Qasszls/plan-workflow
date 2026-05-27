# Task 2: Discover And Validate Skill Files

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/registry.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/registry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run registry tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/registry.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/skill/registry.ts'
```

- [ ] **Step 3: Implement registry public types, parsing, and traversal**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/registry.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export type SkillSource =
  | "global-pi"
  | "global-agents"
  | "package-git"
  | "package-npm"
  | "project-pi"
  | "project-agents";

export interface SkillEntry {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: SkillSource;
}

export interface SkillDiagnostic {
  type: "warning" | "collision";
  message: string;
  path: string;
  winnerPath?: string;
  loserPath?: string;
}

export interface SkillRegistrySnapshot {
  cwd: string;
  skills: Map<string, SkillEntry>;
  diagnostics: SkillDiagnostic[];
  scannedAt: number;
}

export interface DiscoverSkillsOptions {
  cwd: string;
  homeDir?: string;
  now?: () => number;
  maxPackageDepth?: number;
}

interface ParseSkillFileInput {
  filePath: string;
  baseDir: string;
  source: SkillSource;
  content: string;
}

type SkillRootMode = "pi" | "agents";

interface SkillRoot {
  dir: string;
  mode: SkillRootMode;
  source: SkillSource;
}

interface SkillFileCandidate {
  filePath: string;
  baseDir: string;
}

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];
const GENERATED_DIR_NAMES = new Set([
  ".git",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "coverage",
]);

export function discoverSkills(
  options: DiscoverSkillsOptions,
): SkillRegistrySnapshot {
  const cwd = resolve(options.cwd);
  const homeDir = options.homeDir ?? homedir();
  const snapshot: SkillRegistrySnapshot = {
    cwd,
    skills: new Map(),
    diagnostics: [],
    scannedAt: options.now?.() ?? Date.now(),
  };

  for (const root of buildSkillRoots(cwd, homeDir, options.maxPackageDepth ?? 8)) {
    for (const file of collectSkillFiles(root.dir, root.mode)) {
      let content: string;
      try {
        content = readFileSync(file.filePath, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        snapshot.diagnostics.push({
          type: "warning",
          message: `failed to read skill file: ${message}`,
          path: file.filePath,
        });
        continue;
      }

      const parsed = parseSkillFile({
        filePath: file.filePath,
        baseDir: file.baseDir,
        source: root.source,
        content,
      });
      snapshot.diagnostics.push(...parsed.diagnostics);
      if (!parsed.entry) continue;

      const existing = snapshot.skills.get(parsed.entry.name);
      if (existing) {
        snapshot.diagnostics.push({
          type: "collision",
          message: `skill name "${parsed.entry.name}" collision`,
          path: parsed.entry.filePath,
          winnerPath: existing.filePath,
          loserPath: parsed.entry.filePath,
        });
        continue;
      }
      snapshot.skills.set(parsed.entry.name, parsed.entry);
    }
  }

  return snapshot;
}

export function parseSkillFile(input: ParseSkillFileInput): {
  entry?: SkillEntry;
  diagnostics: SkillDiagnostic[];
} {
  const diagnostics: SkillDiagnostic[] = [];
  const match = input.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {
      diagnostics: [{ type: "warning", message: "skill frontmatter is required", path: input.filePath }],
    };
  }

  const frontmatter = parseSimpleFrontmatter(match[1]);
  const name = frontmatter.name?.trim();
  const description = frontmatter.description?.trim();
  if (!name) {
    return {
      diagnostics: [{ type: "warning", message: "skill frontmatter name is required", path: input.filePath }],
    };
  }
  if (!description) {
    return {
      diagnostics: [{ type: "warning", message: "skill frontmatter description is required", path: input.filePath }],
    };
  }

  const nameErrors = validateSkillName(name);
  if (nameErrors.length > 0) {
    return {
      diagnostics: [{
        type: "warning",
        message: `invalid skill name: ${nameErrors.join(", ")}`,
        path: input.filePath,
      }],
    };
  }

  return {
    entry: {
      name,
      description,
      filePath: input.filePath,
      baseDir: input.baseDir,
      source: input.source,
    },
    diagnostics,
  };
}

function buildSkillRoots(
  cwd: string,
  homeDir: string,
  maxPackageDepth: number,
): SkillRoot[] {
  return [
    { dir: join(homeDir, ".pi", "agent", "skills"), mode: "pi", source: "global-pi" },
    { dir: join(homeDir, ".agents", "skills"), mode: "agents", source: "global-agents" },
    ...collectPackageSkillRoots(join(homeDir, ".pi", "agent", "git"), "package-git", maxPackageDepth),
    ...collectPackageSkillRoots(join(homeDir, ".pi", "agent", "npm", "node_modules"), "package-npm", maxPackageDepth),
    { dir: join(cwd, ".pi", "skills"), mode: "pi", source: "project-pi" },
    ...collectAncestorAgentsSkillRoots(cwd),
  ];
}

function collectPackageSkillRoots(
  baseDir: string,
  source: "package-git" | "package-npm",
  maxDepth: number,
): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const base = resolve(baseDir);

  function visit(dir: string, depth: number): void {
    if (depth > maxDepth || !existsSync(dir)) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const fullPath = join(dir, entry.name);
      if (!isDirectory(fullPath)) continue;
      if (entry.name === "skills") {
        roots.push({ dir: fullPath, mode: "pi", source });
        continue;
      }
      if (shouldSkipDirectoryName(entry.name)) continue;
      if (entry.name === "node_modules" && resolve(fullPath) !== base) continue;
      visit(fullPath, depth + 1);
    }
  }

  visit(base, 0);
  return roots;
}

function collectAncestorAgentsSkillRoots(cwd: string): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const gitRoot = findGitRoot(cwd);
  let dir = cwd;
  while (true) {
    roots.push({ dir: join(dir, ".agents", "skills"), mode: "agents", source: "project-agents" });
    if (gitRoot && dir === gitRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return roots;
}

function findGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function collectSkillFiles(dir: string, mode: SkillRootMode): SkillFileCandidate[] {
  const root = resolve(dir);
  const files: SkillFileCandidate[] = [];
  if (!existsSync(root)) return files;

  function visit(currentDir: string, inheritedIgnoreRules: string[]): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const ignoreRules = [
      ...inheritedIgnoreRules,
      ...loadIgnoreRules(currentDir, root),
    ];

    const skillFile = join(currentDir, "SKILL.md");
    if (existsSync(skillFile) && isFile(skillFile)) {
      const relSkillFile = toPosixPath(relative(root, skillFile));
      if (!isIgnored(relSkillFile, ignoreRules)) {
        files.push({ filePath: skillFile, baseDir: currentDir });
      }
      return;
    }

    for (const entry of entries) {
      if (entry.name === "SKILL.md") continue;
      const fullPath = join(currentDir, entry.name);
      const relPath = toPosixPath(relative(root, fullPath));

      if (entry.isFile() || entry.isSymbolicLink()) {
        if (
          mode === "pi" &&
          currentDir === root &&
          entry.name.endsWith(".md") &&
          isFile(fullPath) &&
          !isIgnored(relPath, ignoreRules)
        ) {
          files.push({ filePath: fullPath, baseDir: root });
        }
        continue;
      }

      if (!entry.isDirectory()) continue;
      if (shouldSkipDirectoryName(entry.name)) continue;
      if (!isDirectory(fullPath)) continue;
      if (isIgnored(`${relPath}/`, ignoreRules)) continue;
      visit(fullPath, ignoreRules);
    }
  }

  visit(root, []);
  return files;
}

function loadIgnoreRules(dir: string, root: string): string[] {
  const relativeDir = toPosixPath(relative(root, dir));
  const prefix = relativeDir ? `${relativeDir}/` : "";
  const rules: string[] = [];
  for (const fileName of IGNORE_FILE_NAMES) {
    const filePath = join(dir, fileName);
    if (!existsSync(filePath)) continue;
    try {
      for (const rule of parseIgnoreLines(readFileSync(filePath, "utf-8"))) {
        rules.push(`${prefix}${rule.replace(/^\//, "")}`);
      }
    } catch {}
  }
  return rules;
}

function parseIgnoreLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
}

function isIgnored(relativePath: string, rules: string[]): boolean {
  const normalized = toPosixPath(relativePath);
  return rules.some((rule) => {
    const normalizedRule = toPosixPath(rule);
    if (normalizedRule.endsWith("/")) {
      return normalized.startsWith(normalizedRule);
    }
    return normalized === normalizedRule || normalized.startsWith(`${normalizedRule}/`);
  });
}

function shouldSkipDirectoryName(name: string): boolean {
  return (
    name.startsWith(".") ||
    name === "node_modules" ||
    GENERATED_DIR_NAMES.has(name)
  );
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function parseSimpleFrontmatter(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }
  return values;
}

function validateSkillName(name: string): string[] {
  const errors: string[] = [];
  if (name.length > 64) errors.push("name exceeds 64 characters");
  if (!/^[a-z0-9-]+$/.test(name)) errors.push("name must contain lowercase letters, numbers, and hyphens only");
  if (name.startsWith("-") || name.endsWith("-")) errors.push("name must not start or end with a hyphen");
  if (name.includes("--")) errors.push("name must not contain consecutive hyphens");
  return errors;
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
```

- [ ] **Step 4: Run registry tests to verify pass**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/registry.test.ts
```

Expected:

```text
PASS tests/skill/registry.test.ts
```

- [ ] **Step 5: Commit Task 2**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/skill/registry.ts tests/skill/registry.test.ts
rtk proxy git commit -m "feat: discover Skill files"
```
