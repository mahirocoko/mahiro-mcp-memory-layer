import type { WorkerRuntimeSelection } from "../../orchestration/worker-runtime-selection.js";
import type { CursorWorkerRuntime } from "./cursor-worker-runtime.js";
import { mcpCursorRuntime } from "./mcp/mcp-cursor-runtime.js";

/**
 * Opt-in Cursor runtime selection: injected `dependencies.runtime`, then explicit `workerRuntime`, then `MAHIRO_CURSOR_RUNTIME=mcp`.
 * Default remains shell via {@link shellCursorRuntime} inside {@link runCursorWorker}.
 */
export function resolveCursorWorkerRuntimeDependency(
  injectedRuntime: CursorWorkerRuntime | undefined,
  selection: WorkerRuntimeSelection | undefined,
  env: NodeJS.ProcessEnv,
): CursorWorkerRuntime | undefined {
  if (injectedRuntime) {
    return injectedRuntime;
  }

  if (selection === "mcp") {
    return mcpCursorRuntime;
  }

  if (selection === "shell") {
    return undefined;
  }

  if (env.MAHIRO_CURSOR_RUNTIME === "mcp") {
    return mcpCursorRuntime;
  }

  return undefined;
}
