import { Type, type Static } from "typebox";

export const SkillParamsSchema = Type.Object(
  {
    skills: Type.Array(
      Type.String({
        description: "Name of a skill to load, such as brainstorming",
        minLength: 1,
      }),
      {
        description: "Names of the skills to load",
        minItems: 1,
      },
    ),
  },
  { additionalProperties: false },
);

export type SkillParams = Static<typeof SkillParamsSchema>;

export type NormalizeSkillParamsResult =
  | { ok: true; skills: string[] }
  | { ok: false; error: string };

export function normalizeSkillParams(
  params: unknown,
): NormalizeSkillParamsResult {
  if (
    !isRecord(params) ||
    !Array.isArray(params.skills) ||
    Object.keys(params).some((key) => key !== "skills")
  ) {
    if (isRecord(params) && Object.keys(params).some((key) => key !== "skills")) {
      return { ok: false, error: "skills params must not include extra properties" };
    }
    return { ok: false, error: "skills must be an array of skill names" };
  }

  if (params.skills.length === 0) {
    return {
      ok: false,
      error: "skills must contain at least one skill name",
    };
  }

  const skills: string[] = [];
  const seen = new Set<string>();

  for (const [index, value] of params.skills.entries()) {
    if (typeof value !== "string") {
      return { ok: false, error: `skills[${index}] must be a string` };
    }

    const skill = value.trim();
    if (!skill) {
      return { ok: false, error: `skills[${index}] must not be blank` };
    }

    if (!seen.has(skill)) {
      seen.add(skill);
      skills.push(skill);
    }
  }

  return { ok: true, skills };
}

function isRecord(value: unknown): value is { skills?: unknown } {
  return typeof value === "object" && value !== null;
}
