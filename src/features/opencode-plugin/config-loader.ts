import os from "node:os";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseJsonc } from "jsonc-parser";
import { z } from "zod";

import {
  defaultOpenCodePluginRemindersEnabled,
  defaultOpenCodePluginMessageDebounceMs,
  opencodePluginConfigEnv,
  type OpenCodePluginConfig,
} from "./config.js";
import { agentTaskCategories } from "../orchestration/agent-category-routing.js";
import { getAppEnv } from "../../config/env.js";

const openCodePluginConfigFileSchema = z
  .object({
    runtime: z
      .object({
        messageDebounceMs: z.number().int().nonnegative().optional(),
        userId: z.string().trim().min(1).optional(),
        remindersEnabled: z.boolean().optional(),
      })
      .partial()
      .optional(),
    routing: z
      .object({
        categories: z
          .object(
            Object.fromEntries(
              agentTaskCategories.map((category) => [
                category,
                z
                  .object({
                    model: z.string().trim().min(1).optional(),
                    workerRuntime: z.enum(["shell", "mcp"]).optional(),
                  })
                  .partial()
                  .optional(),
              ]),
            ),
          )
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

type OpenCodePluginConfigFile = z.infer<typeof openCodePluginConfigFileSchema>;

export interface LoadOpenCodePluginConfigOptions {
  readonly contextDirectory?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly opencodeConfigDirectory?: string;
}

export async function loadOpenCodePluginConfig(
  options: LoadOpenCodePluginConfigOptions = {},
): Promise<OpenCodePluginConfig> {
  const env = options.env ?? process.env;
  const appEnv = getAppEnv();
  const userConfig = await loadUserPluginConfigFile(appEnv.appName, options);
  const projectConfig = await loadProjectPluginConfigFile(appEnv.appName, options.contextDirectory);
  const mergedConfigFile = mergePluginConfigFiles(userConfig, projectConfig);

  return {
    packageName: appEnv.appName,
    install: {
      opencodeConfigField: "plugin",
      defaultPluginEntry: appEnv.appName,
      requiresManualMcpConfig: false,
      advancedOverrideChannel: "config_files_and_environment_variables",
    },
    runtime: {
      messageDebounceMs: resolveMessageDebounceMs(mergedConfigFile, env),
      userId: resolveUserId(mergedConfigFile, env),
      remindersEnabled: resolveRemindersEnabled(mergedConfigFile, env),
    },
    routing: {
      categoryRoutes: mergeCategoryRoutes(mergedConfigFile),
    },
    env: opencodePluginConfigEnv,
  };
}

async function loadUserPluginConfigFile(
  appName: string,
  options: LoadOpenCodePluginConfigOptions,
): Promise<OpenCodePluginConfigFile> {
  const userConfigDirectory =
    options.opencodeConfigDirectory ??
    (options.homeDirectory ? path.join(options.homeDirectory, ".config", "opencode") : undefined);

  if (!userConfigDirectory) {
    return {};
  }

  return await loadPluginConfigFileFromDirectory(userConfigDirectory, appName);
}

async function loadProjectPluginConfigFile(
  appName: string,
  contextDirectory: string | undefined,
): Promise<OpenCodePluginConfigFile> {
  if (!contextDirectory) {
    return {};
  }

  return await loadPluginConfigFileFromDirectory(path.join(contextDirectory, ".opencode"), appName);
}

async function loadPluginConfigFileFromDirectory(
  directoryPath: string,
  appName: string,
): Promise<OpenCodePluginConfigFile> {
  const candidatePaths = [
    path.join(directoryPath, `${appName}.jsonc`),
    path.join(directoryPath, `${appName}.json`),
  ];

  for (const candidatePath of candidatePaths) {
    if (!(await fileExists(candidatePath))) {
      continue;
    }

    const rawContent = await readFile(candidatePath, "utf8");
    const parsedContent = parseJsonc(rawContent);
    return openCodePluginConfigFileSchema.parse(parsedContent);
  }

  return {};
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mergePluginConfigFiles(
  userConfig: OpenCodePluginConfigFile,
  projectConfig: OpenCodePluginConfigFile,
): OpenCodePluginConfigFile {
  const mergedCategoryConfig = Object.fromEntries(
    agentTaskCategories.flatMap((category) => {
      const userCategoryConfig = userConfig.routing?.categories?.[category];
      const projectCategoryConfig = projectConfig.routing?.categories?.[category];
      const mergedCategory = {
        ...userCategoryConfig,
        ...projectCategoryConfig,
      };

      if (Object.keys(mergedCategory).length === 0) {
        return [];
      }

      return [[category, mergedCategory]];
    }),
  );

  return {
    ...userConfig,
    ...projectConfig,
    runtime: {
      ...userConfig.runtime,
      ...projectConfig.runtime,
    },
    routing: {
      ...userConfig.routing,
      ...projectConfig.routing,
      categories: mergedCategoryConfig,
    },
  };
}

function resolveMessageDebounceMs(configFile: OpenCodePluginConfigFile, env: NodeJS.ProcessEnv): number {
  const configFileValue = configFile.runtime?.messageDebounceMs;

  if (typeof configFileValue === "number") {
    return resolveNonNegativeInteger(
      env[opencodePluginConfigEnv.messageDebounceMs],
      configFileValue,
    );
  }

  return resolveNonNegativeInteger(
    env[opencodePluginConfigEnv.messageDebounceMs],
    defaultOpenCodePluginMessageDebounceMs,
  );
}

function resolveUserId(configFile: OpenCodePluginConfigFile, env: NodeJS.ProcessEnv): string {
  const explicitUserId =
    toNonEmptyString(env[opencodePluginConfigEnv.userId]) ??
    toNonEmptyString(configFile.runtime?.userId);

  if (explicitUserId) {
    return explicitUserId;
  }

  return resolveStableLocalUserId(env);
}

function resolveRemindersEnabled(configFile: OpenCodePluginConfigFile, env: NodeJS.ProcessEnv): boolean {
  const envValue = toOptionalBoolean(env[opencodePluginConfigEnv.remindersEnabled]);

  if (envValue !== undefined) {
    return envValue;
  }

  return configFile.runtime?.remindersEnabled ?? defaultOpenCodePluginRemindersEnabled;
}

function mergeCategoryRoutes(configFile: OpenCodePluginConfigFile): OpenCodePluginConfig["routing"]["categoryRoutes"] {
  const categoryRoutes = configFile.routing?.categories;

  if (!categoryRoutes) {
    return {};
  }

  return Object.fromEntries(
    agentTaskCategories.flatMap((category) => {
      const categoryOverride = categoryRoutes[category];

      if (!categoryOverride) {
        return [];
      }

      return [[category, categoryOverride]];
    }),
  );
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

function resolveStableLocalUserId(env: NodeJS.ProcessEnv): string {
  const username =
    toNonEmptyString(readOsUsername()) ??
    toNonEmptyString(env.USER) ??
    toNonEmptyString(env.USERNAME);

  if (username) {
    return `local:${username}`;
  }

  return "local:opencode";
}

function readOsUsername(): string | undefined {
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return undefined;
}
