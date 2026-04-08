import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { CursorCommandRunResult, CursorWorkerInput } from "../../types.js";
import type { CursorWorkerRuntime } from "../cursor-worker-runtime.js";

const RUN_CURSOR_WORKER_TOOL = "run_cursor_worker";

function getMcpServerSpawnParams(): { command: string; args: string[]; cwd: string } {
  const command = process.env.MAHIRO_MCP_SERVER_COMMAND ?? "bun";
  const argsEnv = process.env.MAHIRO_MCP_SERVER_ARGS;
  const args = argsEnv ? argsEnv.split(/\s+/).filter(Boolean) : ["run", "start"];
  const cwd = process.env.MAHIRO_MCP_SERVER_CWD ?? process.cwd();
  return { command, args, cwd };
}

function toolArgumentsFromInput(input: CursorWorkerInput): Record<string, unknown> {
  return {
    taskId: input.taskId,
    prompt: input.prompt,
    model: input.model,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.binaryPath !== undefined ? { binaryPath: input.binaryPath } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.force !== undefined ? { force: input.force } : {}),
    ...(input.trust !== undefined ? { trust: input.trust } : {}),
  };
}

function extractTextFromToolContent(
  content: Array<{ type: string; text?: string } | Record<string, unknown>> | undefined,
): string {
  if (!content?.length) {
    return "";
  }

  const first = content[0];

  if (first && typeof first === "object" && "type" in first && first.type === "text" && "text" in first) {
    return String(first.text);
  }

  return "";
}

function parseCommandResultJson(text: string): CursorCommandRunResult | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as CursorCommandRunResult;
  } catch {
    return undefined;
  }
}

async function runMcpCursor(input: CursorWorkerInput): Promise<CursorCommandRunResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const { command, args, cwd } = getMcpServerSpawnParams();

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
  });

  const client = new Client({ name: "mahiro-mcp-cursor-runtime", version: "0.0.0" }, {});

  try {
    await client.connect(transport);

    const callOptions =
      input.timeoutMs !== undefined
        ? { timeout: input.timeoutMs, maxTotalTimeout: input.timeoutMs }
        : undefined;

    const toolResult = await client.callTool(
      {
        name: RUN_CURSOR_WORKER_TOOL,
        arguments: toolArgumentsFromInput(input),
      },
      undefined,
      callOptions,
    );

    const text = extractTextFromToolContent(toolResult.content as never);

    if (toolResult.isError) {
      const finishedAtDate = new Date();
      return {
        stdout: "",
        stderr: text,
        exitCode: 1,
        signal: null,
        timedOut: false,
        startedAt,
        finishedAt: finishedAtDate.toISOString(),
        durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      };
    }

    const parsed = parseCommandResultJson(text);

    if (!parsed) {
      const finishedAtDate = new Date();
      return {
        stdout: "",
        stderr: text ? `Invalid run_cursor_worker JSON payload: ${text.slice(0, 500)}` : "Empty run_cursor_worker tool response.",
        exitCode: 1,
        signal: null,
        timedOut: false,
        startedAt,
        finishedAt: finishedAtDate.toISOString(),
        durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      };
    }

    return parsed;
  } catch (error) {
    const finishedAtDate = new Date();
    return {
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      timedOut: false,
      startedAt,
      finishedAt: finishedAtDate.toISOString(),
      durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      spawnError: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Cursor worker runtime that spawns this MCP server and calls the `run_cursor_worker` tool (stdio). */
export const mcpCursorRuntime: CursorWorkerRuntime = {
  run: runMcpCursor,
};
