import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const piRoot = "/Users/liusahngzuo/code/learn/pi/packages";
const aiSrcIndex = fileURLToPath(new URL(`${piRoot}/ai/src/index.ts`, import.meta.url));
const agentSrcIndex = fileURLToPath(new URL(`${piRoot}/agent/src/index.ts`, import.meta.url));
// Use the installed coding-agent package in tests; the local source alias pulls
// in nested runtime dependencies that are intentionally not installed here.
const codingAgentDistIndex = fileURLToPath(
  new URL("node_modules/@earendil-works/pi-coding-agent/dist/index.js", import.meta.url),
);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@earendil-works\/pi-ai$/, replacement: aiSrcIndex },
      { find: /^@earendil-works\/pi-agent-core$/, replacement: agentSrcIndex },
      { find: /^@earendil-works\/pi-coding-agent$/, replacement: codingAgentDistIndex },
    ],
  },
});
