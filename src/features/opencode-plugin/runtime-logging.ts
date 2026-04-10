import type { OpenCodePluginContext } from "./resolve-scope.js";

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
    return;
  }

  await log({
    body: entry,
  });
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
