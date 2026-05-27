# Explore Agent Design

## Goal

Add a project-local `explore` subagent for `plan-workflow` that helps the main agent quickly understand unfamiliar code without editing files.

The agent should answer questions such as:

- Where is a behavior implemented?
- Which files contain a keyword, type, or pattern?
- What existing code paths matter before making a change?
- What tests or docs are relevant to a requested feature or bug?

## Background

OpenCode documents `Explore` as a fast, read-only `subagent` for exploring codebases, finding files by pattern, searching code for keywords, and answering codebase questions.

The `oh-my-opencode` Explore agent follows the same shape with a stricter prompt: it is a `subagent`, uses low temperature, denies writing and recursive-agent tools, describes itself as contextual grep for codebases, requires intent analysis, searches from multiple angles, and returns structured results with files, answer, and next steps.

`plan-workflow` already discovers project-local agents from `.pi/agents/*.md`. The smallest useful change is therefore to add a project agent file rather than changing Task discovery or registration code.

## Decision

Create `.pi/agents/explore.md` in this repository.

The file will define a Pi-native agent with:

```yaml
---
name: explore
description: Fast read-only codebase exploration agent. Finds files, searches code, explains where behavior lives, and returns actionable results without modifying files.
tools: read,grep,bash
---
```

The body will adapt the OpenCode Explore pattern to Pi:

- act as a codebase search specialist
- stay read-only
- avoid creating, editing, deleting, or formatting files
- avoid recursive delegation through `Task`
- analyze the caller's real need before searching
- use multiple search angles when the target is not obvious
- return absolute file paths
- end with a structured `<results>` block

## User Experience

The main agent can invoke this subagent with:

```json
{
  "tasks": [
    {
      "description": "Explore task runner",
      "prompt": "Find where Task child process args are built and explain the relevant flow.",
      "subagent_type": "explore"
    }
  ]
}
```

Expected output shape:

```xml
<analysis>
Literal Request: Find where Task child process args are built.
Actual Need: Identify the files and functions to edit safely.
Success Looks Like: The caller can open the exact functions and understand the flow.
</analysis>

<results>
<files>
- /absolute/path/src/task/runner.ts — builds Pi CLI args and launches child processes
- /absolute/path/src/task/orchestrator.ts — resolves requested subagent names before invoking the runner
</files>

<answer>
Task child process arguments are built in `buildPiArgs()` and passed through `runTaskChildProcess()`.
</answer>

<next_steps>
Edit `src/task/runner.ts` if argument construction changes; edit `src/task/orchestrator.ts` if agent resolution changes.
</next_steps>
</results>
```

## Behavior Rules

### Read-only constraints

The agent must not:

- write files
- edit files
- delete files
- run formatters or generators that mutate files
- create commits
- invoke `Task` or other recursive child agents

It may use read-only shell commands such as:

- `pwd`
- `find`
- `rg` or `grep`
- `git grep`
- `git log --oneline`
- `git status --short`

If a command might modify the workspace, the agent must not run it.

### Search strategy

The agent should choose search depth from the prompt:

- quick: one or two obvious searches
- medium: several search angles across source, tests, docs
- very thorough: broad search, cross-check tests/docs/history where useful

If no depth is specified, use medium.

For unfamiliar code, start with at least two independent angles, such as symbol names plus file names or source plus tests.

### Output contract

Every successful response must include:

1. `<analysis>` with Literal Request, Actual Need, and Success Looks Like.
2. `<results>` containing:
   - `<files>`: absolute paths and why each file matters
   - `<answer>`: direct explanation of the finding
   - `<next_steps>`: what the caller should do next, or `Ready to proceed - no follow-up needed`

If no relevant files are found, the agent must still return `<results>` and explain the searches it tried.

## Scope

### In scope

- Add `.pi/agents/explore.md`.
- Keep the agent project-local to avoid surprising other repositories.
- Use existing Task agent discovery unchanged.
- Add tests only if implementation touches code; this design does not require code changes.

### Out of scope

- Fixing `subagent_type: "default"` handling.
- Adding a global `~/.pi/agent/agents/explore.md`.
- Adding built-in agent registration to the extension.
- Adding new tools or permissions to Pi.
- Automatically selecting `explore` from the main prompt.

## Verification

Manual verification:

1. Confirm `.pi/agents/explore.md` exists.
2. Run a Task call with `subagent_type: "explore"`.
3. Confirm the child result uses agent `explore`.
4. Confirm output contains `<analysis>` and `<results>`.
5. Confirm no files changed except expected docs/agent files.

Optional command-line smoke test:

```bash
pi --no-extensions --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts --tools Task -p 'Use Task with subagent_type explore to find where Task agent discovery loads .pi/agents files.'
```

## Risks

- The `tools: read,grep,bash` list depends on Pi tool names available in the running environment. If `grep` is not available as a tool name, the agent can still use `bash` for `grep` or `rg`.
- `bash` is powerful, so the read-only guarantee relies on prompt discipline rather than hard sandboxing.
- If Task discovery has a bug or the current working directory is outside the repository, the project-local agent may not be found.
