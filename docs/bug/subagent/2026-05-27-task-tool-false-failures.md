# Task Tool Subagent Failure Notes

Date: 2026-05-27
Project: `/Users/liusahngzuo/code/learn/plan-workflow`

## Summary

Two Task-tool failure modes were observed while executing `docs/superpowers/plans/2026-05-27-plan-workflow-append-system-bootstrap.md`.

1. Passing `subagent_type: "default"` fails because `default` is not a discovered named agent.
2. Omitting `subagent_type` allowed the child agent to implement and commit successfully, but the parent `Task` tool still reported the run as failed.

These notes are saved for later debugging of the Task/subagent implementation.

## Issue 1: `subagent_type: "default"` Is Treated As Unknown Named Agent

### Reproduction

The parent called the Task tool with an explicit default subagent type:

```json
{
  "tasks": [
    {
      "description": "Implement Task 1 single-skill normalization",
      "prompt": "...",
      "subagent_type": "default"
    }
  ]
}
```

### Observed Result

The Task result reported:

```text
Task results:

## 1. Implement Task 1 single-skill normalization

- Agent: default
- Status: failed
- Usage: none

Unknown subagent_type "default"
```

### Evidence In Code

`src/task/orchestrator.ts` treats a provided `subagent_type` as a required named agent lookup:

```ts
const agentName = request.subagent_type ?? "default";
const agent = request.subagent_type ? agentsByName.get(request.subagent_type) : undefined;

if (request.subagent_type && !agent) {
  results[index] = createUnknownAgentResult(request, request.subagent_type);
  emitUpdate();
  continue;
}
```

Because `"default"` is provided, it is looked up as a named agent. If no agent file named `default` exists, the tool fails.

### Current Interpretation

This is mostly a caller/documentation pitfall: for the default child Pi session, callers must omit `subagent_type` entirely. If desired, Task could also treat `subagent_type: "default"` as equivalent to omitted, but that is a design decision for later.

## Issue 2: Task Tool Reported Failure Even Though Child Implemented And Committed

### Reproduction

The parent called the Task tool without `subagent_type` for Task 1 of the implementation plan.

### Observed Parent Result

The parent Task result reported:

```text
Task results:

## 1. Implement Task 1 single-skill normalization

- Agent: default
- Status: failed
- Usage: 18 turns, input 170504, output 3591, cache read 144896

<thinking>**Implementing schema changes**

Now it's time to update the todo: red is done, green is in progress. I need to modify the schema exactly as provided. Use edit replacement from current normalize function onward, including the isRecord helper. Let's do that carefully.</thinking>
```

The surfaced output did not include a clear final error message or stderr.

### Evidence That The Child Actually Succeeded

After the Task tool reported failure, the repository contained a new commit:

```text
28dd4989 feat: accept single Skill param
```

`git show --stat --oneline HEAD` showed:

```text
28dd4989 feat: accept single Skill param
 src/skill/schema.ts        | 34 +++++++++++++++++++++++++---------
 tests/skill/schema.test.ts | 32 +++++++++++++++++++++++++++++++-
 2 files changed, 56 insertions(+), 10 deletions(-)
```

Focused verification passed after the child run:

```bash
npm test -- tests/skill/schema.test.ts
```

Output:

```text
> plan-workflow@0.1.0 test
> vitest --run tests/skill/schema.test.ts

 RUN  v3.2.4 /Users/liusahngzuo/code/learn/plan-workflow

 ✓ tests/skill/schema.test.ts (9 tests) 2ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### Relevant Code Paths

`src/task/runner.ts` determines child status from process exit code and assistant stop reason:

```ts
export function toCompletedStatus(
  exitCode: number,
  wasAborted: boolean,
  stopReason: string | undefined,
): TaskRunStatus {
  if (wasAborted || stopReason === "aborted") return "aborted";
  if (exitCode !== 0 || stopReason === "error") return "failed";
  return "completed";
}
```

It also derives `finalOutput` from the last assistant text message:

```ts
export function getFinalOutput(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (text) return text;
  }
  return "";
}
```

`src/task/orchestrator.ts` marks the whole Task tool call as an error if any child result is failed:

```ts
return {
  details: { version: 1, results: completedResults },
  isError: completedResults.some(isFailedTaskRunResult),
};
```

### Current Hypothesis

The child Pi process likely exited non-zero or produced a final assistant message with `stopReason === "error"` after it had already made and committed the requested code changes. The parent Task result did not surface enough diagnostic detail to identify whether the failure came from:

- child process exit code,
- final assistant `stopReason`,
- stderr,
- JSON event parsing,
- or a post-commit child-agent error.

### Debugging Suggestions For Later

Add or inspect diagnostics in Task results for child runs:

- raw `exitCode`,
- raw `stopReason`,
- `errorMessage`,
- last assistant message summary,
- stderr tail,
- whether a commit was created,
- and whether the requested verification command passed.

Consider making Task render failed child diagnostics more visibly instead of showing only `finalOutput`.

## Related Accidental Commit Cleanup

While investigating, an earlier incorrect local commit was found. It had message:

```text
feat: implement single-skill normalization and argument preparation for Skill tool
```

but only included:

```text
README.md
docs/superpowers/plans/2026-05-27-plan-workflow-append-system-bootstrap.md
```

That commit was reset and replaced with a correct plan-only commit:

```text
68898c3a docs: add append system bootstrap plan
```

The pre-existing `README.md` modification was restored as an uncommitted change and should not be treated as part of this implementation.
