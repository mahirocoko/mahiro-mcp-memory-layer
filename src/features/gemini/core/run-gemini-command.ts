import { spawn } from "node:child_process";

import type { GeminiCommandRunResult, GeminiWorkerInput } from "../types.js";

export async function runGeminiCommand(input: GeminiWorkerInput): Promise<GeminiCommandRunResult> {
  return new Promise((resolve) => {
    const startedAtDate = new Date();
    const startedAt = startedAtDate.toISOString();
    const command = input.binaryPath ?? "gemini";
    const args = ["-m", input.model, "-p", input.prompt, "--output-format", "json"];

    const child = spawn(command, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const finalize = (result: Omit<GeminiCommandRunResult, "finishedAt" | "durationMs">) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      const finishedAtDate = new Date();
      resolve({
        ...result,
        finishedAt: finishedAtDate.toISOString(),
        durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      });
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finalize({
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        timedOut: false,
        startedAt,
        spawnError: error.message,
      });
    });

    child.on("close", (exitCode, signal) => {
      finalize({
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut: false,
        startedAt,
      });
    });

    if (input.timeoutMs) {
      timeoutHandle = setTimeout(() => {
        child.kill("SIGTERM");

        finalize({
          stdout,
          stderr,
          exitCode: null,
          signal: "SIGTERM",
          timedOut: true,
          startedAt,
        });
      }, input.timeoutMs);
    }
  });
}
