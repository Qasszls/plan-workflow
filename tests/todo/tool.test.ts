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
});
