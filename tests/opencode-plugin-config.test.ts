import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
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
  it("returns plugin-first memory defaults without requiring manual MCP config", async () => {
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
      },
      env: {
        messageDebounceMs: opencodePluginConfigEnv.messageDebounceMs,
      },
    });
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
        "runtime": {
          "messageDebounceMs": 320
        }
      }`,
    );
    await writeFile(
      path.join(projectConfigDirectory, "mahiro-mcp-memory-layer.json"),
      JSON.stringify({
        runtime: { messageDebounceMs: 120 },
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
      },
    });
  });
});
