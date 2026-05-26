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

export interface RegisterSkillToolOptions {
  cache?: SkillRegistryCache;
}

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
      "Load and invoke a skill by name. Skills provide specialized workflow instructions.",
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
      const skill = snapshot.skills.get(normalized.skill);
      if (!skill) {
        const availableSkills = [...snapshot.skills.keys()].sort();
        return {
          content: [
            {
              type: "text",
              text: [
                `Skill "${normalized.skill}" not found.`,
                "",
                "Available skills:",
                ...availableSkills.map((name) => `- ${name}`),
              ].join("\n"),
            },
          ],
          isError: true,
          details: {
            requestedSkill: normalized.skill,
            availableSkills,
            diagnostics: summarizeDiagnostics(snapshot.diagnostics),
          },
        };
      }

      const loaded = loadSkillContent(skill);
      if (!loaded.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error loading skill "${skill.name}": ${loaded.error}`,
            },
          ],
          isError: true,
          details: {
            requestedSkill: skill.name,
            skillPath: skill.filePath,
            error: loaded.error,
          },
        };
      }

      return {
        content: [{ type: "text", text: loaded.formattedContent }],
        details: {
          skillName: skill.name,
          skillPath: skill.filePath,
          description: skill.description,
          baseDir: skill.baseDir,
          lineCount: loaded.lineCount,
        },
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

      const details = result.details as
        | { skillName?: string; lineCount?: number }
        | undefined;
      const skillName = details?.skillName ?? "unknown";
      const lineCount = details?.lineCount ?? 0;
      const label = theme.fg("customMessageLabel", "\x1b[1m[skill]\x1b[22m");
      const name = theme.fg("customMessageText", skillName);
      const lines = theme.fg("dim", ` (${lineCount} lines)`);
      const box = new Box(1, 0, (text: string) =>
        theme.bg("customMessageBg", text),
      );
      box.addChild(new Text(`${label} ${name}${lines}`, 0, 0));
      return box;
    },
  });

  return cache;
}

function summarizeDiagnostics(diagnostics: unknown[]): unknown[] {
  return diagnostics.slice(0, 10);
}
