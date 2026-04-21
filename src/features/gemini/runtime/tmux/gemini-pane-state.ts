export type GeminiPaneState = "completed" | "thinking" | "approval_required" | "unhealthy" | "idle";

export interface GeminiPaneSnapshot {
  readonly paneState: GeminiPaneState;
  readonly paneStateReason?: string;
  readonly approvalPrompt?: string;
  readonly lastVisiblePaneExcerpt: string;
}

export const geminiApprovalPromptMatchers = [
  "Approve this action?",
  "Do you want to proceed?",
  "Press enter to confirm",
  "Allow this action?",
] as const;

const unhealthyPaneMatchers = [
  {
    match: "Please ensure that the number of function response parts is equal to the number of function call parts of the function call turn.",
    reason: "api_error_400_function_call_mismatch",
  },
  {
    match: "API Error 400:",
    reason: "api_error_400",
  },
] as const;

function hasGeminiThinking(output: string): boolean {
  return output.includes("Thinking...") || output.includes("Thinking…");
}

export function hasGeminiCompleted(output: string): boolean {
  return output.includes("✦ ") && output.includes("Type your message or @path/to/file");
}

export function buildGeminiPaneExcerpt(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return lines.slice(-20).join("\n");
}

export function inspectGeminiPane(output: string): GeminiPaneSnapshot {
  const excerpt = buildGeminiPaneExcerpt(output);
  const approvalPrompt = geminiApprovalPromptMatchers.find((matcher) => excerpt.includes(matcher));

  if (approvalPrompt) {
    return {
      paneState: "approval_required",
      approvalPrompt,
      lastVisiblePaneExcerpt: excerpt,
    };
  }

  const unhealthyMatch = unhealthyPaneMatchers.find((matcher) => excerpt.includes(matcher.match));
  if (unhealthyMatch) {
    return {
      paneState: "unhealthy",
      paneStateReason: unhealthyMatch.reason,
      lastVisiblePaneExcerpt: excerpt,
    };
  }

  if (hasGeminiCompleted(excerpt)) {
    return {
      paneState: "completed",
      lastVisiblePaneExcerpt: excerpt,
    };
  }

  if (hasGeminiThinking(excerpt)) {
    return {
      paneState: "thinking",
      lastVisiblePaneExcerpt: excerpt,
    };
  }

  return {
    paneState: "idle",
    lastVisiblePaneExcerpt: excerpt,
  };
}
