import { getAppEnv } from "../../config/env.js";
import { OrchestrationResultStore } from "../orchestration/observability/orchestration-result-store.js";
import { waitForOrchestrationResult } from "../orchestration/wait-for-orchestration-result.js";
import {
  buildOpenCodeAsyncTaskReminder,
  createOpenCodeAsyncTaskReminderRegistry,
  markOpenCodeAsyncTaskReminderDelivered,
} from "./async-task-reminders.js";
import type { OpenCodePluginContext } from "./resolve-scope.js";
import type { OpenCodePluginRuntimeCapabilities } from "./runtime-capabilities.js";
import { deliverSessionReminder } from "./session-reminder-delivery.js";
import { detectOpenCodePluginSessionReminderSupport } from "./session-reminder-support.js";

const DEFAULT_ASYNC_TASK_REMINDER_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_ASYNC_TASK_REMINDER_POLL_INTERVAL_MS = 1_000;

export interface OpenCodeAsyncTaskTracker {
  trackAsyncTask(input: {
    readonly parentSessionId?: string;
    readonly requestId?: string;
    readonly taskId?: string;
    readonly status?: string;
    readonly resultTool?: string;
  }): Promise<void>;
}

export function createOpenCodeAsyncTaskTracker(input: {
  readonly context: OpenCodePluginContext;
  readonly capabilities: () => Promise<OpenCodePluginRuntimeCapabilities>;
  readonly remindersEnabled: boolean;
  readonly onReminder?: (reminder: OpenCodeAsyncTaskReminderLike) => Promise<void> | void;
}): OpenCodeAsyncTaskTracker {
  const resultStore = new OrchestrationResultStore(getAppEnv().dataPaths.orchestrationResultDirectory);
  const reminderRegistry = createOpenCodeAsyncTaskReminderRegistry();
  const trackedRequestIds = new Set<string>();

  return {
    async trackAsyncTask(task) {
      if (task.status !== "running" || task.resultTool !== "get_orchestration_result" || !task.requestId) {
        return;
      }

      const capabilities = await input.capabilities();

      if (
        !input.remindersEnabled ||
        !task.parentSessionId ||
        !capabilities.facade.sessionVisibleRemindersAvailable ||
        trackedRequestIds.has(task.requestId)
      ) {
        return;
      }

      const requestId = task.requestId;
      const resultTool = task.resultTool;

      trackedRequestIds.add(requestId);

      void waitForOrchestrationResult(resultStore, requestId, {
        pollIntervalMs: DEFAULT_ASYNC_TASK_REMINDER_POLL_INTERVAL_MS,
        timeoutMs: DEFAULT_ASYNC_TASK_REMINDER_TIMEOUT_MS,
      })
        .then(async (response) => {
          const reminder = buildOpenCodeAsyncTaskReminder(reminderRegistry, {
            parentSessionId: task.parentSessionId,
            requestId,
            taskId: task.taskId,
            status: response.status,
            resultTool,
            capabilities,
            remindersEnabled: input.remindersEnabled,
          });

          if (!reminder) {
            return;
          }

          const deliverySupport = detectOpenCodePluginSessionReminderSupport(input.context, {
            sessionVisibleRemindersAvailable: capabilities.facade.sessionVisibleRemindersAvailable,
          });

          const delivered = await deliverSessionReminder(input.context, reminder, deliverySupport).catch(() => false);

          if (!delivered) {
            return;
          }

          markOpenCodeAsyncTaskReminderDelivered(reminderRegistry, reminder);

          await emitReminderLog(input.context, reminder);
          await input.onReminder?.(reminder);
        })
        .finally(() => {
          trackedRequestIds.delete(requestId);
        });
    },
  };
}

interface OpenCodeAsyncTaskReminderLike {
  readonly parentSessionId: string;
  readonly requestId: string;
  readonly taskId?: string;
  readonly reminderToken: string;
  readonly status: string;
  readonly resultTool: string;
  readonly recommendedFollowUp: string;
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly message: string;
}

async function emitReminderLog(
  context: OpenCodePluginContext,
  reminder: OpenCodeAsyncTaskReminderLike,
): Promise<void> {
  const logFn = context.client.app?.log;

  if (typeof logFn !== "function") {
    return;
  }

  await logFn({
    body: {
      service: "opencode-async-task-reminder",
      level: "info",
      message: reminder.message,
        extra: {
          parentSessionId: reminder.parentSessionId,
          requestId: reminder.requestId,
          reminderToken: reminder.reminderToken,
          ...(reminder.taskId ? { taskId: reminder.taskId } : {}),
          status: reminder.status,
          resultTool: reminder.resultTool,
          recommendedFollowUp: reminder.recommendedFollowUp,
        nextArgs: reminder.nextArgs,
      },
    },
    query: {
      directory: context.directory,
    },
  });
}
