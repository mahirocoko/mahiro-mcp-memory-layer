export type RetrievalEvalCliFormat = "json" | "text";

export interface RetrievalEvalCliArgs {
  readonly format: RetrievalEvalCliFormat;
}

export function parseRetrievalEvalCliArgs(argv: readonly string[]): RetrievalEvalCliArgs {
  let format: RetrievalEvalCliFormat = "json";

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
      case "--format":
        format = readFormatFlagValue(token, nextValue);
        index += 1;
        break;
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  return { format };
}

function readStringFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readFormatFlagValue(flag: string, value: string | undefined): RetrievalEvalCliFormat {
  const parsed = readStringFlagValue(flag, value);

  if (parsed !== "json" && parsed !== "text") {
    throw new Error(`${flag} must be one of: json, text.`);
  }

  return parsed;
}
