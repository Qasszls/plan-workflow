# Task Tool Inline Progress and Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `Task` tool show live child-agent progress inline in its existing tool card and write default-on local diagnostic artifacts for child runs.

**Architecture:** Extend `TaskRunResult` with progress and artifact metadata, add small focused helper modules for formatting/activity/artifacts, update the child-process runner to parse more Pi JSON events and emit heartbeat updates, and render collapsed/expanded Task cards from the richer details object. Artifact logging is best-effort and local-only under `~/.pi/task-runs` when `~/.pi` exists.

**Tech Stack:** TypeScript, Node.js ESM, Pi extension API, `@earendil-works/pi-ai` message types, `@earendil-works/pi-tui`, TypeBox, Vitest.

---

## File Structure

- `src/task/schema.ts` — extend `TaskRunResult` with progress and artifact fields; add `TaskActivity` and `TaskArtifactPaths`; normalize `subagent_type: "default"` to omitted.
- `src/task/time.ts` — new formatting helpers for elapsed duration and token totals.
- `src/task/activity.ts` — new child-event-to-activity helpers and recent-activity list management.
- `src/task/artifacts.ts` — new best-effort artifact setup and writer functions for `task-run.json`, `input.md`, `events.jsonl`, `output.md`, and `meta.json`.
- `src/task/runner.ts` — parse live child events, update progress fields, run heartbeat updates, and write child artifacts through an injected writer.
- `src/task/orchestrator.ts` — create one artifact run context per Task invocation, pass child artifact writers to runners, preserve default subagent behavior, and include progress fields in synthetic failures.
- `src/task/render.ts` — render inline roster in collapsed view and diagnostics/artifact paths in expanded markdown.
- `src/task/tool.ts` — preserve existing partial/final result flow; no structural change expected beyond using updated render output.
- `tests/task/schema.test.ts` — add default subagent normalization and progress shape tests; update manual `TaskRunResult` literals.
- `tests/task/time.test.ts` — new duration/token formatting tests.
- `tests/task/activity.test.ts` — new activity formatting/recent-activity tests.
- `tests/task/artifacts.test.ts` — new artifact setup/write/failure tests using temporary home directories.
- `tests/task/runner.test.ts` — add event parsing, heartbeat, stderr artifact, malformed JSON, and false-failure runner tests.
- `tests/task/orchestrator.test.ts` — add explicit default subagent and artifact-writer orchestration tests; update synthetic results.
- `tests/task/render.test.ts` — replace compact summary expectations with inline roster and diagnostics expectations.

## Task 1: Extend Schema and Normalize Explicit Default Subagents

**Files:**
- Modify: `tests/task/schema.test.ts`
- Modify: `src/task/schema.ts`
- Modify: `tests/task/orchestrator.test.ts`
- Modify: `tests/task/render.test.ts`

- [ ] **Step 1: Write failing schema tests for default subagent normalization and live progress fields**

Add these tests inside `describe("task schema", ...)` in `tests/task/schema.test.ts`, after the existing `trims task fields and drops blank subagent_type` test:

```ts
  it("normalizes explicit default subagent_type to the default child session", () => {
    const normalized = normalizeTaskParams({
      tasks: [
        {
          description: "  Default work  ",
          prompt: "  Do the work.  ",
          subagent_type: "  default  ",
        },
      ],
    });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.tasks).toEqual([
      { description: "Default work", prompt: "Do the work." },
    ]);
  });

  it("defines live progress and artifact fields on TaskRunResult", () => {
    const result: TaskRunResult = {
      description: "Review code",
      prompt: "Review the current diff.",
      agent: "default",
      status: "running",
      finalOutput: "",
      messages: [],
      stderr: "",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
      exitCode: -1,
      startedAt: 1000,
      elapsedMs: 2500,
      toolUseCount: 2,
      currentActivity: "bash npm test",
      recentActivities: [
        { type: "tool_start", label: "bash npm test", timestamp: 1100 },
        { type: "tool_end", label: "bash npm test finished", timestamp: 2000 },
      ],
      artifactPaths: {
        rootDir: "/home/me/.pi/task-runs",
        taskDir: "/home/me/.pi/task-runs/2026-05-27-ab12cd/01-default",
        inputMd: "/home/me/.pi/task-runs/2026-05-27-ab12cd/01-default/input.md",
        eventsJsonl: "/home/me/.pi/task-runs/2026-05-27-ab12cd/01-default/events.jsonl",
        outputMd: "/home/me/.pi/task-runs/2026-05-27-ab12cd/01-default/output.md",
        metaJson: "/home/me/.pi/task-runs/2026-05-27-ab12cd/01-default/meta.json",
      },
      artifactError: "write failed",
    };

    expect(result.status).toBe("running");
    expect(result.recentActivities[0].type).toBe("tool_start");
    expect(result.artifactPaths?.eventsJsonl).toContain("events.jsonl");
  });
```

- [ ] **Step 2: Run schema tests to verify they fail**

Run:

```bash
npm test -- tests/task/schema.test.ts
```

Expected: FAIL because `subagent_type: "default"` is currently preserved and `TaskRunResult` does not yet define progress/artifact fields.

- [ ] **Step 3: Add progress and artifact types to `src/task/schema.ts`**

Insert these interfaces after `UsageStats` in `src/task/schema.ts`:

```ts
export interface TaskActivity {
  type: "thinking" | "text" | "tool_start" | "tool_end" | "done" | "error";
  label: string;
  timestamp: number;
}

export interface TaskArtifactPaths {
  rootDir: string;
  taskDir: string;
  inputMd: string;
  eventsJsonl: string;
  outputMd: string;
  metaJson: string;
}
```

Then add these required and optional fields to `TaskRunResult` after `errorMessage?: string;`:

```ts
  startedAt: number;
  completedAt?: number;
  elapsedMs: number;
  toolUseCount: number;
  currentActivity: string;
  recentActivities: TaskActivity[];
  artifactPaths?: TaskArtifactPaths;
  artifactError?: string;
```

- [ ] **Step 4: Normalize explicit `default` as omitted**

Replace `normalizeOptionalString()` in `src/task/schema.ts` with:

```ts
function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length === 0) return undefined;
  if (trimmed === "default") return undefined;
  return trimmed;
}
```

- [ ] **Step 5: Update existing manual `TaskRunResult` literals in tests**

In `tests/task/schema.test.ts`, `tests/task/orchestrator.test.ts`, and `tests/task/render.test.ts`, add this field set to each hand-built `TaskRunResult` object that lacks it:

```ts
    startedAt: 1000,
    elapsedMs: 0,
    toolUseCount: 0,
    currentActivity: "",
    recentActivities: [],
```

For failed synthetic results, use `currentActivity: "failed"` when the test is asserting diagnostics. For running synthetic results, use a concrete activity such as `currentActivity: "bash npm test"` when the render output should display activity.

- [ ] **Step 6: Run focused schema tests to verify pass**

Run:

```bash
npm test -- tests/task/schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit schema baseline**

```bash
git add src/task/schema.ts tests/task/schema.test.ts tests/task/orchestrator.test.ts tests/task/render.test.ts
git commit -m "feat: extend task run progress schema"
```

## Task 2: Add Time and Activity Helper Modules

**Files:**
- Create: `tests/task/time.test.ts`
- Create: `tests/task/activity.test.ts`
- Create: `src/task/time.ts`
- Create: `src/task/activity.ts`

- [ ] **Step 1: Write failing time formatting tests**

Create `tests/task/time.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatTokenCount, sumUsageTokens } from "../../src/task/time.ts";
import type { UsageStats } from "../../src/task/schema.ts";

const usage = (overrides: Partial<UsageStats>): UsageStats => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  contextTokens: 0,
  turns: 0,
  ...overrides,
});

describe("task time and token formatting", () => {
  it("formats elapsed durations as mm:ss or h:mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(18_400)).toBe("00:18");
    expect(formatDuration(84_000)).toBe("01:24");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
  });

  it("sums displayed token fields", () => {
    expect(sumUsageTokens(usage({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1 }))).toBe(18);
  });

  it("formats token counts for collapsed display", () => {
    expect(formatTokenCount(0)).toBe("0 tok");
    expect(formatTokenCount(999)).toBe("999 tok");
    expect(formatTokenCount(8_100)).toBe("8.1k tok");
    expect(formatTokenCount(318_900)).toBe("318.9k tok");
  });
});
```

- [ ] **Step 2: Write failing activity formatting tests**

Create `tests/task/activity.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  appendRecentActivity,
  formatToolActivity,
  getTextDeltaActivity,
} from "../../src/task/activity.ts";
import { createInitialTaskRunResult } from "../../src/task/runner.ts";

const request = { description: "Run tests", prompt: "Run npm test." };

describe("task activity helpers", () => {
  it("formats common child tool calls", () => {
    expect(formatToolActivity({ type: "tool_execution_start", toolName: "bash", args: { command: "npm test" } })).toBe("bash npm test");
    expect(formatToolActivity({ type: "tool_execution_start", toolName: "read", args: { path: "src/task/runner.ts" } })).toBe("read src/task/runner.ts");
    expect(formatToolActivity({ type: "tool_execution_start", toolName: "grep", args: { pattern: "TaskRunResult", path: "src" } })).toBe("grep TaskRunResult in src");
    expect(formatToolActivity({ type: "tool_execution_start", toolName: "edit", args: { path: "src/task/schema.ts" } })).toBe("edit src/task/schema.ts");
  });

  it("falls back to tool name when args are unavailable", () => {
    expect(formatToolActivity({ type: "tool_execution_start", toolName: "custom_tool", args: { value: 1 } })).toBe("custom_tool");
  });

  it("extracts short assistant text delta activity", () => {
    expect(getTextDeltaActivity({ type: "message_update", delta: { type: "text", text: "Thinking about tests now" } })).toBe("assistant: Thinking about tests now");
    expect(getTextDeltaActivity({ type: "message_update", text: "Working" })).toBe("assistant: Working");
  });

  it("keeps the most recent five activities", () => {
    const result = createInitialTaskRunResult(request, "default", undefined, 1000);
    for (let index = 0; index < 7; index++) {
      appendRecentActivity(result, "text", `activity ${index}`, 1000 + index);
    }

    expect(result.recentActivities.map((activity) => activity.label)).toEqual([
      "activity 2",
      "activity 3",
      "activity 4",
      "activity 5",
      "activity 6",
    ]);
    expect(result.currentActivity).toBe("activity 6");
  });
});
```

- [ ] **Step 3: Run helper tests to verify they fail**

Run:

```bash
npm test -- tests/task/time.test.ts tests/task/activity.test.ts
```

Expected: FAIL because the helper modules do not exist.

- [ ] **Step 4: Implement `src/task/time.ts`**

Create `src/task/time.ts` with:

```ts
import type { UsageStats } from "./schema.ts";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

export function sumUsageTokens(usage: UsageStats): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens} tok`;
  return `${(tokens / 1000).toFixed(1)}k tok`;
}
```

- [ ] **Step 5: Implement `src/task/activity.ts`**

Create `src/task/activity.ts` with:

```ts
import type { TaskActivity, TaskRunResult } from "./schema.ts";

const RECENT_ACTIVITY_LIMIT = 5;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getArgs(event: unknown): UnknownRecord {
  if (!isRecord(event) || !isRecord(event.args)) return {};
  return event.args;
}

export function formatToolActivity(event: unknown): string {
  if (!isRecord(event)) return "tool";
  const toolName = getString(event.toolName) ?? getString(event.name) ?? "tool";
  const args = getArgs(event);

  if (toolName === "bash") {
    const command = getString(args.command);
    return command ? `bash ${command}` : "bash";
  }
  if (toolName === "read") {
    const path = getString(args.path);
    return path ? `read ${path}` : "read";
  }
  if (toolName === "grep" || toolName === "rg") {
    const pattern = getString(args.pattern) ?? getString(args.query);
    const path = getString(args.path) ?? getString(args.cwd);
    if (pattern && path) return `${toolName} ${pattern} in ${path}`;
    if (pattern) return `${toolName} ${pattern}`;
    return toolName;
  }
  if (toolName === "edit" || toolName === "write") {
    const path = getString(args.path);
    return path ? `${toolName} ${path}` : toolName;
  }

  return toolName;
}

export function getTextDeltaActivity(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const directText = getString(event.text);
  if (directText) return `assistant: ${directText.slice(0, 80)}`;

  if (isRecord(event.delta)) {
    const deltaText = getString(event.delta.text);
    if (deltaText) return `assistant: ${deltaText.slice(0, 80)}`;
  }

  return undefined;
}

export function appendRecentActivity(
  result: TaskRunResult,
  type: TaskActivity["type"],
  label: string,
  timestamp = Date.now(),
): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  result.currentActivity = trimmed;
  result.recentActivities.push({ type, label: trimmed, timestamp });
  if (result.recentActivities.length > RECENT_ACTIVITY_LIMIT) {
    result.recentActivities.splice(0, result.recentActivities.length - RECENT_ACTIVITY_LIMIT);
  }
}
```

- [ ] **Step 6: Run helper tests to verify pass**

Run:

```bash
npm test -- tests/task/time.test.ts tests/task/activity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit helper modules**

```bash
git add src/task/time.ts src/task/activity.ts tests/task/time.test.ts tests/task/activity.test.ts
git commit -m "feat: add task progress formatting helpers"
```

## Task 3: Add Best-Effort Artifact Writer

**Files:**
- Create: `tests/task/artifacts.test.ts`
- Create: `src/task/artifacts.ts`

- [ ] **Step 1: Write failing artifact setup and write tests**

Create `tests/task/artifacts.test.ts` with:

```ts
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTaskRunArtifactContext,
  sanitizePathSegment,
} from "../../src/task/artifacts.ts";
import { createInitialTaskRunResult } from "../../src/task/runner.ts";

const tempRoots: string[] = [];

async function tempHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "task-artifacts-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("task artifacts", () => {
  it("sanitizes path segments", () => {
    expect(sanitizePathSegment("Default Agent!" )).toBe("default-agent");
    expect(sanitizePathSegment("../bad/path" )).toBe("bad-path");
    expect(sanitizePathSegment("" )).toBe("task");
  });

  it("skips artifact logging when ~/.pi is missing", async () => {
    const homeDir = await tempHome();
    const context = await createTaskRunArtifactContext({
      cwd: "/tmp/project",
      taskCount: 1,
      homeDir,
      now: new Date("2026-05-27T10:00:00Z"),
      randomId: "ab12cd",
    });

    expect(context.enabled).toBe(false);
    expect(context.runDir).toBeUndefined();
  });

  it("creates task-runs and child files when ~/.pi exists", async () => {
    const homeDir = await tempHome();
    await mkdir(join(homeDir, ".pi"));

    const context = await createTaskRunArtifactContext({
      cwd: "/tmp/project",
      taskCount: 1,
      homeDir,
      now: new Date("2026-05-27T10:00:00Z"),
      randomId: "ab12cd",
    });
    const writer = await context.createChildWriter({
      taskIndex: 1,
      agent: "default",
      description: "Run tests",
      prompt: "Run npm test.",
      cwd: "/tmp/project",
      startedAt: 1000,
    });

    expect(context.enabled).toBe(true);
    expect(writer.paths?.eventsJsonl).toContain("01-default/events.jsonl");

    const result = createInitialTaskRunResult({ description: "Run tests", prompt: "Run npm test." }, "default", undefined, 1000);
    result.status = "failed";
    result.exitCode = 1;
    result.stopReason = "error";
    result.errorMessage = "child assistant stopReason=error";
    result.toolUseCount = 1;
    result.usage.input = 10;
    result.completedAt = 2000;
    result.elapsedMs = 1000;
    result.finalOutput = "failed after tests";

    await writer.appendEvent({ type: "child_stdout_malformed", line: "{bad" });
    await writer.writeOutput(result);
    await writer.writeMeta(result);

    expect(existsSync(join(homeDir, ".pi", "task-runs", "2026-05-27-ab12cd", "task-run.json"))).toBe(true);
    expect(await readFile(writer.paths?.inputMd ?? "", "utf8")).toContain("# Task Input");
    expect(await readFile(writer.paths?.eventsJsonl ?? "", "utf8")).toContain("child_stdout_malformed");
    expect(await readFile(writer.paths?.outputMd ?? "", "utf8")).toContain("Stop reason: error");
    expect(JSON.parse(await readFile(writer.paths?.metaJson ?? "", "utf8"))).toMatchObject({
      status: "failed",
      exitCode: 1,
      stopReason: "error",
      toolUseCount: 1,
    });
  });

  it("records artifact errors without throwing", async () => {
    const homeDir = await tempHome();
    await mkdir(join(homeDir, ".pi"));
    const context = await createTaskRunArtifactContext({
      cwd: "/tmp/project",
      taskCount: 1,
      homeDir,
      now: new Date("2026-05-27T10:00:00Z"),
      randomId: "ab12cd",
    });
    const writer = await context.createChildWriter({
      taskIndex: 1,
      agent: "default",
      description: "Run tests",
      prompt: "Run npm test.",
      cwd: "/tmp/project",
      startedAt: 1000,
    });

    if (!writer.paths) throw new Error("expected artifact paths");
    await rm(writer.paths.taskDir, { recursive: true, force: true });
    await writer.appendEvent({ type: "child_event", event: { type: "message_end" } });

    expect(writer.artifactError).toContain("ENOENT");
  });
});
```

- [ ] **Step 2: Run artifact tests to verify they fail**

Run:

```bash
npm test -- tests/task/artifacts.test.ts
```

Expected: FAIL because `src/task/artifacts.ts` does not exist.

- [ ] **Step 3: Implement `src/task/artifacts.ts`**

Create `src/task/artifacts.ts` with:

```ts
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TaskArtifactPaths, TaskRunResult } from "./schema.ts";
import { formatDuration } from "./time.ts";

export interface CreateTaskRunArtifactContextOptions {
  cwd: string;
  taskCount: number;
  homeDir?: string;
  now?: Date;
  randomId?: string;
}

export interface CreateChildWriterOptions {
  taskIndex: number;
  agent: string;
  description: string;
  prompt: string;
  cwd: string;
  startedAt: number;
}

export interface TaskArtifactWriter {
  paths?: TaskArtifactPaths;
  artifactError?: string;
  appendEvent(event: Record<string, unknown>): Promise<void>;
  writeOutput(result: TaskRunResult): Promise<void>;
  writeMeta(result: TaskRunResult): Promise<void>;
}

export interface TaskRunArtifactContext {
  enabled: boolean;
  rootDir?: string;
  runDir?: string;
  runId?: string;
  artifactError?: string;
  createChildWriter(options: CreateChildWriterOptions): Promise<TaskArtifactWriter>;
}

function datePrefix(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function sanitizePathSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "task";
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function eventLine(event: Record<string, unknown>): string {
  return `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`;
}

function outputMarkdown(result: TaskRunResult): string {
  return [
    "# Task Output",
    "",
    `Status: ${result.status}`,
    `Exit code: ${result.exitCode}`,
    `Stop reason: ${result.stopReason ?? ""}`,
    `Elapsed: ${formatDuration(result.elapsedMs)}`,
    `Usage: input ${result.usage.input}, output ${result.usage.output}, cache read ${result.usage.cacheRead}, cache write ${result.usage.cacheWrite}`,
    "",
    "---",
    "",
    result.finalOutput || result.errorMessage || result.stderr || "(no diagnostic output)",
    "",
  ].join("\n");
}

function metaJson(runId: string, taskIndex: number, result: TaskRunResult): string {
  return JSON.stringify(
    {
      version: 1,
      runId,
      taskIndex,
      agent: result.agent,
      description: result.description,
      status: result.status,
      exitCode: result.exitCode,
      stopReason: result.stopReason,
      errorMessage: result.errorMessage,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.elapsedMs,
      toolUseCount: result.toolUseCount,
      usage: result.usage,
    },
    null,
    2,
  );
}

function disabledContext(error?: string): TaskRunArtifactContext {
  return {
    enabled: false,
    ...(error ? { artifactError: error } : {}),
    async createChildWriter() {
      return {
        ...(error ? { artifactError: error } : {}),
        async appendEvent() {},
        async writeOutput() {},
        async writeMeta() {},
      };
    },
  };
}

export async function createTaskRunArtifactContext({
  cwd,
  taskCount,
  homeDir = homedir(),
  now = new Date(),
  randomId = randomBytes(3).toString("hex"),
}: CreateTaskRunArtifactContextOptions): Promise<TaskRunArtifactContext> {
  const piDir = join(homeDir, ".pi");
  if (!existsSync(piDir)) return disabledContext();

  const rootDir = join(piDir, "task-runs");
  const runId = `${datePrefix(now)}-${sanitizePathSegment(randomId)}`;
  const runDir = join(rootDir, runId);

  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "task-run.json"),
      JSON.stringify(
        {
          version: 1,
          runId,
          cwd,
          startedAt: now.toISOString(),
          taskCount,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    return disabledContext(error instanceof Error ? error.message : String(error));
  }

  return {
    enabled: true,
    rootDir,
    runDir,
    runId,
    async createChildWriter(options) {
      const childDirName = `${String(options.taskIndex).padStart(2, "0")}-${sanitizePathSegment(options.agent)}`;
      const taskDir = join(runDir, childDirName);
      const paths: TaskArtifactPaths = {
        rootDir,
        taskDir,
        inputMd: join(taskDir, "input.md"),
        eventsJsonl: join(taskDir, "events.jsonl"),
        outputMd: join(taskDir, "output.md"),
        metaJson: join(taskDir, "meta.json"),
      };
      const writer: TaskArtifactWriter = {
        paths,
        async appendEvent(event) {
          try {
            await appendFile(paths.eventsJsonl, eventLine(event));
          } catch (error) {
            writer.artifactError = error instanceof Error ? error.message : String(error);
          }
        },
        async writeOutput(result) {
          try {
            await writeFile(paths.outputMd, outputMarkdown(result));
          } catch (error) {
            writer.artifactError = error instanceof Error ? error.message : String(error);
          }
        },
        async writeMeta(result) {
          try {
            await writeFile(paths.metaJson, metaJson(runId, options.taskIndex, result));
          } catch (error) {
            writer.artifactError = error instanceof Error ? error.message : String(error);
          }
        },
      };

      try {
        await mkdir(taskDir, { recursive: true });
        await writeFile(
          paths.inputMd,
          [
            "# Task Input",
            "",
            `Agent: ${options.agent}`,
            `Description: ${options.description}`,
            `Cwd: ${options.cwd}`,
            `Started: ${iso(options.startedAt)}`,
            "",
            "---",
            "",
            options.prompt,
            "",
          ].join("\n"),
        );
        await writeFile(paths.eventsJsonl, "");
      } catch (error) {
        writer.artifactError = error instanceof Error ? error.message : String(error);
      }

      return writer;
    },
  };
}
```

- [ ] **Step 4: Run artifact tests to verify pass**

Run:

```bash
npm test -- tests/task/artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit artifact module**

```bash
git add src/task/artifacts.ts tests/task/artifacts.test.ts
git commit -m "feat: write task diagnostic artifacts"
```

## Task 4: Parse Live Events, Track Heartbeat, and Write Runner Artifacts

**Files:**
- Modify: `tests/task/runner.test.ts`
- Modify: `src/task/runner.ts`

- [ ] **Step 1: Add failing runner tests for progress event parsing**

Add these tests inside `describe("task runner JSON parsing", ...)` in `tests/task/runner.test.ts`, after `ignores malformed JSON lines`:

```ts
  it("records malformed JSON lines through diagnostics callback", () => {
    const result = createInitialTaskRunResult(request, "reviewer", undefined, 1000);
    const malformed: string[] = [];

    processPiJsonLine("{not json", result, { onMalformedLine: (line) => malformed.push(line), now: () => 1100 });

    expect(result.messages).toEqual([]);
    expect(malformed).toEqual(["{not json"]);
  });

  it("tracks tool execution start as count and activity", () => {
    const result = createInitialTaskRunResult(request, "reviewer", undefined, 1000);
    processPiJsonLine(
      JSON.stringify({ type: "tool_execution_start", toolName: "bash", args: { command: "npm test" } }),
      result,
      { now: () => 1200 },
    );

    expect(result.toolUseCount).toBe(1);
    expect(result.currentActivity).toBe("bash npm test");
    expect(result.recentActivities).toEqual([{ type: "tool_start", label: "bash npm test", timestamp: 1200 }]);
  });

  it("tracks tool execution end and message update activity", () => {
    const result = createInitialTaskRunResult(request, "reviewer", undefined, 1000);
    processPiJsonLine(
      JSON.stringify({ type: "tool_execution_end", toolName: "bash", args: { command: "npm test" } }),
      result,
      { now: () => 1300 },
    );
    processPiJsonLine(
      JSON.stringify({ type: "message_update", delta: { type: "text", text: "Reviewing failure output" } }),
      result,
      { now: () => 1400 },
    );

    expect(result.recentActivities.map((activity) => activity.label)).toEqual([
      "bash npm test finished",
      "assistant: Reviewing failure output",
    ]);
    expect(result.currentActivity).toBe("assistant: Reviewing failure output");
  });

  it("marks assistant stopReason error as failed after close", async () => {
    const child = new FakeChildProcess();
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "reviewer",
      spawnChild: () => child as never,
    });

    child.writeStdout(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I committed the code." }],
          usage: { input: 10, output: 2, cacheRead: 5, cacheWrite: 0, cost: { total: 0 }, totalTokens: 17 },
          stopReason: "error",
          errorMessage: "child assistant stopReason=error",
        },
      })}\n`,
    );
    child.close(0);

    const result = await execution;
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(0);
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe("child assistant stopReason=error");
  });
```

- [ ] **Step 2: Add failing heartbeat and artifact writer tests**

Add these tests near the existing `runTaskChildProcess` tests in `tests/task/runner.test.ts`:

```ts
  it("emits heartbeat updates while child stdout is quiet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const child = new FakeChildProcess();
    const updates: number[] = [];
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      spawnChild: () => child as never,
      onUpdate: (result) => updates.push(result.elapsedMs),
    });

    vi.setSystemTime(2000);
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(3000);
    vi.advanceTimersByTime(1000);

    expect(updates).toContain(1000);
    expect(updates).toContain(2000);

    child.close(0);
    await execution;
    vi.useRealTimers();
  });

  it("stops heartbeat updates after terminal status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const child = new FakeChildProcess();
    const updates: string[] = [];
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      spawnChild: () => child as never,
      onUpdate: (result) => updates.push(result.status),
    });

    vi.advanceTimersByTime(1000);
    child.close(0);
    const result = await execution;
    vi.advanceTimersByTime(3000);

    expect(result.status).toBe("completed");
    expect(updates.filter((status) => status === "completed")).toHaveLength(1);
    vi.useRealTimers();
  });

  it("writes runner diagnostics to artifact writer", async () => {
    const child = new FakeChildProcess();
    const events: Record<string, unknown>[] = [];
    const writes: string[] = [];
    const artifactWriter = {
      paths: {
        rootDir: "/tmp/task-runs",
        taskDir: "/tmp/task-runs/run/01-default",
        inputMd: "/tmp/task-runs/run/01-default/input.md",
        eventsJsonl: "/tmp/task-runs/run/01-default/events.jsonl",
        outputMd: "/tmp/task-runs/run/01-default/output.md",
        metaJson: "/tmp/task-runs/run/01-default/meta.json",
      },
      async appendEvent(event: Record<string, unknown>) { events.push(event); },
      async writeOutput() { writes.push("output"); },
      async writeMeta() { writes.push("meta"); },
    };

    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "default",
      spawnChild: () => child as never,
      artifactWriter,
    });

    child.writeStdout("{bad\n");
    child.writeStderr("stderr text");
    child.close(1);

    const result = await execution;
    expect(result.artifactPaths?.eventsJsonl).toContain("events.jsonl");
    expect(events.map((event) => event.type)).toEqual([
      "task_runner_start",
      "child_stdout_malformed",
      "child_stderr",
      "task_runner_close",
    ]);
    expect(writes).toEqual(["output", "meta"]);
  });
```

- [ ] **Step 3: Run runner tests to verify they fail**

Run:

```bash
npm test -- tests/task/runner.test.ts
```

Expected: FAIL because runner progress fields, callbacks, heartbeat, and artifact writer support are not implemented.

- [ ] **Step 4: Update imports and `RunTaskOptions` in `src/task/runner.ts`**

Add imports:

```ts
import { appendRecentActivity, formatToolActivity, getTextDeltaActivity } from "./activity.ts";
import type { TaskArtifactWriter } from "./artifacts.ts";
```

Add `artifactWriter?: TaskArtifactWriter;` to `RunTaskOptions`.

Add this interface near the JSON event types:

```ts
export interface ProcessPiJsonLineOptions {
  now?: () => number;
  onParsedEvent?: (event: Record<string, unknown>) => void;
  onMalformedLine?: (line: string) => void;
}
```

- [ ] **Step 5: Initialize progress fields in `createInitialTaskRunResult()`**

Change the function signature to:

```ts
export function createInitialTaskRunResult(
  request: TaskRequest,
  agent: string,
  agentFilePath?: string,
  startedAt = Date.now(),
): TaskRunResult {
```

Add these fields to the returned object:

```ts
    startedAt,
    elapsedMs: 0,
    toolUseCount: 0,
    currentActivity: "Starting child agent",
    recentActivities: [],
```

- [ ] **Step 6: Replace `processPiJsonLine()` with progress-aware parsing**

Replace the current `processPiJsonLine()` implementation with:

```ts
export function processPiJsonLine(
  line: string,
  result: TaskRunResult,
  options: ProcessPiJsonLineOptions = {},
): void {
  if (!line.trim()) return;

  const now = options.now?.() ?? Date.now();
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    options.onMalformedLine?.(line);
    return;
  }

  options.onParsedEvent?.(event);

  if (event.type === "tool_execution_start") {
    result.toolUseCount += 1;
    appendRecentActivity(result, "tool_start", formatToolActivity(event), now);
    return;
  }

  if (event.type === "tool_execution_end") {
    appendRecentActivity(result, "tool_end", `${formatToolActivity(event)} finished`, now);
    return;
  }

  if (event.type === "tool_execution_update") {
    appendRecentActivity(result, "tool_start", formatToolActivity(event), now);
    return;
  }

  if (event.type === "message_update") {
    const textActivity = getTextDeltaActivity(event);
    if (textActivity) appendRecentActivity(result, "text", textActivity, now);
    return;
  }

  if ((event.type !== "message_end" && event.type !== "tool_result_end") || !isMessage(event.message)) {
    return;
  }

  result.messages.push(event.message);
  result.finalOutput = getFinalOutput(result.messages);
  if (event.message.role !== "assistant") return;

  result.usage.turns++;
  const usage = event.message.usage;
  if (usage) {
    result.usage.input += usage.input || 0;
    result.usage.output += usage.output || 0;
    result.usage.cacheRead += usage.cacheRead || 0;
    result.usage.cacheWrite += usage.cacheWrite || 0;
    result.usage.cost += usage.cost?.total || 0;
    result.usage.contextTokens = usage.totalTokens || 0;
  }
  if (event.message.stopReason) result.stopReason = event.message.stopReason;
  if (event.message.errorMessage) result.errorMessage = event.message.errorMessage;
  if (event.message.stopReason === "error") appendRecentActivity(result, "error", "assistant stopped with error", now);
}
```

- [ ] **Step 7: Add heartbeat and artifact writes in `runTaskChildProcess()`**

Inside `runTaskChildProcess()`:

1. Destructure `artifactWriter` from options.
2. Create the initial result with a captured `startedAt`.
3. Set `result.artifactPaths = artifactWriter.paths` when paths exist.
4. Start a `setInterval()` heartbeat after spawning the child.
5. Clear the heartbeat in `close`, `error`, and after the promise resolves.
6. Write artifact wrapper events as child output arrives and when the run closes.

Use this structure in the function body after `const invocation = getPiInvocation(args);`:

```ts
  if (artifactWriter?.paths) result.artifactPaths = artifactWriter.paths;
  if (artifactWriter?.artifactError) result.artifactError = artifactWriter.artifactError;
```

Inside the `new Promise<number>` callback, after `const child = spawnChild(...)`, add:

```ts
    void artifactWriter?.appendEvent({
      type: "task_runner_start",
      agent: result.agent,
      description: result.description,
      command: invocation.command,
      args: invocation.args,
    });

    const heartbeat = setInterval(() => {
      if (childClosed) return;
      result.elapsedMs = Date.now() - result.startedAt;
      onUpdate?.(result);
    }, 1000);
```

Update `removeAbortListener()` so it clears `heartbeat` as well as `killTimer`:

```ts
    const removeAbortListener = () => {
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
      if (killTimer) clearTimeout(killTimer);
      clearInterval(heartbeat);
    };
```

Replace `processLine` with:

```ts
    const processLine = (line: string) => {
      const beforeMessages = result.messages.length;
      const beforeTools = result.toolUseCount;
      const beforeActivity = result.currentActivity;
      processPiJsonLine(line, result, {
        onParsedEvent: (event) => void artifactWriter?.appendEvent({ type: "child_event", event }),
        onMalformedLine: (malformedLine) => void artifactWriter?.appendEvent({ type: "child_stdout_malformed", line: malformedLine }),
      });
      result.elapsedMs = Date.now() - result.startedAt;
      if (
        result.messages.length > beforeMessages ||
        result.toolUseCount !== beforeTools ||
        result.currentActivity !== beforeActivity
      ) {
        onUpdate?.(result);
      }
    };
```

In `child.stderr.on("data", ...)`, append artifact event and update activity:

```ts
      const text = data.toString();
      result.stderr += text;
      appendRecentActivity(result, "error", "stderr output", Date.now());
      void artifactWriter?.appendEvent({ type: "child_stderr", text });
```

In `child.on("close", ...)`, before `resolve(...)`, add:

```ts
      result.completedAt = Date.now();
      result.elapsedMs = result.completedAt - result.startedAt;
      void artifactWriter?.appendEvent({
        type: "task_runner_close",
        exitCode: code,
        signalName: signalName ?? null,
        stopReason: result.stopReason,
      });
```

After final status calculation and error-message derivation, add:

```ts
  result.completedAt = result.completedAt ?? Date.now();
  result.elapsedMs = result.completedAt - result.startedAt;
  if (result.status === "completed") appendRecentActivity(result, "done", "Done", result.completedAt);
  if (result.status === "failed" && !result.currentActivity) appendRecentActivity(result, "error", "failed", result.completedAt);
  await artifactWriter?.writeOutput(result);
  await artifactWriter?.writeMeta(result);
  if (artifactWriter?.artifactError) result.artifactError = artifactWriter.artifactError;
```

- [ ] **Step 8: Run runner tests to verify pass**

Run:

```bash
npm test -- tests/task/runner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit runner progress**

```bash
git add src/task/runner.ts tests/task/runner.test.ts
git commit -m "feat: track live task child progress"
```

## Task 5: Wire Artifacts and Default Semantics Through Orchestrator

**Files:**
- Modify: `tests/task/orchestrator.test.ts`
- Modify: `src/task/orchestrator.ts`
- Modify: `src/task/runner.ts`

- [ ] **Step 1: Add failing orchestrator tests**

Add this test after `runs a default task when subagent_type is omitted` in `tests/task/orchestrator.test.ts`:

```ts
  it("runs a default task when subagent_type is explicit default", async () => {
    const request = { description: "Default review", prompt: "Review this.", subagent_type: "default" };
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: [request],
      agents: [],
      runTask: async ({ request, agentName, agent }) => ({
        ...resultFor(request, "completed", "done"),
        agent: agent?.name ?? agentName ?? "default",
      }),
    });

    expect(execution.isError).toBe(false);
    expect(execution.details.results[0].agent).toBe("default");
  });
```

Add this test near the partial-update test:

```ts
  it("creates and passes per-child artifact writers when artifacts are enabled", async () => {
    const requests = [
      { description: "First", prompt: "First." },
      { description: "Second", prompt: "Second.", subagent_type: "reviewer" },
    ];
    const writerPaths: string[] = [];
    const artifactContext = {
      enabled: true,
      rootDir: "/tmp/task-runs",
      runDir: "/tmp/task-runs/2026-05-27-ab12cd",
      runId: "2026-05-27-ab12cd",
      async createChildWriter({ taskIndex, agent }: { taskIndex: number; agent: string }) {
        const path = `/tmp/task-runs/2026-05-27-ab12cd/${String(taskIndex).padStart(2, "0")}-${agent}/events.jsonl`;
        writerPaths.push(path);
        return {
          paths: {
            rootDir: "/tmp/task-runs",
            taskDir: path.replace("/events.jsonl", ""),
            inputMd: path.replace("events.jsonl", "input.md"),
            eventsJsonl: path,
            outputMd: path.replace("events.jsonl", "output.md"),
            metaJson: path.replace("events.jsonl", "meta.json"),
          },
          async appendEvent() {},
          async writeOutput() {},
          async writeMeta() {},
        };
      },
    };

    await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [reviewer],
      artifactContext,
      runTask: async ({ request, artifactWriter }) => ({
        ...resultFor(request, "completed", "done"),
        artifactPaths: artifactWriter?.paths,
      }),
    });

    expect(writerPaths).toEqual([
      "/tmp/task-runs/2026-05-27-ab12cd/01-default/events.jsonl",
      "/tmp/task-runs/2026-05-27-ab12cd/02-reviewer/events.jsonl",
    ]);
  });
```

- [ ] **Step 2: Run orchestrator tests to verify they fail**

Run:

```bash
npm test -- tests/task/orchestrator.test.ts
```

Expected: FAIL because `ExecuteTaskRequestsOptions` does not accept `artifactContext`, synthetic failures lack progress fields, and explicit default may still be passed as a named agent if callers bypass normalization.

- [ ] **Step 3: Update orchestrator imports and options**

In `src/task/orchestrator.ts`, add:

```ts
import { createTaskRunArtifactContext, type TaskRunArtifactContext } from "./artifacts.ts";
```

Add this optional field to `ExecuteTaskRequestsOptions`:

```ts
  artifactContext?: TaskRunArtifactContext;
```

- [ ] **Step 4: Add synthetic result helper fields**

In both `createUnknownAgentResult()` and `createFailedRunResult()`, add:

```ts
    startedAt: Date.now(),
    completedAt: Date.now(),
    elapsedMs: 0,
    toolUseCount: 0,
    currentActivity: message,
    recentActivities: [{ type: "error", label: message, timestamp: Date.now() }],
```

Use a local `const now = Date.now();` in each function so `startedAt`, `completedAt`, and `recentActivities[0].timestamp` match:

```ts
  const now = Date.now();
```

- [ ] **Step 5: Normalize explicit default in orchestrator as defensive compatibility**

Inside `runNext()`, replace:

```ts
      const agentName = request.subagent_type ?? "default";
      const agent = request.subagent_type ? agentsByName.get(request.subagent_type) : undefined;

      if (request.subagent_type && !agent) {
        results[index] = createUnknownAgentResult(request, request.subagent_type);
```

with:

```ts
      const requestedAgent = request.subagent_type === "default" ? undefined : request.subagent_type;
      const agentName = requestedAgent ?? "default";
      const agent = requestedAgent ? agentsByName.get(requestedAgent) : undefined;

      if (requestedAgent && !agent) {
        results[index] = createUnknownAgentResult(request, requestedAgent);
```

- [ ] **Step 6: Create artifact context and child writers**

At the start of `executeTaskRequests()`, after `const results...`, add:

```ts
  const artifacts = artifactContext ?? await createTaskRunArtifactContext({ cwd, taskCount: tasks.length });
```

Before `runTask({ ... })`, add:

```ts
      const childArtifactWriter = await artifacts.createChildWriter({
        taskIndex: index + 1,
        agent: agentName,
        description: request.description,
        prompt: request.prompt,
        cwd,
        startedAt: Date.now(),
      });
```

Pass it to `runTask`:

```ts
          artifactWriter: childArtifactWriter,
```

When creating a synthetic failure for runner rejection, attach artifact information if present:

```ts
        results[index] = createFailedRunResult(request, agentName, error);
        if (childArtifactWriter.paths) results[index].artifactPaths = childArtifactWriter.paths;
        if (childArtifactWriter.artifactError) results[index].artifactError = childArtifactWriter.artifactError;
```

- [ ] **Step 7: Run orchestrator tests to verify pass**

Run:

```bash
npm test -- tests/task/orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit orchestrator wiring**

```bash
git add src/task/orchestrator.ts tests/task/orchestrator.test.ts
git commit -m "feat: wire task artifacts through orchestration"
```

## Task 6: Render Inline Progress Roster and Diagnostics

**Files:**
- Modify: `tests/task/render.test.ts`
- Modify: `src/task/render.ts`

- [ ] **Step 1: Replace collapsed summary tests with inline roster expectations**

In `tests/task/render.test.ts`, replace the two tests named `formats running summaries for collapsed TUI display` and `formats result summaries for collapsed TUI display` with:

```ts
  it("formats collapsed running roster with progress fields", () => {
    const summary = formatTaskResultSummary({
      version: 1,
      results: [
        result({
          description: "Scout auth",
          agent: "scout-auth",
          status: "running",
          exitCode: -1,
          elapsedMs: 42_000,
          usage: { input: 8000, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 8100, turns: 1 },
          toolUseCount: 3,
          currentActivity: "grep /auth/ in src/",
        }),
        result({
          description: "Review",
          agent: "reviewer",
          status: "completed",
          elapsedMs: 31_000,
          toolUseCount: 2,
          currentActivity: "Done",
        }),
      ],
    });

    expect(summary).toContain("⏳ Task 1/2 done · 1 running · 01:13 · 8.1k tok");
    expect(summary).toContain("├─ ⠋ scout-auth  00:42 · 8.1k tok · 3 tools");
    expect(summary).toContain("│  ⎿ grep /auth/ in src/");
    expect(summary).toContain("└─ ✓ reviewer  00:31 · 15 tok · 2 tools");
  });

  it("formats collapsed failed roster with diagnostic and log path", () => {
    const summary = formatTaskResultSummary({
      version: 1,
      results: [
        result({
          agent: "default",
          status: "failed",
          finalOutput: "generic output",
          stderr: "stderr failed",
          errorMessage: "child assistant stopReason=error",
          stopReason: "error",
          exitCode: 1,
          elapsedMs: 134_000,
          toolUseCount: 12,
          usage: { input: 170_500, output: 3_500, cacheRead: 144_900, cacheWrite: 0, cost: 0, contextTokens: 318_900, turns: 18 },
          artifactPaths: {
            rootDir: "/tmp/task-runs",
            taskDir: "/tmp/task-runs/2026-05-27-ab12cd/01-default",
            inputMd: "/tmp/task-runs/2026-05-27-ab12cd/01-default/input.md",
            eventsJsonl: "/tmp/task-runs/2026-05-27-ab12cd/01-default/events.jsonl",
            outputMd: "/tmp/task-runs/2026-05-27-ab12cd/01-default/output.md",
            metaJson: "/tmp/task-runs/2026-05-27-ab12cd/01-default/meta.json",
          },
        }),
      ],
    });

    expect(summary).toContain("✗ Task 0/1 done · 1 failed · 02:14 · 318.9k tok");
    expect(summary).toContain("└─ ✗ default  02:14 · 318.9k tok · 12 tools");
    expect(summary).toContain("⎿ child assistant stopReason=error");
    expect(summary).toContain("log: /tmp/task-runs/2026-05-27-ab12cd/01-default/events.jsonl");
  });
```

- [ ] **Step 2: Add expanded diagnostics render test**

Add this test after `uses error text when a failed task has no final output`:

```ts
  it("formats expanded failure diagnostics, activities, artifacts, and final output", () => {
    const details: TaskDetails = {
      version: 1,
      results: [
        result({
          agent: "default",
          status: "failed",
          finalOutput: "generic output",
          stderr: "stderr failed",
          errorMessage: "child assistant stopReason=error",
          stopReason: "error",
          exitCode: 1,
          elapsedMs: 134_000,
          toolUseCount: 12,
          recentActivities: [
            { type: "tool_start", label: "bash npm test", timestamp: 1000 },
            { type: "tool_start", label: "edit src/task/schema.ts", timestamp: 2000 },
            { type: "error", label: "assistant stopped with error", timestamp: 3000 },
          ],
          artifactPaths: {
            rootDir: "/tmp/task-runs",
            taskDir: "/tmp/task-runs/2026-05-27-ab12cd/01-default",
            inputMd: "/tmp/task-runs/2026-05-27-ab12cd/01-default/input.md",
            eventsJsonl: "/tmp/task-runs/2026-05-27-ab12cd/01-default/events.jsonl",
            outputMd: "/tmp/task-runs/2026-05-27-ab12cd/01-default/output.md",
            metaJson: "/tmp/task-runs/2026-05-27-ab12cd/01-default/meta.json",
          },
        }),
      ],
    };

    const content = formatTaskExecutionContent(details);
    expect(content).toContain("Status: failed");
    expect(content).toContain("Exit code: 1");
    expect(content).toContain("Stop reason: error");
    expect(content).toContain("Error: child assistant stopReason=error");
    expect(content).toContain("Tool calls: 12");
    expect(content).toContain("- bash npm test");
    expect(content).toContain("- events: /tmp/task-runs/2026-05-27-ab12cd/01-default/events.jsonl");
    expect(content).toContain("Final output:\n\ngeneric output");
  });
```

- [ ] **Step 3: Run render tests to verify they fail**

Run:

```bash
npm test -- tests/task/render.test.ts
```

Expected: FAIL because the current render only shows simple status counts and compact markdown.

- [ ] **Step 4: Update render helpers in `src/task/render.ts`**

Add imports:

```ts
import { formatDuration, formatTokenCount, sumUsageTokens } from "./time.ts";
```

Replace `formatUsage()` with two functions:

```ts
function formatUsageBreakdown(usage: UsageStats): string {
  return `input ${usage.input} · output ${usage.output} · cache read ${usage.cacheRead} · cache write ${usage.cacheWrite} · total ${formatTokenCount(sumUsageTokens(usage))}`;
}

function formatUsage(usage: UsageStats): string {
  const fields: string[] = [];
  if (usage.turns !== 0) fields.push(`${usage.turns} ${usage.turns === 1 ? "turn" : "turns"}`);
  if (usage.input !== 0) fields.push(`input ${usage.input}`);
  if (usage.output !== 0) fields.push(`output ${usage.output}`);
  if (usage.cacheRead !== 0) fields.push(`cache read ${usage.cacheRead}`);
  if (usage.cacheWrite !== 0) fields.push(`cache write ${usage.cacheWrite}`);
  if (usage.cost !== 0) fields.push(`cost $${usage.cost.toFixed(4)}`);
  if (usage.contextTokens !== 0) fields.push(`context ${usage.contextTokens}`);
  return fields.length > 0 ? fields.join(", ") : "none";
}
```

Add these helper functions below `resultOutput()`:

```ts
function failureDiagnostic(result: TaskRunResult): string {
  const stderrTail = result.stderr.trim().split("\n").slice(-5).join("\n").trim();
  return (
    result.errorMessage?.trim() ||
    stderrTail ||
    [`exitCode=${result.exitCode}`, result.stopReason ? `stopReason=${result.stopReason}` : ""].filter(Boolean).join(" · ") ||
    result.finalOutput.trim() ||
    "(no diagnostic output)"
  );
}

function statusIcon(result: TaskRunResult): string {
  if (result.status === "completed") return "✓";
  if (result.status === "failed") return "✗";
  if (result.status === "aborted") return "⊘";
  return "⠋";
}

function toolNoun(count: number): string {
  return count === 1 ? "tool" : "tools";
}

function aggregateElapsed(details: TaskDetails): number {
  return details.results.reduce((max, result) => Math.max(max, result.elapsedMs), 0);
}

function aggregateTokens(details: TaskDetails): number {
  return details.results.reduce((sum, result) => sum + sumUsageTokens(result.usage), 0);
}

function formatCollapsedHeader(details: TaskDetails): string {
  const counts = { running: 0, completed: 0, failed: 0, aborted: 0 };
  for (const result of details.results) counts[result.status] += 1;
  const done = counts.completed + counts.failed + counts.aborted;
  const total = details.results.length;
  const elapsed = formatDuration(aggregateElapsed(details));
  const tokens = formatTokenCount(aggregateTokens(details));

  if (counts.failed > 0) return `✗ Task ${done - counts.failed}/${total} done · ${counts.failed} failed · ${elapsed} · ${tokens}`;
  if (counts.aborted > 0) return `⊘ Task ${done}/${total} done · ${counts.aborted} aborted · ${elapsed} · ${tokens}`;
  if (counts.running > 0) return `⏳ Task ${done}/${total} done · ${counts.running} running · ${elapsed} · ${tokens}`;
  return `✓ Task ${done}/${total} done · ${elapsed} · ${tokens}`;
}

function formatCollapsedRow(result: TaskRunResult, isLast: boolean): string[] {
  const branch = isLast ? "└─" : "├─";
  const childPrefix = isLast ? "   " : "│  ";
  const tokens = formatTokenCount(sumUsageTokens(result.usage));
  const activity = result.status === "failed" ? failureDiagnostic(result) : result.currentActivity || result.finalOutput || "Done";
  const lines = [
    `${branch} ${statusIcon(result)} ${result.agent}  ${formatDuration(result.elapsedMs)} · ${tokens} · ${result.toolUseCount} ${toolNoun(result.toolUseCount)}`,
    `${childPrefix}⎿ ${activity}`,
  ];
  if (result.status === "failed" && result.artifactPaths?.eventsJsonl) {
    lines.push(`${childPrefix}log: ${result.artifactPaths.eventsJsonl}`);
  }
  return lines;
}
```

- [ ] **Step 5: Replace collapsed and expanded render bodies**

Replace `formatTaskResultSummary()` with:

```ts
export function formatTaskResultSummary(details: TaskDetails): string {
  if (details.results.length === 0) return "Task results: no child tasks ran.";
  const lines = [formatCollapsedHeader(details)];
  details.results.forEach((result, index) => {
    lines.push(...formatCollapsedRow(result, index === details.results.length - 1));
  });
  return lines.join("\n");
}
```

Replace `formatTaskExecutionContent()` with:

```ts
export function formatTaskExecutionContent(details: TaskDetails): string {
  if (details.results.length === 0) return "Task results: no child tasks ran.";

  const lines = ["Task results:"];
  details.results.forEach((result, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${formatHeadingText(result.description)}`,
      "",
      `Agent: ${result.agent}`,
      `Status: ${result.status}`,
      `Elapsed: ${formatDuration(result.elapsedMs)}`,
      `Exit code: ${result.exitCode}`,
      `Stop reason: ${result.stopReason ?? ""}`,
      `Error: ${result.errorMessage ?? ""}`,
      `Usage: ${formatUsageBreakdown(result.usage)}`,
      `Tool calls: ${result.toolUseCount}`,
    );

    if (result.recentActivities.length > 0) {
      lines.push("", "Recent activity:");
      for (const activity of result.recentActivities) lines.push(`- ${activity.label}`);
    }

    if (result.artifactPaths) {
      lines.push(
        "",
        "Artifacts:",
        `- input: ${result.artifactPaths.inputMd}`,
        `- events: ${result.artifactPaths.eventsJsonl}`,
        `- output: ${result.artifactPaths.outputMd}`,
        `- meta: ${result.artifactPaths.metaJson}`,
      );
    }

    if (result.artifactError) {
      lines.push("", `Artifact warning: ${result.artifactError}`);
    }

    lines.push("", "Final output:", "", truncateOutput(resultOutput(result)));
  });

  return lines.join("\n");
}
```

Keep `renderTaskResult()` unchanged so collapsed mode returns `Text(formatTaskResultSummary(...))` and expanded mode returns markdown.

- [ ] **Step 6: Run render tests to verify pass**

Run:

```bash
npm test -- tests/task/render.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit rendering**

```bash
git add src/task/render.ts tests/task/render.test.ts
git commit -m "feat: render inline task progress roster"
```

## Task 7: Add False-Failure Regression Coverage and Run Full Verification

**Files:**
- Modify: `tests/task/runner.test.ts`
- Modify: `tests/task/render.test.ts`
- Modify: any test helpers still missing new `TaskRunResult` fields

- [ ] **Step 1: Add runner regression for successful-looking output followed by raw failure**

Add this test near the existing runner child-process tests:

```ts
  it("preserves raw diagnostics when child looks successful but exits non-zero", async () => {
    const child = new FakeChildProcess();
    const execution = runTaskChildProcess({
      request,
      defaultCwd: "/tmp/project",
      agentName: "default",
      spawnChild: () => child as never,
    });

    child.writeStdout(
      `${JSON.stringify({
        type: "tool_execution_start",
        toolName: "bash",
        args: { command: "git commit -m feat:work" },
      })}\n`,
    );
    child.writeStdout(
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Implemented and committed successfully." }],
          usage: { input: 170_504, output: 3_591, cacheRead: 144_896, cacheWrite: 0, cost: { total: 0 }, totalTokens: 318_991 },
          stopReason: "end",
        },
      })}\n`,
    );
    child.writeStderr("post-commit child error");
    child.close(1);

    const result = await execution;
    expect(result.status).toBe("failed");
    expect(result.finalOutput).toBe("Implemented and committed successfully.");
    expect(result.stderr).toContain("post-commit child error");
    expect(result.errorMessage).toBe("post-commit child error");
    expect(result.toolUseCount).toBe(1);
  });
```

- [ ] **Step 2: Add render regression for false-failure diagnostics priority**

Add this test in `tests/task/render.test.ts`:

```ts
  it("prioritizes raw diagnostics over successful-looking output for failed collapsed rows", () => {
    const summary = formatTaskResultSummary({
      version: 1,
      results: [
        result({
          status: "failed",
          finalOutput: "Implemented and committed successfully.",
          stderr: "post-commit child error",
          errorMessage: "post-commit child error",
          exitCode: 1,
          stopReason: "end",
          elapsedMs: 134_000,
          toolUseCount: 1,
        }),
      ],
    });

    expect(summary).toContain("post-commit child error");
    expect(summary).not.toContain("Implemented and committed successfully.");
  });
```

- [ ] **Step 3: Run regression tests to verify pass**

Run:

```bash
npm test -- tests/task/runner.test.ts tests/task/render.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected: PASS for all test files.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Run full project check**

Run:

```bash
npm run check
```

Expected: PASS. This command runs `npm run typecheck && npm test`.

- [ ] **Step 7: Commit regression and verification fixes**

```bash
git add src/task tests/task
git commit -m "test: cover task false failure diagnostics"
```

## Self-Review Checklist

- Spec coverage:
  - Inline live roster in existing Task card: Task 6.
  - Elapsed time heartbeat: Task 4.
  - Token totals and usage breakdown: Tasks 2 and 6.
  - Tool-call count and activity parsing: Tasks 2 and 4.
  - Diagnostic artifact paths: Tasks 3, 5, and 6.
  - Default-on local artifacts under `~/.pi/task-runs`: Tasks 3 and 5.
  - Missing `~/.pi` and artifact write failures are non-fatal: Task 3.
  - `subagent_type: "default"` equals omitted: Tasks 1 and 5.
  - Final statuses remain `completed`, `failed`, `aborted` with `running` only in partial updates: Tasks 4 and 5.
  - False-failure diagnostics: Tasks 4, 6, and 7.
- Placeholder scan: This plan contains concrete file paths, commands, and code blocks for every code-bearing task.
- Type consistency:
  - `TaskArtifactPaths` is defined in `schema.ts`, used by `artifacts.ts`, `runner.ts`, and `render.ts`.
  - `TaskArtifactWriter` is defined in `artifacts.ts` and injected through `RunTaskOptions`.
  - `TaskActivity.type` values match all calls to `appendRecentActivity()`.
  - `startedAt`, `completedAt`, and `elapsedMs` are numbers in all code and tests.
