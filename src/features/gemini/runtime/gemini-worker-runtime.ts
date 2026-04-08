import type { GeminiCommandRunResult, GeminiWorkerInput } from "../types.js";

/**
 * Pluggable execution strategy for Gemini worker jobs (default: shell-based).
 * MCP stdio transport lives in `./mcp/mcp-gemini-runtime.js` (opt-in via `MAHIRO_GEMINI_RUNTIME=mcp` or `workerRuntime`).
 */
export interface GeminiWorkerRuntime {
  run(input: GeminiWorkerInput): Promise<GeminiCommandRunResult>;
}

export function geminiRuntimeFromRun(
  run: (input: GeminiWorkerInput) => Promise<GeminiCommandRunResult>,
): GeminiWorkerRuntime {
  return { run };
}
