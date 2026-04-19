import { describe, expect, it } from "vitest";

import {
  loadRuntimeModelInventory,
  parseAgentHelpOutput,
  parseAgentModelsOutput,
  resetRuntimeModelInventoryCacheForTests,
} from "../src/features/orchestration/runtime-model-inventory.js";

describe("parseAgentModelsOutput", () => {
  it("extracts model ids from cursor agent models output", () => {
    expect(
      parseAgentModelsOutput(`\u001b[2K\u001b[GLoading models…
Available models

auto - Auto
composer-2-fast - Composer 2 Fast  (default)
composer-2 - Composer 2  (current)
claude-opus-4-7-high - Opus 4.7
gemini-3.1-pro-preview - Gemini 3.1 Pro Preview

Tip: use --model <id> to switch.`),
    ).toEqual([
      "auto",
      "composer-2-fast",
      "composer-2",
      "claude-opus-4-7-high",
        "gemini-3.1-pro-preview",
    ]);
  });
});

describe("parseAgentHelpOutput", () => {
  it("extracts the runtime-supported modes from help output", () => {
    expect(
      parseAgentHelpOutput(`Usage: agent [options]
  -p, --print                  Print responses to console
  -c, --cloud                  Start in cloud mode
  --mode <mode>                Start in the given execution mode. plan / ask
Commands:
  acp                          Start ACP server mode`),
    ).toEqual({
      modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
      supportsPrint: true,
      supportsCloud: true,
      supportsAcp: true,
    });
  });
});

describe("loadRuntimeModelInventory", () => {
  it("returns a live snapshot when command discovery succeeds", async () => {
    resetRuntimeModelInventoryCacheForTests();

    const snapshot = await loadRuntimeModelInventory({
      commandRunner: async (_command, args) => {
        if (args[0] === "--help") {
          return {
            stdout: `Usage: agent [options]
  -p, --print
  -c, --cloud
  --mode <mode>
Commands:
  acp`,
            stderr: "",
            exitCode: 0,
          };
        }

        return {
          stdout: `Available models
composer-2 - Composer 2
claude-opus-4-7-high - Opus 4.7
gemini-3-flash-preview - Gemini 3 Flash Preview`,
          stderr: "",
          exitCode: 0,
        };
      },
      now: () => new Date("2026-04-17T13:47:00.000Z"),
    });

    expect(snapshot).toEqual({
      source: "live",
      fetchedAt: "2026-04-17T13:47:00.000Z",
      cursor: {
        models: ["composer-2", "claude-opus-4-7-high", "gemini-3-flash-preview"],
        modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
        supportsPrint: true,
        supportsCloud: true,
        supportsAcp: true,
      },
    });
  });

  it("falls back to the cached snapshot when live discovery fails", async () => {
    resetRuntimeModelInventoryCacheForTests();

    await loadRuntimeModelInventory({
      commandRunner: async (_command, args) => {
        if (args[0] === "--help") {
          return {
            stdout: `Usage: agent [options]
  -p, --print
  --mode <mode>`,
            stderr: "",
            exitCode: 0,
          };
        }

        return {
          stdout: `Available models
composer-2 - Composer 2`,
          stderr: "",
          exitCode: 0,
        };
      },
      now: () => new Date("2026-04-17T13:47:00.000Z"),
    });

    const snapshot = await loadRuntimeModelInventory({
      commandRunner: async () => ({
        stdout: "",
        stderr: "boom",
        exitCode: 1,
      }),
    });

    expect(snapshot.source).toBe("cache");
    expect(snapshot.cursor.models).toEqual(["composer-2"]);
    expect(snapshot.cursor.modes).toEqual(["agent", "plan", "ask", "print"]);
  });

  it("falls back to static defaults when there is no cache and discovery fails", async () => {
    resetRuntimeModelInventoryCacheForTests();

    const snapshot = await loadRuntimeModelInventory({
      commandRunner: async () => ({
        stdout: "",
        stderr: "boom",
        exitCode: 1,
      }),
    });

    expect(snapshot.source).toBe("static");
    expect(snapshot.cursor.models).toEqual([
      "composer-2",
      "claude-opus-4-7-high",
      "claude-opus-4-7-thinking-high",
      "claude-4.6-sonnet-medium",
      "claude-4.6-opus-high",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
  });
});
