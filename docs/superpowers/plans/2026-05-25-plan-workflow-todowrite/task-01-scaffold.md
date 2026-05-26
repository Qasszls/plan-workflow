# Task 1: Scaffold the local Pi package

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/package.json`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tsconfig.json`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/vitest.config.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/README.md`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`

**Learn-mode rule for this task:** The agent writes the scaffold. Before installing dependencies, pause on `package.json` and `src/index.ts` so the human can trace how Pi discovers an extension package.

- [ ] **Step 1: Create the repository directory**

Run:

```bash
mkdir -p /Users/liusahngzuo/code/learn/plan-workflow/src/todo
mkdir -p /Users/liusahngzuo/code/learn/plan-workflow/test/todo
cd /Users/liusahngzuo/code/learn/plan-workflow
git init
```

Expected:

```text
Initialized empty Git repository
```

- [ ] **Step 2: Create `package.json`**

Create `/Users/liusahngzuo/code/learn/plan-workflow/package.json`:

```json
{
  "name": "plan-workflow",
  "version": "0.1.0",
  "private": true,
  "description": "Personal Pi workflow support package.",
  "type": "module",
  "main": "./src/index.ts",
  "pi": {
    "extensions": [
      "./src/index.ts"
    ]
  },
  "scripts": {
    "test": "vitest --run",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm test"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  },
  "engines": {
    "node": ">=22.19.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

Create `/Users/liusahngzuo/code/learn/plan-workflow/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const piRoot = "/Users/liusahngzuo/code/learn/pi/packages";
const aiSrcIndex = fileURLToPath(new URL(`${piRoot}/ai/src/index.ts`, import.meta.url));
const agentSrcIndex = fileURLToPath(new URL(`${piRoot}/agent/src/index.ts`, import.meta.url));
const codingAgentSrcIndex = fileURLToPath(new URL(`${piRoot}/coding-agent/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@earendil-works\/pi-ai$/, replacement: aiSrcIndex },
      { find: /^@earendil-works\/pi-agent-core$/, replacement: agentSrcIndex },
      { find: /^@earendil-works\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
    ],
  },
});
```

- [ ] **Step 5: Create README**

Create `/Users/liusahngzuo/code/learn/plan-workflow/README.md`:

```md
# plan-workflow

Personal Pi workflow support package.

First slice:

- `TodoWrite` tool compatible with Superpowers-style task tracking
- branch replay from tool result snapshots
- `/todos` command
- above-editor todo overlay

Future slices:

- Task/Agent support
- Skill support
- AskUserQuestion support
- workflow prompts and skills
```

- [ ] **Step 6: Create extension entry**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function planWorkflow(_pi: ExtensionAPI): void {
  // Task 5 replaces this stub with TodoWrite registration.
}
```

- [ ] **Step 7: Learn-mode pause: trace package loading**

Stop here and show the human these exact snippets:

```json
"main": "./src/index.ts",
"pi": {
  "extensions": [
    "./src/index.ts"
  ]
}
```

```ts
export default function planWorkflow(_pi: ExtensionAPI): void {
  // Task 5 replaces this stub with TodoWrite registration.
}
```

Explain:

- `package.json` tells Pi which extension file to load.
- The default export is the package entry point.
- `ExtensionAPI` is the object used later for `registerTool`, `registerCommand`, and event hooks.

Ask the human to confirm the load path in their own words before continuing. No code edit is required in this task because this file is intentionally only a thin entry point.

- [ ] **Step 8: Install dependencies**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
npm install
```

Expected:

```text
added ... packages
```

- [ ] **Step 9: Verify scaffold**

Run:

```bash
npm run typecheck
npm test
```

Expected:

```text
Found 0 errors.
No test files found
```

If Vitest exits non-zero because no tests exist, accept that for this task and continue; tests are added in Task 2.

- [ ] **Step 10: Commit scaffold**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
git add .
git commit -m "chore: scaffold plan-workflow package"
```
