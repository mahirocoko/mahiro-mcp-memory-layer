import { shellCursorRuntime } from "../runtime/shell/shell-cursor-runtime.js";
import type { CursorCommandRunResult, CursorWorkerInput } from "../types.js";

/** @deprecated Prefer {@link shellCursorRuntime} from `../runtime/shell/shell-cursor-runtime.js`. */
export async function runCursorCommand(input: CursorWorkerInput): Promise<CursorCommandRunResult> {
  return shellCursorRuntime.run(input);
}
