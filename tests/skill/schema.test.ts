import { describe, expect, it } from "vitest";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "../../src/skill/schema.ts";

interface JsonObjectSchemaShape {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: {
    skills?: {
      type?: string;
      items?: {
        type?: string;
      };
      minItems?: number;
    };
  };
}

describe("skill schema", () => {
  it("defines a strict object schema for batch skill params", () => {
    const schema = SkillParamsSchema as JsonObjectSchemaShape;

    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["skills"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.skills?.type).toBe("array");
    expect(schema.properties?.skills?.items?.type).toBe("string");
    expect(schema.properties?.skills?.minItems).toBe(1);
  });

  it("trims and deduplicates skill names during normalization", () => {
    expect(
      normalizeSkillParams({
        skills: ["  brainstorming  ", "vitest", "brainstorming"],
      }),
    ).toEqual({
      ok: true,
      skills: ["brainstorming", "vitest"],
    });
  });

  it("normalizes Claude Code-style single skill params", () => {
    expect(normalizeSkillParams({ skill: "brainstorming" })).toEqual({
      ok: true,
      skills: ["brainstorming"],
    });
    expect(normalizeSkillParams({ skill: "  using-superpowers  " })).toEqual({
      ok: true,
      skills: ["using-superpowers"],
    });
  });

  it("rejects invalid Claude Code-style single skill params", () => {
    expect(normalizeSkillParams({ skill: "" })).toEqual({
      ok: false,
      error: "skills[0] must not be blank",
    });
    expect(normalizeSkillParams({ skill: "   " })).toEqual({
      ok: false,
      error: "skills[0] must not be blank",
    });
    expect(normalizeSkillParams({ skill: 1 })).toEqual({
      ok: false,
      error: "skills[0] must be a string",
    });
  });

  it("rejects missing or non-array skills", () => {
    expect(normalizeSkillParams({})).toEqual({
      ok: false,
      error: "skills must be an array of skill names",
    });
    expect(normalizeSkillParams({ skills: "brainstorming" })).toEqual({
      ok: false,
      error: "skills must be an array of skill names",
    });
  });

  it("rejects extra and ambiguous properties", () => {
    expect(
      normalizeSkillParams({ skills: ["brainstorming"], skill: "old" }),
    ).toEqual({
      ok: false,
      error: "skills params must not include extra properties",
    });
    expect(normalizeSkillParams({ skill: "old", extra: true })).toEqual({
      ok: false,
      error: "skills params must not include extra properties",
    });
  });

  it("rejects empty skill arrays", () => {
    expect(normalizeSkillParams({ skills: [] })).toEqual({
      ok: false,
      error: "skills must contain at least one skill name",
    });
  });

  it("rejects invalid skill array items", () => {
    expect(normalizeSkillParams({ skills: ["brainstorming", 1] })).toEqual({
      ok: false,
      error: "skills[1] must be a string",
    });
    expect(normalizeSkillParams({ skills: ["brainstorming", "   "] })).toEqual({
      ok: false,
      error: "skills[1] must not be blank",
    });
  });

  it("supports the SkillParams type", () => {
    const params: SkillParams = { skills: ["test-driven-development"] };

    expect(params.skills).toEqual(["test-driven-development"]);
  });
});
