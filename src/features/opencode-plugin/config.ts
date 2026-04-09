import { getAppEnv } from "../../config/env.js";

export const opencodePluginConfigEnv = {
  messageDebounceMs: "MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS",
} as const;

export const defaultOpenCodePluginMessageDebounceMs = 250;

export interface OpenCodePluginConfig {
  readonly packageName: string;
  readonly install: {
    readonly opencodeConfigField: "plugin";
    readonly defaultPluginEntry: string;
    readonly requiresManualMcpConfig: false;
    readonly advancedOverrideChannel: "environment_variables";
  };
  readonly runtime: {
    readonly messageDebounceMs: number;
  };
  readonly env: typeof opencodePluginConfigEnv;
}

export function getOpenCodePluginConfig(env: NodeJS.ProcessEnv = process.env): OpenCodePluginConfig {
  const appEnv = getAppEnv();

  return {
    packageName: appEnv.appName,
    install: {
      opencodeConfigField: "plugin",
      defaultPluginEntry: appEnv.appName,
      requiresManualMcpConfig: false,
      advancedOverrideChannel: "environment_variables",
    },
    runtime: {
      messageDebounceMs: resolveNonNegativeInteger(
        env[opencodePluginConfigEnv.messageDebounceMs],
        defaultOpenCodePluginMessageDebounceMs,
      ),
    },
    env: opencodePluginConfigEnv,
  };
}

function resolveNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || !/^\d+$/.test(normalizedValue)) {
    return fallback;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
    return fallback;
  }

  return parsedValue;
}
