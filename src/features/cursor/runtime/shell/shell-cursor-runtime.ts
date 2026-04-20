import { spawn } from "node:child_process";

import type { CursorCommandRunResult, CursorWorkerInput, CursorWorkerRuntime } from "../../types.js";

export function buildCursorShellArgs(input: CursorWorkerInput): string[] {
  const args = ["-p", "--output-format", "json", "--model", input.model];
  if (input.mode) {
    args.push("--mode", input.mode);
  }
  if (input.force) {
    args.push("--force");
  }
  if (input.trust) {
    args.push("--trust");
  }
  if (input.cwd) {
    args.push("--workspace", input.cwd);
  }
  args.push(input.prompt);
  return args;
}

async function runCursorWithArgs(args: string[]): Promise<CursorCommandRunResult> {
  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  return await new Promise<CursorCommandRunResult>((resolve, reject) => {
    const child = spawn("agent", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut: signal === "SIGTERM" && code === null,
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAtMs),
      });
    });
  });
}

export const shellCursorRuntime: CursorWorkerRuntime = {
  run: async (input) => await runCursorWithArgs(buildCursorShellArgs(input)),
};
