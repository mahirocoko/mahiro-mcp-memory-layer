import type { OpenCodePluginContext } from "./resolve-scope.js";
import type { OpenCodeAsyncTaskReminder } from "./async-task-reminders.js";
import type { OpenCodePluginSessionReminderSupport } from "./session-reminder-support.js";

export async function deliverSessionReminder(
  context: OpenCodePluginContext,
  reminder: OpenCodeAsyncTaskReminder,
  support: OpenCodePluginSessionReminderSupport,
): Promise<boolean> {
  if (!support.sessionPromptAsyncAvailable) {
    return false;
  }

  const promptAsync = context.client.session?.promptAsync;

  if (typeof promptAsync !== "function") {
    return true;
  }

  await promptAsync({
    path: {
      id: reminder.parentSessionId,
    },
    body: {
      parts: [
        {
          type: "text",
          text: reminder.sessionPrompt,
          synthetic: true,
          metadata: {
            source: "mahiro-mcp-memory-layer",
            kind: "async-task-reminder",
            requestId: reminder.requestId,
            reminderToken: reminder.reminderToken,
            ...(reminder.taskId ? { taskId: reminder.taskId } : {}),
          },
        },
      ],
    },
    query: {
      directory: context.directory,
    },
  });

  if (support.tuiShowToastAvailable) {
    await context.client.tui
      .showToast({
        body: {
          title: reminder.status === "completed" ? "Background task completed" : "Background task update",
          message: reminder.message,
          variant: reminder.status === "completed" ? "success" : "warning",
        },
        query: {
          directory: context.directory,
        },
      })
      .catch(() => undefined);
  }

  return true;
}
