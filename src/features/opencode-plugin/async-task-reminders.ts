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
  readonly reminderToken: string;
  readonly dedupeKey: string;
  readonly parentSessionId: string;
  readonly requestId: string;
  readonly taskId?: string;
  readonly status: AsyncTaskTerminalStatus;
  readonly resultTool: string;
  readonly recommendedFollowUp: string;
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly message: string;
  readonly sessionPrompt: string;
}

export interface OpenCodeAsyncTaskReminderRegistry {
  readonly deliveredReminderKeys: Set<string>;
}

export interface BuildOpenCodeAsyncTaskReminderInput {
  readonly parentSessionId?: string;
  readonly requestId: string;
  readonly taskId?: string;
  readonly status: AsyncTaskTerminalStatus | "running";
  readonly resultTool: string;
  readonly capabilities?: OpenCodePluginRuntimeCapabilities;
  readonly remindersEnabled?: boolean;
}

export function createOpenCodeAsyncTaskReminderRegistry(): OpenCodeAsyncTaskReminderRegistry {
  return {
    deliveredReminderKeys: new Set<string>(),
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

export function buildOpenCodeAsyncTaskReminder(
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

  if (registry.deliveredReminderKeys.has(dedupeKey)) {
    return null;
  }

  return {
    reminderId: `async-task:${dedupeKey}`,
    reminderToken: dedupeKey,
    dedupeKey,
    parentSessionId,
    requestId: input.requestId,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    status: input.status,
    resultTool: input.resultTool,
    recommendedFollowUp: input.resultTool,
    nextArgs: {
      requestId: input.requestId,
    },
    message: buildAsyncTaskReminderMessage(input.requestId, input.status, input.resultTool),
    sessionPrompt: buildAsyncTaskReminderPrompt({
      requestId: input.requestId,
      taskId: input.taskId,
      status: input.status,
      resultTool: input.resultTool,
    }),
  };
}

export function markOpenCodeAsyncTaskReminderDelivered(
  registry: OpenCodeAsyncTaskReminderRegistry,
  reminder: OpenCodeAsyncTaskReminder,
): boolean {
  if (registry.deliveredReminderKeys.has(reminder.dedupeKey)) {
    return false;
  }

  registry.deliveredReminderKeys.add(reminder.dedupeKey);
  return true;
}

export function consumeOpenCodeAsyncTaskReminder(
  registry: OpenCodeAsyncTaskReminderRegistry,
  input: BuildOpenCodeAsyncTaskReminderInput,
): OpenCodeAsyncTaskReminder | null {
  const reminder = buildOpenCodeAsyncTaskReminder(registry, input);

  if (!reminder) {
    return null;
  }

  markOpenCodeAsyncTaskReminderDelivered(registry, reminder);
  return reminder;
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

function buildAsyncTaskReminderPrompt(input: {
  readonly requestId: string;
  readonly taskId?: string;
  readonly status: AsyncTaskTerminalStatus;
  readonly resultTool: string;
}): string {
  const lines = [
    "<system-reminder>",
    "[BACKGROUND TASK COMPLETED]",
    `requestId: ${input.requestId}`,
    ...(input.taskId ? [`taskId: ${input.taskId}`] : []),
    `status: ${input.status}`,
    `Use ${input.resultTool} with this requestId to inspect the stored result and continue the operator loop in this same session.`,
    "</system-reminder>",
  ];

  return lines.join("\n");
}
