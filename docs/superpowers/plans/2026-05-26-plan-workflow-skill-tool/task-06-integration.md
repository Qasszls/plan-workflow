# Task 6: Wire Extension Entrypoint And Verify

**Files:**
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`
- Modify: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/tool.test.ts`

- [ ] **Step 1: Add an entrypoint registration test**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/tool.test.ts`:

Add this import to the existing top import block:

```ts
import planWorkflow from "../../src/index.ts";
```

Then append this test block after the existing `describe("Skill tool", ...)` block:

```ts
describe("Skill entrypoint integration", () => {
  it("registers Skill from the extension entrypoint", () => {
    const tools: Array<{ name: string }> = [];
    const pi = {
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    planWorkflow(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools.map((tool) => tool.name)).toContain("Skill");
  });
});
```

- [ ] **Step 2: Run integration test to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/tool.test.ts
```

Expected:

```text
FAIL ... expected [ 'TodoWrite' ] to include 'Skill'
```

- [ ] **Step 3: Register Skill in the extension entrypoint**

Modify `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSkillTool } from "./skill/tool.ts";
import { registerTodoWrite } from "./todo/tool.ts";

export default function planWorkflow(pi: ExtensionAPI): void {
  registerTodoWrite(pi);
  registerSkillTool(pi);
}
```

- [ ] **Step 4: Run all Skill tests**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill
```

Expected:

```text
PASS tests/skill/schema.test.ts
PASS tests/skill/registry.test.ts
PASS tests/skill/cache.test.ts
PASS tests/skill/content.test.ts
PASS tests/skill/tool.test.ts
```

- [ ] **Step 5: Run full verification**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm run check
```

Expected:

```text
> plan-workflow@0.1.0 check
> npm run typecheck && npm test

PASS ...
```

- [ ] **Step 6: Manual Pi smoke test**

Run:

```bash
pi --no-extensions --extension /Users/liusahngzuo/code/learn/plan-workflow/src/index.ts --tools Skill -p "Use the Skill tool to load the brainstorming skill. Reply with the first heading from the loaded skill."
```

Expected:

```text
The model calls Skill with {"skill":"brainstorming"}.
The tool result includes the full SKILL.md content with frontmatter.
The visible TUI result is compact, such as [skill] brainstorming (... lines).
```

- [ ] **Step 7: Commit Task 6**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/index.ts tests/skill/tool.test.ts
rtk proxy git commit -m "feat: enable Skill tool"
```
