import { describe, expect, it } from "vitest";
import planWorkflow from "../../src/index.ts";
import { registerTaskTool } from "../../src/task/tool.ts";
import type { TaskAgentConfig } from "../../src/task/discovery.ts";
import type { TaskRequest, TaskRunResult } from "../../src/task/schema.ts";

function resultFor(request: TaskRequest, agent = request.subagent_type ?? "default"): TaskRunResult {
  return {
    description: request.description,
    prompt: request.prompt,
    agent,
    status: "completed",
    finalOutput: "done",
    messages: [],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    exitCode: 0,
  };
}

function failedResultFor(request: TaskRequest): TaskRunResult {
  return {
    ...resultFor(request),
    status: "failed",
    finalOutput: "",
    stderr: "failed",
    exitCode: 1,
    errorMessage: "failed",
  };
}

function runningResultFor(request: TaskRequest): TaskRunResult {
  return {
    ...resultFor(request),
    status: "running",
    finalOutput: "working",
    exitCode: -1,
  };
}

const reviewer: TaskAgentConfig = {
  name: "reviewer",
  description: "Review code",
  body: "Review carefully.",
  filePath: "/tmp/reviewer.md",
};

describe("Task tool registration", () => {
  it("registers Task from the package entrypoint", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const pi = {
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    planWorkflow(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools.map((tool) => tool.name)).toContain("Task");
  });

  it("executes Task and returns markdown content plus details", async () => {
    const tools: any[] = [];
    const pi = {
      registerTool(tool: unknown) {
        tools.push(tool);
      },
    };

    registerTaskTool(pi as never, {
      discoverAgents: () => ({ agents: [reviewer], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ tasks }) => ({
        isError: false,
        details: { version: 1, results: tasks.map((task) => resultFor(task)) },
      }),
    });

    const tool = tools.find((candidate) => candidate.name === "Task");
    const result = await tool.execute(
      "tool-1",
      { tasks: [{ description: "Review", prompt: "Review this.", subagent_type: "reviewer" }] },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Task results:");
    expect(result.details.results[0]).toMatchObject({ description: "Review", agent: "reviewer" });
  });

  it("returns an error result when params fail normalization", async () => {
    const tools: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool) } as never);

    const result = await tools[0].execute(
      "tool-1",
      { tasks: [] },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Task error: Task requires at least one task request");
    expect(result.details).toEqual({ version: 1, results: [] });
  });

  it("returns an error result when child execution fails", async () => {
    const tools: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool), on() {} } as never, {
      discoverAgents: () => ({ agents: [], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ tasks }) => ({
        isError: true,
        details: { version: 1, results: tasks.map((task) => failedResultFor(task)) },
      }),
    });

    const result = await tools[0].execute(
      "tool-1",
      { tasks: [{ description: "Default", prompt: "Do it." }] },
      undefined,
      undefined,
      { cwd: "/tmp/project" },
    );

    expect(result.isError).toBe(true);
    expect(result.details.results[0].status).toBe("failed");
  });

  it("passes running partial updates through onUpdate without marking them as errors", async () => {
    const tools: any[] = [];
    const updates: any[] = [];
    registerTaskTool({ registerTool: (tool: unknown) => tools.push(tool) } as never, {
      discoverAgents: () => ({ agents: [], projectAgentsDir: null, globalAgentsDir: "/tmp/global" }),
      executeTasks: async ({ onUpdate, tasks }) => {
        const runningDetails = { version: 1 as const, results: tasks.map((task) => runningResultFor(task)) };
        const finalDetails = { version: 1 as const, results: tasks.map((task) => resultFor(task)) };
        onUpdate?.(runningDetails);
        return { isError: false, details: finalDetails };
      },
    });

    await tools[0].execute(
      "tool-1",
      { tasks: [{ description: "Default", prompt: "Do it." }] },
      undefined,
      (update: unknown) => updates.push(update),
      { cwd: "/tmp/project" },
    );

    expect(updates[0].details.results[0].status).toBe("running");
    expect(updates[0].isError).toBeUndefined();
  });

  it("promotes Task tool_result events to runtime errors when details contain failed children", async () => {
    const handlers: Record<string, Function[]> = {};
    registerTaskTool({
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = [...(handlers[event] ?? []), handler];
      },
    } as never);

    const result = await handlers.tool_result[0]({
      toolName: "Task",
      details: {
        version: 1,
        results: [failedResultFor({ description: "Default", prompt: "Do it." })],
      },
    });

    expect(result).toEqual({ isError: true });
  });

  it("does not promote running-only Task tool_result events to runtime errors", async () => {
    const handlers: Record<string, Function[]> = {};
    registerTaskTool({
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = [...(handlers[event] ?? []), handler];
      },
    } as never);

    const result = await handlers.tool_result[0]({
      toolName: "Task",
      content: [{ type: "text", text: "Task results:" }],
      details: {
        version: 1,
        results: [runningResultFor({ description: "Default", prompt: "Do it." })],
      },
    });

    expect(result).toEqual({ isError: false });
  });

  it("does not throw when Task tool_result events omit content", async () => {
    const handlers: Record<string, Function[]> = {};
    registerTaskTool({
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = [...(handlers[event] ?? []), handler];
      },
    } as never);

    const result = await handlers.tool_result[0]({
      toolName: "Task",
      details: {
        version: 1,
        results: [runningResultFor({ description: "Default", prompt: "Do it." })],
      },
    });

    expect(result).toEqual({ isError: false });
  });

  it("promotes Task normalization errors to runtime errors", async () => {
    const handlers: Record<string, Function[]> = {};
    registerTaskTool({
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = [...(handlers[event] ?? []), handler];
      },
    } as never);

    const result = await handlers.tool_result[0]({
      toolName: "Task",
      content: [{ type: "text", text: "Task error: Task requires at least one task request" }],
      details: { version: 1, results: [] },
    });

    expect(result).toEqual({ isError: true });
  });
});
