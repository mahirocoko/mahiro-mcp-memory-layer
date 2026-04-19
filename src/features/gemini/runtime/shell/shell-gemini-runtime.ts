import type { GeminiWorkerRuntime } from "../gemini-worker-runtime.js";

import { buildGeminiInteractiveShellArgs, buildGeminiShellArgs } from "./build-gemini-shell-args.js";
import { runInteractiveGeminiShellCommand } from "./run-interactive-gemini-shell-command.js";
import { runGeminiShellCommand } from "./run-gemini-shell-command.js";

export { buildGeminiInteractiveShellArgs, buildGeminiShellArgs };

/** Default Gemini worker runtime: spawns the local `gemini` CLI. */
export const shellGeminiRuntime: GeminiWorkerRuntime = {
  run: runGeminiShellCommand,
};

/** Interactive Gemini worker runtime: hosts one Gemini normal-mode turn inside tmux and captures the result. */
export const interactiveShellGeminiRuntime: GeminiWorkerRuntime = {
  run: runInteractiveGeminiShellCommand,
};
