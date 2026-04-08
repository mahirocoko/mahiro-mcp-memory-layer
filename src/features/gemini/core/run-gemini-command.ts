import { shellGeminiRuntime } from "../runtime/shell/shell-gemini-runtime.js";
import type { GeminiCommandRunResult, GeminiWorkerInput } from "../types.js";

/** @deprecated Prefer {@link shellGeminiRuntime} from `../runtime/shell/shell-gemini-runtime.js`. */
export async function runGeminiCommand(input: GeminiWorkerInput): Promise<GeminiCommandRunResult> {
  return shellGeminiRuntime.run(input);
}
