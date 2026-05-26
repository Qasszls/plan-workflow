# plan-workflow Task Tool Design

## Purpose

This spec defines the first `Task` tool implementation for `plan-workflow`.

`Task` is a Pi adapter for Claude/Superpowers-style subagent dispatch. It lets the parent model delegate one or more isolated tasks to child Pi agent processes, then returns the child results as one tool result entry.

This is not a task-state tool and not a full workflow engine. Workflow orchestration can build on top of this tool later.

## Source Context

Current package:

- `/Users/liusahngzuo/code/learn/plan-workflow`

Relevant Pi references:

- Pi subagent example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/subagent/`
- Agent discovery example: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/examples/extensions/subagent/agents.ts`
- System prompt builder: `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/system-prompt.ts`
- Agent session active tools/system prompt APIs:
  - `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/agent-session.ts`
  - `/Users/liusahngzuo/code/learn/pi/packages/coding-agent/src/core/extensions/types.ts`

Existing package style:

- TodoWrite is split by responsibility under `src/todo/`.
- Task should follow the same small-file structure.

## Scope

In scope:

- Register one model-visible tool named `Task`.
- Accept a required `tasks` array.
- Support one task or blocking parallel execution.
- Support optional `subagent_type` per task.
- Discover Pi-native agent markdown files from project and global locations.
- Reuse Pi's current effective system prompt instead of rebuilding tool/skill/docs context.
- Return model-visible markdown `content` and structured `details`.
- Render collapsed and expanded TUI results.
- Test pure parsing, prompt assembly, JSON event aggregation, and orchestration.

Out of scope:

- A separate `Agent` tool alias.
- Chain mode.
- Automatic agent selection.
- `cwd` override.
- External persistence.
- TodoWrite integration.
- Supporting non-Pi agent formats such as `~/.agents/agent/*.md`.

## Tool Contract

The model-facing tool is named `Task`.

Parameters:

```ts
interface TaskParams {
  tasks: TaskRequest[];
}

interface TaskRequest {
  description: string;
  prompt: string;
  subagent_type?: string;
}
```

Rules:

- `tasks` is required.
- Empty `tasks` is invalid.
- `tasks.length === 1` runs one child Pi process.
- `tasks.length > 1` runs blocking parallel child Pi processes.
- The maximum number of tasks is `8`.
- The maximum concurrency is `4`.
- Results are returned in input order, not completion order.
- `description` is a short label for TUI and result grouping.
- `prompt` is the complete child task prompt.
- `subagent_type` is optional. Missing `subagent_type` means a default child Pi session.

Example:

```ts
Task({
  tasks: [
    {
      description: "Review TodoWrite state logic",
      prompt: "Review src/todo/state.ts and tests for correctness and missing edge cases.",
      subagent_type: "code-reviewer"
    },
    {
      description: "Review TodoWrite UI",
      prompt: "Review render, overlay, and command behavior for TUI usability."
    }
  ]
})
```

## Agent Discovery

`Task` does not expose `agentScope`, `confirmProjectAgents`, or `agentSource`.

Discovery order:

1. Starting at `ctx.cwd`, walk upward looking for `.pi/agents`.
2. Stop at the nearest directory containing `.git`.
3. Read global agents from `~/.pi/agent/agents`.
4. Merge global and project agents.
5. If names collide, the project agent wins.

Only Pi-native agent markdown files are supported:

```md
---
name: code-reviewer
description: Review implementation against requirements
model: google/gemini-3.1-pro-high
tools: read,grep,bash
---

You are a focused code reviewer.
Prioritize correctness, regressions, and missing tests.
```

Parsing rules:

- `name` and `description` are required.
- `model` is optional.
- `tools` is optional.
- `tools` may be a comma-separated string or a string array.
- Markdown body is the agent-specific role and behavior text.
- Invalid agent files are ignored.

If `subagent_type` is provided and no matching agent is found, that task fails. Other parallel tasks still run.

If `subagent_type` is omitted, no agent file is used.

## Agent Prompt Append

Pi already builds the child runtime system prompt from:

- selected tools
- tool `promptSnippet`
- tool `promptGuidelines`
- skills
- context files
- Pi docs/readme/examples guidance
- current date and working directory

`Task` should not override that system prompt. It should use Pi's native `--append-system-prompt` support to add named-agent instructions.

For a named agent, create an append prompt:

```md
# Subagent role

Name: <agent name>
Description: <agent description>

<agent markdown body>

# Tool boundary

This subagent is limited to these tools:
<agent tools or "default active tools">
```

Pass that append prompt to the child process with `--append-system-prompt`.

For a default child session, do not pass `--append-system-prompt`.

Do not call `ctx.getSystemPrompt()` to copy the parent prompt into the child process. The child Pi process will build its own normal system prompt from the same Pi runtime mechanisms.

Do not separately scan or inline skills, docs, readmes, or examples in the first implementation. Pi's resource loader already handles those for the child process.

If a named agent declares `tools`, also pass them to the child Pi process via `--tools`.

If a named agent declares `model`, pass it via `--model`.

Pi-native `--tools` behavior:

- `--tools read,grep,bash` becomes the allowed and active tool set for the child session.
- The child session rebuilds its system prompt around those selected tools.
- Tool snippets and prompt guidelines are collected from registered tool definitions.
- Unknown tool names are ignored by Pi's active-tool setup.

## Child Process Execution

Each task starts an isolated Pi child process:

```bash
pi --mode json -p --no-session [--append-system-prompt <agent-prompt-file>] [--model <model>] [--tools <tools>] "Task: <prompt>"
```

Implementation should preserve the Pi subagent example's robust process behavior:

- Use the current runtime invocation when possible.
- Fall back to `pi`.
- Write named-agent append prompts to temporary files.
- Reuse one temporary append prompt file per unique named agent within a single `Task` call.
- Clean up temporary append prompt files after all child processes finish.
- Pipe stdout and stderr.
- Respect the parent tool abort signal.
- Kill with `SIGTERM`, then `SIGKILL` after a grace period if needed.

Pi's `--append-system-prompt` accepts either literal text or a path to an existing file. Use a file path for named agents to avoid long command-line arguments and process-list leakage.

## JSON Stream Parsing

Child Pi emits JSON lines.

The runner should collect:

- `message_end` events with `event.message`
- `tool_result_end` events with `event.message`

Collected messages are stored in `TaskRunResult.messages`.

Final output:

```ts
finalOutput = last assistant message's first text part
```

Usage aggregation:

```ts
usage.input += message.usage.input
usage.output += message.usage.output
usage.cacheRead += message.usage.cacheRead
usage.cacheWrite += message.usage.cacheWrite
usage.cost += message.usage.cost.total
usage.contextTokens = message.usage.totalTokens
usage.turns += assistant message count
```

Malformed JSON stdout lines should be ignored. Stderr is captured separately.

## Details Contract

Successful and failed tool calls return structured details:

```ts
interface TaskDetails {
  version: 1;
  results: TaskRunResult[];
}

interface TaskRunResult {
  description: string;
  prompt: string;
  agent: string;
  agentFilePath?: string;
  status: "completed" | "failed" | "aborted";
  finalOutput: string;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}
```

`agent` is:

- the requested `subagent_type` for named agents
- `"default"` when no `subagent_type` was provided
- the requested unknown name when discovery fails

`agentFilePath` is included only when a named agent was found.

## Content Contract

The tool result `content` is markdown for the parent model.

Parallel output must include a one-to-one section for every requested task in input order.

Example:

```md
Task completed: 2/2 succeeded

## 1. Review TodoWrite state logic
Agent: code-reviewer
Status: completed

Final output:
...

## 2. Review TodoWrite UI
Agent: default
Status: completed

Final output:
...
```

Failure example:

```md
Task completed: 1/2 succeeded, 1 failed

## 2. Review TodoWrite UI
Agent: code-reviewer
Status: failed

Error:
...
```

Status rules:

- All child tasks completed: omit `isError` or set `false`.
- Any child task failed or aborted: set `isError: true`.
- Always return all available results in `details`.
- Always include failed task sections in `content`.

## TUI Rendering

`renderCall`:

- Show `Task`.
- Show task count.
- For one task, show description and agent.
- For multiple tasks, show first few descriptions and total count.

`renderResult` collapsed:

- Show aggregate status such as `Task 2/2 succeeded` or `Task 1/2 succeeded, 1 failed`.
- Include short final output previews.
- Indicate expandable details when content was truncated.

`renderResult` expanded:

- Show each task in input order.
- Show description, agent, status, final output, relevant tool calls, and usage.
- Use markdown rendering for final output.

## Module Structure

Create:

```text
src/task/
  schema.ts
  discovery.ts
  prompt.ts
  runner.ts
  orchestrator.ts
  render.ts
  tool.ts
```

Responsibilities:

- `schema.ts`: Typebox params, runtime result/detail types, validators.
- `discovery.ts`: Pi-native agent markdown discovery and frontmatter normalization.
- `prompt.ts`: assemble named-agent append prompt from agent metadata/body and declared tool boundary.
- `runner.ts`: spawn child Pi process and parse JSON stream into `TaskRunResult`.
- `orchestrator.ts`: validate task array, run one or many tasks with concurrency, aggregate statuses.
- `render.ts`: markdown content and TUI render helpers.
- `tool.ts`: `pi.registerTool("Task", ...)`.

Modify:

- `src/index.ts`: register `Task` alongside `TodoWrite`.

## Tests

Focus tests on logic that does not require a real child Pi process.

Schema tests:

- Accept `tasks` with one item.
- Accept missing `subagent_type`.
- Reject empty `tasks`.
- Reject more than `8` tasks.

Discovery tests:

- Find project `.pi/agents` before nearest `.git`.
- Stop searching above nearest `.git`.
- Load global `~/.pi/agent/agents`.
- Project agent overrides global agent with same name.
- Ignore files missing `name` or `description`.
- Normalize `tools` from comma string or string array.

Prompt tests:

- Default task creates no append prompt.
- Named prompt puts agent body in the append prompt.
- Named prompt includes tool boundary text.

Runner tests:

- Parse fake JSON lines into messages.
- Extract final assistant text.
- Aggregate usage.
- Preserve stderr.
- Ignore malformed JSON lines.

Orchestrator tests:

- Preserve input order under parallel completion.
- Mark whole result error when any task fails.
- Still include all task results when one fails.
- Return parameter error for empty task arrays.

Tool registration test:

- Registers `Task`.
- Description mentions subagents or delegated tasks.

## Success Criteria

The implementation is complete when:

- Pi loads `plan-workflow` and exposes `Task`.
- `Task({ tasks: [...] })` runs one default child Pi session.
- `Task({ tasks: [{ subagent_type }] })` runs a named agent if found.
- Multiple tasks run concurrently and return once all finish.
- `content` is readable markdown for the parent model.
- `details` preserves complete structured task records.
- A failed child task marks the overall tool result as `isError: true`.
- Tests pass for discovery, prompt assembly, stream parsing, orchestration, and tool registration.
