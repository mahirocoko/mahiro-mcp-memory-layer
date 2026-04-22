import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PluginInput, PluginModule } from "@opencode-ai/plugin";
import { describe, expect, it, vi } from "vitest";

import { getMemoryToolDefinitions, type MemoryToolBackend } from "../src/features/memory/lib/tool-definitions.js";

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

function createSharedMemoryBackend(): MemoryToolBackend {
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

async function createPluginHarness(memoryBackend: MemoryToolBackend) {
  const pluginModule = await importPluginModule();
  const pluginInput = {
    directory: repoRoot,
    client: {},
  } as PluginInput;

  const hooks = await pluginModule.server(pluginInput, {
    __test: {
      memory: memoryBackend,
      messageDebounceMs: 0,
    },
  });

  await hooks["session.created"]?.({ event: createSessionCreatedEvent() });
  await hooks["message.updated"]?.({ event: createMessageUpdatedEvent() });
  await hooks["session.idle"]?.({ event: createSessionIdleEvent() });

  return { hooks, pluginModule };
}

describe("OpenCode plugin package", () => {
  it("publishes a memory-only plugin surface", async () => {
    const backend = createSharedMemoryBackend();
    const { hooks, pluginModule } = await createPluginHarness(backend);
    const toolNames = Object.keys(hooks.tool ?? {}).sort();
    const expectedMemoryToolNames = getMemoryToolDefinitions().map((tool) => tool.name);

    expect(toolNames).toEqual([...expectedMemoryToolNames, "memory_context", "runtime_capabilities"].sort());
  });

  it("reports memory-only runtime capabilities and session-scoped memory context", async () => {
    const backend = createSharedMemoryBackend();
    const { hooks } = await createPluginHarness(backend);

    const runtimeCapabilities = parsePluginToolResult(await hooks.tool?.runtime_capabilities.execute({}, {}));
    expect(runtimeCapabilities).toMatchObject({
      mode: "plugin-native",
      memory: {
        toolNames: expect.arrayContaining(["remember", "memory_context"]),
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
      },
    });

    const memoryContext = parsePluginToolResult(await hooks.tool?.memory_context.execute({}, { sessionID: "session-1" }));
    expect(memoryContext).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-1",
        continuityCache: {
          wakeUp: expect.any(Object),
        },
      },
    });

    expect(memoryContext).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          continuityCache: expect.objectContaining({
            wakeUp: expect.any(Object),
          }),
        }),
      }),
    );
  });
});
