import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { newId } from "../../lib/ids.js";
import { OrchestrationResultStore } from "../orchestration/observability/orchestration-result-store.js";
import type { OrchestrationRunResult } from "../orchestration/run-orchestration-workflow.js";
import type { OrchestrateWorkflowSpec } from "../orchestration/workflow-spec.js";
import { createOpenCodeAsyncTaskTracker } from "./async-task-reminder-bridge.js";

interface CallbackReminderPocPromptCall {
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CallbackReminderPocResult {
  readonly requestId: string;
  readonly taskId: string;
  readonly promptCalls: readonly CallbackReminderPocPromptCall[];
  readonly toastCallCount: number;
  readonly logCallCount: number;
  readonly onReminderCallCount: number;
}

const callbackReminderPocSpec: OrchestrateWorkflowSpec = {
  mode: "parallel",
  jobs: [
    {
      kind: "gemini",
      input: {
        taskId: "callback_reminder_poc",
        prompt: "Proof callback reminder flow.",
        model: "gemini-3.1-pro-preview",
      },
      workerRuntime: "shell",
    },
  ],
};

function buildCompletedPocResult(requestId: string): OrchestrationRunResult {
  const timestamp = new Date().toISOString();

  return {
    requestId,
    mode: "parallel",
    status: "completed",
    results: [],
    summary: {
      totalJobs: 1,
      finishedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
      skippedJobs: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
      durationMs: 0,
    },
  };
}

export async function runOpenCodeCallbackReminderPoc(): Promise<CallbackReminderPocResult> {
  const promptCalls: CallbackReminderPocPromptCall[] = [];
  const toastCalls: unknown[] = [];
  const logCalls: unknown[] = [];
  const reminderCalls: unknown[] = [];
  const requestId = newId("workflow");
  const taskId = "callback_reminder_poc";
  const storeDirectory = await mkdtemp(path.join(os.tmpdir(), "mahiro-callback-poc-"));
  const resultStore = new OrchestrationResultStore(storeDirectory);

  await resultStore.writeCompleted({
    requestId,
    source: "mcp",
    spec: callbackReminderPocSpec,
    result: buildCompletedPocResult(requestId),
  });

  const tracker = createOpenCodeAsyncTaskTracker({
    context: {
      directory: "/callback-poc",
      client: {
        session: {
          promptAsync: async (input: { body?: { parts?: Array<{ text?: string; metadata?: Record<string, unknown> }> } }) => {
            const part = input.body?.parts?.[0];
            promptCalls.push({
              text: part?.text ?? "",
              metadata: part?.metadata,
            });
          },
        },
        tui: {
          showToast: async (input: unknown) => {
            toastCalls.push(input);
            return true;
          },
        },
        app: {
          log: async (input: unknown) => {
            logCalls.push(input);
          },
        },
      },
    } as never,
    capabilities: async () => ({
      mode: "plugin-native+mcp",
      memory: {
        toolNames: ["memory_context"],
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
      },
      orchestration: {
        available: true,
        serverName: "mahiro-mcp-memory-layer",
        toolNames: ["start_agent_task", "get_orchestration_result"],
        activation: "source-checkout-mcp-injection",
      },
      facade: {
        categoryRoutingAvailable: true,
        categoryRoutes: {},
        remindersConfigured: true,
        sessionVisibleRemindersAvailable: true,
      },
    }),
    remindersEnabled: true,
    resultStore,
    pollIntervalMs: 10,
    timeoutMs: 2_000,
    onReminder: async (reminder) => {
      reminderCalls.push(reminder);
    },
  });

  await tracker.trackAsyncTask({
    parentSessionId: "parent-session-1",
    requestId,
    taskId,
    status: "running",
    resultTool: "get_orchestration_result",
  });

  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));

  return {
    requestId,
    taskId,
    promptCalls,
    toastCallCount: toastCalls.length,
    logCallCount: logCalls.length,
    onReminderCallCount: reminderCalls.length,
  };
}
