import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeGeminiCliPath = path.join(repoRoot, "tests/fixtures/fake-gemini-cli.js");

describe("local MCP stdio worker tools", () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  afterEach(async () => {
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    client = undefined;
    transport = undefined;
  });

  it(
    "calls run_gemini_worker through the local MCP server",
    async () => {
      transport = new StdioClientTransport({
        command: "bun",
        args: ["run", "start"],
        cwd: repoRoot,
        stderr: "pipe",
      });
      client = new Client({ name: "mcp-stdio-worker-e2e", version: "0.0.0" });

      await client.connect(transport);

      const result = await client.callTool({
        name: "run_gemini_worker",
        arguments: {
          taskId: "gemini-e2e-1",
          prompt: "Summarize the worker runtime.",
          model: "gemini-3-flash-preview",
          binaryPath: fakeGeminiCliPath,
        },
      });

      expect(result.isError).not.toBe(true);

      const textContent = result.content.find((item) => item.type === "text");
      expect(textContent?.type).toBe("text");

      const commandResult = JSON.parse((textContent as { text: string }).text) as {
        stdout: string;
        exitCode: number | null;
        timedOut: boolean;
      };
      const payload = JSON.parse(commandResult.stdout) as {
        response: string;
        stats: { model: string };
      };

      expect(commandResult.exitCode).toBe(0);
      expect(commandResult.timedOut).toBe(false);
      expect(payload.response).toContain("Summarize the worker runtime.");
      expect(payload.stats.model).toBe("gemini-3-flash-preview");
    },
    20000,
  );
});
