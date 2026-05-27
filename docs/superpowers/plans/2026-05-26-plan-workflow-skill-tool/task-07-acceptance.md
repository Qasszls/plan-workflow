# Task 7: Execute Acceptance Plan

**Files:**
- Read: `/Users/liusahngzuo/code/learn/plan-workflow/docs/superpowers/plans/2026-05-26-plan-workflow-skill-tool/acceptance.md`
- Read: `/Users/liusahngzuo/code/learn/plan-workflow/docs/superpowers/plans/2026-05-26-plan-workflow-skill-tool/verification.md`

- [ ] **Step 1: Review acceptance criteria**

Read:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk sed -n '1,260p' docs/superpowers/plans/2026-05-26-plan-workflow-skill-tool/acceptance.md
rtk sed -n '1,220p' docs/superpowers/plans/2026-05-26-plan-workflow-skill-tool/verification.md
```

Expected:

```text
Acceptance criteria and isolated Pi smoke-test setup are visible.
```

- [ ] **Step 2: Run automated acceptance**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm run check
```

Expected:

```text
TypeScript typecheck passes.
All TodoWrite tests pass.
All Skill tests pass.
```

- [ ] **Step 3: Create isolated Pi HOME**

Run:

```bash
TMP_HOME_RECORD="/tmp/plan-workflow-skill-smoke-home"
TMP_HOME="$(mktemp -d)"
printf '%s\n' "$TMP_HOME" > "$TMP_HOME_RECORD"
mkdir -p "$TMP_HOME/.pi/agent"
cp /Users/liusahngzuo/.pi/agent/models.json "$TMP_HOME/.pi/agent/models.json"
cp /Users/liusahngzuo/.pi/agent/auth.json "$TMP_HOME/.pi/agent/auth.json"
printf '{"defaultProvider":"gptplus","defaultModel":"gpt-5.4-mini","packages":[]}' > "$TMP_HOME/.pi/agent/settings.json"
echo "$TMP_HOME"
```

Expected:

```text
The command prints a temporary directory path.
```

Keep the `TMP_HOME` value for the remaining steps.

The `TMP_HOME_RECORD` file lets later commands recover the temporary HOME path even when each step runs in a fresh shell.

- [ ] **Step 4: Confirm isolated Pi environment**

Run:

```bash
TMP_HOME="$(cat /tmp/plan-workflow-skill-smoke-home)"
HOME="$TMP_HOME" PI_OFFLINE=1 pi --list-models gpt-5.4-mini
HOME="$TMP_HOME" PI_OFFLINE=1 pi list
```

Expected:

```text
provider  model         context  max-out  thinking  images
gptplus   gpt-5.4-mini  400K     128K     yes       yes

No packages installed.
```

- [ ] **Step 5: Run TodoWrite smoke in isolated Pi**

Run:

```bash
TMP_HOME="$(cat /tmp/plan-workflow-skill-smoke-home)"
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

Expected:

```text
JSON output includes "model":"gpt-5.4-mini".
JSON output includes a TodoWrite tool call.
JSON output includes a successful TodoWrite tool result.
Final assistant output includes SMOKE_DONE.
```

- [ ] **Step 6: Create isolated Skill fixture**

Run:

```bash
TMP_HOME="$(cat /tmp/plan-workflow-skill-smoke-home)"
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

Expected:

```text
The command creates a Superpowers-like skill fixture under the isolated HOME.
```

- [ ] **Step 7: Run Skill smoke in isolated Pi**

Run:

```bash
TMP_HOME="$(cat /tmp/plan-workflow-skill-smoke-home)"
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

Expected:

```text
JSON output includes a Skill tool call.
JSON output includes a successful Skill tool result.
Tool result content includes <skill name="brainstorming".
Tool result content includes name: brainstorming.
Tool result content includes # Brainstorming Test Skill.
Final assistant response references Brainstorming Test Skill.
```

- [ ] **Step 8: Clean up isolated HOME**

Run:

```bash
TMP_HOME_RECORD="/tmp/plan-workflow-skill-smoke-home"
TMP_HOME="$(cat "$TMP_HOME_RECORD")"
rm -rf "$TMP_HOME"
rm -f "$TMP_HOME_RECORD"
test ! -e "$TMP_HOME" && echo cleaned
```

Expected:

```text
cleaned
```

- [ ] **Step 9: Confirm no unrelated staged changes**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git status --short
rtk proxy git diff --cached --stat
```

Expected:

```text
No unrelated staged changes.
Known unrelated unstaged changes, if any, are left untouched.
```

- [ ] **Step 10: Report acceptance result**

In the final implementation response, report:

```text
Automated acceptance: PASS/FAIL
Isolated Pi environment: PASS/FAIL
TodoWrite smoke: PASS/FAIL
Skill smoke: PASS/FAIL
Temporary HOME cleanup: PASS/FAIL
Residual worktree changes: list any unrelated unstaged changes
```

Do not mark the implementation complete unless all required acceptance checks pass or the user explicitly accepts a documented exception.
