# Task Tool Inline Progress and Artifacts Design

## Goal

Improve `plan-workflow`'s `Task` tool observability so child Pi agents no longer feel like a black box while they run.

The user should be able to see, inside the normal Task tool card in the conversation window:

- which child agents are running, completed, failed, or aborted
- elapsed time per child
- token usage per child
- tool-call count per child
- the current or most recent activity per child
- diagnostic artifact paths when a run fails or needs investigation

This design intentionally does not add a bottom widget, footer roster, or editor-adjacent persistent UI. The progress display belongs in the existing Task tool call/result surface, like the current Task output.

## Background

The current Task tool already supports partial updates and a transient `running` state. It still lacks enough live detail to reassure the user that child agents are active.

A related bug note documents a more serious observability gap:

- `docs/bug/subagent/2026-05-27-task-tool-false-failures.md`

In that case, a child agent implemented and committed successfully, but the parent Task result reported failure without enough diagnostics to determine whether the failure came from child process exit code, assistant `stopReason`, stderr, JSON parsing, or a post-commit child-agent error.

This design adds live inline progress and default-on local artifacts so false failures and similar problems can be debugged after the fact.

## Research Summary

External subagent UI patterns point to three common approaches:

1. **Inline tool card progress**: show live child-agent rows in the tool result itself.
2. **Persistent roster/widget**: show all running agents above/below the editor or near the footer.
3. **Overlay/dashboard**: provide a richer interactive panel with selection, scrolling transcripts, and controls.

The chosen design combines the information density of a roster with the placement of the existing Task card:

- live rows render inside the Task tool result
- no bottom widget is added
- expanded view provides more detail
- artifact files preserve full debugging data

This follows the useful parts of `pi-subagents`, `pi-subagent-in-memory`, and Qwen Code-style live agent panels while staying small enough for the current `plan-workflow` Task implementation.

## Confirmed Decisions

1. Display progress in the existing Task tool card, not in a bottom/editor widget.
2. Collapsed rows show elapsed time, token count, tool-call count, and current activity.
3. Expanded view shows more per-child detail and artifact paths.
4. JSONL/artifact logging is default-on.
5. Artifact root is `~/.pi/task-runs`.
6. If `~/.pi` does not exist, artifact logging is skipped without failing Task execution.
7. If `~/.pi` exists but `~/.pi/task-runs` does not, create `~/.pi/task-runs`.
8. Artifact write failures are non-fatal and must not change child task status.
9. `subagent_type: "default"` is treated the same as omitting `subagent_type`.
10. Final Task status semantics remain compatible: final child statuses are still `completed`, `failed`, or `aborted`; `running` is partial-update-only.

## Scope

### In Scope

- Add inline live roster rendering to the Task result.
- Track elapsed time per child task.
- Track token count per child task.
- Track tool-call count per child task.
- Track current and recent child activity.
- Parse child JSON events beyond `message_end` and `tool_result_end`.
- Write default-on artifacts under `~/.pi/task-runs` when possible.
- Improve failure rendering so failed tasks show raw diagnostics.
- Treat explicit `subagent_type: "default"` as the default child session.
- Add tests for parsing, rendering, artifacts, and failure diagnostics.

### Out of Scope

- Bottom widget or footer roster.
- Full overlay dashboard.
- Interactive kill/steer/resume controls.
- Background agents that return before completion.
- Changing Task into a general subagent manager.
- Changing final success/failure semantics beyond better diagnostics.
- Cleaning old `~/.pi/task-runs` directories in the first implementation.

## User Experience

### Collapsed Running View

Example:

```text
⏳ Task 1/3 done · 2 running · 01:24 · 18.4k tok

├─ ⠹ scout-auth   0:42 · 8.1k tok · 3 tools
│  ⎿ grep /auth/ in src/
├─ ⠋ test-runner  0:18 · 2.7k tok · 1 tool
│  ⎿ bash npm test
└─ ✓ reviewer     0:31 · 7.6k tok · 2 tools
   ⎿ Done
```

The exact spinner frame can vary, but the row must include:

- status icon
- child agent name
- elapsed time
- total displayed tokens
- tool-call count
- current or most recent activity

### Collapsed Failed View

Example:

```text
✗ Task 0/1 done · 1 failed · 02:14 · 318.9k tok

└─ ✗ default  02:14 · 318.9k tok · 12 tools
   ⎿ failed: exitCode=1 · stopReason=error
   log: ~/.pi/task-runs/2026-05-27-ab12cd/01-default/events.jsonl
```

Failed rows should prioritize diagnostics over generic final output.

### Expanded View

Expanded rendering shows each child with details:

```text
## default

Status: failed
Elapsed: 02:14
Exit code: 1
Stop reason: error
Error: child assistant stopReason=error
Usage: input 170.5k · output 3.6k · cache read 144.9k · total 318.9k
Tool calls: 12

Recent activity:
- bash npm test
- edit src/skill/schema.ts
- bash npm test
- assistant stopped with error

Artifacts:
- input: ~/.pi/task-runs/.../01-default/input.md
- events: ~/.pi/task-runs/.../01-default/events.jsonl
- output: ~/.pi/task-runs/.../01-default/output.md
- meta: ~/.pi/task-runs/.../01-default/meta.json

Final output:
...
```

Expanded view should remain useful for both running and terminal child states.

## Data Model

Extend `TaskRunResult` with live progress and artifact fields:

```ts
interface TaskRunResult {
  description: string;
  prompt: string;
  agent: string;
  agentFilePath?: string;
  status: "running" | "completed" | "failed" | "aborted";
  finalOutput: string;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;

  startedAt: number;
  completedAt?: number;
  elapsedMs: number;
  toolUseCount: number;
  currentActivity: string;
  recentActivities: TaskActivity[];
  artifactPaths?: TaskArtifactPaths;
  artifactError?: string;
}

interface TaskActivity {
  type: "thinking" | "text" | "tool_start" | "tool_end" | "done" | "error";
  label: string;
  timestamp: number;
}

interface TaskArtifactPaths {
  rootDir: string;
  taskDir: string;
  inputMd: string;
  eventsJsonl: string;
  outputMd: string;
  metaJson: string;
}
```

`artifactError` is non-fatal and exists only to expose artifact write/setup problems in expanded diagnostics when useful.

## Token Display

Collapsed token display uses a single total:

```ts
displayTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
```

Expanded view shows the breakdown.

Token values update when child assistant messages include usage data. They are not expected to update for every streamed token.

## Tool-Call Count

`toolUseCount` increments on child `tool_execution_start` events.

The runner should also record a formatted activity string for the tool call, for example:

- `bash npm test`
- `read src/task/runner.ts`
- `grep /TaskRunResult/ in src/`
- `edit src/task/render.ts`

Tool end events can update recent activity with success or failure when that information is available.

## Child Event Parsing

The runner currently handles mostly `message_end` and `tool_result_end` events. It should also parse:

- `tool_execution_start`
- `tool_execution_end`
- `tool_execution_update` when useful
- `message_update` text deltas when useful for `currentActivity`
- malformed JSON stdout lines for artifact diagnostics

Rules:

- Malformed JSON lines must not crash the runner.
- Malformed JSON lines should be written to `events.jsonl` when artifacts are enabled.
- `message_end` remains the source of usage aggregation, final assistant text, stop reason, and assistant error message.
- `tool_result_end` remains part of the preserved message list.

## Elapsed Time and Heartbeat

Elapsed time should update even when the child process emits no stdout for a while.

A lightweight heartbeat should update running results about once per second:

```ts
elapsedMs = Date.now() - startedAt;
```

The heartbeat should trigger partial updates but must stop when the child reaches a terminal status.

## Artifact Logging

### Root Directory

Artifacts are written under:

```text
~/.pi/task-runs
```

Setup rules:

1. Resolve the user home directory.
2. Check for `~/.pi`.
3. If `~/.pi` does not exist, skip artifact logging.
4. If `~/.pi/task-runs` does not exist, create it.
5. If creating or writing artifacts fails, keep executing the Task normally.

### Directory Structure

Each Task invocation creates a run directory:

```text
~/.pi/task-runs/
└── 2026-05-27-<runId>/
    ├── task-run.json
    ├── 01-default/
    │   ├── input.md
    │   ├── events.jsonl
    │   ├── output.md
    │   └── meta.json
    └── 02-reviewer/
        ├── input.md
        ├── events.jsonl
        ├── output.md
        └── meta.json
```

Run and task directory names should be stable, readable, and safe for file systems. Agent names and descriptions must be sanitized before being used in paths.

### `task-run.json`

The run-level file records aggregate metadata:

```json
{
  "version": 1,
  "runId": "2026-05-27-ab12cd",
  "cwd": "/Users/liusahngzuo/code/learn/plan-workflow",
  "startedAt": "2026-05-27T...",
  "taskCount": 3
}
```

### `input.md`

Each child directory gets its full input prompt:

```md
# Task Input

Agent: default
Description: Implement Task 1 single-skill normalization
Cwd: /Users/liusahngzuo/code/learn/plan-workflow
Started: 2026-05-27T...

---

<full prompt>
```

### `events.jsonl`

`events.jsonl` stores wrapper events and child Pi JSON stream events. Example entries:

```jsonl
{"type":"task_runner_start","timestamp":"...","agent":"default","description":"...","command":"pi","args":["--mode","json","-p","--no-session","Task: ..."]}
{"type":"child_event","timestamp":"...","event":{"type":"tool_execution_start","toolName":"bash","args":{"command":"npm test"}}}
{"type":"child_stderr","timestamp":"...","text":"..."}
{"type":"child_stdout_malformed","timestamp":"...","line":"..."}
{"type":"task_runner_close","timestamp":"...","exitCode":1,"signalName":null,"stopReason":"error","status":"failed"}
```

The stored `args` may include the child prompt. This is acceptable because the artifact is local diagnostic data under the user's home directory.

### `output.md`

`output.md` records the human-readable final result and diagnostics:

```md
# Task Output

Status: failed
Exit code: 1
Stop reason: error
Elapsed: 02:14
Usage: input 170504, output 3591, cache read 144896

---

<final output or diagnostic fallback>
```

### `meta.json`

`meta.json` stores structured per-child summary data:

```json
{
  "version": 1,
  "runId": "2026-05-27-ab12cd",
  "taskIndex": 1,
  "agent": "default",
  "description": "Implement Task 1 single-skill normalization",
  "status": "failed",
  "exitCode": 1,
  "stopReason": "error",
  "errorMessage": "child assistant stopReason=error",
  "startedAt": 1779867000000,
  "completedAt": 1779867134000,
  "durationMs": 134000,
  "toolUseCount": 12,
  "usage": {
    "input": 170504,
    "output": 3591,
    "cacheRead": 144896,
    "cacheWrite": 0,
    "cost": 0,
    "contextTokens": 0,
    "turns": 18
  }
}
```

## Failure Diagnostics

Failure summaries should make the raw reason visible.

Diagnostic priority:

1. `errorMessage`
2. stderr tail
3. `exitCode` and `stopReason`
4. `finalOutput`
5. `(no diagnostic output)`

A child result should not show only a generic final text or thinking snippet when the status is failed and raw diagnostic fields are available.

The false-failure bug class should become debuggable from:

- collapsed row diagnostic text
- expanded diagnostic block
- `events.jsonl`
- `meta.json`
- `output.md`

## Default Subagent Normalization

Treat explicit `subagent_type: "default"` as the default child Pi session.

These cases are equivalent:

```ts
subagent_type === undefined
subagent_type === ""
subagent_type === "default"
```

They should not trigger named-agent discovery failure.

Named-agent lookup still applies for all other non-empty `subagent_type` values.

## Module Changes

Likely changes:

```text
src/task/
  schema.ts          # add live progress/artifact types
  runner.ts          # parse more events, heartbeat, artifacts
  orchestrator.ts    # run-level artifact setup, default normalization, update merging
  render.ts          # inline roster rendering and diagnostics
  tool.ts            # preserve partial/final result behavior
```

Optional new files if they keep responsibilities clearer:

```text
src/task/activity.ts   # format child activities/tool calls
src/task/artifacts.ts  # artifact path setup and safe writes
src/task/time.ts       # elapsed/time/token formatting helpers
```

Keep files small and focused.

## Testing

### Schema and Normalization

- `subagent_type` omitted uses default.
- `subagent_type: "default"` uses default.
- Empty `subagent_type` is normalized to default.
- Unknown non-default named agents still fail.

### Event Parsing

- `tool_execution_start` increments `toolUseCount`.
- `tool_execution_start` updates `currentActivity`.
- `tool_execution_end` appends recent activity.
- `message_end` updates usage and final output.
- `message_end` with `stopReason: "error"` leads to failed final status.
- malformed JSON is ignored for runtime parsing but recorded in artifacts when artifacts exist.
- stderr is preserved in result and artifact events.

### Heartbeat

- running child receives elapsed-time updates without stdout events.
- heartbeat stops after terminal status.
- final elapsed time is stable enough for rendering tests.

### Artifact Logging

Use temporary home directories or injected artifact operations.

- No `~/.pi` means no artifact files and no Task failure.
- Existing `~/.pi` creates `task-runs` if missing.
- Writes `task-run.json`, `input.md`, `events.jsonl`, `output.md`, and `meta.json`.
- Write failure records non-fatal artifact error and does not change child status.
- Artifact paths appear in `TaskRunResult.artifactPaths` when setup succeeds.

### Rendering

- Collapsed running view includes aggregate status, elapsed time, token count, and per-child rows.
- Each child row includes elapsed time, token count, tool count, and current activity.
- Collapsed failed view prioritizes diagnostics and log path.
- Expanded view includes recent activities, raw failure fields, final output, and artifact paths.
- Existing final completed rendering remains readable.

### False Failure Regression

Simulate a child that emits successful-looking activity and then exits with code `1` or `stopReason: "error"`.

Expected:

- status is `failed`
- collapsed row shows `exitCode` or `stopReason`
- expanded view shows artifacts
- `meta.json` records raw fields
- `events.jsonl` records close event

## Acceptance Criteria

- Task progress is visible inside the conversation's Task card while children run.
- No bottom widget or editor-adjacent roster is introduced.
- Each child row shows status, elapsed time, token count, tool-call count, and activity.
- Elapsed time updates even during quiet child periods.
- Failed child rows show clear diagnostics.
- Default artifact logging writes to `~/.pi/task-runs` when `~/.pi` exists.
- Missing `~/.pi` or artifact write failures do not fail Task runs.
- `subagent_type: "default"` no longer fails named-agent lookup.
- Final Task result statuses remain compatible with the existing terminal-status contract.
- Tests cover parsing, rendering, artifacts, heartbeat, and false-failure diagnostics.
- `npm run check` passes.
