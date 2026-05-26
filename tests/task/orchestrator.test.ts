import { describe, expect, it } from "vitest";
import type { TaskAgentConfig } from "../../src/task/discovery.ts";
import { executeTaskRequests } from "../../src/task/orchestrator.ts";
import { MAX_CONCURRENCY, type TaskDetails, type TaskRequest, type TaskRunResult } from "../../src/task/schema.ts";

function resultFor(request: TaskRequest, status: TaskRunResult["status"], output: string): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent: request.subagent_type ?? "default",
    status,
    finalOutput: output,
    messages: [],
    stderr: status === "failed" ? "failed" : "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    exitCode: status === "completed" ? 0 : 1,
  };
}

const reviewer: TaskAgentConfig = {
  name: "reviewer",
  description: "Review code",
  body: "Review carefully.",
  filePath: "/tmp/reviewer.md",
};

describe("task orchestration", () => {
  it("runs a default task when subagent_type is omitted", async () => {
    const request = { description: "Default review", prompt: "Review this." };
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: [request],
      agents: [],
      runTask: async ({ request }) => resultFor(request, "completed", "done"),
    });

    expect(execution.isError).toBe(false);
    expect(execution.details.results[0].agent).toBe("default");
  });

  it("uses a named agent when subagent_type matches discovery", async () => {
    const request = { description: "Review", prompt: "Review this.", subagent_type: "reviewer" };
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: [request],
      agents: [reviewer],
      runTask: async ({ request, agent, appendSystemPromptPath }) => ({
        ...resultFor(request, "completed", "reviewed"),
        agent: agent?.name ?? "default",
        agentFilePath: agent?.filePath,
        stderr: appendSystemPromptPath ?? "",
      }),
    });

    expect(execution.details.results[0]).toMatchObject({
      agent: "reviewer",
      agentFilePath: "/tmp/reviewer.md",
      finalOutput: "reviewed",
    });
    expect(execution.details.results[0].stderr).toBe("/tmp/reviewer.md");
  });

  it("marks an unknown named agent as failed and continues", async () => {
    const requests = [
      { description: "Missing", prompt: "Do missing.", subagent_type: "missing" },
      { description: "Default", prompt: "Do default." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => resultFor(request, "completed", "done"),
    });

    expect(execution.isError).toBe(true);
    expect(execution.details.results.map((result) => [result.description, result.status])).toEqual([
      ["Missing", "failed"],
      ["Default", "completed"],
    ]);
  });

  it("preserves input order when parallel tasks finish out of order", async () => {
    const requests = [
      { description: "First", prompt: "First." },
      { description: "Second", prompt: "Second." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => {
        if (request.description === "First") await new Promise((resolve) => setTimeout(resolve, 10));
        return resultFor(request, "completed", request.description);
      },
    });

    expect(execution.details.results.map((result) => result.description)).toEqual(["First", "Second"]);
  });

  it("marks the whole execution as error when any child fails", async () => {
    const requests = [
      { description: "Good", prompt: "Good." },
      { description: "Bad", prompt: "Bad." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) =>
        request.description === "Bad" ? resultFor(request, "failed", "bad") : resultFor(request, "completed", "good"),
    });

    expect(execution.isError).toBe(true);
    expect(execution.details.results).toHaveLength(2);
  });

  it("returns a failed result when a child runner rejects", async () => {
    const requests = [
      { description: "Throws", prompt: "Throw." },
      { description: "Good", prompt: "Good." },
    ];
    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => {
        if (request.description === "Throws") throw new Error("spawn failed");
        return resultFor(request, "completed", "good");
      },
    });

    expect(execution.isError).toBe(true);
    expect(execution.details.results.map((result) => [result.description, result.status, result.errorMessage])).toEqual([
      ["Throws", "failed", "spawn failed"],
      ["Good", "completed", undefined],
    ]);
  });

  it("limits parallel execution to MAX_CONCURRENCY", async () => {
    const requests = Array.from({ length: MAX_CONCURRENCY + 2 }, (_, index) => ({
      description: `Task ${index + 1}`,
      prompt: "Do work.",
    }));
    let active = 0;
    let maxActive = 0;
    let started = 0;
    const releases: Array<() => void> = [];

    const execution = executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      runTask: async ({ request }) => {
        started += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return resultFor(request, "completed", request.description);
      },
    });

    while (started < MAX_CONCURRENCY) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maxActive).toBe(MAX_CONCURRENCY);
    while (started < requests.length) {
      releases.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    while (releases.length > 0) releases.shift()?.();

    await execution;
    expect(maxActive).toBe(MAX_CONCURRENCY);
  });

  it("emits partial updates for child progress, unknown agents, and completions", async () => {
    const requests = [
      { description: "Missing", prompt: "Do missing.", subagent_type: "missing" },
      { description: "Default", prompt: "Do default." },
    ];
    const updates: TaskDetails[] = [];

    const execution = await executeTaskRequests({
      cwd: "/tmp/project",
      tasks: requests,
      agents: [],
      onUpdate: (details) => updates.push(details),
      runTask: async ({ request, onUpdate }) => {
        onUpdate?.(resultFor(request, "completed", "partial"));
        return resultFor(request, "completed", "done");
      },
    });

    expect(execution.details.results.map((result) => result.description)).toEqual(["Missing", "Default"]);
    expect(updates[0].results.map((result) => result.description)).toEqual(["Missing"]);
    expect(updates.some((details) => details.results.map((result) => result.description).join(",") === "Missing,Default")).toBe(true);
  });
});
