import type { OpenCodePluginContext } from "./resolve-scope.js";

const openCodePluginDebugStderrEnvName = "MAHIRO_OPENCODE_PLUGIN_DEBUG_STDERR";

export async function logCompactionOutcome(
  context: OpenCodePluginContext,
  outcome: "invoked" | "skipped" | "degraded" | "error",
  extra: Record<string, unknown>,
): Promise<void> {
  await logPluginLifecycle(context, {
    service: "opencode-memory-plugin",
    level: outcome === "error" ? "warn" : "info",
    message: `OpenCode plugin experimental.session.compacting ${outcome}.`,
    extra,
  });
}

export async function logPluginLifecycle(
  context: OpenCodePluginContext,
  entry: {
    readonly service: string;
    readonly level: "debug" | "info" | "warn" | "error";
    readonly message: string;
    readonly extra?: Record<string, unknown>;
  },
): Promise<void> {
  const appClient = asRecord(context.client)?.app;
  const log = asRecord(appClient)?.log;

  if (typeof log !== "function") {
    writeDebugLifecycleToStderr("missing_app_logger", entry);
    return;
  }

  try {
    await log({
      body: entry,
    });
  } catch (error) {
    writeDebugLifecycleToStderr("app_logger_failed", {
      ...entry,
      extra: {
        ...(entry.extra ?? {}),
        loggingError: toErrorMessage(error),
      },
    });
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function writeDebugLifecycleToStderr(reason: "missing_app_logger" | "app_logger_failed", entry: {
  readonly service: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly extra?: Record<string, unknown>;
}): void {
  if (!isDebugStderrEnabled()) {
    return;
  }

  process.stderr.write(
    `[opencode-memory-plugin:${reason}] ${JSON.stringify({
      ...entry,
      extra: {
        ...(entry.extra ?? {}),
      },
    })}\n`,
  );
}

function isDebugStderrEnabled(): boolean {
  const envValue = process.env[openCodePluginDebugStderrEnvName];

  return envValue === "1" || envValue === "true";
}
