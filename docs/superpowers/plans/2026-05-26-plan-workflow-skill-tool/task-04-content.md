# Task 4: Load And Format Skill Content

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/content.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/content.test.ts`

- [ ] **Step 1: Write failing content tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/content.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatSkillBlock,
  loadSkillContent,
} from "../../src/skill/content.ts";
import type { SkillEntry } from "../../src/skill/registry.ts";

describe("skill content", () => {
  let root: string;
  let entry: SkillEntry;

  beforeEach(() => {
    root = join(tmpdir(), `plan-workflow-skill-content-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const skillDir = join(root, "brainstorming");
    mkdirSync(skillDir, { recursive: true });
    const filePath = join(skillDir, "SKILL.md");
    writeFileSync(filePath, "---\nname: brainstorming\ndescription: Use when designing.\n---\n# Brainstorming\nBody\n");
    entry = {
      name: "brainstorming",
      description: "Use when designing.",
      filePath,
      baseDir: skillDir,
      source: "project-pi",
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads full skill content including frontmatter", () => {
    const loaded = loadSkillContent(entry);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.rawContent).toContain("---\nname: brainstorming");
    expect(loaded.lineCount).toBe(6);
  });

  it("formats a model-visible skill block", () => {
    const text = formatSkillBlock(entry, "---\nname: brainstorming\n---\n# Body\n");

    expect(text).toContain(`<skill name="brainstorming" location="${entry.filePath}">`);
    expect(text).toContain(`References are relative to ${entry.baseDir}.`);
    expect(text).toContain("---\nname: brainstorming\n---");
    expect(text).toContain("</skill>");
  });

  it("returns a read error for missing files", () => {
    const missing = { ...entry, filePath: join(root, "missing", "SKILL.md") };
    const loaded = loadSkillContent(missing);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain("failed to read skill file");
  });
});
```

- [ ] **Step 2: Run content tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/content.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/skill/content.ts'
```

- [ ] **Step 3: Implement content loading**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/content.ts`:

```ts
import { readFileSync } from "node:fs";
import type { SkillEntry } from "./registry.ts";

export type LoadSkillContentResult =
  | { ok: true; rawContent: string; formattedContent: string; lineCount: number }
  | { ok: false; error: string };

export function formatSkillBlock(entry: SkillEntry, rawContent: string): string {
  return [
    `<skill name="${escapeAttribute(entry.name)}" location="${escapeAttribute(entry.filePath)}">`,
    `References are relative to ${entry.baseDir}.`,
    "",
    rawContent.trim(),
    "</skill>",
  ].join("\n");
}

export function loadSkillContent(entry: SkillEntry): LoadSkillContentResult {
  try {
    const rawContent = readFileSync(entry.filePath, "utf-8");
    return {
      ok: true,
      rawContent,
      formattedContent: formatSkillBlock(entry, rawContent),
      lineCount: rawContent.split(/\r?\n/).length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `failed to read skill file: ${message}` };
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

- [ ] **Step 4: Run content tests to verify pass**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/content.test.ts
```

Expected:

```text
PASS tests/skill/content.test.ts
```

- [ ] **Step 5: Commit Task 4**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/skill/content.ts tests/skill/content.test.ts
rtk proxy git commit -m "feat: format Skill content"
```
