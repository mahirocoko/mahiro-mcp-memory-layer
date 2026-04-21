import { describe, expect, it, vi } from "vitest";

import { runWorkerJob } from "../src/features/orchestration/run-worker-job.js";

describe("runWorkerJob", () => {
  it("parses approval-required Gemini results without retrying", async () => {
    const runtime = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          response: "Awaiting approval",
          approvalRequired: true,
          approvalPrompt: "Approve this action?",
          subagentId: "subagent_approval",
          sessionName: "session-approval",
          paneId: "%12",
          stats: {
            model: "gemini-3.1-pro-preview",
          },
        }),
        stderr: "",
        exitCode: 0,
        signal: null,
        timedOut: false,
        startedAt: "2026-04-20T00:00:00.000Z",
        finishedAt: "2026-04-20T00:00:01.000Z",
        durationMs: 1000,
      }),
    };

    const result = await runWorkerJob({
      kind: "gemini",
      input: {
        taskId: "gemini_approval",
        prompt: "Do the work.",
        model: "gemini-3.1-pro-preview",
      },
      dependencies: {
        runtime,
      },
      retries: 2,
      retryDelayMs: 1,
    });

    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: "gemini",
      retryCount: 0,
      result: {
        status: "approval_required",
        requestedModel: "gemini-3.1-pro-preview",
        reportedModel: "gemini-3.1-pro-preview",
        approvalPrompt: "Approve this action?",
        subagentId: "subagent_approval",
        sessionName: "session-approval",
        paneId: "%12",
      },
    });
  });

  it("preserves pane evidence for timed out Gemini sessions", async () => {
    const runtime = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          response: "Thinking...",
          paneState: "unhealthy",
          paneStateReason: "api_error_400_function_call_mismatch",
          lastVisiblePaneExcerpt: "API Error 400:\nPlease ensure that the number of function response parts is equal to the number of function call parts of the function call turn.",
          promptSubmissionAttempted: true,
          subagentId: "subagent_unhealthy",
          sessionName: "session-unhealthy",
          paneId: "%99",
          stats: {
            model: "gemini-3.1-pro-preview",
          },
        }),
        stderr: "",
        exitCode: null,
        signal: "SIGTERM",
        timedOut: true,
        startedAt: "2026-04-21T00:00:00.000Z",
        finishedAt: "2026-04-21T00:00:05.000Z",
        durationMs: 5000,
      }),
    };

    const result = await runWorkerJob({
      kind: "gemini",
      input: {
        taskId: "gemini_timeout",
        prompt: "Do the work.",
        model: "gemini-3.1-pro-preview",
      },
      dependencies: {
        runtime,
      },
    });

    expect(result).toMatchObject({
      kind: "gemini",
      retryCount: 0,
      result: {
        status: "timeout",
        paneState: "unhealthy",
        paneStateReason: "api_error_400_function_call_mismatch",
        lastVisiblePaneExcerpt: expect.stringContaining("API Error 400"),
        promptSubmissionAttempted: true,
        subagentId: "subagent_unhealthy",
        sessionName: "session-unhealthy",
        paneId: "%99",
        error: "Gemini command timed out after pane state 'api_error_400_function_call_mismatch'.",
      },
    });
  });
});
