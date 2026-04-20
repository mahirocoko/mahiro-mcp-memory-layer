import { spawn } from "node:child_process";

import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerRuntime } from "../../types.js";

function joinAllowedMcpServerNames(names: GeminiWorkerInput["allowedMcpServerNames"]): string | undefined {
  if (names === undefined) {
    return undefined;
  }
  if (names === "none") {
    return "none";
  }
  return names.join(",");
}

export function buildGeminiShellArgs(input: GeminiWorkerInput): string[] {
  const args = ["-m", input.model];
  if (input.approvalMode) {
    args.push("--approval-mode", input.approvalMode);
  }
  const allowlist = joinAllowedMcpServerNames(input.allowedMcpServerNames);
  if (allowlist) {
    args.push("--allowed-mcp-server-names", allowlist);
  }
  args.push("-p", input.prompt, "--output-format", "json");
  return args;
}

export function buildGeminiInteractiveShellArgs(input: GeminiWorkerInput): string[] {
  const args = ["-m", input.model];
  if (input.approvalMode) {
    args.push("--approval-mode", input.approvalMode);
  }
  const allowlist = joinAllowedMcpServerNames(input.allowedMcpServerNames);
  if (allowlist) {
    args.push("--allowed-mcp-server-names", allowlist);
  }
  args.push("-i", input.prompt);
  return args;
}

export function buildGeminiInteractiveTmuxSessionArgs(input: GeminiWorkerInput): string[] {
  const args = ["-m", input.model];
  if (input.approvalMode) {
    args.push("--approval-mode", input.approvalMode);
  }
  const allowlist = joinAllowedMcpServerNames(input.allowedMcpServerNames);
  if (allowlist) {
    args.push("--allowed-mcp-server-names", allowlist);
  }
  return args;
}

async function runGeminiWithArgs(args: string[]): Promise<GeminiCommandRunResult> {
  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  return await new Promise<GeminiCommandRunResult>((resolve, reject) => {
    const child = spawn("gemini", args, {
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
      const finishedAtIso = new Date().toISOString();
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut: signal === "SIGTERM" && code === null,
        startedAt: startedAtIso,
        finishedAt: finishedAtIso,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      });
    });
  });
}

export const shellGeminiRuntime: GeminiWorkerRuntime = {
  run: async (input) => await runGeminiWithArgs(buildGeminiShellArgs(input)),
};

export const interactiveShellGeminiRuntime: GeminiWorkerRuntime = {
  run: async (input) => await runGeminiWithArgs(buildGeminiInteractiveShellArgs(input)),
};
