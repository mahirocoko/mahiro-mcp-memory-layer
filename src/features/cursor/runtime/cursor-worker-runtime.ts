import type { CursorCommandRunResult, CursorWorkerInput } from "../types.js";

/**
 * Pluggable execution strategy for Cursor worker jobs (default: shell-based).
 * MCP stdio transport lives in `./mcp/mcp-cursor-runtime.js` (opt-in via `MAHIRO_CURSOR_RUNTIME=mcp` or `workerRuntime`).
 */
export interface CursorWorkerRuntime {
  run(input: CursorWorkerInput): Promise<CursorCommandRunResult>;
}

export function cursorRuntimeFromRun(
  run: (input: CursorWorkerInput) => Promise<CursorCommandRunResult>,
): CursorWorkerRuntime {
  return { run };
}
