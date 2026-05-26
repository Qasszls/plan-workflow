# Task 5: Render markdown and TUI results

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/task/render.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/render.test.ts`

- [ ] **Step 1: Write failing render tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/task/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatTaskCallSummary,
  formatTaskExecutionContent,
  formatTaskResultSummary,
  truncateOutput,
} from "../../src/task/render.ts";
import type { TaskDetails, TaskParams, TaskRunResult } from "../../src/task/schema.ts";

function result(overrides: Partial<TaskRunResult> = {}): TaskRunResult {
  return {
    description: "Review code",
    prompt: "Review the diff.",
    agent: "reviewer",
    agentFilePath: "/tmp/reviewer.md",
    status: "completed",
    finalOutput: "Looks good.",
    messages: [],
    stderr: "",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0.01, contextTokens: 15, turns: 1 },
    exitCode: 0,
    ...overrides,
  };
}

describe("task rendering", () => {
  it("formats a compact call summary", () => {
    const params: TaskParams = {
      tasks: [
        { description: "Review", prompt: "Review this.", subagent_type: "reviewer" },
        { description: "Summarize", prompt: "Summarize this." },
      ],
    };

    expect(formatTaskCallSummary(params)).toBe("Task: 2 delegated tasks (Review, Summarize)");
  });

  it("formats model-visible markdown with one section per result", () => {
    const details: TaskDetails = {
      version: 1,
      results: [
        result({ description: "Review", finalOutput: "No issues." }),
        result({ description: "Summarize", agent: "default", finalOutput: "Summary here." }),
      ],
    };

    expect(formatTaskExecutionContent(details)).toBe(
      [
        "Task results:",
        "",
        "## 1. Review",
        "",
        "- Agent: reviewer",
        "- Status: completed",
        "- Usage: 1 turn, input 10, output 5, cost $0.0100, context 15",
        "",
        "No issues.",
        "",
        "## 2. Summarize",
        "",
        "- Agent: default",
        "- Status: completed",
        "- Usage: 1 turn, input 10, output 5, cost $0.0100, context 15",
        "",
        "Summary here.",
      ].join("\n"),
    );
  });

  it("uses error text when a failed task has no final output", () => {
    const details: TaskDetails = {
      version: 1,
      results: [
        result({
          status: "failed",
          finalOutput: "",
          stderr: "stderr failed",
          errorMessage: "agent failed",
          exitCode: 1,
        }),
      ],
    };

    expect(formatTaskExecutionContent(details)).toContain("agent failed");
  });

  it("truncates long child output in model-visible content", () => {
    const output = `${"a".repeat(20)}\n${"b".repeat(20)}`;

    expect(truncateOutput(output, 25)).toBe("aaaaaaaaaaaaaaaaaaaa\nbbbb\n\n[Output truncated: 16 characters omitted. Full output preserved in tool details.]");
  });

  it("formats result summaries for collapsed TUI display", () => {
    const summary = formatTaskResultSummary({
      version: 1,
      results: [result(), result({ description: "Fail", status: "failed", exitCode: 1 })],
    });

    expect(summary).toBe("Task finished: 1 completed, 1 failed, 0 aborted.");
  });
});
```

- [ ] **Step 2: Run render tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm test -- tests/task/render.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/task/render.ts'
```

- [ ] **Step 3: Implement render helpers**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/task/render.ts`:

```ts
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, Text, type Component } from "@earendil-works/pi-tui";
import type { TaskDetails, TaskParams, TaskRunResult, UsageStats } from "./schema.ts";

const OUTPUT_CAP = 50 * 1024;

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function formatUsage(usage: UsageStats): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(plural(usage.turns, "turn"));
  if (usage.input) parts.push(`input ${usage.input}`);
  if (usage.output) parts.push(`output ${usage.output}`);
  if (usage.cacheRead) parts.push(`cache read ${usage.cacheRead}`);
  if (usage.cacheWrite) parts.push(`cache write ${usage.cacheWrite}`);
  if (usage.cost) parts.push(`cost $${usage.cost.toFixed(4)}`);
  if (usage.contextTokens) parts.push(`context ${usage.contextTokens}`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

function getResultOutput(result: TaskRunResult): string {
  if (result.finalOutput.trim()) return result.finalOutput.trim();
  if (result.errorMessage?.trim()) return result.errorMessage.trim();
  if (result.stderr.trim()) return result.stderr.trim();
  return "(no output)";
}

export function truncateOutput(output: string, maxChars = OUTPUT_CAP): string {
  if (output.length <= maxChars) return output;
  const truncated = output.slice(0, maxChars);
  return `${truncated}\n\n[Output truncated: ${output.length - truncated.length} characters omitted. Full output preserved in tool details.]`;
}

export function formatTaskCallSummary(params: TaskParams): string {
  const labels = params.tasks.slice(0, 3).map((task) => task.description).join(", ");
  const suffix = params.tasks.length > 3 ? `, +${params.tasks.length - 3} more` : "";
  return params.tasks.length === 1
    ? `Task: ${params.tasks[0].description}`
    : `Task: ${params.tasks.length} delegated tasks (${labels}${suffix})`;
}

export function formatTaskExecutionContent(details: TaskDetails): string {
  if (details.results.length === 0) return "Task results: no child tasks ran.";

  const lines = ["Task results:", ""];
  details.results.forEach((result, index) => {
    if (index > 0) lines.push("");
    lines.push(
      `## ${index + 1}. ${result.description}`,
      "",
      `- Agent: ${result.agent}`,
      `- Status: ${result.status}`,
      `- Usage: ${formatUsage(result.usage)}`,
      "",
      truncateOutput(getResultOutput(result)),
    );
  });
  return lines.join("\n");
}

export function formatTaskResultSummary(details: TaskDetails): string {
  const completed = details.results.filter((result) => result.status === "completed").length;
  const failed = details.results.filter((result) => result.status === "failed").length;
  const aborted = details.results.filter((result) => result.status === "aborted").length;
  return `Task finished: ${completed} completed, ${failed} failed, ${aborted} aborted.`;
}

export function renderTaskCall(params: TaskParams): Component {
  return new Text(formatTaskCallSummary(params), 0, 0);
}

export function renderTaskResult(details: TaskDetails, expanded: boolean): Component {
  if (expanded) return new Markdown(formatTaskExecutionContent(details), 0, 0, getMarkdownTheme());
  return new Text(formatTaskResultSummary(details), 0, 0);
}
```

- [ ] **Step 4: Run render tests**

Run:

```bash
npm test -- tests/task/render.test.ts
```

Expected:

```text
PASS tests/task/render.test.ts
```

- [ ] **Step 5: Commit render helpers**

Run:

```bash
git add src/task/render.ts tests/task/render.test.ts
git commit -m "feat: render Task results"
```
