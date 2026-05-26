import { Type, type Static } from "typebox";

export const SkillParamsSchema = Type.Object(
  {
    skill: Type.String({
      description: "Name of the skill to load, such as brainstorming",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export type SkillParams = Static<typeof SkillParamsSchema>;

export type NormalizeSkillParamsResult =
  | { ok: true; skill: string }
  | { ok: false; error: string };

export function normalizeSkillParams(
  params: SkillParams,
): NormalizeSkillParamsResult {
  const skill = params.skill.trim();
  if (!skill) return { ok: false, error: "Skill name must not be blank" };
  return { ok: true, skill };
}
