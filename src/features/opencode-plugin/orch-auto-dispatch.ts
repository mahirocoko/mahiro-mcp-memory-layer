import type { OpenCodePluginSessionState } from "./runtime-state.js";

export interface OpenCodePluginOrchAutoDispatchRequest {
  readonly prompt: string;
  readonly mode: "request-only" | "sticky-on";
  readonly sourceMessageId: string;
}

export function resolveOpenCodePluginOrchAutoDispatchRequest(
  sessionState: OpenCodePluginSessionState,
): OpenCodePluginOrchAutoDispatchRequest | null {
  const recentConversation = sessionState.recentConversation?.trim();
  const sourceMessageId = sessionState.lastMessageId;

  if (!recentConversation || !sourceMessageId) {
    return null;
  }

  if (
    recentConversation.startsWith("<system-reminder>") ||
    recentConversation.startsWith("Task — ") ||
    recentConversation.startsWith("Task - ")
  ) {
    return null;
  }

  const normalizedConversation = recentConversation.toLowerCase();

  if (normalizedConversation === "orch: on" || normalizedConversation === "orch: off" || normalizedConversation === "orch: status") {
    return null;
  }

  if (normalizedConversation.startsWith("orch:")) {
    const prompt = recentConversation.slice("orch:".length).trim();

    if (!prompt) {
      return null;
    }

    return {
      prompt,
      mode: "request-only",
      sourceMessageId,
    };
  }

  if (!sessionState.operator?.stickyModeEnabled) {
    return null;
  }

  return {
    prompt: recentConversation,
    mode: "sticky-on",
    sourceMessageId,
  };
}
