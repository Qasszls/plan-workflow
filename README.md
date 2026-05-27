# plan-workflow

Personal Pi workflow support package.

## Install locally

```bash
pi install /Users/liusahngzuo/code/learn/plan-workflow
```

The current local Pi build treats `path:` as part of the filesystem path, so use
the raw path form above.

## First slice

- `TodoWrite` tool compatible with Superpowers-style task tracking
- branch replay from tool result snapshots
- `/todos` command
- above-editor todo overlay

## Verify

This package registers a `TodoWrite` tool. If
`npm:@uadgj/pi-superpowers-support` is also enabled, Pi will report a duplicate
tool-name conflict. For isolated verification, run:

```bash
pi --no-extensions --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts --no-builtin-tools --tools TodoWrite -p "Use TodoWrite to create one task for testing: inspect tool loading. Mark it in_progress."
```

For interactive verification with this package enabled and the old TodoWrite
provider disabled:

1. Start Pi.
2. Confirm `TodoWrite` is available in the tool list.
3. Confirm `/todos` appears in slash command autocomplete.
4. Ask the model to create tasks with `TodoWrite`.
5. Use `/todos` to inspect state.
6. Use `/reload` and `/todos` again to verify branch replay.

## Future slices

- Task/Agent support
- Skill support
- AskUserQuestion support
- workflow prompts and skills

pi 文档 /Users/liusahngzuo/code/learn/pi/packages/coding-agent/docs/\*.md
