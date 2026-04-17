import type { OpenCodePluginRuntimeCapabilities } from "./runtime-capabilities.js";

export type AsyncTaskTerminalStatus =
  | "completed"
  | "failed"
  | "step_failed"
  | "timed_out"
  | "runner_failed"
  | "command_failed"
  | "invalid_json"
  | "invalid_structured_output"
  | "empty_output"
  | "timeout"
  | "spawn_error"
  | "invalid_input";

export interface OpenCodeAsyncTaskReminder {
  readonly reminderId: string;
  readonly dedupeKey: string;
  readonly parentSessionId: string;
  readonly requestId: string;
  readonly status: AsyncTaskTerminalStatus;
  readonly resultTool: string;
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly message: string;
}

export interface OpenCodeAsyncTaskReminderRegistry {
  readonly emittedReminderKeys: Set<string>;
}

export interface BuildOpenCodeAsyncTaskReminderInput {
  readonly parentSessionId?: string;
  readonly requestId: string;
  readonly status: AsyncTaskTerminalStatus | "running";
  readonly resultTool: string;
  readonly capabilities?: OpenCodePluginRuntimeCapabilities;
  readonly remindersEnabled?: boolean;
}

export function createOpenCodeAsyncTaskReminderRegistry(): OpenCodeAsyncTaskReminderRegistry {
  return {
    emittedReminderKeys: new Set<string>(),
  };
}

export function canEmitOpenCodeAsyncTaskReminder(input: {
  readonly parentSessionId?: string;
  readonly capabilities?: OpenCodePluginRuntimeCapabilities;
  readonly remindersEnabled?: boolean;
}): boolean {
  if (input.remindersEnabled !== true) {
    return false;
  }

  if (!input.parentSessionId) {
    return false;
  }

  return Boolean(input.capabilities?.facade.sessionVisibleRemindersAvailable);
}

export function consumeOpenCodeAsyncTaskReminder(
  registry: OpenCodeAsyncTaskReminderRegistry,
  input: BuildOpenCodeAsyncTaskReminderInput,
): OpenCodeAsyncTaskReminder | null {
  if (input.status === "running") {
    return null;
  }

  if (
    !canEmitOpenCodeAsyncTaskReminder({
      parentSessionId: input.parentSessionId,
      capabilities: input.capabilities,
      remindersEnabled: input.remindersEnabled,
    })
  ) {
    return null;
  }

  const parentSessionId = input.parentSessionId;

  if (!parentSessionId) {
    return null;
  }

  const dedupeKey = `${parentSessionId}:${input.requestId}:${input.status}`;

  if (registry.emittedReminderKeys.has(dedupeKey)) {
    return null;
  }

  registry.emittedReminderKeys.add(dedupeKey);

  return {
    reminderId: `async-task:${dedupeKey}`,
    dedupeKey,
    parentSessionId,
    requestId: input.requestId,
    status: input.status,
    resultTool: input.resultTool,
    nextArgs: {
      requestId: input.requestId,
    },
    message: buildAsyncTaskReminderMessage(input.requestId, input.status, input.resultTool),
  };
}

function buildAsyncTaskReminderMessage(
  requestId: string,
  status: AsyncTaskTerminalStatus,
  resultTool: string,
): string {
  if (status === "completed") {
    return `Background task ${requestId} completed. Use ${resultTool} with this requestId to inspect the stored result.`;
  }

  return `Background task ${requestId} reached terminal status ${status}. Use ${resultTool} with this requestId to inspect the stored result before deciding on follow-up work.`;
}
