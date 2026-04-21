import { describe, expect, it, vi } from "vitest";

import { InteractiveGeminiTmuxRuntime } from "../src/features/gemini/runtime/tmux/interactive-gemini-tmux-runtime.js";
import { inspectGeminiPane } from "../src/features/gemini/runtime/tmux/gemini-pane-state.js";

describe("InteractiveGeminiTmuxRuntime", () => {
  it("preserves approval_required interrupts instead of degrading them into timeout", async () => {
    const runtime = new InteractiveGeminiTmuxRuntime({} as never);
    (runtime as unknown as {
      subagentManager: {
        inspectSession: ReturnType<typeof vi.fn>;
        ensureSession: ReturnType<typeof vi.fn>;
        recordTask: ReturnType<typeof vi.fn>;
      };
      tmuxRuntimeOwner: {
        runInteractiveTask: ReturnType<typeof vi.fn>;
      };
    }).subagentManager = {
      inspectSession: vi.fn().mockResolvedValue(null),
      ensureSession: vi.fn().mockResolvedValue({
        subagentId: "subagent_approval",
        sessionName: "session-approval",
        paneId: "%12",
      }),
      recordTask: vi.fn().mockResolvedValue(null),
    };
    (runtime as unknown as {
      tmuxRuntimeOwner: {
        runInteractiveTask: ReturnType<typeof vi.fn>;
      };
    }).tmuxRuntimeOwner = {
      runInteractiveTask: vi.fn().mockResolvedValue({
        output: "Approve this action?",
        timedOut: false,
        completionDetected: false,
        sessionName: "session-approval",
        paneId: "%12",
        interruptedReason: "approval_required",
        matchedText: "Approve this action?",
        promptSubmissionAttempted: true,
      }),
    };

    const result = await runtime.run({
      taskId: "gemini_approval",
      prompt: "Do the task.",
      model: "gemini-3.1-pro-preview",
    });
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.timedOut).toBe(false);
    expect(parsed).toMatchObject({
      approvalRequired: true,
      approvalPrompt: "Approve this action?",
      paneState: "approval_required",
      promptSubmissionAttempted: true,
      subagentId: "subagent_approval",
      sessionName: "session-approval",
      paneId: "%12",
    });
  });
});

describe("inspectGeminiPane scrollback behavior", () => {
  it("prefers the recent pane tail over stale completed scrollback", () => {
    const output = [
      "✦ Completed old task",
      "Type your message or @path/to/file",
      ...Array.from({ length: 25 }, (_, index) => `older line ${index}`),
      "Thinking...",
      "Still working",
    ].join("\n");

    expect(inspectGeminiPane(output)).toMatchObject({
      paneState: "thinking",
    });
  });
});
