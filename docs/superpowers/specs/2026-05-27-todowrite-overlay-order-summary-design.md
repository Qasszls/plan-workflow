# TodoWrite Overlay Order and Summary Design

## Goal

Fix TodoWrite overlay behavior so initial todo creation preserves input order, completed todos remain visible, and the overlay reads like a compact progress widget instead of a raw plan dump.

## Scope

This change updates TodoWrite schema, state details, overlay rendering, and focused tests.

In scope:

- Preserve TodoWrite input order in the overlay.
- Keep completed todos visible instead of dropping them after completion.
- Render completed todos with a check icon and strikethrough text where the widget renderer supports styling.
- Add optional `summary` to TodoWrite input and replayable details.
- Replace the hardcoded `Plan` title with `summary` or a short fallback.
- Show completed count under the title, formatted as `completed/total`.
- Temporarily disable public blocked todo behavior.
- Add tests for the requested multi-step todo lifecycle.

Out of scope:

- Incremental todo patch operations.
- Automatic dependency scheduling or blocked-state restart behavior.
- Rich visual redesign beyond the current overlay widget capabilities.

## Chosen Approach

Use the existing TodoWrite replace-snapshot model and make targeted changes around schema, state, and rendering.

`TodoWrite` accepts:

```ts
{
  summary?: string;
  todos: TodoWriteItemInput[];
}
```

`summary` is optional. If absent or blank, the overlay uses `Todos` as the title. This keeps the model-facing API explicit without requiring summary generation from todo text.

The internal details snapshot stores the normalized summary:

```ts
interface TodoWriteDetails {
  version: 1;
  action: "replace";
  summary?: string;
  todos: TaskSnapshot[];
  stats: TodoStats;
  error?: string;
}
```

Replay restores both `summary` and `todos` so rebuilt todo state matches the last valid TodoWrite result.

## Rendering

The overlay renders todos in the same order they appear in the current TodoWrite snapshot. It no longer groups by status.

Visible items include all non-deleted todos:

- `in_progress`: active marker.
- `pending`: pending marker.
- `completed`: check icon plus strikethrough text where supported.

The overlay header is:

```text
<summary or Todos>
<completed>/<non-deleted total>
```

Example:

```text
早会
1/3
- 确认今日重点任务与负责人
- 识别阻塞问题并约定解决方案/跟进人
✓ ~~同步昨日工作进展与已完成事项~~
```

The example above shows Markdown-like strikethrough as the design intent. If the widget API only accepts plain text arrays, implementation should use the closest supported representation while preserving the check icon and stable ordering.

`/todos` command output can keep its existing status-oriented text format unless tests show it shares the same ordering bug. The primary user-facing fix is the overlay widget shown after TodoWrite.

## Blocking Behavior

Blocked todo behavior is deferred.

The current `blockedBy` parameter creates ambiguous lifecycle questions when one TodoWrite call mixes completion, restoration, and dependencies. For this change:

- The public TodoWrite parameter description should not advertise `blockedBy`.
- Normalization should not reject todos because of missing or cyclic `blockedBy` values.
- Internal snapshots can keep `blockedBy: []` for compatibility.
- Existing persisted details that contain `blockedBy` remain replayable.

This keeps the first iteration simple and avoids surprising restarts or hidden scheduling behavior.

## Testing

Add or update tests to verify:

1. Creating three todos renders them in input order.
2. Completing the first todo keeps it visible with completed styling and updates the count.
3. Completing the third todo keeps order stable and updates the count.
4. Rebuilding todo state from the latest details preserves summary, todos, order, and completion state.
5. Completing the second todo while restoring the first todo updates visibility and count correctly.
6. `summary` is optional and falls back to `Todos`.
7. Blocked parameters no longer cause normalization failure.

The main scenario should use these todo contents:

- `同步昨日工作进展与已完成事项`
- `确认今日重点任务与负责人`
- `识别阻塞问题并约定解决方案/跟进人`

## Acceptance Criteria

- Initial creation of the three-todo morning meeting list displays item 1 first and item 3 last.
- Completed todos do not disappear from the overlay.
- Completed todos use a check icon and strikethrough where supported.
- The title uses optional `summary`; otherwise it uses `Todos`.
- The overlay displays a `completed/total` count below the title.
- Todo replay after tree/rebuild preserves the same state and ordering.
- Blocked todo validation is not part of this release.
