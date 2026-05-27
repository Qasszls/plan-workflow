import { describe, expect, it } from "vitest";
import { registerTodoWrite } from "../../src/todo/tool.ts";

describe("TodoWrite tool registration", () => {
  it("registers a TodoWrite tool", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const pi = {
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    registerTodoWrite(pi as never);

    expect(tools.map((tool) => tool.name)).toContain("TodoWrite");
    expect(tools[0].description).toContain("todo");
  });

  it("stores summary in details and updates the overlay widget", async () => {
    const tools: Array<{
      name: string;
      execute: (...args: unknown[]) => Promise<unknown>;
    }> = [];
    const widgets: Array<{ key: string; content: unknown }> = [];
    const pi = {
      registerTool(
        tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> },
      ) {
        tools.push(tool);
      },
      on() {},
      registerCommand() {},
    };

    registerTodoWrite(pi as never);

    const result = await tools[0].execute(
      "call-1",
      {
        summary: "早会",
        todos: [
          {
            id: "sync",
            content: "同步昨日工作进展与已完成事项",
            status: "completed",
          },
          {
            id: "focus",
            content: "确认今日重点任务与负责人",
            status: "pending",
          },
        ],
      },
      new AbortController().signal,
      () => {},
      {
        ui: {
          setWidget(key: string, content: unknown) {
            widgets.push({ key, content });
          },
        },
      },
    );

    expect(result).toMatchObject({
      details: {
        summary: "早会",
        stats: { pending: 1, inProgress: 0, completed: 1, deleted: 0 },
      },
    });
    expect(
      String((result as { content: Array<{ text: string }> }).content[0].text),
    ).toContain("Todos updated: 1/2 completed.");
    expect(widgets).toHaveLength(1);
    expect(widgets[0].key).toBe("plan-workflow-todos");
    expect(typeof widgets[0].content).toBe("function");
  });
});
