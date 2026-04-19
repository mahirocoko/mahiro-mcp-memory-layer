import type { GeminiWorkerInput } from "../../types.js";

function buildAllowedMcpServerArgs(input: GeminiWorkerInput): string[] {
  if (input.allowedMcpServerNames === undefined) {
    return [];
  }

  return [
    "--allowed-mcp-server-names",
    input.allowedMcpServerNames === "none" ? "none" : input.allowedMcpServerNames.join(","),
  ];
}

export function buildGeminiShellArgs(input: GeminiWorkerInput): string[] {
  return [
    "-m",
    input.model,
    ...(input.approvalMode !== undefined ? ["--approval-mode", input.approvalMode] : []),
    ...buildAllowedMcpServerArgs(input),
    "-p",
    input.prompt,
    "--output-format",
    "json",
  ];
}

export function buildGeminiInteractiveShellArgs(input: GeminiWorkerInput): string[] {
  return [
    "-m",
    input.model,
    ...(input.approvalMode !== undefined ? ["--approval-mode", input.approvalMode] : []),
    ...buildAllowedMcpServerArgs(input),
    "--screen-reader",
    "-i",
    input.prompt,
  ];
}
