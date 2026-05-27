#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn(
  "pi",
  [
    "--extension",
    "/Users/liusahngzuo/code/learn/plan-workflow/src/index.ts",
    "--append-system-prompt",
    "/Users/liusahngzuo/code/learn/plan-workflow/APPEND_SYSTEM.md",
  ],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
