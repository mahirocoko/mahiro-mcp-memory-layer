import type { GeminiCommandRunResult, GeminiWorkerInput } from "../../types.js";
import { buildGeminiInteractiveShellArgs } from "./build-gemini-shell-args.js";
import { finalizeGeminiCommandResult } from "./finalize-gemini-command-result.js";
import {
  buildInteractiveSessionName,
  extractInteractiveGeminiResponse,
  getInteractiveRuntimeCaptureHistoryLines,
  shellEscapeArg,
} from "./interactive-gemini-response.js";
import { runTmuxCommand } from "./run-tmux-command.js";

const interactiveRuntimePollIntervalMs = 500;
const interactiveRuntimeQuietWindowMs = 1_000;

export async function runInteractiveGeminiShellCommand(input: GeminiWorkerInput): Promise<GeminiCommandRunResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const tmuxBinary = "tmux";
  const sessionName = buildInteractiveSessionName(input.taskId);

  try {
    await runTmuxCommand(tmuxBinary, ["new-session", "-d", "-s", sessionName, "-c", input.cwd ?? process.cwd()]);

    const command = input.binaryPath ?? "gemini";
    const args = buildGeminiInteractiveShellArgs(input);
    const interactiveCommand = [command, ...args].map(shellEscapeArg).join(" ");
    await runTmuxCommand(tmuxBinary, ["send-keys", "-t", sessionName, interactiveCommand, "C-m"]);

    const timeoutMs = input.timeoutMs ?? 300_000;
    const deadline = Date.now() + timeoutMs;
    let latestPane = "";
    let lastPaneChangeAt = Date.now();
    let observedModelResponse = false;

    while (Date.now() < deadline) {
      await wait(interactiveRuntimePollIntervalMs);
      const pane = await captureTmuxPane(tmuxBinary, sessionName);

      if (pane !== latestPane) {
        latestPane = pane;
        lastPaneChangeAt = Date.now();
      }

      if (!observedModelResponse && extractInteractiveGeminiResponse(pane)) {
        observedModelResponse = true;
      }

      if (observedModelResponse && Date.now() - lastPaneChangeAt >= interactiveRuntimeQuietWindowMs) {
        return finalizeSuccess(startedAtDate, startedAt, latestPane, input.model);
      }
    }

    const timedOutPane = await captureTmuxPane(tmuxBinary, sessionName).catch(() => latestPane);
    return finalizeGeminiCommandResult(startedAtDate, {
      stdout: "",
      stderr: timedOutPane,
      exitCode: null,
      signal: "SIGTERM",
      timedOut: true,
      startedAt,
    });
  } catch (error) {
    return finalizeGeminiCommandResult(startedAtDate, {
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      timedOut: false,
      startedAt,
      spawnError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await runTmuxCommand(tmuxBinary, ["kill-session", "-t", sessionName]).catch(() => undefined);
  }
}

async function captureTmuxPane(command: string, sessionName: string): Promise<string> {
  return await runTmuxCommand(command, [
    "capture-pane",
    "-p",
    "-t",
    sessionName,
    "-S",
    `-${getInteractiveRuntimeCaptureHistoryLines()}`,
  ]);
}

function finalizeSuccess(startedAtDate: Date, startedAt: string, pane: string, model: string): GeminiCommandRunResult {
  const response = extractInteractiveGeminiResponse(pane);

  if (!response) {
    return finalizeGeminiCommandResult(startedAtDate, {
      stdout: JSON.stringify({ error: "Gemini interactive tmux run completed without an extractable model response." }),
      stderr: pane,
      exitCode: 1,
      signal: null,
      timedOut: false,
      startedAt,
    });
  }

  return finalizeGeminiCommandResult(startedAtDate, {
    stdout: JSON.stringify({ response, stats: { model, runtime: "interactive_tmux" } }),
    stderr: pane,
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt,
  });
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
