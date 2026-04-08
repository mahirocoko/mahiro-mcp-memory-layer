import type { CursorWorkerRuntime } from "./cursor-worker-runtime.js";
import { mcpCursorRuntime } from "./mcp/mcp-cursor-runtime.js";

/**
 * Opt-in Cursor runtime selection: explicit `dependencies.runtime` wins, then `MAHIRO_CURSOR_RUNTIME=mcp`.
 * Default remains shell via {@link shellCursorRuntime} inside {@link runCursorWorker}.
 */
export function resolveCursorWorkerRuntimeDependency(
  explicit: CursorWorkerRuntime | undefined,
  env: NodeJS.ProcessEnv,
): CursorWorkerRuntime | undefined {
  if (explicit) {
    return explicit;
  }

  if (env.MAHIRO_CURSOR_RUNTIME === "mcp") {
    return mcpCursorRuntime;
  }

  return undefined;
}
