import { describe, expect, it } from "vitest";

import { inspectGeminiPane } from "../src/features/gemini/runtime/tmux/gemini-pane-state.js";

describe("inspectGeminiPane", () => {
  it("detects approval prompts", () => {
    expect(inspectGeminiPane("Approve this action?\nChoose an option")).toMatchObject({
      paneState: "approval_required",
      approvalPrompt: "Approve this action?",
    });
  });

  it("detects unhealthy Gemini CLI API 400 sessions", () => {
    expect(inspectGeminiPane("API Error 400:\nPlease ensure that the number of function response parts is equal to the number of function call parts of the function call turn.")).toMatchObject({
      paneState: "unhealthy",
      paneStateReason: "api_error_400_function_call_mismatch",
    });
  });

  it("detects thinking panes", () => {
    expect(inspectGeminiPane("Thinking...\nWorking through the prompt")).toMatchObject({
      paneState: "thinking",
    });
  });
});
