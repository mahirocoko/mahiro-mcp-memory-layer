import * as childProcess from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PluginInput, PluginModule } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMemoryToolDefinitions, type MemoryToolBackend } from "../src/features/memory/lib/tool-definitions.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("OpenCode plugin path must not spawn child_process stdio processes.");
  }),
}));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createSessionCreatedEvent(sessionId = "session-1") {
  return {
    type: "session.created" as const,
    properties: {
      sessionID: sessionId,
      info: {
        id: sessionId,
      },
    },
  };
}

function createMessageUpdatedEvent(sessionId = "session-1", message = "Summarize recent memory context for this turn.") {
  return {
    type: "message.updated" as const,
    properties: {
      sessionID: sessionId,
      messageID: `${sessionId}-message-1`,
      parts: [{ type: "text" as const, text: message }],
    },
  };
}

function createSessionIdleEvent(sessionId = "session-1") {
  return {
    type: "session.idle" as const,
    properties: {
      sessionID: sessionId,
    },
  };
}

function parsePluginToolResult(result: unknown): unknown {
  expect(typeof result).toBe("string");
  return JSON.parse(result as string);
}

function createMemoryBackend(): MemoryToolBackend {
  return {
    inspectMemoryRetrieval: vi.fn().mockResolvedValue({ status: "empty", lookup: "latest" }),
    resetStorage: vi.fn().mockResolvedValue({ status: "cleared" }),
    promoteMemory: vi.fn().mockResolvedValue({ id: "memory-1" }),
    reviewMemory: vi.fn().mockResolvedValue({ id: "memory-1" }),
    remember: vi.fn().mockResolvedValue({ id: "memory-1" }),
    search: vi.fn().mockResolvedValue({ items: [], degraded: false }),
    buildContext: vi.fn().mockResolvedValue({ context: "built-context", items: [], truncated: false, degraded: false }),
    upsertDocument: vi.fn().mockResolvedValue({ id: "document-1" }),
    list: vi.fn().mockResolvedValue([]),
    listReviewQueue: vi.fn().mockResolvedValue([]),
    listReviewQueueOverview: vi.fn().mockResolvedValue([]),
    getReviewAssist: vi.fn().mockResolvedValue({ status: "ready", suggestions: [], hints: [] }),
    enqueueMemoryProposal: vi.fn().mockResolvedValue({ recommendation: "likely_skip", proposed: [], skipped: [], candidates: [] }),
    suggestMemoryCandidates: vi.fn().mockReturnValue({ recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] }),
    applyConservativeMemoryPolicy: vi.fn().mockResolvedValue({
      recommendation: "likely_skip",
      signals: { durable: [], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    }),
    prepareHostTurnMemory: vi.fn().mockResolvedValue({
      context: "host-turn-context",
      items: [],
      truncated: false,
      degraded: false,
      memorySuggestions: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] },
      conservativePolicy: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [], autoSaved: [], autoSaveSkipped: [], reviewOnlySuggestions: [] },
    }),
    wakeUpMemory: vi.fn().mockResolvedValue({
      wakeUpContext: "wake-up-context",
      profile: { context: "profile", items: [], truncated: false, degraded: false },
      recent: { context: "recent", items: [], truncated: false, degraded: false },
      truncated: false,
      degraded: false,
    }),
    prepareTurnMemory: vi.fn().mockResolvedValue({
      context: "turn-context",
      items: [],
      truncated: false,
      degraded: false,
      memorySuggestions: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] },
      conservativePolicy: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [], autoSaved: [], autoSaveSkipped: [], reviewOnlySuggestions: [] },
    }),
  };
}

async function importPluginModule(): Promise<Pick<PluginModule, "id"> & { readonly server: PluginModule["server"] }> {
  const imported = await import("../src/features/opencode-plugin/index.js");
  expect(imported.server).toEqual(expect.any(Function));
  return imported as Pick<PluginModule, "id"> & { readonly server: PluginModule["server"] };
}

async function createHarness(options?: { readonly messageDebounceMs?: number }) {
  const backend = createMemoryBackend();
  const pluginModule = await importPluginModule();
  const pluginInput = {
    project: {
      id: "60b045c93ff3cd0bf6899ddc83256eb0daed10a2",
      name: "mahiro-mcp-memory-layer",
      directory: repoRoot,
    },
    directory: repoRoot,
    client: {},
  } as PluginInput;

  const hooks = await pluginModule.server(pluginInput, {
    __test: {
      memory: backend,
      messageDebounceMs: options?.messageDebounceMs ?? 0,
    },
  });

  return { backend, hooks, pluginModule };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("product memory plugin", () => {
  it("initializes as an OpenCode plugin module with only memory tools, memory_context, and runtime_capabilities", async () => {
    const harness = await createHarness();
    const sharedMemoryToolNames = getMemoryToolDefinitions().map((tool) => tool.name);

    expect(Object.keys(harness.hooks.tool ?? {}).sort()).toEqual(
      [...sharedMemoryToolNames, "memory_context", "runtime_capabilities"].sort(),
    );
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });

  it("returns a memory-only runtime capability contract", async () => {
    const harness = await createHarness();

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities.execute({}, {}));
    expect(result).toMatchObject({
      mode: "plugin-native",
      memory: {
        toolNames: expect.arrayContaining(["remember", "prepare_host_turn_memory", "wake_up_memory", "memory_context"]),
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
      },
    });
  });

  it("serves memory_context from cached singleton runtime state", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });

      await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent() });
      await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent() });
      vi.advanceTimersByTime(5);
      await Promise.resolve();
      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent() });
      await Promise.resolve();

      const result = parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: "session-1" }));
      expect(result).toMatchObject({
        status: "ready",
        session: {
          sessionId: "session-1",
          continuityCache: {
            wakeUp: expect.any(Object),
          },
        },
      });

      expect(result).toEqual(
        expect.objectContaining({
          session: expect.objectContaining({
            continuityCache: expect.objectContaining({
              wakeUp: expect.any(Object),
            }),
          }),
        }),
      );
      expect(harness.backend.wakeUpMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          phase: "wake-up",
        }),
      );
      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          phase: "host-turn-persistence",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns empty when memory_context is called without an explicit session id", async () => {
    const harness = await createHarness();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, {}));
    expect(result).toMatchObject({
      status: "empty",
    });
  });
});
