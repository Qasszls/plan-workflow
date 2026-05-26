# Task 4: Implement replay from branch snapshots

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/replay.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/replay.test.ts`

**Learn-mode rule for this task:** The agent writes replay implementation and baseline tests, but must leave one branch-history test for the human. After implementation, the agent must also pause on `replay.ts` so the human can trace how raw session entries are filtered into valid snapshots.

- [ ] **Step 1: Write failing replay tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TodoWriteDetails } from "../../src/todo/schema.ts";
import { replayTodoStateFromEntries } from "../../src/todo/replay.ts";

function todoDetails(id: string, content: string): TodoWriteDetails {
  return {
    version: 1,
    action: "replace",
    todos: [{ id, content, status: "pending", blockedBy: [], metadata: {} }],
    stats: { pending: 1, inProgress: 0, completed: 0, deleted: 0 },
  };
}

function toolResult(toolName: string, details: unknown) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName,
      details,
    },
  };
}

describe("todo replay", () => {
  it("returns empty state for an empty branch", () => {
    expect(replayTodoStateFromEntries([])).toEqual([]);
  });

  it("uses the latest valid TodoWrite snapshot", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old")),
      toolResult("TodoWrite", todoDetails("b", "New")),
    ]);

    expect(result).toEqual([{ id: "b", content: "New", status: "pending", blockedBy: [], metadata: {} }]);
  });

  it("ignores invalid details", () => {
    const result = replayTodoStateFromEntries([
      toolResult("TodoWrite", todoDetails("a", "Old")),
      toolResult("TodoWrite", { version: 2, todos: "bad" }),
    ]);

    expect(result).toEqual([{ id: "a", content: "Old", status: "pending", blockedBy: [], metadata: {} }]);
  });

  it("ignores other tool results", () => {
    const result = replayTodoStateFromEntries([
      toolResult("OtherTool", todoDetails("a", "Other")),
      toolResult("TodoWrite", todoDetails("b", "Todo")),
    ]);

    expect(result).toEqual([{ id: "b", content: "Todo", status: "pending", blockedBy: [], metadata: {} }]);
  });

  it("LEARN-MODE: human adds one branch-order replay edge case", () => {
    // Human replaces this placeholder with a 5-10 line fixture.
    // Recommended case: a valid TodoWrite snapshot, then another valid TodoWrite snapshot,
    // then assert the later snapshot wins because branch order is authoritative.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Learn-mode pause: human writes one replay fixture**

Stop after creating `test/todo/replay.test.ts`.

Ask the human to replace only the placeholder test body with:

```ts
const result = replayTodoStateFromEntries([
  toolResult("TodoWrite", todoDetails("a", "First")),
  toolResult("TodoWrite", todoDetails("b", "Second")),
]);

expect(result).toEqual([{ id: "b", content: "Second", status: "pending", blockedBy: [], metadata: {} }]);
```

Teaching point to explain before they edit:

- Replay is append-only scanning of the current session branch.
- There is no separate todo database in this slice.
- The latest valid `toolResult.details` snapshot is the source of truth after reload.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- test/todo/replay.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/todo/replay.ts'
```

- [ ] **Step 4: Implement replay**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/replay.ts`:

```ts
import type { TaskSnapshot } from "./schema.ts";
import { isTodoWriteDetails } from "./schema.ts";

const TODO_TOOL_NAME = "TodoWrite";

interface MaybeSessionEntry {
  type?: unknown;
  message?: {
    role?: unknown;
    toolName?: unknown;
    details?: unknown;
  };
}

export function replayTodoStateFromEntries(entries: readonly unknown[]): TaskSnapshot[] {
  let latest: TaskSnapshot[] = [];

  for (const entry of entries) {
    const candidate = entry as MaybeSessionEntry;
    if (candidate.type !== "message") continue;
    const message = candidate.message;
    if (!message || message.role !== "toolResult" || message.toolName !== TODO_TOOL_NAME) continue;
    if (!isTodoWriteDetails(message.details)) continue;
    latest = message.details.todos.map((todo) => ({
      ...todo,
      blockedBy: [...todo.blockedBy],
      metadata: { ...todo.metadata },
    }));
  }

  return latest;
}
```

- [ ] **Step 5: Run replay tests**

Run:

```bash
npm test -- test/todo/replay.test.ts
```

Expected:

```text
PASS test/todo/replay.test.ts
```

- [ ] **Step 6: Learn-mode trace: replay.ts filtering path**

Stop and show the human this part of `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/replay.ts`:

```ts
if (candidate.type !== "message") continue;
const message = candidate.message;
if (!message || message.role !== "toolResult" || message.toolName !== TODO_TOOL_NAME) continue;
if (!isTodoWriteDetails(message.details)) continue;
latest = message.details.todos.map((todo) => ({
  ...todo,
  blockedBy: [...todo.blockedBy],
  metadata: { ...todo.metadata },
}));
```

Ask the human to explain why each `continue` exists:

- skip non-message session entries
- skip non-toolResult messages
- skip tool results from other tools
- skip invalid or old details shapes

Continue only after this file's role is clear: it translates untrusted branch history into trusted in-memory `TaskSnapshot[]`.

- [ ] **Step 7: Commit replay**

Run:

```bash
git add src/todo/replay.ts test/todo/replay.test.ts
git commit -m "feat: replay TodoWrite snapshots"
```
