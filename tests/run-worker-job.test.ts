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
});
