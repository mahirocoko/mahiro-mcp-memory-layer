import { readFileSync } from "node:fs";
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

const forbiddenRuntimeCapabilityFieldNames = [
  "hooksAvailable",
  "claudeHooks",
  "hookDispatch",
  "commandHooks",
  "httpHooks",
  "workflow",
  "permission",
] as const;

const forbiddenPublicRuntimeSurfaceNamePattern =
  /hooksAvailable|claudeHooks|hookDispatch|commandHooks|httpHooks|workflow|permission|command|http|dispatch/i;

const expectedMemoryToolNames = [
  "inspect_memory_retrieval",
  "reset_memory_storage",
  "promote_memory",
  "review_memory",
  "remember",
  "search_memories",
  "build_context_for_task",
  "upsert_document",
  "list_memories",
  "list_review_queue",
  "list_review_queue_overview",
  "get_review_assist",
  "enqueue_memory_proposal",
  "suggest_memory_candidates",
  "apply_conservative_memory_policy",
  "prepare_host_turn_memory",
  "wake_up_memory",
  "prepare_turn_memory",
] as const;

const expectedRuntimeCapabilityMemoryKeys = [
  "toolNames",
  "sessionStartWakeUpAvailable",
  "turnPreflightAvailable",
  "idlePersistenceAvailable",
  "memoryContextToolAvailable",
  "lifecycleDiagnosticsAvailable",
  "compactionContinuityAvailable",
  "memoryProtocol",
] as const;

const expectedPluginHookNames = [
  "config",
  "event",
  "experimental.session.compacting",
  "message.updated",
  "session.created",
  "session.idle",
  "tool",
] as const;

function expectNoForbiddenRuntimeCapabilityFields(serializedResult: string) {
  for (const fieldName of forbiddenRuntimeCapabilityFieldNames) {
    expect(serializedResult).not.toContain(`"${fieldName}"`);
  }
}

function expectNoForbiddenPublicRuntimeSurfaceNames(names: readonly string[]) {
  for (const name of names) {
    expect(name).not.toMatch(forbiddenPublicRuntimeSurfaceNamePattern);
  }
}

function expectNoForbiddenPublicRuntimeFieldNames(value: unknown) {
  expectNoForbiddenPublicRuntimeSurfaceNames(collectObjectFieldNames(value));
}

function collectObjectFieldNames(value: unknown, fieldNames = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectFieldNames(item, fieldNames);
    }
    return [...fieldNames];
  }

  if (!isRecord(value)) {
    return [...fieldNames];
  }

  for (const [key, item] of Object.entries(value)) {
    fieldNames.add(key);
    collectObjectFieldNames(item, fieldNames);
  }

  return [...fieldNames];
}

function expectRecord(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  it("keeps the public package export limited to the memory plugin entrypoint", async () => {
    const packageManifest = expectRecord(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")));
    const packageExports = expectRecord(packageManifest.exports);
    const pluginExports = await import("../src/features/opencode-plugin/index.js");
    const exportNames = Object.keys(pluginExports).sort();

    expect(packageExports).toEqual({ ".": "./src/features/opencode-plugin/index.ts" });
    expectNoForbiddenPublicRuntimeSurfaceNames([...Object.keys(packageExports), ...Object.values(packageExports).map(String)]);
    expect(exportNames).toEqual(["server"]);
    expectNoForbiddenPublicRuntimeSurfaceNames(exportNames);
  });

  it("publishes a memory-only plugin surface", async () => {
    const backend = createSharedMemoryBackend();
    const { hooks, pluginModule } = await createPluginHarness(backend);
    const toolNames = Object.keys(hooks.tool ?? {}).sort();
    const sharedMemoryToolNames = getMemoryToolDefinitions().map((tool) => tool.name);

    expect(Object.keys(hooks).sort()).toEqual([...expectedPluginHookNames].sort());
    expect(sharedMemoryToolNames).toEqual([...expectedMemoryToolNames]);
    expect(toolNames).toEqual([...expectedMemoryToolNames, "memory_context", "runtime_capabilities"].sort());
    expectNoForbiddenPublicRuntimeSurfaceNames([...Object.keys(hooks), ...toolNames]);
    expect(pluginModule).toEqual(expect.objectContaining({ server: expect.any(Function) }));
  });

  it("reports memory-only runtime capabilities and session-scoped memory context", async () => {
    const backend = createSharedMemoryBackend();
    const { hooks } = await createPluginHarness(backend);

    const runtimeCapabilities = parsePluginToolResult(await hooks.tool?.runtime_capabilities.execute({}, {}));
    const serializedRuntimeCapabilities = JSON.stringify(runtimeCapabilities);
    const capabilityRecord = expectRecord(runtimeCapabilities);
    const memoryCapabilities = expectRecord(capabilityRecord.memory);

    expect(Object.keys(capabilityRecord).sort()).toEqual(["memory", "mode"]);
    expect(Object.keys(memoryCapabilities).sort()).toEqual([...expectedRuntimeCapabilityMemoryKeys].sort());
    expect(memoryCapabilities.toolNames).toEqual([...expectedMemoryToolNames, "memory_context"]);
    expect(runtimeCapabilities).toMatchObject({
      mode: "plugin-native",
      memory: {
        toolNames: expect.arrayContaining(["remember", "memory_context"]),
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
        lifecycleDiagnosticsAvailable: true,
        compactionContinuityAvailable: true,
        memoryProtocol: {
          version: "1",
          guidelines: expect.arrayContaining([
            "Save or propose durable decisions, preferences, and tasks through the existing memory tools.",
          ]),
        },
      },
    });
    expectNoForbiddenRuntimeCapabilityFields(serializedRuntimeCapabilities);
    expectNoForbiddenPublicRuntimeFieldNames(runtimeCapabilities);

    const memoryContext = parsePluginToolResult(await hooks.tool?.memory_context.execute({}, { sessionID: "session-1" }));
    expect(memoryContext).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-1",
        memoryProtocol: {
          version: "1",
        },
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
