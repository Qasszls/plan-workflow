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
