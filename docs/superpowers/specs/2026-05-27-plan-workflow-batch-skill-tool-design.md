# plan-workflow Batch Skill Tool Design

## Purpose

This spec updates the existing `Skill` tool so an agent can load several skills in one tool call.

The current tool accepts one `skill: string`. That works for a single workflow skill, but it is inefficient when a task needs several best-practice skills at once, such as Vue, Vite, and Vitest. The agent must spend one tool call per skill even though all requests use the same registry snapshot and the same read-and-format path.

The new contract accepts `skills: string[]` and returns each requested skill in one clear markdown response. Successful skills are still loaded normally. Missing or unreadable skills are reported inline so one bad name does not hide the useful skills that were found.

## Source Context

Existing implementation:

- `src/skill/schema.ts` defines `SkillParamsSchema` and parameter normalization.
- `src/skill/tool.ts` registers the `Skill` tool and handles lookup, loading, result details, and TUI rendering.
- `src/skill/content.ts` formats a single loaded skill as a `<skill ...>` block.
- `src/skill/registry.ts` discovers skills and exposes a `Map<string, SkillEntry>`.
- `tests/skill/tool.test.ts` covers registration, success, missing skill errors, blank input errors, and read failures.

Existing spec:

- `docs/superpowers/specs/2026-05-26-plan-workflow-skill-tool-design.md`

This spec is an incremental replacement for the tool parameter contract and result aggregation behavior. Discovery, cache, validation of skill files, and content formatting remain unchanged unless explicitly listed below.

## Scope

In scope:

- Replace the model-facing parameter with required `skills: string[]`.
- Require at least one requested skill.
- Trim each skill name.
- Reject blank skill names before registry lookup.
- Load all requested skills independently.
- Return successful skill content and failed skill diagnostics in one markdown response.
- Treat partial failures as a successful tool call with inline error blocks.
- Treat invalid parameters or all failed skill requests as tool errors.
- Update TUI rendering to summarize single-skill and multi-skill results.
- Update tests for the new contract.

Out of scope:

- Maintaining long-term support for the old `skill: string` parameter.
- Adding a second `skill` alias alongside `skills`.
- Changing skill discovery order or registry cache behavior.
- Fuzzy matching or suggestions beyond the current available-skills list for missing names.
- Automatically rewriting historical logs or previous conversations.

## Tool Contract

The model-facing tool remains named `Skill`.

Parameters:

```ts
interface SkillParams {
  skills: string[];
}
```

Rules:

- `skills` is required.
- `skills` must be an array.
- `skills` must contain at least one item.
- Each item must be a string.
- Each item is matched as `item.trim()`.
- Empty trimmed names are invalid.
- No other parameters are accepted.

Example:

```ts
Skill({ skills: ["vue", "vite", "vitest"] })
```

Old calls such as `Skill({ skill: "vue" })` are intentionally not part of the new contract. Migrating existing prompts, docs, and examples is a small mechanical replacement and can be handled separately by a cheaper model or script.

## Normalization

`normalizeSkillParams` should return one normalized list:

```ts
type NormalizeSkillParamsResult =
  | { ok: true; skills: string[] }
  | { ok: false; error: string };
```

Validation should fail when:

- `skills` is missing.
- `skills` is not an array.
- `skills` is empty.
- Any item is not a string.
- Any item trims to an empty string.

Duplicate names should be removed after trimming while preserving first-seen order. This keeps the output concise and prevents accidental duplicate context loading.

## Execution Flow

For a valid request:

1. Load the registry snapshot once for `ctx.cwd`.
2. For each normalized skill name:
   - If the registry has no entry, record a missing-skill failure.
   - If the file cannot be read, record a read failure.
   - Otherwise record a successful loaded skill with formatted content and line count.
3. Build one markdown response from all per-skill outcomes.
4. Return `isError: true` only when every requested skill failed.
5. Return a non-error result when at least one skill loaded successfully.

This preserves the most useful behavior for agents: successfully loaded skills enter context even when another requested skill name was wrong.

## Markdown Output

A successful loaded skill block should be headed by a short summary line:

```md
[skill] writing-plans (152 lines)

<skill name="writing-plans" location="/path/to/SKILL.md">
...
</skill>
```

Multiple outcomes are separated by a markdown horizontal rule:

```md
[skill] vue (180 lines)

<skill name="vue" location="/path/to/vue/SKILL.md">
...
</skill>

---

[skill] vite (122 lines)

<skill name="vite" location="/path/to/vite/SKILL.md">
...
</skill>

---

[skill:error] missing-skill

Skill "missing-skill" not found.
Available skills:
- vite
- vitest
- vue
```

Read failures use the same error heading:

```md
[skill:error] vitest

Error loading skill "vitest": failed to read skill file: ...
```

The existing `<skill ...>` block remains unchanged so downstream model instructions and relative reference guidance keep working.

## Result Details

Tool details should expose enough structured data for rendering and debugging:

```ts
interface SkillToolDetails {
  requestedSkills: string[];
  loaded: Array<{
    skillName: string;
    skillPath: string;
    description: string;
    baseDir: string;
    lineCount: number;
  }>;
  failed: Array<{
    skillName: string;
    reason: "not_found" | "read_error";
    error: string;
    skillPath?: string;
  }>;
  availableSkills?: string[];
  diagnostics?: unknown[];
}
```

`availableSkills` should be included when at least one requested skill is missing. Registry diagnostics should stay summarized with the existing `summarizeDiagnostics` helper.

## Error Semantics

Parameter errors are hard errors:

- blank array
- non-string entries
- empty trimmed names

Lookup and read errors are per-skill failures:

- If at least one skill succeeds, the tool result is not an error.
- If all skills fail, the tool result is an error.

This means `Skill({ skills: ["vue", "missing"] })` returns usable Vue instructions plus a visible missing-skill block, while `Skill({ skills: ["missing"] })` returns an error.

## TUI Rendering

Single successful skill:

```text
[skill] vue (180 lines)
```

Multiple skills with at least one success:

```text
[skill] 3 requested, 2 loaded, 1 failed
```

All failed:

```text
[skill] 2 requested, 0 loaded, 2 failed
```

Parameter errors can keep the existing error text rendering path.

## Testing

Update `tests/skill/tool.test.ts` to cover:

- Tool schema requires `skills` and rejects extra properties.
- A single-item array returns one formatted skill block.
- Multiple found skills return multiple headed blocks separated clearly.
- Duplicate names are loaded once.
- Blank array returns a parameter error.
- Blank string item returns a parameter error.
- Missing skill in a mixed request returns a non-error result with one success and one error block.
- Missing-only request returns `isError: true`.
- Read failure in a mixed request returns a non-error result if another skill loads.
- Read-failure-only request returns `isError: true`.
- Render output summarizes single and multi-skill results.

No registry tests need to change unless type changes require updated fixtures.

## Migration Notes

All examples and docs that show:

```ts
Skill({ skill: "brainstorming" })
```

should become:

```ts
Skill({ skills: ["brainstorming"] })
```

This is intentionally mechanical. The implementation does not need to support both shapes just to make the migration easier.
