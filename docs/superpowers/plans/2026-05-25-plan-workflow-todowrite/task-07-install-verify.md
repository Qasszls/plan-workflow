# Task 7: Install locally and verify in Pi

**Files:**
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/README.md`
- No code changes expected unless verification finds issues.

**Learn-mode rule for this task:** Verification is also a teaching checkpoint. The agent drives commands, but the human should identify which Pi surface proves each part of the tool architecture.

- [ ] **Step 1: Run final package checks**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm run check
```

Expected:

```text
PASS ...
Found 0 errors.
```

- [ ] **Step 2: Install package into Pi locally**

Run:

```bash
pi install path:/Users/liusahngzuo/code/learn/plan-workflow
```

Expected:

```text
Installed plan-workflow
```

If the local Pi build expects `npm:` or direct path syntax instead, run:

```bash
pi install /Users/liusahngzuo/code/learn/plan-workflow
```

Expected:

```text
Installed plan-workflow
```

- [ ] **Step 3: Start Pi and confirm tool loads**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
pi
```

Manual verification:

- Open `/tools` or relevant Pi tool UI if enabled.
- Confirm `TodoWrite` is available.
- Confirm `/todos` appears in slash command autocomplete.

- [ ] **Step 4: Learn-mode pause: map loaded surfaces**

Before sending a model prompt, stop and ask the human to map the loaded surfaces:

```text
TodoWrite available -> registerTool worked
/todos autocomplete -> registerCommand worked
overlay slot empty or present -> setWidget path is ready
```

Continue after the human confirms the mapping or asks a question.

- [ ] **Step 5: Ask Pi to create todos**

In Pi, send:

```text
Use TodoWrite to create three tasks for testing: implement state, verify replay, inspect overlay. Mark implement state as in_progress.
```

Expected:

- The model calls `TodoWrite`.
- The tool result summary is concise.
- The overlay appears above the editor.
- `/todos` shows the current tasks.

- [ ] **Step 6: Learn-mode pause: inspect model text vs persisted details**

After the first successful tool call, stop and explain:

- The visible tool result text came from `content`.
- The replayable snapshot came from `details`.
- `/todos` and overlay are reading runtime state restored or updated from that snapshot path.

Ask the human to identify where the full task list must be if `/reload` is going to work. Expected answer: in `toolResult.details` on the current session branch.

- [ ] **Step 7: Verify completed task retention**

In Pi, send:

```text
Use TodoWrite to mark implement state completed and verify replay in_progress.
```

Expected:

- Completed item remains visible in overlay immediately after the tool call.
- On the next agent response start, completed items disappear from overlay unless still active through `recentCompletedIds`.

- [ ] **Step 8: Verify reload replay**

In Pi, run:

```text
/reload
```

Then run:

```text
/todos
```

Expected:

- The current todo state is restored from session branch.
- No external todo file is required.

- [ ] **Step 9: Learn-mode pause: explain replay result**

Stop and ask the human to explain which code path made `/reload` restore todos:

```text
session_start/session_tree/session_compact hook
 -> ctx.sessionManager.getBranch()
 -> replayTodoStateFromEntries()
 -> setTodos()
 -> updateTodoOverlay()
```

Continue after the human can point to the responsible file names:

- `tool.ts` for lifecycle hook wiring
- `replay.ts` for branch scanning
- `overlay.ts` for UI refresh

- [ ] **Step 10: Verify branch or compact replay if convenient**

Optional manual checks:

```text
/compact
/todos
```

Expected:

- Todo state remains available after compaction.

- [ ] **Step 11: Update README with install and verification notes**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/README.md`:

```md
# plan-workflow

Personal Pi workflow support package.

## Install locally

```bash
pi install path:/Users/liusahngzuo/code/learn/plan-workflow
```

If the local Pi install command expects a raw path:

```bash
pi install /Users/liusahngzuo/code/learn/plan-workflow
```

## First slice

- `TodoWrite` tool compatible with Superpowers-style task tracking
- branch replay from tool result snapshots
- `/todos` command
- above-editor todo overlay

## Verify

Start Pi and ask the model to create tasks with `TodoWrite`.
Use `/todos` to inspect state.
Use `/reload` and `/todos` again to verify branch replay.
```

- [ ] **Step 12: Commit README and verification fixes**

Run:

```bash
git add README.md
git commit -m "docs: document local plan-workflow install"
```

- [ ] **Step 13: Final status**

Run:

```bash
git status --short
```

Expected:

```text
<no output>
```
