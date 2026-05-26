import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { TaskDetails, TaskParams, TaskRunResult, UsageStats } from "./schema.ts";

const OUTPUT_CAP = 50 * 1024;

export function truncateOutput(output: string, maxLength = OUTPUT_CAP): string {
  if (output.length <= maxLength) return output;

  const omitted = output.length - maxLength;
  return `${output.slice(0, maxLength)}\n\n[Output truncated: ${omitted} characters omitted. Full output preserved in tool details.]`;
}

export function formatTaskCallSummary(params: TaskParams): string {
  const descriptions = params.tasks.map((task) => task.description).join(", ");
  const noun = params.tasks.length === 1 ? "delegated task" : "delegated tasks";
  return `Task: ${params.tasks.length} ${noun} (${descriptions})`;
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

function resultOutput(result: TaskRunResult): string {
  return (
    result.finalOutput.trim() ||
    result.errorMessage?.trim() ||
    result.stderr.trim() ||
    "(no output)"
  );
}

function formatHeadingText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

export function formatTaskExecutionContent(details: TaskDetails): string {
  if (details.results.length === 0) return "Task results: no child tasks ran.";

  const lines = ["Task results:"];
  details.results.forEach((result, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${formatHeadingText(result.description)}`,
      "",
      `- Agent: ${result.agent}`,
      `- Status: ${result.status}`,
      `- Usage: ${formatUsage(result.usage)}`,
      "",
      truncateOutput(resultOutput(result)),
    );
  });

  return lines.join("\n");
}

export function formatTaskResultSummary(details: TaskDetails): string {
  const counts = { completed: 0, failed: 0, aborted: 0 };
  for (const result of details.results) counts[result.status] += 1;
  return `Task finished: ${counts.completed} completed, ${counts.failed} failed, ${counts.aborted} aborted.`;
}

export function renderTaskCall(params: TaskParams): Component {
  return new Text(formatTaskCallSummary(params), 0, 0);
}

export function renderTaskResult(details: TaskDetails, expanded: boolean): Component {
  if (!expanded) return new Text(formatTaskResultSummary(details), 0, 0);
  return new Markdown(formatTaskExecutionContent(details), 0, 0, getMarkdownTheme());
}
