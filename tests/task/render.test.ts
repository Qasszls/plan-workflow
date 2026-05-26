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

  it("escapes and normalizes task descriptions in markdown headings", () => {
    const details: TaskDetails = {
      version: 1,
      results: [result({ description: "Review\n# Heading\n- list" })],
    };

    expect(formatTaskExecutionContent(details)).toContain("## 1. Review \\# Heading \\- list");
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
