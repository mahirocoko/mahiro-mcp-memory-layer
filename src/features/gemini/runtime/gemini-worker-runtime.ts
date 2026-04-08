import type { GeminiCommandRunResult, GeminiWorkerInput } from "../types.js";

/**
 * Pluggable execution strategy for Gemini worker jobs (default: shell-based).
 * Phase 2 may add MCP-native implementations alongside {@link shellGeminiRuntime}.
 */
export interface GeminiWorkerRuntime {
  run(input: GeminiWorkerInput): Promise<GeminiCommandRunResult>;
}

export function geminiRuntimeFromRun(
  run: (input: GeminiWorkerInput) => Promise<GeminiCommandRunResult>,
): GeminiWorkerRuntime {
  return { run };
}
