import { readFile } from "node:fs/promises";

import { normalizeWorkflowSpec, type OrchestrateWorkflowSpec } from "./workflow-spec.js";

export async function parseOrchestrateCliArgs(
  argv: string[],
  io: { readFileText?: (filePath: string) => Promise<string>; readStdinText?: () => Promise<string> } = {},
): Promise<{ dryRun: boolean; spec: OrchestrateWorkflowSpec }> {
  let filePath: string | undefined;
  let cwd: string | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      filePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--cwd") {
      cwd = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg?.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!filePath) {
    throw new Error("--file is required.");
  }
  const content = filePath === "-"
    ? await (io.readStdinText ? io.readStdinText() : new Promise<string>((resolve, reject) => {
        let text = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { text += chunk; });
        process.stdin.on("end", () => resolve(text));
        process.stdin.on("error", reject);
      }))
    : await (io.readFileText ? io.readFileText(filePath) : readFile(filePath, "utf8"));
  const parsed = JSON.parse(content) as OrchestrateWorkflowSpec;
  validateWorkflowShape(parsed);
  validateWorkflowTemplates(parsed);
  return { dryRun, spec: normalizeWorkflowSpec(parsed, cwd) };
}

function validateWorkflowShape(spec: OrchestrateWorkflowSpec): void {
  if (spec.mode === "parallel") {
    if (!Array.isArray(spec.jobs) || spec.jobs.length === 0) {
      throw new Error("Parallel workflows require at least one job.");
    }
    if (spec.maxConcurrency !== undefined && (!Number.isInteger(spec.maxConcurrency) || spec.maxConcurrency <= 0)) {
      throw new Error("maxConcurrency must be a positive integer.");
    }
  }
  if (spec.mode === "sequential" && (!Array.isArray(spec.steps) || spec.steps.length === 0)) {
    throw new Error("Sequential workflows require at least one step.");
  }
  if (spec.timeoutMs !== undefined && (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs <= 0)) {
    throw new Error("timeoutMs must be a positive integer.");
  }
}

function validateWorkflowTemplates(spec: OrchestrateWorkflowSpec): void {
  const jobs = spec.mode === "parallel" ? spec.jobs : spec.steps;
  for (const job of jobs) {
    const prompt = job.input.prompt;
    const matches = prompt.matchAll(/{{\s*([a-zA-Z0-9_]+)\(/g);
    for (const match of matches) {
      const helper = match[1];
      if (helper && helper !== "default" && helper !== "json") {
        throw new Error(`Unknown template helper '${helper}'.`);
      }
    }
  }
}
