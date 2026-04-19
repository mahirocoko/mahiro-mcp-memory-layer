import { describe, expect, it } from "vitest";

import { runOpenCodeCallbackReminderPoc } from "../src/features/opencode-plugin/callback-reminder-poc.js";

describe("runOpenCodeCallbackReminderPoc", () => {
  it("delivers a synthetic session reminder for a completed tracked workflow", async () => {
    const result = await runOpenCodeCallbackReminderPoc();

    expect(result.onReminderCallCount).toBe(1);
    expect(result.toastCallCount).toBe(1);
    expect(result.logCallCount).toBe(1);
    expect(result.promptCalls).toHaveLength(1);
    expect(result.promptCalls[0]?.text).toContain("<system-reminder>");
    expect(result.promptCalls[0]?.text).toContain(`[BACKGROUND TASK COMPLETED]`);
    expect(result.promptCalls[0]?.text).toContain(`requestId: ${result.requestId}`);
    expect(result.promptCalls[0]?.text).toContain(`taskId: ${result.taskId}`);
    expect(result.promptCalls[0]?.text).toContain("Use get_orchestration_result with this requestId");
    expect(result.promptCalls[0]?.metadata).toMatchObject({
      source: "mahiro-mcp-memory-layer",
      kind: "async-task-reminder",
      requestId: result.requestId,
      taskId: result.taskId,
    });
  });
});
