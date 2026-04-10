export const opencodePluginConfigEnv = {
  messageDebounceMs: "MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS",
  userId: "MAHIRO_OPENCODE_PLUGIN_USER_ID",
} as const;

export const defaultOpenCodePluginMessageDebounceMs = 250;

export interface OpenCodePluginConfig {
  readonly packageName: string;
  readonly install: {
    readonly opencodeConfigField: "plugin";
    readonly defaultPluginEntry: string;
    readonly requiresManualMcpConfig: false;
    readonly advancedOverrideChannel: "environment_variables" | "config_files_and_environment_variables";
  };
  readonly runtime: {
    readonly messageDebounceMs: number;
    readonly userId: string;
  };
  readonly env: typeof opencodePluginConfigEnv;
}
