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
- Treat only invalid parameters as tool errors.
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

This is a breaking change by design. The new `skills` contract replaces the old `skill` contract instead of adding a compatibility window.

This spec also supersedes the old schema/result-format stability note in `docs/superpowers/specs/2026-05-26-plan-workflow-skill-tool-design.md`. Future Pi API migration work should preserve this spec's `skills` parameter shape and aggregate result details.

## Normalization

`normalizeSkillParams` should accept `unknown` and return one normalized list. It should not rely only on TypeBox/Pi validation because tests and direct callers can exercise it without the tool runtime:

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

Parameter error messages should be stable:

- Missing or non-array `skills`: `skills must be an array of skill names`
- Empty `skills`: `skills must contain at least one skill name`
- Non-string item: `skills[N] must be a string`
- Blank item after trimming: `skills[N] must not be blank`

The tool wraps these messages as `Skill error: <message>`.

## Execution Flow

For a valid request:

1. Load the registry snapshot once for `ctx.cwd`.
2. For each normalized skill name:
   - If the registry has no entry, record a missing-skill failure.
   - If the file cannot be read, record a read failure.
   - Otherwise record a successful loaded skill with formatted content and line count.
3. Build one markdown response from all per-skill outcomes.
4. Return `isError: true` only for invalid parameters.
5. Return a non-error result for valid parameters, even when every requested skill failed to load.

This preserves the most useful behavior for agents: successfully loaded skills enter context even when another requested skill name was wrong.

## Markdown Output

A successful loaded skill block should be headed by a short summary line:

```md
[skill] writing-plans (152 lines)

<skill name="writing-plans" location="/path/to/SKILL.md">
...
</skill>
```

Multiple outcomes are separated by a markdown horizontal rule. Output order must follow the normalized request order after duplicate removal, including failure blocks:

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

`failed[].error` stores the raw reason, such as `Skill "missing-skill" not found.` or `failed to read skill file: ...`. Markdown rendering may wrap the raw reason in a more readable block, but the detail payload should stay concise and machine-friendly.

## Error Semantics

Parameter errors are tool-call errors:

- blank array
- non-string entries
- empty trimmed names

Lookup and read errors are per-skill outcomes:

- If at least one skill succeeds, the tool result is not an error.
- If all skills fail, the tool result is still not an error.

Tool-call errors are reserved for invalid parameters. Skill lookup and read failures mean the tool ran successfully but some or all requested skills could not be loaded. This avoids hiding per-skill failure diagnostics behind Pi/tool error handling.

This means `Skill({ skills: ["vue", "missing"] })` returns usable Vue instructions plus a visible missing-skill block, while `Skill({ skills: ["missing"] })` returns a normal tool result containing a missing-skill block.

## TUI Rendering

TUI rendering should stay close to the current behavior.

Single successful skill:

```text
[skill] vue (180 lines)
```

Multiple skills with at least one success:

```text
[skill] 3 requested, 2 loaded, 1 failed
```

If no skill loads, keep the old error-style display for the first failure rather than showing a new batch summary:

```text
Skill "missing-skill" not found.
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
- Missing-only request returns a non-error result with one error block.
- Read failure in a mixed request returns a non-error result if another skill loads.
- Read-failure-only request returns a non-error result with one error block.
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
