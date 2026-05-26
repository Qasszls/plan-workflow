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
