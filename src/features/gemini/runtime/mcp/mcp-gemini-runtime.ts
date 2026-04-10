import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AsyncWorkerResultResponse, AsyncWorkerStartResponse } from "../../../orchestration/mcp/async-worker-tools.js";
import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerResult } from "../../types.js";
import type { GeminiWorkerRuntime } from "../gemini-worker-runtime.js";

const RUN_GEMINI_WORKER_ASYNC_TOOL = "run_gemini_worker_async";
const GET_GEMINI_WORKER_RESULT_TOOL = "get_gemini_worker_result";
const DEFAULT_POLL_INTERVAL_MS = 1_000;

function getMcpServerSpawnParams(): { command: string; args: string[]; cwd: string } {
  const command = process.env.MAHIRO_MCP_SERVER_COMMAND ?? "bun";
  const argsEnv = process.env.MAHIRO_MCP_SERVER_ARGS;
  const args = argsEnv ? argsEnv.split(/\s+/).filter(Boolean) : ["run", "start"];
  const cwd = process.env.MAHIRO_MCP_SERVER_CWD ?? process.cwd();
  return { command, args, cwd };
}

function toolArgumentsFromInput(input: GeminiWorkerInput): Record<string, unknown> {
  return {
    taskId: input.taskId,
    prompt: input.prompt,
    model: input.model,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.binaryPath !== undefined ? { binaryPath: input.binaryPath } : {}),
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
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

function parseJson<T>(text: string): T | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return undefined;
  }
}

function buildInvalidPayloadResult(startedAtDate: Date, startedAt: string, text: string, toolName: string): GeminiCommandRunResult {
  const finishedAtDate = new Date();
  return {
    stdout: "",
    stderr: text ? `Invalid ${toolName} JSON payload: ${text.slice(0, 500)}` : `Empty ${toolName} tool response.`,
    exitCode: 1,
    signal: null,
    timedOut: false,
    startedAt,
    finishedAt: finishedAtDate.toISOString(),
    durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
  };
}

function buildToolErrorResult(startedAtDate: Date, startedAt: string, text: string): GeminiCommandRunResult {
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

function buildSpawnErrorResult(startedAtDate: Date, startedAt: string, error: string): GeminiCommandRunResult {
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
    spawnError: error,
  };
}

function toGeminiCommandResult(
  polled: Exclude<AsyncWorkerResultResponse<GeminiWorkerResult>, { status: "running" }>,
  startedAtDate: Date,
  startedAt: string,
): GeminiCommandRunResult {
  if (polled.status === "runner_failed") {
    return buildSpawnErrorResult(startedAtDate, startedAt, polled.error);
  }

  const workerResult = polled.result;

  switch (workerResult.status) {
    case "completed": {
      const stdoutPayload = workerResult.raw ?? {
        response: workerResult.response ?? "",
        stats: {
          model: workerResult.reportedModel ?? workerResult.requestedModel,
        },
      };

      return {
        stdout: JSON.stringify(stdoutPayload),
        stderr: workerResult.stderr ?? "",
        exitCode: 0,
        signal: workerResult.signal ?? null,
        timedOut: false,
        startedAt: workerResult.startedAt,
        finishedAt: workerResult.finishedAt,
        durationMs: workerResult.durationMs,
      };
    }
    case "timeout":
      return {
        stdout: workerResult.stdout ?? "",
        stderr: workerResult.stderr ?? workerResult.error ?? "",
        exitCode: workerResult.exitCode ?? null,
        signal: workerResult.signal ?? null,
        timedOut: true,
        startedAt: workerResult.startedAt,
        finishedAt: workerResult.finishedAt,
        durationMs: workerResult.durationMs,
      };
    case "spawn_error":
      return {
        stdout: "",
        stderr: workerResult.stderr ?? "",
        exitCode: workerResult.exitCode ?? null,
        signal: workerResult.signal ?? null,
        timedOut: false,
        startedAt: workerResult.startedAt,
        finishedAt: workerResult.finishedAt,
        durationMs: workerResult.durationMs,
        spawnError: workerResult.error ?? "Gemini worker spawn error.",
      };
    default:
      return {
        stdout: workerResult.stdout ?? "",
        stderr: workerResult.error ?? workerResult.stderr ?? "",
        exitCode: workerResult.exitCode ?? 1,
        signal: workerResult.signal ?? null,
        timedOut: false,
        startedAt: workerResult.startedAt,
        finishedAt: workerResult.finishedAt,
        durationMs: workerResult.durationMs,
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMcpGemini(input: GeminiWorkerInput): Promise<GeminiCommandRunResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const { command, args, cwd } = getMcpServerSpawnParams();

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
  });

  const client = new Client({ name: "mahiro-mcp-gemini-runtime", version: "0.0.0" }, {});

  try {
    await client.connect(transport);

    const startToolResult = await client.callTool(
      {
        name: RUN_GEMINI_WORKER_ASYNC_TOOL,
        arguments: toolArgumentsFromInput(input),
      },
      undefined,
    );

    const startText = extractTextFromToolContent(startToolResult.content as never);

    if (startToolResult.isError) {
      return buildToolErrorResult(startedAtDate, startedAt, startText);
    }

    const started = parseJson<AsyncWorkerStartResponse>(startText);

    if (!started) {
      return buildInvalidPayloadResult(startedAtDate, startedAt, startText, RUN_GEMINI_WORKER_ASYNC_TOOL);
    }

    while (true) {
      const resultTool = await client.callTool(
        {
          name: GET_GEMINI_WORKER_RESULT_TOOL,
          arguments: {
            requestId: started.requestId,
          },
        },
        undefined,
      );

      const resultText = extractTextFromToolContent(resultTool.content as never);

      if (resultTool.isError) {
        return buildToolErrorResult(startedAtDate, startedAt, resultText);
      }

      const polled = parseJson<AsyncWorkerResultResponse<GeminiWorkerResult>>(resultText);

      if (!polled) {
        return buildInvalidPayloadResult(startedAtDate, startedAt, resultText, GET_GEMINI_WORKER_RESULT_TOOL);
      }

      if (polled.status !== "running") {
        return toGeminiCommandResult(polled, startedAtDate, startedAt);
      }

      await sleep(polled.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    }
  } catch (error) {
    return buildSpawnErrorResult(startedAtDate, startedAt, error instanceof Error ? error.message : String(error));
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Gemini worker runtime that spawns this MCP server and uses async worker MCP tools with polling (stdio). */
export const mcpGeminiRuntime: GeminiWorkerRuntime = {
  run: runMcpGemini,
};
