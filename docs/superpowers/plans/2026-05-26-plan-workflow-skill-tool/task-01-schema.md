# Task 1: Define Skill Schema And Normalized Params

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/schema.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SkillParamsSchema,
  normalizeSkillParams,
  type SkillParams,
} from "../../src/skill/schema.ts";

describe("skill schema", () => {
  it("defines a strict Skill params schema", () => {
    expect(SkillParamsSchema.type).toBe("object");
    expect(SkillParamsSchema.required).toEqual(["skill"]);
    expect(SkillParamsSchema.additionalProperties).toBe(false);
    expect(SkillParamsSchema.properties.skill.type).toBe("string");
  });

  it("normalizes skill names by trimming whitespace", () => {
    const normalized = normalizeSkillParams({ skill: "  brainstorming  " });

    expect(normalized).toEqual({ ok: true, skill: "brainstorming" });
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

  it("exports the SkillParams type", () => {
    const params: SkillParams = { skill: "test-driven-development" };

    expect(params.skill).toBe("test-driven-development");
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/schema.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/skill/schema.ts'
```

- [ ] **Step 3: Implement schema and normalization**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/schema.ts`:

```ts
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
```

- [ ] **Step 4: Run schema tests to verify pass**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/schema.test.ts
```

Expected:

```text
PASS tests/skill/schema.test.ts
```

- [ ] **Step 5: Commit Task 1**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/skill/schema.ts tests/skill/schema.test.ts
rtk proxy git commit -m "feat: add Skill params schema"
```
