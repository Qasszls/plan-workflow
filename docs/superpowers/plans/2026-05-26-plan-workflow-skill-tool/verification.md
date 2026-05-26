# Isolated Pi Smoke Test Environment

This document records the manual Pi smoke-test setup for `plan-workflow`.

The goal is to verify extension loading in a clean Pi environment without using the real `~/.pi/agent/settings.json` package list. This prevents conflicts with globally installed extensions such as `@uadgj/pi-superpowers-support`.

## What This Verifies

- Pi can start with an isolated `HOME`.
- The isolated environment can still use the configured model definitions.
- No packages are loaded from the user's real Pi settings.
- `--no-extensions` disables extension discovery.
- `--extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts` explicitly loads this package.
- `--no-builtin-tools --tools <ToolName>` enables only the extension tool being tested.
- A real model can call the tool in JSON mode.

This is a smoke test for the Pi runtime environment. Unit tests still verify the tool's pure behavior.

## Create The Isolated HOME

```bash
TMP_HOME="$(mktemp -d)"
mkdir -p "$TMP_HOME/.pi/agent"
cp /Users/liusahngzuo/.pi/agent/models.json "$TMP_HOME/.pi/agent/models.json"
cp /Users/liusahngzuo/.pi/agent/auth.json "$TMP_HOME/.pi/agent/auth.json"
printf '{"defaultProvider":"gptplus","defaultModel":"gpt-5.4-mini","packages":[]}' > "$TMP_HOME/.pi/agent/settings.json"
echo "$TMP_HOME"
```

Why copy these files:

- `models.json` contains the `gptplus/gpt-5.4-mini` model definition.
- `auth.json` keeps Pi's auth file shape available.
- `settings.json` intentionally has an empty `packages` array.

## Confirm The Environment Is Clean

```bash
HOME="$TMP_HOME" PI_OFFLINE=1 pi --list-models gpt-5.4-mini
HOME="$TMP_HOME" PI_OFFLINE=1 pi list
```

Expected:

```text
provider  model         context  max-out  thinking  images
gptplus   gpt-5.4-mini  400K     128K     yes       yes

No packages installed.
```

## Smoke Test Current Extension Loading

Before the `Skill` tool exists, use the existing `TodoWrite` tool to verify the isolated Pi runtime:

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

Expected JSON stream evidence:

- `provider` is `gptplus`.
- `model` is `gpt-5.4-mini`.
- A tool call appears with `"name":"TodoWrite"`.
- A tool result appears with `"toolName":"TodoWrite"` and `"isError":false`.
- The final assistant text contains `SMOKE_DONE`.

This command was tested successfully on 2026-05-26 with `gptplus/gpt-5.4-mini`.

## Smoke Test Skill After Implementation

After the `Skill` tool is implemented, create an isolated package-cache-shaped skill fixture:

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

Then run:

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

Expected JSON stream evidence:

- A tool call appears with `"name":"Skill"`.
- A tool result appears with `"toolName":"Skill"` and `"isError":false`.
- The tool result content contains `<skill name="brainstorming"`.
- The tool result content contains the frontmatter line `name: brainstorming`.
- The final assistant response references `Brainstorming Test Skill`.

This test exercises the installed Pi git package cache scan without installing the real Superpowers package.

## Known Model Fallback

`gptplus/gpt-5.3-codex-spark` can be used with the same environment, but it returned repeated `502 Upstream service temporarily unavailable` during the initial smoke test on 2026-05-26. Use `gptplus/gpt-5.4-mini` when the spark model is unavailable.

## Cleanup

Always delete the temporary HOME after the smoke test:

```bash
rm -rf "$TMP_HOME"
```

Do not leave copied model configuration files in temporary directories.
