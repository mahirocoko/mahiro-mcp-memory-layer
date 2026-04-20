export interface RuntimeModelInventorySnapshot {
  readonly source: "live" | "static";
  readonly fetchedAt: string;
  readonly cursor: {
    readonly models: string[];
    readonly modes: string[];
    readonly supportsPrint: boolean;
    readonly supportsCloud: boolean;
    readonly supportsAcp: boolean;
  };
}

export async function loadRuntimeModelInventory(): Promise<RuntimeModelInventorySnapshot> {
  return {
    source: "static",
    fetchedAt: new Date().toISOString(),
    cursor: {
      models: [
        "composer-2",
        "claude-opus-4-7-high",
        "claude-opus-4-7-thinking-high",
        "claude-4.6-opus-high",
        "claude-4.6-sonnet-medium",
        "gemini-3-flash-preview",
        "gemini-3.1-pro-preview",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
      ],
      modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
      supportsPrint: true,
      supportsCloud: true,
      supportsAcp: true,
    },
  };
}
