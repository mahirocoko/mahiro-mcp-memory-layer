import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultOpenCodePluginRemindersEnabled,
  defaultOpenCodePluginMessageDebounceMs,
  opencodePluginConfigEnv,
} from "../src/features/opencode-plugin/config.js";
import { loadOpenCodePluginConfig } from "../src/features/opencode-plugin/config-loader.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directoryPath) => {
      await rm(directoryPath, { recursive: true, force: true });
    }),
  );
});

async function createTempDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "opencode-plugin-config-"));
  tempDirectories.push(directoryPath);
  return directoryPath;
}

describe("loadOpenCodePluginConfig", () => {
  it("returns plugin-first defaults without requiring manual MCP config", async () => {
    await expect(loadOpenCodePluginConfig({ env: {} })).resolves.toEqual({
      packageName: "mahiro-mcp-memory-layer",
      install: {
        opencodeConfigField: "plugin",
        defaultPluginEntry: "mahiro-mcp-memory-layer",
        requiresManualMcpConfig: false,
        advancedOverrideChannel: "config_files_and_environment_variables",
      },
      runtime: {
        messageDebounceMs: defaultOpenCodePluginMessageDebounceMs,
        userId: expect.stringMatching(/^local:/),
        remindersEnabled: defaultOpenCodePluginRemindersEnabled,
      },
      routing: {
        categoryRoutes: {},
      },
      env: {
        messageDebounceMs: opencodePluginConfigEnv.messageDebounceMs,
        userId: opencodePluginConfigEnv.userId,
        remindersEnabled: opencodePluginConfigEnv.remindersEnabled,
      },
    });
  });

  it("prefers explicit user id overrides from environment variables", async () => {
    await expect(
      loadOpenCodePluginConfig({
        env: {
          [opencodePluginConfigEnv.userId]: "project-user",
        },
      }).then((config) => config.runtime.userId),
    ).resolves.toBe("project-user");
  });

  it("parses message debounce overrides from environment variables", async () => {
    await expect(
      loadOpenCodePluginConfig({
        env: {
        [opencodePluginConfigEnv.messageDebounceMs]: "40",
        },
      }).then((config) => config.runtime.messageDebounceMs),
    ).resolves.toBe(40);
  });

  it("loads user and project config files with project precedence", async () => {
    const homeDirectory = await createTempDirectory();
    const contextDirectory = await createTempDirectory();
    const userConfigDirectory = path.join(homeDirectory, ".config", "opencode");
    const projectConfigDirectory = path.join(contextDirectory, ".opencode");

    await mkdir(userConfigDirectory, { recursive: true });
    await mkdir(projectConfigDirectory, { recursive: true });
    await writeFile(
      path.join(userConfigDirectory, "mahiro-mcp-memory-layer.jsonc"),
      `{
        // user default
        "runtime": {
          "messageDebounceMs": 320,
          "userId": "user-scope",
          "remindersEnabled": true
        },
        "routing": {
          "categories": {
            "quick": {
              "model": "claude-4.6-opus-high"
            }
          }
        },
      }
      `,
    );
    await writeFile(
      path.join(projectConfigDirectory, "mahiro-mcp-memory-layer.json"),
      JSON.stringify({
        runtime: { messageDebounceMs: 120 },
        routing: {
          categories: {
            quick: {
              workerRuntime: "mcp",
            },
          },
        },
      }),
    );

    await expect(
      loadOpenCodePluginConfig({
        env: {},
        homeDirectory,
        contextDirectory,
      }),
    ).resolves.toMatchObject({
      runtime: {
        messageDebounceMs: 120,
        userId: "user-scope",
        remindersEnabled: true,
      },
      routing: {
        categoryRoutes: {
          quick: {
            model: "claude-4.6-opus-high",
            workerRuntime: "mcp",
          },
        },
      },
    });
  });

  it("lets environment overrides win over config files", async () => {
    const homeDirectory = await createTempDirectory();
    const userConfigDirectory = path.join(homeDirectory, ".config", "opencode");

    await mkdir(userConfigDirectory, { recursive: true });
    await writeFile(
      path.join(userConfigDirectory, "mahiro-mcp-memory-layer.json"),
      JSON.stringify({ runtime: { messageDebounceMs: 320 } }),
    );

    await expect(
      loadOpenCodePluginConfig({
        homeDirectory,
        env: {
          [opencodePluginConfigEnv.messageDebounceMs]: "40",
        },
      }).then((config) => config.runtime.messageDebounceMs),
    ).resolves.toBe(40);
  });

  it("falls back to defaults when the environment override is invalid", async () => {
    await expect(
      loadOpenCodePluginConfig({
        env: {
        [opencodePluginConfigEnv.messageDebounceMs]: "  ",
        },
      }).then((config) => config.runtime.messageDebounceMs),
    ).resolves.toBe(defaultOpenCodePluginMessageDebounceMs);

    await expect(
      loadOpenCodePluginConfig({
        env: {
        [opencodePluginConfigEnv.messageDebounceMs]: "fast",
        },
      }).then((config) => config.runtime.messageDebounceMs),
    ).resolves.toBe(defaultOpenCodePluginMessageDebounceMs);

    await expect(
      loadOpenCodePluginConfig({
        env: {
        [opencodePluginConfigEnv.messageDebounceMs]: "-5",
        },
      }).then((config) => config.runtime.messageDebounceMs),
    ).resolves.toBe(defaultOpenCodePluginMessageDebounceMs);
  });

  it("parses remindersEnabled from environment variables", async () => {
    await expect(
      loadOpenCodePluginConfig({
        env: {
          [opencodePluginConfigEnv.remindersEnabled]: "true",
        },
      }).then((config) => config.runtime.remindersEnabled),
    ).resolves.toBe(true);

    await expect(
      loadOpenCodePluginConfig({
        env: {
          [opencodePluginConfigEnv.remindersEnabled]: "false",
        },
      }).then((config) => config.runtime.remindersEnabled),
    ).resolves.toBe(false);
  });
});
