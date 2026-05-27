import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { createSkillRegistryCache, type SkillRegistryCache } from "./cache.ts";
import { loadSkillContent } from "./content.ts";
import { discoverSkills } from "./registry.ts";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "./schema.ts";
import type { SkillEntry } from "./registry.ts";

export interface RegisterSkillToolOptions {
  cache?: SkillRegistryCache;
}

export interface LoadedSkillDetail {
  skillName: string;
  skillPath: string;
  description: string;
  baseDir: string;
  lineCount: number;
}

export interface FailedSkillDetail {
  skillName: string;
  reason: "not_found" | "read_error";
  error: string;
  skillPath?: string;
}

export interface SkillToolDetails {
  requestedSkills: string[];
  loaded: LoadedSkillDetail[];
  failed: FailedSkillDetail[];
  availableSkills?: string[];
  diagnostics?: unknown[];
}

export type SkillOutcome =
  | { kind: "loaded"; detail: LoadedSkillDetail; text: string }
  | { kind: "failed"; detail: FailedSkillDetail; text: string };

export function createDefaultSkillRegistryCache(): SkillRegistryCache {
  return createSkillRegistryCache((cwd) => discoverSkills({ cwd }));
}

export function registerSkillTool(
  pi: ExtensionAPI,
  options: RegisterSkillToolOptions = {},
): SkillRegistryCache {
  const cache = options.cache ?? createDefaultSkillRegistryCache();

  pi.registerTool({
    name: "Skill",
    label: "Skill",
    description:
      "Load and invoke one or more skills by name. Skills provide specialized workflow instructions.",
    promptSnippet: "Load specialized skill instructions by name",
    promptGuidelines: [
      "Use Skill when a task matches an available skill's description or the user explicitly names a skill.",
      "Use the Skill tool instead of reading skill files directly.",
    ],
    parameters: SkillParamsSchema,
    async execute(_toolCallId, params: SkillParams, _signal, _onUpdate, ctx) {
      const normalized = normalizeSkillParams(params);
      if (!normalized.ok) {
        return {
          content: [{ type: "text", text: `Skill error: ${normalized.error}` }],
          isError: true,
          details: { error: normalized.error },
        };
      }

      const snapshot = cache.get(ctx.cwd);
      const outcomes = normalized.skills.map((skillName) =>
        loadSkillOutcome(snapshot, skillName),
      );
      const loaded = outcomes
        .filter((outcome): outcome is Extract<SkillOutcome, { kind: "loaded" }> =>
          outcome.kind === "loaded",
        )
        .map((outcome) => outcome.detail);
      const failed = outcomes
        .filter((outcome): outcome is Extract<SkillOutcome, { kind: "failed" }> =>
          outcome.kind === "failed",
        )
        .map((outcome) => outcome.detail);
      const details: SkillToolDetails = {
        requestedSkills: normalized.skills,
        loaded,
        failed,
      };
      if (failed.some((detail) => detail.reason === "not_found")) {
        details.availableSkills = [...snapshot.skills.keys()].sort();
        details.diagnostics = summarizeDiagnostics(snapshot.diagnostics);
      }

      return {
        content: [{ type: "text", text: joinOutcomes(outcomes) }],
        details,
      };
    },
    renderResult(result, _options, theme, context) {
      if (context.isError) {
        const text =
          result.content[0]?.type === "text"
            ? result.content[0].text
            : "Skill failed.";
        return new Text(theme.fg("error", text), 0, 0);
      }

      const details = result.details as SkillToolDetails | undefined;
      if (!details) {
        return new Text(theme.fg("customMessageText", "Skill"), 0, 0);
      }

      const text = renderCompactSkillResult(details, theme);
      const box = new Box(1, 0, (value: string) =>
        theme.bg("customMessageBg", value),
      );
      box.addChild(new Text(text, 0, 0));
      return box;
    },
  });

  return cache;
}

function summarizeDiagnostics(diagnostics: unknown[]): unknown[] {
  return diagnostics.slice(0, 10);
}

function loadSkillOutcome(
  snapshot: { skills: Map<string, SkillEntry>; diagnostics: unknown[] },
  skillName: string,
): SkillOutcome {
  const skill = snapshot.skills.get(skillName);
  if (!skill) {
    return {
      kind: "failed",
      detail: {
        skillName,
        reason: "not_found",
        error: `Skill "${skillName}" not found.`,
      },
      text: buildMissingSkillText(skillName, [...snapshot.skills.keys()].sort()),
    };
  }

  const loaded = loadSkillContent(skill);
  if (!loaded.ok) {
    return {
      kind: "failed",
      detail: {
        skillName: skill.name,
        reason: "read_error",
        error: loaded.error,
        skillPath: skill.filePath,
      },
      text: buildReadFailureText(skill.name, loaded.error),
    };
  }

  return {
    kind: "loaded",
    detail: {
      skillName: skill.name,
      skillPath: skill.filePath,
      description: skill.description,
      baseDir: skill.baseDir,
      lineCount: loaded.lineCount,
    },
    text: buildLoadedSkillText(skill.name, loaded.lineCount, loaded.formattedContent),
  };
}

function joinOutcomes(outcomes: SkillOutcome[]): string {
  return outcomes.map((outcome) => outcome.text).join("\n\n---\n\n");
}

function buildLoadedSkillText(
  skillName: string,
  lineCount: number,
  formattedContent: string,
): string {
  return `[skill] ${skillName} (${lineCount} lines)\n\n${formattedContent}`;
}

function buildMissingSkillText(skillName: string, availableSkills: string[]): string {
  return [
    `[skill:error] ${skillName}`,
    "",
    `Skill "${skillName}" not found.`,
    "Available skills:",
    ...availableSkills.map((name) => `- ${name}`),
  ].join("\n");
}

function buildReadFailureText(skillName: string, error: string): string {
  return [`[skill:error] ${skillName}`, "", formatReadFailureMessage(skillName, error)].join("\n");
}

function renderCompactSkillResult(
  details: SkillToolDetails,
  theme: { fg(name: string, text: string): string },
): string {
  const label = theme.fg("customMessageLabel", "\x1b[1m[skill]\x1b[22m");
  const loadedByName = new Map(
    details.loaded.map((detail) => [detail.skillName, detail]),
  );
  const failedByName = new Map(
    details.failed.map((detail) => [detail.skillName, detail]),
  );
  const entries = details.requestedSkills.map((skillName) => {
    const loaded = loadedByName.get(skillName);
    if (loaded) {
      const name = theme.fg("customMessageText", loaded.skillName);
      const lines = theme.fg("dim", ` (${loaded.lineCount} lines)`);
      return `${name}${lines}`;
    }

    const failed = failedByName.get(skillName);
    if (failed) {
      const name = theme.fg("customMessageText", failed.skillName);
      const error = theme.fg("error", `(error:${renderFailureText(failed)})`);
      return `${name} ${error}`;
    }

    return `${skillName} ${theme.fg("error", "(error:Skill failed.)")}`;
  });

  return `${label} ${entries.join(", ")}`;
}

function renderFailureText(detail: FailedSkillDetail): string {
  if (detail.reason === "read_error") {
    return formatReadFailureMessage(detail.skillName, detail.error);
  }

  return detail.error;
}

function formatReadFailureMessage(skillName: string, error: string): string {
  return `Error loading skill "${skillName}": ${error}`;
}
