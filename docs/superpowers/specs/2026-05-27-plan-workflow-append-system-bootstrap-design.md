# plan-workflow Append System Bootstrap Design

## Purpose

Add a small, composable startup path for using `plan-workflow` with Superpowers-style workflows.

The package should provide a root `APPEND_SYSTEM.md` that can be passed to Pi with `--append-system-prompt`, plus a minimal Node wrapper script that starts Pi with this package's extension and append prompt. The package should also accept Claude Code/Superpowers-style single-skill tool calls so the bootstrap can safely tell the model to use the `Skill` tool.

## Source Context

Current package:

- `/Users/liusahngzuo/code/learn/plan-workflow`

Relevant current behavior:

- `src/index.ts` registers `TodoWrite`, `Task`, and `Skill`.
- `src/skill/tool.ts` registers a batch `Skill` tool using `skills: string[]`.
- `src/skill/schema.ts` normalizes strict batch params only.
- Superpowers prompts and tests expect Claude Code-style `Skill` invocations with a single `skill` field, for example `Skill({ skill: "brainstorming" })`.

Relevant Pi behavior:

- `--append-system-prompt <text-or-file>` appends to the default system prompt through Pi's native system prompt builder.
- `.pi/APPEND_SYSTEM.md` and `~/.pi/agent/APPEND_SYSTEM.md` are also native append-system-prompt sources.
- Extension `promptPaths` are prompt templates, not system prompt append sources.
- Extension `before_agent_start` can modify the final system prompt string, but this design intentionally avoids runtime system prompt mutation for the bootstrap.

## Scope

In scope:

- Add a root `APPEND_SYSTEM.md` containing a short Superpowers bootstrap instruction.
- Add one simple Node wrapper script at `scripts/pi-plan-workflow.mjs`.
- The wrapper starts `pi` with the local `plan-workflow` extension and root append-system prompt.
- The wrapper uses hard-coded local absolute paths and accepts no user arguments.
- Add compatibility for `Skill({ skill: "name" })` while preserving `Skill({ skills: ["name"] })`.
- Add tests for single-skill parameter compatibility.

Out of scope:

- Runtime `before_agent_start` pre-context injection.
- A `src/pre-context/` module.
- Modifying Pi core.
- Installing or editing user/project `.pi/APPEND_SYSTEM.md` files.
- A generalized launcher framework.
- Multiple scripts or multiple agent profiles.
- Environment variable configuration.
- Argument passthrough.
- Agent alias support.

## User-Facing Behavior

The user can run:

```bash
node scripts/pi-plan-workflow.mjs
```

The script starts:

```bash
pi \
  --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts \
  --append-system-prompt /Users/liusahngzuo/code/learn/plan-workflow/APPEND_SYSTEM.md
```

The script is intentionally just a readable Node wrapper around this fixed command. It does not accept arguments, merge configuration, locate project roots, or compose other agents.

## APPEND_SYSTEM.md Content

The root append prompt should be short and stable:

```md
# Plan Workflow Superpowers Bootstrap

At the start of each conversation, use the Skill tool to load the `using-superpowers` skill before responding or taking actions.

Use the Skill tool, not the read tool, to load skill files.

If a task matches an available skill, invoke the relevant skill before answering or acting.
```

Design notes:

- Do not inline the full `using-superpowers` skill; the model should load it through `Skill`.
- Do not include timestamps, session state, diagnostics, or generated text.
- Keep the prompt deterministic to preserve prompt-cache friendliness.
- Keep wording independent of the exact tool parameter shape; compatibility code handles both single and batch forms.

## Skill Parameter Compatibility

Current primary API remains:

```ts
Skill({ skills: ["brainstorming"] })
```

Add compatibility for:

```ts
Skill({ skill: "brainstorming" })
```

Implementation shape:

- Add `prepareArguments` to the `Skill` tool definition.
- If args are an object containing `skill` and not containing `skills`, return `{ skills: [args.skill] }`.
- Otherwise return args unchanged.
- Update `normalizeSkillParams()` defensively so direct calls with `{ skill: string }` also normalize to `{ ok: true, skills: [string] }`.
- Keep batch validation behavior unchanged for normal `{ skills }` calls.
- Continue rejecting ambiguous or malformed params, such as `{ skill: "x", skills: ["y"] }`, because extra properties remain invalid after preparation.

## Script Design

Create `scripts/pi-plan-workflow.mjs`:

```js
#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn(
  "pi",
  [
    "--extension",
    "/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts",
    "--append-system-prompt",
    "/Users/liusahngzuo/code/learn/plan-workflow/APPEND_SYSTEM.md",
  ],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
```

No argument handling is added. If the user later wants model selection, extra append prompts, or other agent profiles, they can edit the array directly or create a separate script in future work.

## Data Flow

Startup flow:

1. User runs `node scripts/pi-plan-workflow.mjs`.
2. Script spawns `pi` with the local extension path.
3. Script passes the package root `APPEND_SYSTEM.md` via `--append-system-prompt`.
4. Pi's native resource/system-prompt builder appends the file content to the default system prompt.
5. The model sees the bootstrap and should call `Skill` to load `using-superpowers`.
6. If the model calls `Skill({ skill: "using-superpowers" })`, `prepareArguments` converts it to batch form before validation/execution.

## Compaction and Prompt Cache Considerations

The bootstrap is passed through Pi's native append-system-prompt path, not as a message.

Consequences:

- It does not enter session history.
- It is not summarized by compaction.
- It remains present after compaction because it is part of the system prompt source.
- It is stable across turns as long as `APPEND_SYSTEM.md` is unchanged.
- It avoids the per-turn final-system-prompt replacement approach.

## Error Handling

Script:

- If `pi` cannot be spawned, Node emits the normal child process error and exits via the unhandled error path or visible stderr.
- Child process stdout/stderr/stdin are inherited.
- Child exit code is propagated.
- Signal exit attempts to propagate the same signal to the wrapper process.

Skill compatibility:

- Blank single skill values produce the same validation error as blank batch entries.
- Non-string single skill values produce a clear validation error through normalization.
- Existing batch behavior and error messages are preserved where possible.

## Testing

Update skill schema tests:

- `normalizeSkillParams({ skill: "brainstorming" })` returns `{ ok: true, skills: ["brainstorming"] }`.
- `normalizeSkillParams({ skill: "  brainstorming  " })` trims the skill name.
- `normalizeSkillParams({ skill: "" })` rejects blank names.
- Existing batch tests still pass.
- Ambiguous `{ skill: "x", skills: ["y"] }` is rejected.

Update skill tool tests:

- The registered `Skill` tool has a `prepareArguments` function.
- `prepareArguments({ skill: "brainstorming" })` returns `{ skills: ["brainstorming"] }`.
- Normal batch input remains unchanged.
- Executing after prepared single-skill input loads the requested skill.

Manual verification:

```bash
node scripts/pi-plan-workflow.mjs
```

Expected:

- Pi starts with the local `plan-workflow` extension.
- Pi uses `APPEND_SYSTEM.md` as an append system prompt.
- Asking a first prompt should cause the model to load `using-superpowers` via `Skill` before substantive work.

## Acceptance Criteria

- `APPEND_SYSTEM.md` exists at the package root with short bootstrap instructions.
- `scripts/pi-plan-workflow.mjs` exists and contains a simple hard-coded Pi spawn command.
- The `Skill` tool accepts both `{ skills: [...] }` and `{ skill: "..." }`.
- Existing batch `Skill` behavior is not regressed.
- `npm test -- tests/skill/schema.test.ts tests/skill/tool.test.ts` passes.
- `npm run check` passes before implementation is considered complete.
