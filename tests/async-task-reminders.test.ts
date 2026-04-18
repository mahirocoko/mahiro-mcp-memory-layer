import { describe, expect, it } from "vitest";

import {
  buildOpenCodeAsyncTaskReminder,
  canEmitOpenCodeAsyncTaskReminder,
  consumeOpenCodeAsyncTaskReminder,
  createOpenCodeAsyncTaskReminderRegistry,
  markOpenCodeAsyncTaskReminderDelivered,
} from "../src/features/opencode-plugin/async-task-reminders.js";

const pluginOnlyCapabilities = {
  mode: "plugin-native" as const,
  memory: {
    toolNames: ["memory_context"],
    sessionStartWakeUpAvailable: true as const,
    turnPreflightAvailable: true as const,
    idlePersistenceAvailable: true as const,
    memoryContextToolAvailable: true as const,
  },
  orchestration: {
    available: false,
    toolNames: [],
    activation: "unavailable" as const,
  },
  facade: {
    categoryRoutingAvailable: true as const,
    categoryRoutes: {},
    remindersConfigured: false,
    sessionVisibleRemindersAvailable: false,
  },
};

const pluginPlusMcpCapabilities = {
  ...pluginOnlyCapabilities,
  mode: "plugin-native+mcp" as const,
  orchestration: {
    available: true,
    serverName: "mahiro-mcp-memory-layer",
    toolNames: ["get_orchestration_result"],
    activation: "source-checkout-mcp-injection" as const,
  },
  facade: {
    categoryRoutingAvailable: true as const,
    categoryRoutes: {},
    remindersConfigured: true,
    sessionVisibleRemindersAvailable: true,
  },
};

describe("canEmitOpenCodeAsyncTaskReminder", () => {
  it("requires both a parent session and orchestration availability", () => {
    expect(
      canEmitOpenCodeAsyncTaskReminder({
        parentSessionId: "session-1",
        capabilities: pluginOnlyCapabilities,
      }),
    ).toBe(false);

    expect(
      canEmitOpenCodeAsyncTaskReminder({
        capabilities: pluginPlusMcpCapabilities,
      }),
    ).toBe(false);

    expect(
      canEmitOpenCodeAsyncTaskReminder({
        parentSessionId: "session-1",
        remindersEnabled: true,
        capabilities: pluginPlusMcpCapabilities,
      }),
    ).toBe(true);
  });

  it("lets an explicit disable flag suppress reminders", () => {
    expect(
      canEmitOpenCodeAsyncTaskReminder({
        parentSessionId: "session-1",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("consumeOpenCodeAsyncTaskReminder", () => {
  it("builds a reminder for terminal async results when capability-gated conditions are met", () => {
    const registry = createOpenCodeAsyncTaskReminderRegistry();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "completed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).toEqual({
      reminderId: "async-task:session-1:workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed",
      reminderToken: "session-1:workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed",
      dedupeKey: "session-1:workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed",
      parentSessionId: "session-1",
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "completed",
      resultTool: "get_orchestration_result",
      recommendedFollowUp: "get_orchestration_result",
      nextArgs: {
        requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      message:
        "Background task workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa completed. Use get_orchestration_result with this requestId to inspect the stored result.",
      sessionPrompt: `<system-reminder>
[BACKGROUND TASK COMPLETED]
requestId: workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
status: completed
Use get_orchestration_result with this requestId to inspect the stored result and continue the operator loop in this same session.
</system-reminder>`,
    });
  });

  it("does not emit reminders for running results or unsupported runtime paths", () => {
    const registry = createOpenCodeAsyncTaskReminderRegistry();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_running",
        status: "running",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).toBeNull();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_plugin_only",
        status: "runner_failed",
        resultTool: "get_orchestration_result",
        capabilities: pluginOnlyCapabilities,
        remindersEnabled: true,
      }),
    ).toBeNull();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_disabled",
        status: "completed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
      }),
    ).toBeNull();
  });

  it("deduplicates repeated terminal notifications for the same session, request, and status", () => {
    const registry = createOpenCodeAsyncTaskReminderRegistry();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_duplicate",
        status: "runner_failed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).not.toBeNull();

    expect(
      consumeOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_duplicate",
        status: "runner_failed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).toBeNull();
  });

  it("marks reminders as delivered only after explicit delivery finalization", () => {
    const registry = createOpenCodeAsyncTaskReminderRegistry();
    const reminder = buildOpenCodeAsyncTaskReminder(registry, {
      parentSessionId: "session-1",
      requestId: "workflow_delivery",
      status: "completed",
      resultTool: "get_orchestration_result",
      capabilities: pluginPlusMcpCapabilities,
      remindersEnabled: true,
    });

    expect(reminder).not.toBeNull();
    expect(
      buildOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_delivery",
        status: "completed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).not.toBeNull();

    expect(markOpenCodeAsyncTaskReminderDelivered(registry, reminder!)).toBe(true);
    expect(
      buildOpenCodeAsyncTaskReminder(registry, {
        parentSessionId: "session-1",
        requestId: "workflow_delivery",
        status: "completed",
        resultTool: "get_orchestration_result",
        capabilities: pluginPlusMcpCapabilities,
        remindersEnabled: true,
      }),
    ).toBeNull();
  });
});
