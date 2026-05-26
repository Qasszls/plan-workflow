import { readFileSync } from "node:fs";
import type { SkillEntry } from "./registry.ts";

export type LoadSkillContentResult =
  | {
      ok: true;
      rawContent: string;
      formattedContent: string;
      lineCount: number;
    }
  | { ok: false; error: string };

export function formatSkillBlock(entry: SkillEntry, rawContent: string): string {
  return [
    `<skill name="${escapeAttribute(entry.name)}" location="${escapeAttribute(entry.filePath)}">`,
    `References are relative to ${entry.baseDir}.`,
    "",
    rawContent.trim(),
    "</skill>",
  ].join("\n");
}

export function loadSkillContent(entry: SkillEntry): LoadSkillContentResult {
  try {
    const rawContent = readFileSync(entry.filePath, "utf-8");
    return {
      ok: true,
      rawContent,
      formattedContent: formatSkillBlock(entry, rawContent),
      lineCount: countLines(rawContent),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `failed to read skill file: ${message}` };
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countLines(value: string): number {
  return value.replace(/\r?\n$/, "").split(/\r?\n/).length;
}
