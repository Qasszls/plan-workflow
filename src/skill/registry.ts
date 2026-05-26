import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from "node:fs";
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
const VALID_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function discoverSkills(
  options: DiscoverSkillsOptions,
): SkillRegistrySnapshot {
  const cwd = resolve(options.cwd);
  const homeDir = resolve(options.homeDir ?? homedir());
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
        content = readFileSync(file.filePath, "utf8");
      } catch (error) {
        snapshot.diagnostics.push({
          type: "warning",
          message: `failed to read skill file: ${toErrorMessage(error)}`,
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
      if (!parsed.entry) {
        continue;
      }

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
      diagnostics: [
        {
          type: "warning",
          message: "skill frontmatter is required",
          path: input.filePath,
        },
      ],
    };
  }

  const frontmatter = parseSimpleFrontmatter(match[1]);
  const name = frontmatter.name?.trim();
  const description = frontmatter.description?.trim();

  if (!name) {
    return {
      diagnostics: [
        {
          type: "warning",
          message: "skill frontmatter name is required",
          path: input.filePath,
        },
      ],
    };
  }

  if (!description) {
    return {
      diagnostics: [
        {
          type: "warning",
          message: "skill frontmatter description is required",
          path: input.filePath,
        },
      ],
    };
  }

  const nameErrors = validateSkillName(name);
  if (nameErrors.length > 0) {
    return {
      diagnostics: [
        {
          type: "warning",
          message: `invalid skill name: ${nameErrors.join(", ")}`,
          path: input.filePath,
        },
      ],
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
    {
      dir: join(homeDir, ".pi", "agent", "skills"),
      mode: "pi",
      source: "global-pi",
    },
    {
      dir: join(homeDir, ".agents", "skills"),
      mode: "agents",
      source: "global-agents",
    },
    ...collectPackageSkillRoots(
      join(homeDir, ".pi", "agent", "git"),
      "package-git",
      maxPackageDepth,
    ),
    ...collectPackageSkillRoots(
      join(homeDir, ".pi", "agent", "npm", "node_modules"),
      "package-npm",
      maxPackageDepth,
    ),
    {
      dir: join(cwd, ".pi", "skills"),
      mode: "pi",
      source: "project-pi",
    },
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
    if (depth > maxDepth || !existsSync(dir)) {
      return;
    }

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (!isDirectory(fullPath)) {
        continue;
      }

      if (entry.name === "skills") {
        roots.push({ dir: fullPath, mode: "pi", source });
        continue;
      }

      if (shouldSkipDirectoryName(entry.name)) {
        continue;
      }

      visit(fullPath, depth + 1);
    }
  }

  visit(base, 0);
  return roots;
}

function collectAncestorAgentsSkillRoots(cwd: string): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const gitRoot = findGitRoot(cwd);
  let current = cwd;

  while (true) {
    roots.push({
      dir: join(current, ".agents", "skills"),
      mode: "agents",
      source: "project-agents",
    });

    if (gitRoot && current === gitRoot) {
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return roots;
}

function findGitRoot(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function collectSkillFiles(dir: string, mode: SkillRootMode): SkillFileCandidate[] {
  const root = resolve(dir);
  const files: SkillFileCandidate[] = [];
  if (!existsSync(root)) {
    return files;
  }

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
      const skillPath = toPosixPath(relative(root, skillFile));
      if (!isIgnored(skillPath, ignoreRules)) {
        files.push({ filePath: skillFile, baseDir: currentDir });
      }
      return;
    }

    for (const entry of entries) {
      if (entry.name === "SKILL.md") {
        continue;
      }

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

      if (!entry.isDirectory()) {
        continue;
      }

      if (shouldSkipDirectoryName(entry.name)) {
        continue;
      }

      if (!isDirectory(fullPath)) {
        continue;
      }

      if (isIgnored(`${relPath}/`, ignoreRules)) {
        continue;
      }

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
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      for (const rule of parseIgnoreLines(readFileSync(filePath, "utf8"))) {
        rules.push(`${prefix}${rule.replace(/^\//, "")}`);
      }
    } catch {
      // Ignore unreadable ignore files and continue scanning.
    }
  }

  return rules;
}

function parseIgnoreLines(content: string): string[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
}

function isIgnored(relativePath: string, rules: string[]): boolean {
  const normalizedPath = toPosixPath(relativePath);
  return rules.some((rule) => {
    const normalizedRule = toPosixPath(rule);
    if (normalizedRule.endsWith("/")) {
      return normalizedPath.startsWith(normalizedRule);
    }
    return (
      normalizedPath === normalizedRule ||
      normalizedPath.startsWith(`${normalizedRule}/`)
    );
  });
}

function parseSimpleFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key) {
      result[key] = value;
    }
  }

  return result;
}

function validateSkillName(name: string): string[] {
  const errors: string[] = [];

  if (name.length > 64) {
    errors.push("must be 64 characters or fewer");
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("cannot start or end with hyphen");
  }
  if (name.includes("--")) {
    errors.push("cannot contain consecutive hyphens");
  }
  if (!VALID_SKILL_NAME.test(name)) {
    errors.push("must use lowercase letters, numbers, and single hyphens only");
  }

  return [...new Set(errors)];
}

function shouldSkipDirectoryName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || GENERATED_DIR_NAMES.has(name);
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

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
