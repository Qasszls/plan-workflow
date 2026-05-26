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
