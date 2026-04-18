import type { OpenCodePluginContext } from "./resolve-scope.js";
import type { OpenCodePluginSessionReminderSupport } from "./session-reminder-support.js";

export async function deliverSessionTaskStart(input: {
  readonly context: OpenCodePluginContext;
  readonly support: OpenCodePluginSessionReminderSupport;
  readonly sessionId: string;
  readonly requestId: string;
  readonly taskId?: string;
  readonly prompt: string;
}): Promise<boolean> {
  if (!input.support.sessionPromptAsyncAvailable) {
    return false;
  }

  const promptAsync = input.context.client.session?.promptAsync;

  if (typeof promptAsync !== "function") {
    return false;
  }

  await promptAsync({
    path: {
      id: input.sessionId,
    },
    body: {
      parts: [
        {
          type: "text",
          text: `Task — ${buildTaskTitle(input.prompt)}`,
          synthetic: true,
          metadata: {
            source: "mahiro-mcp-memory-layer",
            kind: "async-task-start",
            requestId: input.requestId,
            ...(input.taskId ? { taskId: input.taskId } : {}),
          },
        },
      ],
    },
    query: {
      directory: input.context.directory,
    },
  });

  return true;
}

function buildTaskTitle(prompt: string): string {
  const firstLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const normalized = (firstLine ?? prompt).trim().replace(/[.。]+$/, "");

  if (normalized.length <= 72) {
    return capitalizeFirstLetter(normalized);
  }

  return `${capitalizeFirstLetter(normalized.slice(0, 69).trimEnd())}...`;
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
