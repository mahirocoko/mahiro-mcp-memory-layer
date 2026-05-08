import { stdout, stderr } from "node:process";

import type { WikiCanonicalRecordReader } from "./selector.js";
import { runWikiMaterialization } from "./materialize.js";

export interface WikiMaterializerCliArgs {
  readonly projectId: string;
  readonly containerId: string;
  readonly outputDir?: string;
  readonly includeHypotheses: boolean;
}

export interface WikiMaterializerCliDependencies {
  readonly runWikiMaterialization?: typeof runWikiMaterialization;
  readonly logStore?: WikiCanonicalRecordReader;
  readonly stdout?: Pick<typeof stdout, "write">;
  readonly stderr?: Pick<typeof stderr, "write">;
  readonly materializerVersion?: string;
}

export interface WikiMaterializerCliResult {
  readonly exitCode: number;
  readonly output?: string;
  readonly error?: string;
}

export function parseWikiMaterializerCliArgs(argv: readonly string[]): WikiMaterializerCliArgs {
  let projectId = "";
  let containerId = "";
  let outputDir: string | undefined;
  let includeHypotheses = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    switch (token) {
      case "--project-id":
        projectId = readRequiredValue(token, argv[++index]);
        break;
      case "--container-id":
        containerId = readRequiredValue(token, argv[++index]);
        break;
      case "--output-dir":
        outputDir = readRequiredValue(token, argv[++index]);
        break;
      case "--include-hypotheses":
        includeHypotheses = true;
        break;
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  if (!projectId) {
    throw new Error("--project-id is required.");
  }

  if (!containerId) {
    throw new Error("--container-id is required.");
  }

  return { projectId, containerId, outputDir, includeHypotheses };
}

export async function runWikiMaterializerCli(
  argv: readonly string[],
  dependencies: WikiMaterializerCliDependencies = {},
): Promise<WikiMaterializerCliResult> {
  try {
    const args = parseWikiMaterializerCliArgs(argv);
    const result = await (dependencies.runWikiMaterialization ?? runWikiMaterialization)({
      projectId: args.projectId,
      containerId: args.containerId,
      outputDir: args.outputDir,
      includeHypotheses: args.includeHypotheses,
      logStore: dependencies.logStore,
      materializerVersion: dependencies.materializerVersion,
    });
    const output = formatWikiMaterializerCliOutput({
      scopeDirectory: result.layout.scopeDirectory,
      manifestPath: result.layout.manifestFilePath,
      includedCount: result.manifest.includedCount,
      excludedCount: result.manifest.excludedCount,
      verificationHints: buildVerificationHints(result.manifest.filters.mode, result.manifest.filters.excludeReviewStatuses),
    });
    (dependencies.stdout ?? stdout).write(`${output}\n`);
    return { exitCode: 0, output };
  } catch (error) {
    const message = formatCliError(error);
    (dependencies.stderr ?? stderr).write(`${message}\n`);
    return { exitCode: 1, error: message };
  }
}

export function formatWikiMaterializerCliOutput(input: {
  readonly scopeDirectory: string;
  readonly manifestPath: string;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly verificationHints: readonly string[];
}): string {
  return [
    `Wiki materialization scope: ${input.scopeDirectory}`,
    `Manifest path: ${input.manifestPath}`,
    `Included records: ${input.includedCount}`,
    `Excluded records: ${input.excludedCount}`,
    "Verification hints:",
    ...input.verificationHints.map((hint) => `- ${hint}`),
  ].join("\n");
}

function buildVerificationHints(mode: string, excludedReviewStatuses: readonly string[]): readonly string[] {
  const hints = [
    mode === "include_hypotheses" ? "hypotheses included" : "verified records only",
  ];

  if (excludedReviewStatuses.length > 0) {
    hints.push(`excluded review statuses: ${excludedReviewStatuses.join(", ")}`);
  }

  return hints;
}

function readRequiredValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown CLI error.";
}
