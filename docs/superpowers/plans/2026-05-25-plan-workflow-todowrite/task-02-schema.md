# Task 2: Define TodoWrite schema and types

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/schema.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/schema.test.ts`

**Learn-mode rule for this task:** The agent creates schemas and tests, but must pause before finalizing `TaskSnapshot` and `TodoWriteDetails`. The human reviews or edits those two interfaces because they define what survives replay.

- [ ] **Step 1: Write schema tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTodoWriteDetails, type TaskSnapshot, type TodoWriteDetails } from "../../src/todo/schema.ts";

describe("todo schema", () => {
  it("defines the internal task snapshot shape", () => {
    const task: TaskSnapshot = {
      id: "write-tests",
      content: "Write replay tests",
      status: "pending",
      priority: "high",
      blockedBy: [],
      metadata: {},
    };

    expect(task.id).toBe("write-tests");
    expect(task.status).toBe("pending");
  });

  it("recognizes valid TodoWrite details snapshots", () => {
    const details: TodoWriteDetails = {
      version: 1,
      action: "replace",
      todos: [],
      stats: { pending: 0, inProgress: 0, completed: 0, deleted: 0 },
    };

    expect(isTodoWriteDetails(details)).toBe(true);
  });

  it("rejects invalid details snapshots", () => {
    expect(isTodoWriteDetails({ version: 2, todos: [] })).toBe(false);
    expect(isTodoWriteDetails(null)).toBe(false);
    expect(isTodoWriteDetails({ version: 1, action: "replace", todos: "bad" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- test/todo/schema.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/todo/schema.ts'
```

- [ ] **Step 3: Create schema file with human-owned type placeholders**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/schema.ts`:

```ts
import { Type, type Static } from "typebox";

export const TodoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);

export const InternalTodoStatusSchema = Type.Union([
  TodoStatusSchema,
  Type.Literal("deleted"),
]);

export const TodoPrioritySchema = Type.Union([
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

export const TodoWriteItemSchema = Type.Object({
  id: Type.String({ description: "Unique identifier for the todo item" }),
  content: Type.String({ description: "The content/description of the todo item" }),
  status: TodoStatusSchema,
  priority: Type.Optional(TodoPrioritySchema),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  deleted: Type.Optional(Type.Boolean()),
});

export const TodoWriteParamsSchema = Type.Object({
  todos: Type.Array(TodoWriteItemSchema),
});

export type TodoStatus = Static<typeof TodoStatusSchema>;
export type InternalTodoStatus = Static<typeof InternalTodoStatusSchema>;
export type TodoPriority = Static<typeof TodoPrioritySchema>;
export type TodoWriteItemInput = Static<typeof TodoWriteItemSchema>;
export type TodoWriteParams = Static<typeof TodoWriteParamsSchema>;

// LEARN-MODE: human-owned section.
// Decide what the internal todo snapshot must preserve after reload/compact.
// Keep this compatible with TodoWriteDetails replay in replay.ts.
export interface TaskSnapshot {
  // Human fills/reviews 5-8 lines here.
}

export interface TodoStats {
  pending: number;
  inProgress: number;
  completed: number;
  deleted: number;
}

// LEARN-MODE: human-owned section.
// This is the exact snapshot stored in toolResult.details.
export interface TodoWriteDetails {
  // Human fills/reviews 4-6 lines here.
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskSnapshot(value: unknown): value is TaskSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.content !== "string") return false;
  if (!["pending", "in_progress", "completed", "deleted"].includes(String(value.status))) return false;
  if (value.priority !== undefined && !["high", "medium", "low"].includes(String(value.priority))) return false;
  if (!Array.isArray(value.blockedBy) || !value.blockedBy.every((id) => typeof id === "string")) return false;
  if (!isRecord(value.metadata)) return false;
  return true;
}

function isTodoStats(value: unknown): value is TodoStats {
  if (!isRecord(value)) return false;
  return (
    typeof value.pending === "number" &&
    typeof value.inProgress === "number" &&
    typeof value.completed === "number" &&
    typeof value.deleted === "number"
  );
}

export function isTodoWriteDetails(value: unknown): value is TodoWriteDetails {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (value.action !== "replace") return false;
  if (!Array.isArray(value.todos) || !value.todos.every(isTaskSnapshot)) return false;
  if (!isTodoStats(value.stats)) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  return true;
}
```

- [ ] **Step 4: Learn-mode pause: human fills snapshot contracts**

Stop and show the human `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/schema.ts`.

Ask the human to fill or edit only these two interfaces:

```ts
export interface TaskSnapshot {
  id: string;
  content: string;
  status: InternalTodoStatus;
  priority?: TodoPriority;
  blockedBy: string[];
  metadata: Record<string, unknown>;
  updatedAtTurn?: number;
}

export interface TodoWriteDetails {
  version: 1;
  action: "replace";
  todos: TaskSnapshot[];
  stats: TodoStats;
  error?: string;
}
```

Teaching point to explain before they edit:

- Tool input is temporary; `TodoWriteDetails` is persisted into the session branch.
- `TaskSnapshot` should contain normalized state, not every possible model input field.
- `deleted: true` is model-call sugar and becomes `status: "deleted"` internally.

After the human edits, continue. If they only discuss instead of editing, apply the agreed interface exactly.

- [ ] **Step 5: Run schema tests**

Run:

```bash
npm test -- test/todo/schema.test.ts
```

Expected:

```text
PASS test/todo/schema.test.ts
```

- [ ] **Step 6: Commit schema**

Run:

```bash
git add src/todo/schema.ts test/todo/schema.test.ts
git commit -m "feat: define TodoWrite schema"
```
