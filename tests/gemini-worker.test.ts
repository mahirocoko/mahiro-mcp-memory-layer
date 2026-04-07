import { describe, expect, it } from "vitest";

import { runGeminiWorker } from "../src/features/gemini/gemini-worker-service.js";
import { createGeminiCacheKey, type GeminiCacheEntry, type GeminiCacheLookupInput, type GeminiCacheStore } from "../src/features/gemini/core/gemini-cache-store.js";
import type { GeminiCommandRunResult, GeminiWorkerInput } from "../src/features/gemini/types.js";

const baseInput: GeminiWorkerInput = {
  taskId: "task-123",
  prompt: "Summarize this file.",
  model: "gemini-3-flash-preview",
};

function createCommandResult(
  overrides: Partial<GeminiCommandRunResult> = {},
): GeminiCommandRunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-04-03T06:19:00.000Z",
    finishedAt: "2026-04-03T06:19:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

class MemoryGeminiCacheStore implements GeminiCacheStore {
  public readonly entries = new Map<string, GeminiCacheEntry>();
  public version = "v1";
  public now = Date.parse("2026-04-03T07:00:00.000Z");

  public async get(input: GeminiCacheLookupInput): Promise<GeminiCacheEntry | undefined> {
    const entry = this.entries.get(createGeminiCacheKey(input, this.version));
    if (!entry) {
      return undefined;
    }

    if (entry.cacheVersion !== this.version) {
      return undefined;
    }

    if (Date.parse(entry.expiresAt) <= this.now) {
      return undefined;
    }

    return entry;
  }

  public async set(input: GeminiCacheLookupInput, result: Awaited<ReturnType<typeof runGeminiWorker>>): Promise<void> {
    const key = createGeminiCacheKey(input, this.version);
    this.entries.set(key, {
      key,
      cacheVersion: this.version,
      model: input.model,
      prompt: input.prompt,
      taskKind: input.taskKind,
      cwd: input.cwd,
      response: result.response,
      raw: result.raw,
      reportedModel: result.reportedModel,
      structuredData: result.structuredData,
      cachedAt: "2026-04-03T07:00:00.000Z",
      expiresAt: "2026-04-04T07:00:00.000Z",
    });
  }
}

function createNoopCacheStore(): GeminiCacheStore {
  return {
    get: async () => undefined,
    set: async () => undefined,
  };
}

async function runWorker(
  input: GeminiWorkerInput,
  options: Parameters<typeof runGeminiWorker>[1] = {},
) {
  return runGeminiWorker(input, {
    cacheStore: createNoopCacheStore(),
    ...options,
  });
}

describe("runGeminiWorker", () => {
  it("returns a completed normalized result for valid Gemini JSON", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: JSON.stringify({
            response: "Done.",
            stats: {
              model: "gemini-3-flash-preview",
            },
          }),
        }),
    });

    expect(result.status).toBe("completed");
    expect(result.requestedModel).toBe("gemini-3-flash-preview");
    expect(result.reportedModel).toBe("gemini-3-flash-preview");
    expect(result.response).toBe("Done.");
  });

  it("passes the requested model to the command runner", async () => {
    let capturedModel: string | undefined;

    await runWorker(
      { ...baseInput, model: "custom-model-99" },
      {
        runCommand: async (input) => {
          capturedModel = input.model;
          return createCommandResult({
            stdout: JSON.stringify({ response: "Done." }),
          });
        },
      },
    );

    expect(capturedModel).toBe("custom-model-99");
  });

  it("extracts the reported model from the Gemini stats object", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: JSON.stringify({
            response: "Done.",
            stats: {
              model: "actual-model-returned-by-api",
            },
          }),
        }),
    });

    expect(result.requestedModel).toBe("gemini-3-flash-preview");
    expect(result.reportedModel).toBe("actual-model-returned-by-api");
  });

  it("falls back to the single stats.models key for reported model", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: JSON.stringify({
            response: "Done.",
            stats: {
              models: {
                "gemini-3-flash-preview": {
                  tokens: {
                    total: 10,
                  },
                },
              },
            },
          }),
        }),
    });

    expect(result.reportedModel).toBe("gemini-3-flash-preview");
  });

  it("extracts cached token counts from Gemini stats models", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: JSON.stringify({
            response: "Done.",
            stats: {
              models: {
                "gemini-3-flash-preview": {
                  tokens: {
                    cached: 321,
                  },
                },
              },
            },
          }),
        }),
    });

    expect(result.status).toBe("completed");
    expect(result.cachedTokens).toBe(321);
  });

  it("returns invalid_input when model is missing from the worker payload", async () => {
    const result = await runWorker(
      { taskId: "task-bad", prompt: "Summarize this.", model: "" } as unknown as typeof baseInput,
      { runCommand: async () => createCommandResult() },
    );

    expect(result.status).toBe("invalid_input");
    expect(result.error).toContain("model");
  });

  it("routes summarize tasks through structured output parsing", async () => {
    const result = await runWorker(
      {
        ...baseInput,
        taskKind: "summarize",
      },
      {
        runCommand: async (input) => {
          expect(input.prompt).toContain("Return JSON only");
          return createCommandResult({
            stdout: JSON.stringify({
              response: JSON.stringify({
                summary: "Short summary",
                keyPoints: ["One", "Two"],
              }),
              stats: {
                model: "gemini-3-flash-preview",
              },
            }),
          });
        },
      },
    );

    expect(result.status).toBe("completed");
    expect(result.taskKind).toBe("summarize");
    expect(result.structuredData).toEqual({
      summary: "Short summary",
      keyPoints: ["One", "Two"],
    });
  });

  it("parses structured output when response body is fenced with json markdown", async () => {
    const result = await runWorker(
      {
        ...baseInput,
        taskKind: "summarize",
      },
      {
        runCommand: async () =>
          createCommandResult({
            stdout: JSON.stringify({
              response: "```json\n{\"summary\":\"Short summary\",\"keyPoints\":[\"One\",\"Two\"]}\n```",
              stats: {
                model: "gemini-3-flash-preview",
              },
            }),
          }),
      },
    );

    expect(result.status).toBe("completed");
    expect(result.structuredData).toEqual({
      summary: "Short summary",
      keyPoints: ["One", "Two"],
    });
  });

  it("parses structured output when response body is fenced with bare markdown", async () => {
    const result = await runWorker(
      {
        ...baseInput,
        taskKind: "summarize",
      },
      {
        runCommand: async () =>
          createCommandResult({
            stdout: JSON.stringify({
              response: "```\n{\"summary\":\"Short summary\",\"keyPoints\":[\"One\",\"Two\"]}\n```",
              stats: {
                model: "gemini-3-flash-preview",
              },
            }),
          }),
      },
    );

    expect(result.status).toBe("completed");
    expect(result.structuredData).toEqual({
      summary: "Short summary",
      keyPoints: ["One", "Two"],
    });
  });

  it("returns invalid_structured_output when a structured task returns the wrong shape", async () => {
    const result = await runWorker(
      {
        ...baseInput,
        taskKind: "extract-facts",
      },
      {
        runCommand: async () =>
          createCommandResult({
            stdout: JSON.stringify({
              response: JSON.stringify({
                summary: "Missing facts",
              }),
            }),
          }),
      },
    );

    expect(result.status).toBe("invalid_structured_output");
    expect(result.error).toContain("facts");
  });

  it("returns command_failed when Gemini exits non-zero with structured JSON", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          exitCode: 2,
          stderr: "command failed",
          stdout: JSON.stringify({
            error: "rate limited",
          }),
        }),
    });

    expect(result.status).toBe("command_failed");
    expect(result.error).toContain("rate limited");
    expect(result.exitCode).toBe(2);
  });

  it("returns invalid_json when stdout cannot be parsed", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: "not-json",
        }),
    });

    expect(result.status).toBe("invalid_json");
    expect(result.error).toBeTruthy();
  });

  it("keeps the outer Gemini envelope strict when stdout is fenced markdown", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: `\
\`\`\`json
${JSON.stringify({ response: "Done." })}
\`\`\``,
        }),
    });

    expect(result.status).toBe("invalid_json");
    expect(result.error).toBeTruthy();
  });

  it("returns invalid_json when stdout is JSON but not a valid Gemini envelope", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          stdout: JSON.stringify(["unexpected"]),
        }),
    });

    expect(result.status).toBe("invalid_json");
    expect(result.error).toContain("output");
  });

  it("returns empty_output when Gemini prints nothing", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () => createCommandResult(),
    });

    expect(result.status).toBe("empty_output");
    expect(result.error).toContain("no stdout");
  });

  it("returns timeout when the command times out", async () => {
    const result = await runWorker(
      {
        ...baseInput,
        timeoutMs: 5000,
      },
      {
        runCommand: async () =>
          createCommandResult({
            timedOut: true,
          }),
      },
    );

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("5000ms");
  });

  it("returns spawn_error when the binary cannot be launched", async () => {
    const result = await runWorker(baseInput, {
      runCommand: async () =>
        createCommandResult({
          spawnError: "spawn gemini ENOENT",
          exitCode: null,
        }),
    });

    expect(result.status).toBe("spawn_error");
    expect(result.error).toContain("ENOENT");
  });

  it("returns a cached result without executing Gemini again", async () => {
    const cacheStore = new MemoryGeminiCacheStore();
    let calls = 0;

    const firstResult = await runGeminiWorker(baseInput, {
      cacheStore,
      runCommand: async () => {
        calls += 1;
        return createCommandResult({
          stdout: JSON.stringify({
            response: "Done once.",
            stats: {
              model: "gemini-3-flash-preview",
            },
          }),
        });
      },
    });

    const secondResult = await runGeminiWorker(
      {
        ...baseInput,
        taskId: "task-456",
      },
      {
        cacheStore,
        runCommand: async () => {
          calls += 1;
          return createCommandResult();
        },
      },
    );

    expect(firstResult.cached).toBeUndefined();
    expect(secondResult.cached).toBe(true);
    expect(secondResult.response).toBe("Done once.");
    expect(secondResult.taskId).toBe("task-456");
    expect(calls).toBe(1);
  });

  it("misses the cache when the cached entry is expired", async () => {
    const cacheStore = new MemoryGeminiCacheStore();
    let calls = 0;

    await runGeminiWorker(baseInput, {
      cacheStore,
      runCommand: async () => {
        calls += 1;
        return createCommandResult({
          stdout: JSON.stringify({
            response: "Done once.",
          }),
        });
      },
    });

    cacheStore.now = Date.parse("2026-04-05T07:00:00.000Z");

    await runGeminiWorker(
      {
        ...baseInput,
        taskId: "task-789",
      },
      {
        cacheStore,
        runCommand: async () => {
          calls += 1;
          return createCommandResult({
            stdout: JSON.stringify({
              response: "Done twice.",
            }),
          });
        },
      },
    );

    expect(calls).toBe(2);
  });

  it("misses the cache when the cache version changes", async () => {
    const cacheStore = new MemoryGeminiCacheStore();
    let calls = 0;

    await runGeminiWorker(baseInput, {
      cacheStore,
      runCommand: async () => {
        calls += 1;
        return createCommandResult({
          stdout: JSON.stringify({
            response: "Done once.",
          }),
        });
      },
    });

    cacheStore.version = "v2";

    await runGeminiWorker(
      {
        ...baseInput,
        taskId: "task-999",
      },
      {
        cacheStore,
        runCommand: async () => {
          calls += 1;
          return createCommandResult({
            stdout: JSON.stringify({
              response: "Done twice.",
            }),
          });
        },
      },
    );

    expect(calls).toBe(2);
  });
});
