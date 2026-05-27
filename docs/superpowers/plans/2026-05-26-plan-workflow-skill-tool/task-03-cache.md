# Task 3: Add Cwd-Keyed Registry Cache

**Files:**
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/cache.ts`
- Create: `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/cache.test.ts`

- [ ] **Step 1: Write failing cache tests**

Create `/Users/liusahngzuo/code/learn/plan-workflow/tests/skill/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSkillRegistryCache,
  type SkillRegistryLoader,
} from "../../src/skill/cache.ts";
import type { SkillRegistrySnapshot } from "../../src/skill/registry.ts";

function snapshot(cwd: string, scannedAt: number): SkillRegistrySnapshot {
  return {
    cwd,
    skills: new Map(),
    diagnostics: [],
    scannedAt,
  };
}

describe("skill registry cache", () => {
  it("loads a cwd once and reuses the cached snapshot", () => {
    let calls = 0;
    const loader: SkillRegistryLoader = (cwd) => {
      calls += 1;
      return snapshot(cwd, calls);
    };
    const cache = createSkillRegistryCache(loader);

    const first = cache.get("/tmp/project");
    const second = cache.get("/tmp/project");

    expect(first).toBe(second);
    expect(first.scannedAt).toBe(1);
    expect(calls).toBe(1);
  });

  it("keeps separate snapshots for separate cwd values", () => {
    const seen: string[] = [];
    const cache = createSkillRegistryCache((cwd) => {
      seen.push(cwd);
      return snapshot(cwd, seen.length);
    });

    const first = cache.get("/tmp/project-a");
    const second = cache.get("/tmp/project-b");

    expect(first).not.toBe(second);
    expect(seen).toHaveLength(2);
  });

  it("can clear one cwd or all snapshots", () => {
    let calls = 0;
    const cache = createSkillRegistryCache((cwd) => snapshot(cwd, ++calls));

    cache.get("/tmp/project-a");
    cache.get("/tmp/project-b");
    cache.clear("/tmp/project-a");
    cache.get("/tmp/project-a");
    cache.get("/tmp/project-b");
    cache.clear();
    cache.get("/tmp/project-b");

    expect(calls).toBe(4);
  });
});
```

- [ ] **Step 2: Run cache tests to verify failure**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/cache.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/skill/cache.ts'
```

- [ ] **Step 3: Implement cache**

Create `/Users/liusahngzuo/code/learn/plan-workflow/src/skill/cache.ts`:

```ts
import { resolve } from "node:path";
import type { SkillRegistrySnapshot } from "./registry.ts";

export type SkillRegistryLoader = (cwd: string) => SkillRegistrySnapshot;

export interface SkillRegistryCache {
  get(cwd: string): SkillRegistrySnapshot;
  clear(cwd?: string): void;
}

export function createSkillRegistryCache(
  loader: SkillRegistryLoader,
): SkillRegistryCache {
  const snapshots = new Map<string, SkillRegistrySnapshot>();

  return {
    get(cwd: string): SkillRegistrySnapshot {
      const key = resolve(cwd);
      const existing = snapshots.get(key);
      if (existing) return existing;

      const snapshot = loader(key);
      snapshots.set(key, snapshot);
      return snapshot;
    },

    clear(cwd?: string): void {
      if (cwd === undefined) {
        snapshots.clear();
        return;
      }
      snapshots.delete(resolve(cwd));
    },
  };
}
```

- [ ] **Step 4: Run cache tests to verify pass**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk npm test -- tests/skill/cache.test.ts
```

Expected:

```text
PASS tests/skill/cache.test.ts
```

- [ ] **Step 5: Commit Task 3**

Run:

```bash
cd /Users/liusahngzuo/code/learn/plan-workflow
rtk proxy git add src/skill/cache.ts tests/skill/cache.test.ts
rtk proxy git commit -m "feat: cache Skill discovery"
```
