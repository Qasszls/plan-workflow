# Task 5: Register the TodoWrite tool

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/tool.ts`
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/tool.test.ts`

**Learn-mode rule for this task:** The agent writes the tool registration scaffold, but must pause before finalizing `promptGuidelines` and before running the passing test. The human edits one model-facing guidance line and traces the `execute` flow.

- [ ] **Step 1: Write a registration smoke test**

Create `/Users/liusahngzuo/code/learn/plan-workflow/test/todo/tool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { registerTodoWrite } from "../../src/todo/tool.ts";

describe("TodoWrite tool registration", () => {
  it("registers a TodoWrite tool", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const pi = {
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    registerTodoWrite(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools[0].description).toContain("todo");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- test/todo/tool.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/todo/tool.ts'
```

- [ ] **Step 3: Implement tool registration**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/tool.ts`:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TodoWriteParamsSchema, type TaskSnapshot, type TodoWriteParams } from "./schema.ts";
import { buildDetails, computeRecentCompletedIds, normalizeTodoWrite } from "./state.ts";

export interface TodoRuntimeState {
  todos: TaskSnapshot[];
  recentCompletedIds: Set<string>;
}

export function createTodoRuntimeState(): TodoRuntimeState {
  return { todos: [], recentCompletedIds: new Set() };
}

export function setTodos(state: TodoRuntimeState, todos: TaskSnapshot[]): void {
  state.todos = todos.map((todo) => ({
    ...todo,
    blockedBy: [...todo.blockedBy],
    metadata: { ...todo.metadata },
  }));
}

export function registerTodoWriteTool(pi: ExtensionAPI, state: TodoRuntimeState, updateOverlay: (ctx: ExtensionContext) => void): void {
  pi.registerTool({
    name: "TodoWrite",
    label: "TodoWrite",
    description: "Create, update, or replace the todo list for tracking task progress.",
    promptSnippet: "Track tasks with status (pending, in_progress, completed)",
    promptGuidelines: [
      "Use TodoWrite when starting a multi-step task to track progress.",
      // LEARN-MODE: human-owned line.
      // Write one guidance sentence that tells the model when to update task status.
    ],
    parameters: TodoWriteParamsSchema,
    async execute(_toolCallId, params: TodoWriteParams, _signal, _onUpdate, ctx) {
      const normalized = normalizeTodoWrite(params);
      if (!normalized.ok) {
        const details = buildDetails(state.todos, normalized.error);
        return {
          content: [{ type: "text", text: `TodoWrite error: ${normalized.error}` }],
          isError: true,
          details,
        };
      }

      const newlyCompleted = computeRecentCompletedIds(state.todos, normalized.todos);
      setTodos(state, normalized.todos);
      for (const id of newlyCompleted) state.recentCompletedIds.add(id);
      updateOverlay(ctx);

      const details = buildDetails(state.todos);
      return {
        content: [{ type: "text", text: formatTodoWriteSummary(details.stats, state.todos) }],
        details,
      };
    },
  });
}

function formatTodoWriteSummary(stats: ReturnType<typeof buildDetails>["stats"], todos: TaskSnapshot[]): string {
  const lines = [
    `Todos updated: ${stats.inProgress} in progress, ${stats.pending} pending, ${stats.completed} completed.`,
  ];
  const current = todos.filter((todo) => todo.status === "in_progress" || todo.status === "pending").slice(0, 8);
  if (current.length > 0) {
    lines.push("Current:");
    for (const todo of current) lines.push(`- ${todo.status}: ${todo.content}`);
  }
  return lines.join("\n");
}

export function registerTodoWrite(pi: ExtensionAPI): TodoRuntimeState {
  const state = createTodoRuntimeState();
  registerTodoWriteTool(pi, state, () => {});
  return state;
}
```

- [ ] **Step 4: Learn-mode pause: human writes one model-facing guidance line**

Stop and show the human this section in `/Users/liusahngzuo/code/learn/plan-workflow/src/todo/tool.ts`:

```ts
promptGuidelines: [
  "Use TodoWrite when starting a multi-step task to track progress.",
  // LEARN-MODE: human-owned line.
],
```

Ask the human to replace the comment with one string. Recommended line:

```ts
"Update todo status as you work through tasks: mark in_progress when starting, completed when done.",
```

Teaching point to explain before they edit:

- `promptGuidelines` affects the prompt sent to the model; it is not UI text.
- Tool schema says what the model may call; prompt guidance nudges when and why it should call it.
- This is one of the main customization surfaces for future `Task`, `Skill`, and `AskUserQuestion` tools.

- [ ] **Step 5: Learn-mode trace: read the `execute` flow before wiring**

Before editing `src/index.ts`, show the human the `execute` function and walk this exact control flow:

```text
params from model
 -> normalizeTodoWrite(params)
 -> on error: return isError + previous snapshot details
 -> on success: compute newly completed ids
 -> replace runtime state
 -> update overlay hook
 -> return model-visible text + full replay details
```

Ask the human to identify which returned field is for the model and which returned field is for replay:

- `content`: model-visible/tool-result text
- `details`: structured snapshot used by replay

- [ ] **Step 6: Wire extension entry**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTodoWrite } from "./todo/tool.ts";

export default function planWorkflow(pi: ExtensionAPI): void {
  registerTodoWrite(pi);
}
```

- [ ] **Step 7: Run tool test**

Run:

```bash
npm test -- test/todo/tool.test.ts
```

Expected:

```text
PASS test/todo/tool.test.ts
```

- [ ] **Step 8: Run all tests and typecheck**

Run:

```bash
npm run check
```

Expected:

```text
PASS ...
Found 0 errors.
```

- [ ] **Step 9: Commit tool registration**

Run:

```bash
git add src/index.ts src/todo/tool.ts test/todo/tool.test.ts
git commit -m "feat: register TodoWrite tool"
```
