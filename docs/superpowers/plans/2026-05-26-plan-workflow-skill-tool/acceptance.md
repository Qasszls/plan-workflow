# Skill Tool Acceptance Plan

This document defines when the `plan-workflow` `Skill` tool is accepted as complete.

`verification.md` describes how to create a clean Pi runtime. This document defines what must pass inside that runtime and in automated tests.

## Acceptance Goal

The implementation is accepted when `plan-workflow` can provide a Claude Code-compatible `Skill` tool for Superpowers workflows without relying on the old `@uadgj/pi-superpowers-support` extension, without modifying Pi source, and without rescanning skill directories on every tool call.

## Preconditions

- The implementation tasks in [index.md](index.md) are complete.
- The worktree does not include unrelated staged changes.
- The real user Pi environment may still contain old packages, but acceptance must use the isolated HOME procedure in [verification.md](verification.md).
- Use `gptplus/gpt-5.4-mini` for manual smoke tests unless `gptplus/gpt-5.3-codex-spark` is known healthy at test time.

## Automated Acceptance

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm run check
```

Required result:

- TypeScript typecheck passes.
- All existing TodoWrite tests pass.
- All new `tests/skill/*.test.ts` tests pass.

The skill tests must cover:

- strict `{ skill: string }` schema
- blank skill name rejection
- directory `SKILL.md` discovery
- `.pi/skills/*.md` root-file discovery
- `.agents/skills/*.md` root-file exclusion
- ancestor `.agents/skills` discovery stopping at git root
- installed package-cache `skills` discovery under isolated `~/.pi/agent/git`
- installed package-cache `skills` discovery under isolated `~/.pi/agent/npm/node_modules`
- ignored directories and `node_modules` skips
- missing `name` invalid
- missing `description` invalid
- invalid skill name invalid
- duplicate names first-wins with collision diagnostic
- per-`cwd` registry cache reuse
- different `cwd` cache separation
- full content returned with frontmatter
- compact success rendering
- missing skill error includes available skill names
- unreadable file error includes the skill path

## Isolated Pi Runtime Acceptance

Create the isolated HOME exactly as described in [verification.md](verification.md).

Confirm:

```bash
HOME="$TMP_HOME" PI_OFFLINE=1 pi --list-models gpt-5.4-mini
HOME="$TMP_HOME" PI_OFFLINE=1 pi list
```

Required result:

- `gptplus/gpt-5.4-mini` is listed.
- `pi list` prints `No packages installed.`

This confirms acceptance is not using globally configured package extensions.

## Current Extension Smoke

Before or after the `Skill` implementation, this smoke verifies that the clean Pi runtime can load this project extension:

```bash
HOME="$TMP_HOME" PI_OFFLINE=1 pi \
  --no-extensions \
  --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts \
  --no-builtin-tools \
  --tools TodoWrite \
  --model gptplus/gpt-5.4-mini \
  --mode json \
  --no-session \
  -p 'Use TodoWrite to create exactly one todo with id "smoke", content "verify isolated Pi extension loading", status "in_progress". After the tool call, reply with SMOKE_DONE.'
```

Required result:

- JSON output includes `"model":"gpt-5.4-mini"`.
- JSON output includes a `TodoWrite` tool call.
- JSON output includes a successful `TodoWrite` tool result.
- Final assistant output includes `SMOKE_DONE`.

This command was already proven viable on 2026-05-26 with `gptplus/gpt-5.4-mini`.

## Skill Tool Smoke

After implementation, create the isolated Superpowers-like skill fixture:

```bash
mkdir -p "$TMP_HOME/.pi/agent/git/github.com/obra/superpowers/skills/brainstorming"
cat > "$TMP_HOME/.pi/agent/git/github.com/obra/superpowers/skills/brainstorming/SKILL.md" <<'EOF'
---
name: brainstorming
description: Use when designing before implementation.
---

# Brainstorming Test Skill

Loaded from isolated HOME.
EOF
```

Run:

```bash
HOME="$TMP_HOME" PI_OFFLINE=1 pi \
  --no-extensions \
  --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts \
  --no-builtin-tools \
  --tools Skill \
  --model gptplus/gpt-5.4-mini \
  --mode json \
  --no-session \
  -p 'Use the Skill tool to load brainstorming. Reply with the first heading from the loaded skill.'
```

Required result:

- JSON output includes a `Skill` tool call.
- JSON output includes a successful `Skill` tool result.
- Tool result content includes `<skill name="brainstorming"`.
- Tool result content includes `name: brainstorming`.
- Tool result content includes `# Brainstorming Test Skill`.
- Final assistant response references `Brainstorming Test Skill`.

## Conflict Acceptance

Acceptance must show the new tool can run without the old support package.

Required evidence:

- The isolated `settings.json` used for smoke tests contains `"packages":[]`.
- The smoke commands use `--no-extensions`.
- The only loaded extension path is `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`.
- No duplicate tool-name conflict appears in the output.

## Cache Acceptance

Cache behavior is accepted by automated tests, not by manual Pi smoke.

Required evidence:

- A test proves two lookups for the same normalized `cwd` reuse the same `SkillRegistrySnapshot`.
- A test proves two different `cwd` values produce separate snapshots.
- No implementation path in `tool.ts` calls discovery directly during execution except through the cache loader.

## Failure Handling Acceptance

These failures are accepted only when they are reported clearly:

- Missing skill returns `isError: true` and lists available skill names.
- Blank skill name returns `isError: true` with `Skill name must not be blank`.
- Unreadable skill file returns `isError: true` and includes `skillPath`.
- Invalid skill files are skipped and appear in diagnostics.

These failures are not accepted:

- Tool returns partial or frontmatter-stripped skill content.
- Tool reads skill files through Pi source internals.
- Tool depends on real user packages during isolated smoke tests.
- Tool rescans all skill roots on every call for the same `cwd`.
- Tool requires `@uadgj/pi-superpowers-support` to be installed.

## Final Acceptance Checklist

- [ ] `rtk npm run check` passes.
- [ ] Isolated HOME setup succeeds.
- [ ] Isolated HOME reports `No packages installed.`
- [ ] TodoWrite smoke passes in isolated HOME.
- [ ] Skill smoke passes in isolated HOME after implementation.
- [ ] No duplicate `Skill` or `TodoWrite` tool conflict appears.
- [ ] Temporary HOME is deleted after smoke testing.
- [ ] Final implementation commits do not include unrelated `.gitignore` or workspace changes.
