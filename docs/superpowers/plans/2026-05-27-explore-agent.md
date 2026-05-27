# Explore Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-local `explore` Task subagent that performs read-only codebase exploration and returns structured, actionable results.

**Architecture:** Use the existing Task agent discovery path by creating `.pi/agents/explore.md`; do not change TypeScript code. The agent file contains Pi-native frontmatter plus an OpenCode-inspired prompt that constrains the child session to read-only exploration and a stable output contract.

**Tech Stack:** Pi agent markdown frontmatter, existing `src/task/discovery.ts` project-agent loading, built-in read-only Pi tools (`read`, `grep`, `find`, `ls`) plus `bash` for read-only shell searches.

---

## File Structure

- Create: `.pi/agents/explore.md`
  - Project-local subagent definition discovered by `src/task/discovery.ts`.
  - Frontmatter names the subagent `explore`, describes when to use it, and limits tools to discovery/search commands.
  - Body defines read-only constraints, search strategy, and XML-style output contract.

No source-code files should change for this feature. Existing `.gitignore` does not ignore `.pi/`, so the new agent file can be committed directly.

---

### Task 1: Add project-local Explore agent

**Files:**
- Create: `.pi/agents/explore.md`

- [ ] **Step 1: Verify `explore` is not already defined**

Run:

```bash
find .pi/agents -maxdepth 1 -type f -name '*.md' -print 2>/dev/null || true
```

Expected before this task:

```text
```

If the command prints `.pi/agents/explore.md`, stop and inspect that file instead of overwriting it.

- [ ] **Step 2: Create the project agent directory**

Run:

```bash
mkdir -p .pi/agents
```

Expected: command exits with status 0 and prints no output.

- [ ] **Step 3: Create `.pi/agents/explore.md`**

Write this exact file content:

```markdown
---
name: explore
description: Fast read-only codebase exploration agent. Finds files, searches code, explains where behavior lives, and returns actionable results without modifying files.
tools: read,grep,find,ls,bash
---

You are a codebase exploration specialist. Your job is to find files, locate code, explain existing behavior, and return actionable evidence to the caller.

## Mission

Answer questions like:

- Where is X implemented?
- Which files contain Y?
- Find the code that does Z.
- Which tests, docs, or call paths matter before changing this behavior?

Your output should let the caller proceed without asking where to look next.

## Required Intent Analysis

Before searching, include an analysis block:

<analysis>
Literal Request: [what the caller literally asked]
Actual Need: [what the caller needs in order to proceed]
Success Looks Like: [what evidence or answer would make this complete]
</analysis>

If the request is ambiguous, state the most likely interpretation and proceed with a conservative read-only search.

## Read-only Rules

You must not:

- create files
- edit files
- delete files
- format files
- run generators that write files
- create commits
- invoke Task or any other recursive child agent
- run commands that intentionally mutate the workspace or external state

Allowed commands are read-only discovery commands such as:

- pwd
- ls
- find
- grep
- rg
- git grep
- git log --oneline
- git status --short

If a command might change files or state, do not run it. Report that the command is outside your read-only scope.

## Search Strategy

Choose search depth from the prompt:

- quick: one or two obvious searches
- medium: several search angles across source, tests, and docs
- very thorough: broad search, cross-checking source, tests, docs, and history where useful

If no depth is specified, use medium.

For unfamiliar code, search from at least two independent angles before answering. Examples:

- file names plus symbol names
- source plus tests
- docs plus implementation
- exact string plus related type or function names

Prefer precise results over broad dumps. Include enough context to explain why each file matters.

## Required Result Format

Always end with this exact structure:

<results>
<files>
- /absolute/path/to/file1.ts — why this file is relevant
- /absolute/path/to/file2.test.ts — why this test or example is relevant
</files>

<answer>
Direct answer to the caller's actual need. Explain the relevant flow or relationship, not just a list of matches.
</answer>

<next_steps>
What the caller should do with this information, or: Ready to proceed - no follow-up needed
</next_steps>
</results>

## Output Requirements

- Use absolute paths only in the <files> list.
- If no relevant files are found, keep the same <results> structure and explain which searches found nothing.
- Keep the answer concise and evidence-backed.
- Do not include emojis.
- Do not write findings to files; report findings in your message only.
```

- [ ] **Step 4: Verify the file exists and has the expected frontmatter**

Run:

```bash
head -12 .pi/agents/explore.md
```

Expected output starts with:

```text
---
name: explore
description: Fast read-only codebase exploration agent. Finds files, searches code, explains where behavior lives, and returns actionable results without modifying files.
tools: read,grep,find,ls,bash
---
```

- [ ] **Step 5: Commit the agent file**

Run:

```bash
git add .pi/agents/explore.md
git commit -m "feat: add explore subagent"
```

Expected: commit succeeds and includes only `.pi/agents/explore.md`.

---

### Task 2: Smoke test Explore through Task

**Files:**
- Read: `.pi/agents/explore.md`
- Read: `src/task/discovery.ts`
- Read: `src/task/runner.ts`

- [ ] **Step 1: Confirm no unrelated files are staged**

Run:

```bash
git status --short
```

Expected: no staged changes. Existing unstaged user changes may remain, such as `README.md` or `.gitignore`; do not stage them.

- [ ] **Step 2: Run a Task smoke test using `subagent_type: "explore"`**

Run:

```bash
pi --no-extensions --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts --tools Task -p 'Use Task with one child task: description "Explore discovery", prompt "Quick: find where project-local Task agents are discovered and explain the relevant flow. Do not modify files.", subagent_type "explore".'
```

Expected:

- The `Task` tool runs one child task.
- The child result lists `Agent: explore`.
- The child output contains `<analysis>`.
- The child output contains `<results>`.
- The child output references `/Users/liusahngzuo/code/learn/plan-workflow/src/task/discovery.ts`.
- The child does not create, edit, or delete files.

- [ ] **Step 3: Check workspace cleanliness after smoke test**

Run:

```bash
git status --short
```

Expected:

- `.pi/agents/explore.md` is committed and no longer appears as untracked or modified.
- No new files were created by the explore child.
- Any pre-existing unstaged changes remain untouched.

- [ ] **Step 4: Investigate smoke-test failure if `explore` is not found**

Run:

```bash
node --input-type=module -e "import { discoverTaskAgents } from './src/task/discovery.ts'; const result = discoverTaskAgents(process.cwd()); console.log(result.projectAgentsDir); console.log(result.agents.map((agent) => agent.name).join('\n'));"
```

Expected output contains:

```text
/Users/liusahngzuo/code/learn/plan-workflow/.pi/agents
explore
```

If `explore` is missing, inspect `.pi/agents/explore.md` frontmatter for a nonblank `name` and `description`.

- [ ] **Step 5: Commit no additional changes**

Run:

```bash
git status --short
```

Expected: no new implementation changes remain to commit. If the smoke test generated session files outside the repository, leave them alone.

---

## Self-Review

Spec coverage:

- Project-local `.pi/agents/explore.md`: Task 1.
- OpenCode-inspired read-only exploration behavior: Task 1 Step 3.
- Structured `<analysis>` and `<results>` output: Task 1 Step 3 and Task 2 Step 2.
- Existing Task discovery unchanged: File Structure and Task 2 Step 4.
- Manual verification: Task 2.

Placeholder scan:

- The plan contains no placeholder implementation steps.
- The bracketed fields inside the agent prompt are intentional instructions to the future explore agent for filling response content at runtime, not plan placeholders.

Type and path consistency:

- Agent name is consistently `explore`.
- Project agent path is consistently `.pi/agents/explore.md`.
- Smoke test uses the current project path `/Users/liusahngzuo/code/learn/plan-workflow`.
