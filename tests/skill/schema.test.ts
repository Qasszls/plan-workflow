import { describe, expect, it } from "vitest";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "../../src/skill/schema.ts";

describe("skill schema", () => {
  it("defines a strict object schema for skill params", () => {
    expect(SkillParamsSchema.type).toBe("object");
    expect(SkillParamsSchema.required).toEqual(["skill"]);
    expect(SkillParamsSchema.additionalProperties).toBe(false);
    expect(SkillParamsSchema.properties.skill.type).toBe("string");
  });

  it("trims skill names during normalization", () => {
    expect(normalizeSkillParams({ skill: "  brainstorming  " })).toEqual({
      ok: true,
      skill: "brainstorming",
    });
  });

  it("rejects blank skill names", () => {
    expect(normalizeSkillParams({ skill: "" })).toEqual({
      ok: false,
      error: "Skill name must not be blank",
    });
    expect(normalizeSkillParams({ skill: "   " })).toEqual({
      ok: false,
      error: "Skill name must not be blank",
    });
  });

  it("supports the SkillParams type", () => {
    const params: SkillParams = { skill: "test-driven-development" };

    expect(params.skill).toBe("test-driven-development");
  });
});
