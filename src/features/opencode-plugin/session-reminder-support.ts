import type { OpenCodePluginContext } from "./resolve-scope.js";

export interface OpenCodePluginSessionReminderSupport {
  readonly sessionPromptAsyncAvailable: boolean;
  readonly tuiShowToastAvailable: boolean;
}

export function detectOpenCodePluginSessionReminderSupport(
  context: OpenCodePluginContext,
  overrides: {
    readonly sessionVisibleRemindersAvailable?: boolean;
  } = {},
): OpenCodePluginSessionReminderSupport {
  if (overrides.sessionVisibleRemindersAvailable !== undefined) {
    return {
      sessionPromptAsyncAvailable: overrides.sessionVisibleRemindersAvailable,
      tuiShowToastAvailable: hasTuiShowToast(context),
    };
  }

  return {
    sessionPromptAsyncAvailable: hasSessionPromptAsync(context),
    tuiShowToastAvailable: hasTuiShowToast(context),
  };
}

function hasSessionPromptAsync(context: OpenCodePluginContext): boolean {
  return typeof context.client.session?.promptAsync === "function";
}

function hasTuiShowToast(context: OpenCodePluginContext): boolean {
  return typeof context.client.tui?.showToast === "function";
}
