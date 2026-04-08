import type { WorkerRuntimeSelection } from "../../orchestration/worker-runtime-selection.js";
import type { GeminiWorkerRuntime } from "./gemini-worker-runtime.js";
import { mcpGeminiRuntime } from "./mcp/mcp-gemini-runtime.js";

/**
 * Opt-in Gemini runtime selection: injected `dependencies.runtime`, then explicit `workerRuntime`, then `MAHIRO_GEMINI_RUNTIME=mcp`.
 * Default remains shell via {@link shellGeminiRuntime} inside {@link runGeminiWorker}.
 */
export function resolveGeminiWorkerRuntimeDependency(
  injectedRuntime: GeminiWorkerRuntime | undefined,
  selection: WorkerRuntimeSelection | undefined,
  env: NodeJS.ProcessEnv,
): GeminiWorkerRuntime | undefined {
  if (injectedRuntime) {
    return injectedRuntime;
  }

  if (selection === "mcp") {
    return mcpGeminiRuntime;
  }

  if (selection === "shell") {
    return undefined;
  }

  if (env.MAHIRO_GEMINI_RUNTIME === "mcp") {
    return mcpGeminiRuntime;
  }

  return undefined;
}
