import type { OpenCodePluginEvent, OpenCodePluginContext } from "./resolve-scope.js";
import type { OpenCodePluginSessionState } from "./runtime-state.js";
import { logCompactionOutcome, toErrorMessage } from "./runtime-logging.js";

export interface OpenCodePluginCompactionInput {
  readonly sessionID?: unknown;
  readonly info?: unknown;
  readonly properties?: Record<string, unknown>;
}

export interface OpenCodePluginCompactionOutput {
  context?: unknown;
  prompt?: unknown;
}

export function createCompactionEvent(input: OpenCodePluginCompactionInput): OpenCodePluginEvent {
  const properties = asRecord(input.properties);
  const sessionId =
    toNonEmptyString(input.sessionID) ??
    toNonEmptyString(asRecord(input.info)?.id) ??
    toNonEmptyString(properties?.sessionID) ??
    toNonEmptyString(asRecord(properties?.info)?.id);

  return {
    type: "experimental.session.compacting",
    properties: {
      ...(sessionId ? { sessionID: sessionId } : {}),
    },
  };
}

export async function applyCompactionContinuity(
  context: OpenCodePluginContext,
  sessionState: OpenCodePluginSessionState | undefined,
  output: OpenCodePluginCompactionOutput,
): Promise<void> {
  if (!sessionState) {
    await logCompactionOutcome(context, "skipped", {
      reason: "missing_session_state",
    });
    return;
  }

  const continuityBlock = buildCompactionContinuityBlock(sessionState);

  if (!continuityBlock) {
    await logCompactionOutcome(context, "skipped", {
      sessionId: sessionState.sessionId,
      reason: "missing_cached_session_state",
    });
    return;
  }

  if (toNonEmptyString(output.prompt)) {
    await logCompactionOutcome(context, "degraded", {
      sessionId: sessionState.sessionId,
      reason: "output_prompt_already_set",
    });
    return;
  }

  const contextAppender = asCompactionContextAppender(output.context);

  if (!contextAppender) {
    await logCompactionOutcome(context, "degraded", {
      sessionId: sessionState.sessionId,
      reason: "output_context_not_appendable",
    });
    return;
  }

  try {
    contextAppender.push(continuityBlock);
    await logCompactionOutcome(context, "invoked", {
      sessionId: sessionState.sessionId,
      reason: "cached_session_state_appended",
    });
  } catch (error) {
    await logCompactionOutcome(context, "error", {
      sessionId: sessionState.sessionId,
      reason: "context_append_failed",
      error: toErrorMessage(error),
    });
  }
}

function buildCompactionContinuityBlock(sessionState: OpenCodePluginSessionState): string | undefined {
  const sections = [
    sessionState.wakeUp
      ? `### Session wake-up\n${sessionState.wakeUp.wakeUpContext}`
      : undefined,
    sessionState.prepareTurn
      ? `### Latest turn precompute\n${sessionState.prepareTurn.context}`
      : undefined,
    sessionState.prepareHostTurn
      ? `### Latest idle persistence\n${sessionState.prepareHostTurn.context}`
      : undefined,
  ].filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return undefined;
  }

  return [`## Continuity cache`, ...sections].join("\n\n");
}

function asCompactionContextAppender(value: unknown): { push: (entry: string) => void } | undefined {
  if (Array.isArray(value)) {
    return {
      push: (entry) => {
        value.push(entry);
      },
    };
  }

  const record = asRecord(value);
  const push = record?.push;

  if (typeof push !== "function") {
    return undefined;
  }

  return {
    push: (entry) => {
      push.call(value, entry);
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}
