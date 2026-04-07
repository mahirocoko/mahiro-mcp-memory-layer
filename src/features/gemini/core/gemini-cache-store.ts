import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GeminiTaskKind, GeminiWorkerResult } from "../types.js";

export interface GeminiCachePolicy {
  readonly version: string;
  readonly ttlMs: number;
}

export interface GeminiCacheLookupInput {
  readonly model: string;
  readonly prompt: string;
  readonly taskKind: GeminiTaskKind;
  readonly cwd?: string;
}

export interface GeminiCacheEntry {
  readonly key: string;
  readonly cacheVersion: string;
  readonly model: string;
  readonly prompt: string;
  readonly taskKind: GeminiTaskKind;
  readonly cwd?: string;
  readonly response?: string;
  readonly raw?: GeminiWorkerResult["raw"];
  readonly reportedModel?: string;
  readonly structuredData?: unknown;
  readonly cachedAt: string;
  readonly expiresAt: string;
}

export interface GeminiCacheStore {
  get(input: GeminiCacheLookupInput): Promise<GeminiCacheEntry | undefined>;
  set(input: GeminiCacheLookupInput, result: GeminiWorkerResult): Promise<void>;
}

export class FileGeminiCacheStore implements GeminiCacheStore {
  public constructor(
    private readonly filePath: string,
    private readonly policy: GeminiCachePolicy,
  ) {}

  public async get(input: GeminiCacheLookupInput): Promise<GeminiCacheEntry | undefined> {
    const entries = await this.readAll();
    const key = createGeminiCacheKey(input);
    const entry = entries[key];

    if (!entry) {
      return undefined;
    }

    if (entry.cacheVersion !== this.policy.version) {
      return undefined;
    }

    if (isExpired(entry.expiresAt)) {
      return undefined;
    }

    return entry;
  }

  public async set(input: GeminiCacheLookupInput, result: GeminiWorkerResult): Promise<void> {
    const entries = await this.readAll();
    const key = createGeminiCacheKey(input, this.policy.version);
    const cachedAt = new Date();

    entries[key] = {
      key,
      cacheVersion: this.policy.version,
      model: input.model,
      prompt: input.prompt,
      taskKind: input.taskKind,
      cwd: input.cwd,
      response: result.response,
      raw: result.raw,
      reportedModel: result.reportedModel,
      structuredData: result.structuredData,
      cachedAt: cachedAt.toISOString(),
      expiresAt: new Date(cachedAt.getTime() + this.policy.ttlMs).toISOString(),
    };

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  private async readAll(): Promise<Record<string, GeminiCacheEntry>> {
    try {
      const fileContent = await readFile(this.filePath, "utf8");
      return JSON.parse(fileContent) as Record<string, GeminiCacheEntry>;
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }

      throw error;
    }
  }
}

export function createGeminiCacheKey(input: GeminiCacheLookupInput, version = "v1"): string {
  const normalized = JSON.stringify({
    version,
    taskKind: input.taskKind,
    model: input.model,
    cwd: input.cwd ?? "",
    prompt: input.prompt,
  });

  return createHash("sha256").update(normalized).digest("hex");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}
