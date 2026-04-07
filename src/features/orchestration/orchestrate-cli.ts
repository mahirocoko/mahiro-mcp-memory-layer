import { readFile } from "node:fs/promises";
import { stdin } from "node:process";

import { validateWorkerJobTemplates } from "./resolve-workflow-templates.js";
import { normalizeWorkflowSpec, type OrchestrateWorkflowSpec, workflowSpecSchema } from "./workflow-spec.js";

interface OrchestrateCliOptions {
  file?: string;
  cwd?: string;
  dryRun?: boolean;
}

export interface ParsedOrchestrateCliArgs {
  readonly spec: OrchestrateWorkflowSpec;
  readonly dryRun: boolean;
}

export interface ParseOrchestrateCliDependencies {
  readonly readFileText?: (filePath: string) => Promise<string>;
  readonly readStdinText?: () => Promise<string>;
}

export async function parseOrchestrateCliArgs(
  argv: readonly string[],
  dependencies: ParseOrchestrateCliDependencies = {},
): Promise<ParsedOrchestrateCliArgs> {
  const options: OrchestrateCliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const nextValue = argv[index + 1];

    switch (token) {
      case "--file":
        options.file = readFlagValue(token, nextValue);
        index += 1;
        break;
      case "--cwd":
        options.cwd = readFlagValue(token, nextValue);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  const file = options.file?.trim();

  if (!file) {
    throw new Error("--file is required.");
  }

  const readFileText = dependencies.readFileText ?? readWorkflowFile;
  const readStdinText = dependencies.readStdinText ?? readStdin;
  const rawText = file === "-" ? await readStdinText() : await readFileText(file);
  const rawJson = JSON.parse(rawText) as unknown;
  const spec = normalizeWorkflowSpec(workflowSpecSchema.parse(rawJson), options.cwd);

  if (spec.mode === "sequential") {
    for (const step of spec.steps) {
      if (typeof step === "function") {
        continue;
      }

      validateWorkerJobTemplates(step);
    }
  }

  return {
    spec,
    dryRun: options.dryRun ?? false,
  };
}

async function readWorkflowFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function readFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}
