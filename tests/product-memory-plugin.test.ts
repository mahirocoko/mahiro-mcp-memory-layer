import * as childProcess from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PluginInput, PluginModule } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMemoryToolDefinitions, type MemoryToolBackend } from "../src/features/memory/lib/tool-definitions.js";
import type { PrepareHostTurnMemoryResult } from "../src/features/memory/types.js";
import { resetOpenCodePluginMemoryBackendSingletonForTests } from "../src/features/opencode-plugin/runtime-shell.js";

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

function createMessageUpdatedEventWithMessageId(sessionId: string, messageId: string, message: string) {
  return {
    type: "message.updated" as const,
    properties: {
      sessionID: sessionId,
      messageID: messageId,
      parts: [{ type: "text" as const, text: message }],
    },
  };
}

function createMessageUpdatedEventWithoutText(sessionId = "session-1") {
  return {
    type: "message.updated" as const,
    properties: {
      sessionID: sessionId,
      messageID: `${sessionId}-message-without-text`,
    },
  };
}

function createMessagePartUpdatedEvent(sessionId = "session-1", message = "Continue with the latest memory context.") {
  return {
    type: "message.part.updated" as const,
    properties: {
      sessionID: sessionId,
      messageID: `${sessionId}-message-part-1`,
      part: { type: "text" as const, text: message },
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

async function flushRuntimePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const forbiddenHookRuntimeSurfacePattern =
  /dispatchHook|PreToolUse|PostToolUse|PreCompact|command hook|http hook|claudeHooks|hookDispatch/i;

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

const durablePreferenceCandidate = {
  kind: "decision" as const,
  scope: "project" as const,
  reason: "Explicit decision language (decided/agreed/chose).",
  draftContent: "We decided to keep idle persistence conservative.",
  confidence: "high" as const,
};

function createPrepareHostTurnResult(
  overrides?: Partial<PrepareHostTurnMemoryResult>,
): PrepareHostTurnMemoryResult {
  return {
    context: "host-turn-context",
    items: [],
    truncated: false,
    degraded: false,
    memorySuggestions: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] },
    conservativePolicy: {
      recommendation: "likely_skip",
      signals: { durable: [], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    },
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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
    prepareHostTurnMemory: vi.fn().mockResolvedValue(createPrepareHostTurnResult()),
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

async function createHarness(options?: {
  readonly messageDebounceMs?: number;
  readonly pluginInput?: PluginInput;
}) {
  const backend = createMemoryBackend();
  const pluginModule = await importPluginModule();
  const pluginInput = options?.pluginInput ?? {
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
  resetOpenCodePluginMemoryBackendSingletonForTests();
  vi.clearAllMocks();
});

describe("product memory plugin", () => {
  it("initializes as an OpenCode plugin module with only memory tools, memory_context, and runtime_capabilities", async () => {
    const harness = await createHarness();
    const sharedMemoryToolNames = getMemoryToolDefinitions().map((tool) => tool.name);
    const pluginToolNames = Object.keys(harness.hooks.tool ?? {}).sort();

    expect(sharedMemoryToolNames).toEqual([...expectedMemoryToolNames]);
    expect(pluginToolNames).toEqual([...expectedMemoryToolNames, "memory_context", "runtime_capabilities"].sort());
    expectNoForbiddenPublicRuntimeSurfaceNames(pluginToolNames);
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });

  it("returns a memory-only runtime capability contract", async () => {
    const harness = await createHarness();

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities.execute({}, {}));
    const serializedResult = JSON.stringify(result);
    const capabilityRecord = expectRecord(result);
    const memoryCapabilities = expectRecord(capabilityRecord.memory);

    expect(Object.keys(capabilityRecord).sort()).toEqual(["memory", "mode"]);
    expect(Object.keys(memoryCapabilities).sort()).toEqual([...expectedRuntimeCapabilityMemoryKeys].sort());
    expect(memoryCapabilities.toolNames).toEqual([...expectedMemoryToolNames, "memory_context"]);
    expect(result).toMatchObject({
      mode: "plugin-native",
      memory: {
        toolNames: expect.arrayContaining(["remember", "prepare_host_turn_memory", "wake_up_memory", "memory_context"]),
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
        lifecycleDiagnosticsAvailable: true,
        compactionContinuityAvailable: true,
        memoryProtocol: {
          version: "1",
          guidelines: expect.arrayContaining([
            "Search memory before answering questions about prior work.",
            "Inspect the retrieval trace when recall is empty or unclear.",
          ]),
        },
      },
    });
    expect(serializedResult).not.toMatch(forbiddenHookRuntimeSurfacePattern);
    expectNoForbiddenRuntimeCapabilityFields(serializedResult);
    expectNoForbiddenPublicRuntimeFieldNames(result);
  });

  it("scopes latest retrieval inspection to the active session when no requestId is supplied", async () => {
    const sessionId = "inspect-scoped-session";
    const harness = await createHarness();

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent(sessionId) });

    await harness.hooks.tool?.inspect_memory_retrieval.execute({}, { sessionID: sessionId });

    expect(harness.backend.inspectMemoryRetrieval).toHaveBeenLastCalledWith({
      latestScopeFilter: {
        projectId: "mahiro-mcp-memory-layer",
        containerId: `directory:${repoRoot}`,
      },
    });
  });

  it("keeps requestId retrieval inspection unscoped", async () => {
    const sessionId = "inspect-request-id-session";
    const harness = await createHarness();

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent(sessionId) });

    await harness.hooks.tool?.inspect_memory_retrieval.execute({ requestId: "req_123" }, { sessionID: sessionId });

    expect(harness.backend.inspectMemoryRetrieval).toHaveBeenLastCalledWith({ requestId: "req_123" });
  });

  it("routes OpenCode lifecycle events as memory signals", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "lifecycle-session";

      await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent(sessionId) });
      await flushRuntimePromises();
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lastEventType: "session.created",
          lastMemoryLifecycleStages: ["session-start-wake-up"],
          memoryProtocol: {
            version: "1",
          },
          lifecycleDiagnostics: {
            "session-start-wake-up": {
              stage: "session-start-wake-up",
              status: "succeeded",
              reasonCode: "cache_write_completed",
              scopeUsed: {
                projectId: "mahiro-mcp-memory-layer",
                containerId: `directory:${repoRoot}`,
                sessionId,
              },
              summaryCounts: { retrieved: 0 },
            },
            "turn-preflight": {
              stage: "turn-preflight",
              status: "not_run",
              reasonCode: "awaiting_lifecycle_signal",
            },
            "idle-persistence": {
              stage: "idle-persistence",
              status: "not_run",
              reasonCode: "awaiting_lifecycle_signal",
            },
            "compaction-continuity": {
              stage: "compaction-continuity",
              status: "not_run",
              reasonCode: "awaiting_lifecycle_signal",
            },
          },
        },
      });

      expect(harness.backend.wakeUpMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          trigger: "session-start",
          phase: "wake-up",
        }),
      );

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the memory lifecycle baseline."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lastEventType: "message.updated",
          lastMemoryLifecycleStages: ["turn-preflight"],
          memoryProtocol: {
            version: "1",
          },
          lifecycleDiagnostics: {
            "turn-preflight": {
              stage: "turn-preflight",
              status: "succeeded",
              reasonCode: "cache_write_completed",
              summaryCounts: {
                retrieved: 0,
                candidates: 0,
                autoSaved: 0,
                reviewOnly: 0,
                skipped: 0,
              },
            },
          },
        },
      });

      expect(harness.backend.prepareTurnMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          trigger: "message.updated",
          phase: "turn-preflight",
        }),
      );

      await harness.hooks.event?.({
        event: createMessagePartUpdatedEvent(sessionId, "Continue with message part memory context."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lastEventType: "message.part.updated",
          lastMemoryLifecycleStages: ["session-start-wake-up", "turn-preflight"],
          memoryProtocol: {
            version: "1",
          },
        },
      });

      expect(harness.backend.prepareTurnMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          trigger: "message.part.updated",
          phase: "turn-preflight",
        }),
      );

      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lastEventType: "session.idle",
          lastMemoryLifecycleStages: ["idle-persistence"],
          memoryProtocol: {
            version: "1",
          },
        },
      });

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          trigger: "session.idle",
          phase: "host-turn-persistence",
        }),
      );

      const compactionOutput: { context: string[] } = { context: [] };
      await harness.hooks["experimental.session.compacting"]?.({ sessionID: sessionId }, compactionOutput);

      expect(compactionOutput.context.join("\n")).toContain("## Continuity cache");

      const contextResult = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );
      expect(contextResult).toMatchObject({
        status: "ready",
        session: {
          lastEventType: "experimental.session.compacting",
          lastMemoryLifecycleStages: ["compaction-continuity"],
          memoryProtocol: {
            version: "1",
          },
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "skipped",
              reasonCode: "no_candidates",
              summaryCounts: {
                candidates: 0,
                autoSaved: 0,
                reviewOnly: 0,
                skipped: 0,
              },
            },
            "compaction-continuity": {
              stage: "compaction-continuity",
              status: "succeeded",
              reasonCode: "cached_session_state_appended",
              summaryCounts: { retrieved: expect.any(Number) },
            },
          },
        },
      });
      expect(JSON.stringify(contextResult)).not.toMatch(forbiddenHookRuntimeSurfacePattern);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records skipped lifecycle diagnostics without changing continuity cache semantics", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "skipped-diagnostics-session";

      await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent(sessionId, "hi") });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(result).toMatchObject({
        status: "ready",
        session: {
          sessionId,
          continuityCache: {},
          lifecycleDiagnostics: {
            "session-start-wake-up": {
              stage: "session-start-wake-up",
              status: "not_run",
              reasonCode: "awaiting_lifecycle_signal",
            },
            "turn-preflight": {
              stage: "turn-preflight",
              status: "skipped",
              reasonCode: "preflight_not_needed",
              scopeUsed: {
                projectId: "mahiro-mcp-memory-layer",
                containerId: `directory:${repoRoot}`,
                sessionId,
              },
              summaryCounts: { skipped: 1 },
            },
          },
        },
      });
      expect(harness.backend.prepareTurnMemory).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prepares a compaction checkpoint before appending continuity without overwriting prompt", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 1_000 });
      const sessionId = "compaction-checkpoint-success-session";

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the compaction checkpoint memory lifecycle."),
      });

      const compactionOutput: { context: string[]; prompt?: string } = { context: [] };
      await harness.hooks["experimental.session.compacting"]?.({ sessionID: sessionId }, compactionOutput);

      expect(compactionOutput.prompt).toBeUndefined();
      expect(compactionOutput.context.join("\n")).toContain("## Continuity cache");
      expect(compactionOutput.context.join("\n")).toContain("### Latest idle persistence");
      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          recentConversation: "Continue the compaction checkpoint memory lifecycle.",
          projectId: "mahiro-mcp-memory-layer",
          containerId: `directory:${repoRoot}`,
        }),
        expect.objectContaining({
          trigger: "experimental.session.compacting",
          phase: "compaction-checkpoint",
        }),
      );

      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lifecycleDiagnostics: {
            "compaction-continuity": {
              stage: "compaction-continuity",
              status: "succeeded",
              reasonCode: "cached_session_state_appended",
            },
          },
          continuityCache: {
            prepareHostTurn: expect.any(Object),
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps compaction fail-open when checkpoint preparation fails and cached continuity exists", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 1_000 });
      const sessionId = "compaction-checkpoint-fail-open-session";

      await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent(sessionId) });
      await flushRuntimePromises();
      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue with fail-open compaction checkpoint memory."),
      });
      vi.mocked(harness.backend.prepareHostTurnMemory).mockRejectedValueOnce(new Error("checkpoint unavailable"));

      const compactionOutput: { context: string[]; prompt?: string } = { context: [] };
      await expect(
        harness.hooks["experimental.session.compacting"]?.({ sessionID: sessionId }, compactionOutput),
      ).resolves.toBeUndefined();

      expect(compactionOutput.prompt).toBeUndefined();
      expect(compactionOutput.context.join("\n")).toContain("## Continuity cache");
      expect(compactionOutput.context.join("\n")).toContain("### Session wake-up");
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          lifecycleDiagnostics: {
            "compaction-continuity": {
              stage: "compaction-continuity",
              status: "failed_open",
              reasonCode: "backend_failed_open",
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares idle and compaction idempotency for the same turn", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "compaction-checkpoint-idempotency-session";

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the idle and compaction idempotency lifecycle."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();

      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();
      await harness.hooks["experimental.session.compacting"]?.({ sessionID: sessionId }, { context: [] });

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(harness.backend.prepareHostTurnMemory).toHaveBeenLastCalledWith(
        expect.any(Object),
        expect.objectContaining({
          trigger: "session.idle",
          phase: "host-turn-persistence",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("records missing-scope compaction degradation without backend writes", async () => {
    vi.useFakeTimers();

    try {
      const incompleteScopeInput = {
        project: {},
        client: {},
      } as PluginInput;
      const harness = await createHarness({ messageDebounceMs: 1_000, pluginInput: incompleteScopeInput });
      const sessionId = "compaction-checkpoint-missing-scope-session";

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the missing scope compaction lifecycle."),
      });
      const compactionOutput: { context: string[] } = { context: [] };
      await harness.hooks["experimental.session.compacting"]?.({ sessionID: sessionId }, compactionOutput);

      expect(compactionOutput.context).toEqual([]);
      expect(harness.backend.prepareHostTurnMemory).not.toHaveBeenCalled();
      expect(parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }))).toMatchObject({
        status: "ready",
        session: {
          scopeResolution: {
            status: "incomplete",
            reason: "incomplete_scope_ids",
          },
          lifecycleDiagnostics: {
            "compaction-continuity": {
              stage: "compaction-continuity",
              status: "skipped",
              reasonCode: "incomplete_scope",
              summaryCounts: { skipped: 1 },
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records duplicate idle persistence as a deduped turn without duplicating backend writes", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "duplicate-idle-diagnostics-session";

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the duplicate idle lifecycle diagnostic."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();

      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();
      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: "ready",
        session: {
          sessionId,
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "skipped",
              reasonCode: "deduped_turn",
              scopeUsed: {
                projectId: "mahiro-mcp-memory-layer",
                containerId: `directory:${repoRoot}`,
                sessionId,
              },
              summaryCounts: { skipped: 1 },
            },
          },
          continuityCache: {
            prepareHostTurn: expect.any(Object),
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops stale idle persistence results after a newer turn update", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 1_000 });
      const sessionId = "stale-idle-result-session";
      const deferredPrepareHostTurn = createDeferred<PrepareHostTurnMemoryResult>();
      vi.mocked(harness.backend.prepareHostTurnMemory).mockReturnValueOnce(deferredPrepareHostTurn.promise);

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEventWithMessageId(
          sessionId,
          "stale-idle-message-a",
          "Continue the stale idle persistence diagnostic.",
        ),
      });
      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEventWithMessageId(
          sessionId,
          "stale-idle-message-b",
          "Continue with a newer turn before idle persistence resolves.",
        ),
      });

      deferredPrepareHostTurn.resolve(createPrepareHostTurnResult());
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: "ready",
        session: {
          lastMessageId: "stale-idle-message-b",
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "skipped",
              reasonCode: "stale_lifecycle_result",
              summaryCounts: { skipped: 1 },
            },
          },
          continuityCache: {},
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records likely-skip idle persistence without writing while preserving detailed policy output", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "likely-skip-idle-diagnostics-session";
      vi.mocked(harness.backend.prepareHostTurnMemory).mockResolvedValueOnce(
        createPrepareHostTurnResult({
          memorySuggestions: {
            recommendation: "likely_skip",
            signals: { durable: [], ephemeral: ["very_short_turn"] },
            candidates: [durablePreferenceCandidate],
          },
          conservativePolicy: {
            recommendation: "likely_skip",
            signals: { durable: [], ephemeral: ["very_short_turn"] },
            candidates: [durablePreferenceCandidate],
            autoSaved: [],
            autoSaveSkipped: [],
            reviewOnlySuggestions: [],
          },
        }),
      );

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "Continue the likely skip idle persistence diagnostic."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();

      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: "ready",
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "skipped",
              reasonCode: "likely_skip",
              summaryCounts: {
                candidates: 1,
                autoSaved: 0,
                reviewOnly: 0,
                skipped: 0,
              },
            },
          },
          continuityCache: {
            prepareHostTurn: {
              conservativePolicy: {
                recommendation: "likely_skip",
                autoSaved: [],
                autoSaveSkipped: [],
                reviewOnlySuggestions: [],
              },
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records strong-candidate idle auto-save as auto_saved while preserving detailed policy output", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "auto-saved-idle-diagnostics-session";
      vi.mocked(harness.backend.prepareHostTurnMemory).mockResolvedValueOnce(
        createPrepareHostTurnResult({
          memorySuggestions: {
            recommendation: "strong_candidate",
            signals: { durable: ["explicit_durable_language"], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
          },
          conservativePolicy: {
            recommendation: "strong_candidate",
            signals: { durable: ["explicit_durable_language"], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
            autoSaved: [{ candidateIndex: 0, id: "memory-auto-saved-1" }],
            autoSaveSkipped: [],
            reviewOnlySuggestions: [],
          },
        }),
      );

      await harness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent(sessionId, "We decided to keep idle persistence conservative."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();

      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(harness.backend.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: "ready",
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "succeeded",
              reasonCode: "auto_saved",
              summaryCounts: {
                candidates: 1,
                autoSaved: 1,
                reviewOnly: 0,
                skipped: 0,
              },
            },
          },
          continuityCache: {
            prepareHostTurn: {
              conservativePolicy: {
                recommendation: "strong_candidate",
                autoSaved: [{ candidateIndex: 0, id: "memory-auto-saved-1" }],
              },
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records review-only and incomplete-scope policy skips as deterministic idle diagnostics", async () => {
    vi.useFakeTimers();

    try {
      const reviewHarness = await createHarness({ messageDebounceMs: 5 });
      vi.mocked(reviewHarness.backend.prepareHostTurnMemory).mockResolvedValueOnce(
        createPrepareHostTurnResult({
          memorySuggestions: {
            recommendation: "consider_saving",
            signals: { durable: [], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
          },
          conservativePolicy: {
            recommendation: "consider_saving",
            signals: { durable: [], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
            autoSaved: [],
            autoSaveSkipped: [],
            reviewOnlySuggestions: [durablePreferenceCandidate],
          },
        }),
      );

      await reviewHarness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent("review-only-idle-session", "Continue the review-only persistence diagnostic."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();
      await reviewHarness.hooks["session.idle"]?.({ event: createSessionIdleEvent("review-only-idle-session") });
      await flushRuntimePromises();

      expect(
        parsePluginToolResult(
          await reviewHarness.hooks.tool?.memory_context.execute({}, { sessionID: "review-only-idle-session" }),
        ),
      ).toMatchObject({
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              status: "skipped",
              reasonCode: "review_only",
              summaryCounts: { candidates: 1, reviewOnly: 1 },
            },
          },
        },
      });

      resetOpenCodePluginMemoryBackendSingletonForTests();
      const skippedHarness = await createHarness({ messageDebounceMs: 5 });
      vi.mocked(skippedHarness.backend.prepareHostTurnMemory).mockResolvedValueOnce(
        createPrepareHostTurnResult({
          memorySuggestions: {
            recommendation: "strong_candidate",
            signals: { durable: ["explicit_durable_language"], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
          },
          conservativePolicy: {
            recommendation: "strong_candidate",
            signals: { durable: ["explicit_durable_language"], ephemeral: [] },
            candidates: [durablePreferenceCandidate],
            autoSaved: [],
            autoSaveSkipped: [{ candidateIndex: 0, reason: "incomplete_scope_ids" }],
            reviewOnlySuggestions: [],
          },
        }),
      );

      await skippedHarness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent("auto-save-skipped-idle-session", "We decided to keep scope validation strict."),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();
      await skippedHarness.hooks["session.idle"]?.({ event: createSessionIdleEvent("auto-save-skipped-idle-session") });
      await flushRuntimePromises();

      expect(
        parsePluginToolResult(
          await skippedHarness.hooks.tool?.memory_context.execute({}, { sessionID: "auto-save-skipped-idle-session" }),
        ),
      ).toMatchObject({
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              status: "skipped",
              reasonCode: "auto_save_skipped_incomplete_scope",
              summaryCounts: { candidates: 1, skipped: 1 },
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records idle persistence pre-backend skip reasons for small talk and missing turn keys", async () => {
    vi.useFakeTimers();

    try {
      const smallTalkHarness = await createHarness({ messageDebounceMs: 5 });
      await smallTalkHarness.hooks["message.updated"]?.({
        event: createMessageUpdatedEvent("small-talk-idle-session", "hi"),
      });
      await vi.advanceTimersByTimeAsync(5);
      await flushRuntimePromises();
      await smallTalkHarness.hooks["session.idle"]?.({ event: createSessionIdleEvent("small-talk-idle-session") });
      await flushRuntimePromises();

      expect(smallTalkHarness.backend.prepareHostTurnMemory).not.toHaveBeenCalled();
      expect(
        parsePluginToolResult(
          await smallTalkHarness.hooks.tool?.memory_context.execute({}, { sessionID: "small-talk-idle-session" }),
        ),
      ).toMatchObject({
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              status: "skipped",
              reasonCode: "small_talk",
              summaryCounts: { skipped: 1 },
            },
          },
        },
      });

      resetOpenCodePluginMemoryBackendSingletonForTests();
      const missingTurnHarness = await createHarness({ messageDebounceMs: 5 });
      await missingTurnHarness.hooks["session.created"]?.({ event: createSessionCreatedEvent("missing-turn-key-idle-session") });
      await flushRuntimePromises();
      await missingTurnHarness.hooks["session.idle"]?.({ event: createSessionIdleEvent("missing-turn-key-idle-session") });
      await flushRuntimePromises();

      expect(missingTurnHarness.backend.prepareHostTurnMemory).not.toHaveBeenCalled();
      expect(
        parsePluginToolResult(
          await missingTurnHarness.hooks.tool?.memory_context.execute({}, { sessionID: "missing-turn-key-idle-session" }),
        ),
      ).toMatchObject({
        session: {
          lifecycleDiagnostics: {
            "idle-persistence": {
              status: "skipped",
              reasonCode: "missing_turn_key",
              summaryCounts: { skipped: 1 },
            },
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records idle persistence with a turn key but no recent conversation as skipped", async () => {
    vi.useFakeTimers();

    try {
      const harness = await createHarness({ messageDebounceMs: 5 });
      const sessionId = "missing-conversation-diagnostics-session";

      await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEventWithoutText(sessionId) });
      await flushRuntimePromises();
      await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent(sessionId) });
      await flushRuntimePromises();

      const result = parsePluginToolResult(
        await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
      );

      expect(harness.backend.prepareHostTurnMemory).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: "ready",
        session: {
          sessionId,
          lifecycleDiagnostics: {
            "idle-persistence": {
              stage: "idle-persistence",
              status: "skipped",
              reasonCode: "empty_recent_conversation",
              scopeUsed: {
                projectId: "mahiro-mcp-memory-layer",
                containerId: `directory:${repoRoot}`,
                sessionId,
              },
              summaryCounts: { skipped: 1 },
            },
          },
          continuityCache: {},
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records failed-open lifecycle diagnostics without throwing", async () => {
    const harness = await createHarness();
    const sessionId = "failed-open-diagnostics-session";
    vi.mocked(harness.backend.wakeUpMemory).mockRejectedValueOnce(new Error("wake-up unavailable"));

    await expect(
      harness.hooks["session.created"]?.({ event: createSessionCreatedEvent(sessionId) }),
    ).resolves.toBeUndefined();
    await flushRuntimePromises();

    const result = parsePluginToolResult(
      await harness.hooks.tool?.memory_context.execute({}, { sessionID: sessionId }),
    );

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId,
        continuityCache: {},
        lifecycleDiagnostics: {
          "session-start-wake-up": {
            stage: "session-start-wake-up",
            status: "failed_open",
            reasonCode: "backend_error",
            scopeUsed: {
              projectId: "mahiro-mcp-memory-layer",
              containerId: `directory:${repoRoot}`,
              sessionId,
            },
          },
        },
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
          memoryProtocol: {
            version: "1",
          },
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

  it("returns empty without crashing or inventing session diagnostics for sessionless events", async () => {
    const harness = await createHarness();

    await expect(
      harness.hooks.event?.({ event: { type: "session.created", properties: {} } }),
    ).resolves.toBeUndefined();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context.execute({}, {}));
    expect(result).toMatchObject({
      status: "empty",
    });
    expect(result).not.toHaveProperty("session");
    expect(result).not.toHaveProperty("lifecycleDiagnostics");
  });
});
