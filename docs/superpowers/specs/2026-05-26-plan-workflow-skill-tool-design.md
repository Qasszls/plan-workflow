# plan-workflow Skill Tool Design

## Purpose

This spec defines the first `Skill` tool implementation for `plan-workflow`.

`Skill` is a Pi extension tool that provides Claude Code-style skill invocation for Superpowers compatibility. Superpowers expects a model-visible `Skill` tool and instructs agents not to load skill files with the normal file reader. Pi already has native skill discovery, but the current public extension API does not expose loaded skills to tools. This implementation copies the necessary discovery behavior into `plan-workflow` behind a small registry boundary.

This spec covers only the `Skill` tool. It does not cover automatic `using-superpowers` injection, Task/Agent support, or TodoWrite behavior.

## Source Context

Current package:

- `/Users/liusahngzuo/code/learn/plan-workflow`

Relevant current package behavior:

- `src/index.ts` registers extension tools.
- `src/todo/` keeps TodoWrite split by schema, state, render, commands, overlay, and tool registration.
- `docs/superpowers/specs/2026-05-26-plan-workflow-task-tool-design.md` defines Task separately.

Relevant Pi references used for design only:

- Pi skill docs: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/docs/skills.md`
- Pi skill loader: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/skills.ts`
- Pi package discovery rules: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/package-manager.ts`
- Pi system prompt skill format: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/system-prompt.ts`

Relevant compatibility reference:

- `@uadgj/pi-superpowers-support` provides a working but narrow `Skill` tool. This implementation should preserve the useful model-facing contract while improving discovery boundaries, validation, caching, and testability.

## Scope

In scope:

- Register one model-visible tool named `Skill`.
- Accept only one parameter, `skill: string`.
- Discover skill metadata from supported local skill directories and installed Pi package caches.
- Cache discovery results per working directory for the life of the extension instance.
- Load and return full `SKILL.md` content, including frontmatter.
- Render a compact TUI result for successful loads.
- Return clear errors for missing skills, invalid parameters, and unreadable files.
- Unit test schema, discovery, caching, content loading, tool behavior, and registration.

Out of scope:

- Modifying Pi source or relying on unpublished Pi internals.
- Importing local `/Users/liusahngzuo/code/learn/pi` source files.
- Automatic `using-superpowers` prompt injection.
- Installing, updating, or resolving packages from Pi settings.
- A `/skill-reload` command.
- TTL, file watchers, or per-call filesystem stat checks.
- Reimplementing Pi slash commands such as `/skill:name`.

## Tool Contract

The model-facing tool is named `Skill`.

Parameters:

```ts
interface SkillParams {
  skill: string;
}
```

Rules:

- `skill` is required.
- `skill.trim()` must not be empty.
- No other parameters are accepted.
- The value is matched against discovered skill frontmatter `name`.

Example:

```ts
Skill({ skill: "brainstorming" })
```

## Architecture

The implementation should follow the current package's small-module style:

```text
src/skill/
  cache.ts
  content.ts
  registry.ts
  schema.ts
  tool.ts
```

`src/index.ts` registers both TodoWrite and Skill:

```ts
export default function planWorkflow(pi: ExtensionAPI): void {
  registerTodoWrite(pi);
  registerSkillTool(pi);
}
```

Responsibilities:

- `schema.ts`: TypeBox schema and TypeScript types for `SkillParams`.
- `registry.ts`: filesystem discovery, frontmatter parsing, validation, collision diagnostics.
- `cache.ts`: process-local `cwd` keyed snapshots.
- `content.ts`: read full skill file content and format model-visible skill blocks.
- `tool.ts`: Pi tool registration, error handling, details, and compact rendering.

Future Pi API migration:

- Keep registry access behind an interface such as `SkillRegistry`.
- Current implementation discovers local files.
- If a future Pi release exposes `ctx.getSkills()`, replace the registry implementation without changing the tool schema or result format.

## Skill Discovery

Discovery intentionally copies only the necessary skill rules from Pi. It does not import Pi source and does not install, update, or resolve packages from Pi settings. It may scan already-installed Pi package cache directories so installed Superpowers skills are discoverable.

For a given `cwd`, discover skills from these roots:

1. Global Pi skills: `~/.pi/agent/skills`
2. Global agent skills: `~/.agents/skills`
3. Installed Pi git package skill roots: `skills` directories under `~/.pi/agent/git`
4. Installed Pi npm package skill roots: `skills` directories under `~/.pi/agent/npm/node_modules`
5. Project Pi skills: `<cwd>/.pi/skills`
6. Project/ancestor agent skills: `.agents/skills` starting at `cwd` and walking upward

Installed package cache scanning:

- Recursively search `~/.pi/agent/git` for directories named `skills`.
- Recursively search `~/.pi/agent/npm/node_modules` for directories named `skills`.
- Treat each found directory as a Pi skill root.
- Do not run package installation commands.
- Do not parse Pi settings to decide whether a cached package is enabled in the first implementation.
- Limit recursion depth and skip hidden directories, `node_modules` below the npm root, and common generated directories to avoid expensive scans.

Ancestor `.agents/skills` walking:

- Start from `resolve(cwd)`.
- Include each `<dir>/.agents/skills`.
- Stop after including the nearest git repository root, if one is found.
- If no git repository root is found, stop at filesystem root.

Mode-specific file rules:

- Pi skill roots (`~/.pi/agent/skills`, installed package `skills`, `<cwd>/.pi/skills`) support:
  - directories containing `SKILL.md`
  - root-level `.md` files
- Agent skill roots (`~/.agents/skills`, ancestor `.agents/skills`) support:
  - directories containing `SKILL.md`
  - no root-level `.md` files

Recursive traversal rules:

- If a directory contains `SKILL.md`, that directory is a skill root and traversal does not continue below it.
- Skip hidden entries except ignore files used for traversal rules.
- Skip `node_modules`.
- Follow symlinks only after verifying the target is a file or directory.
- Respect `.gitignore`, `.ignore`, and `.fdignore` files encountered during traversal.

## Skill Validation

A skill file is valid only when:

- It has frontmatter delimited by `---`.
- Frontmatter contains `name`.
- Frontmatter contains `description`.
- `name` is a non-empty string.
- `description` is a non-empty string.

Name validation should follow the Agent Skills shape used by Pi:

- 1 to 64 characters
- lowercase letters, numbers, and hyphens only
- no leading or trailing hyphen
- no consecutive hyphens

Invalid skills are skipped and recorded in diagnostics. Missing `name` is invalid. Do not fall back to the parent directory name.

`disable-model-invocation` does not prevent explicit loading through the `Skill` tool. That field controls model prompt visibility in Pi's native skills system, not explicit tool invocation.

## Collision Behavior

When two valid skills have the same `name`, the first discovered skill wins. Later skills are skipped and recorded in diagnostics.

Discovery order is:

1. Global Pi skills
2. Global agent skills
3. Installed Pi git package skill roots
4. Installed Pi npm package skill roots
5. Project Pi skills
6. Ancestor agent skills from `cwd` upward

This order is intentionally simple for the first implementation. If later work needs full Pi package/settings precedence, replace the registry implementation behind the same interface.

## Cache

Discovery is cached in memory for the lifetime of the extension instance.

Cache behavior:

- Cache key is `resolve(ctx.cwd)`.
- First `Skill` call for a `cwd` scans and stores a `SkillRegistrySnapshot`.
- Later `Skill` calls for the same `cwd` reuse the snapshot and do not rescan.
- Different `cwd` values get separate snapshots.
- Pi reload reloads the extension instance, so the cache naturally resets.

No first version support for:

- persistent disk cache
- TTL
- file watchers
- `/skill-reload`
- automatic stat checks before each lookup

Snapshot shape:

```ts
interface SkillRegistrySnapshot {
  cwd: string;
  skills: Map<string, SkillEntry>;
  diagnostics: SkillDiagnostic[];
  scannedAt: number;
}

interface SkillEntry {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source:
    | "global-pi"
    | "global-agents"
    | "package-git"
    | "package-npm"
    | "project-pi"
    | "project-agents";
}
```

## Content Loading

The registry caches metadata, not full file contents.

When a skill is invoked:

1. Read the target skill file from `SkillEntry.filePath`.
2. Return the full file content including frontmatter.
3. Wrap it in a model-visible skill block:

```md
<skill name="brainstorming" location="/absolute/path/SKILL.md">
References are relative to /absolute/path.

---
name: brainstorming
description: ...
---

# Brainstorming Ideas Into Designs
...
</skill>
```

This keeps the returned content explicit, debuggable, and close to the skill file on disk.

## Tool Results

Successful result:

```ts
{
  content: [{ type: "text", text: formattedSkillBlock }],
  details: {
    skillName,
    skillPath,
    description,
    baseDir,
    lineCount
  }
}
```

Missing skill result:

```ts
{
  content: [{
    type: "text",
    text: "Skill \"x\" not found.\n\nAvailable skills:\n- ..."
  }],
  isError: true,
  details: {
    requestedSkill,
    availableSkills,
    diagnostics
  }
}
```

Unreadable skill result:

```ts
{
  content: [{
    type: "text",
    text: "Error loading skill \"x\": failed to read skill file."
  }],
  isError: true,
  details: {
    requestedSkill,
    skillPath,
    error
  }
}
```

Diagnostics in tool results should be concise. Include counts and the most useful path/message pairs, not a long unbounded dump.

## TUI Rendering

Successful `Skill` results should not render full skill content in the TUI.

Render one compact line:

```text
[skill] brainstorming (164 lines)
```

Error results should render the error text directly.

## Testing

Add focused tests under `tests/skill/`.

Schema tests:

- accepts `{ skill: "brainstorming" }`
- rejects missing `skill`
- rejects empty or whitespace-only `skill`
- rejects extra properties

Registry tests:

- discovers directory skills with `SKILL.md`
- discovers root `.md` files in `.pi/skills`
- ignores root `.md` files in `.agents/skills`
- discovers installed Superpowers skills under `~/.pi/agent/git/.../skills`
- walks ancestor `.agents/skills` up to git root
- skips hidden directories and `node_modules`
- respects ignore files
- rejects missing `name`
- rejects missing `description`
- rejects invalid names
- keeps the first duplicate skill and records a collision diagnostic

Cache tests:

- first lookup scans
- second lookup for same `cwd` reuses snapshot
- different `cwd` values get different snapshots

Content tests:

- reads full content including frontmatter
- formats the `<skill>` block with location and base directory
- reports read errors

Tool tests:

- registers `Skill`
- returns full formatted content for a found skill
- returns available skills when a skill is missing
- returns an error when the skill file cannot be read
- renders compact success output

## Verification

After implementation:

```bash
rtk npm run typecheck
rtk npm test
rtk npm run check
```

Manual verification:

```bash
pi --no-extensions --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts --tools Skill -p "Use the Skill tool to load the brainstorming skill."
```

Expected manual result:

- `Skill` appears in the active tool set.
- Invoking `Skill({ skill: "brainstorming" })` returns the full skill content to the model.
- The TUI displays only a compact skill-loaded line.
