import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PluginInput, PluginModule } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { getMemoryToolDefinitions, type MemoryToolBackend } from "../src/features/memory/lib/tool-definitions.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("OpenCode plugin path must not spawn child_process stdio processes.");
  }),
}));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedLocalUserId = `local:${os.userInfo().username}`;

const pluginModulePath = "../src/features/opencode-plugin/index.js";

interface PluginEvent {
  readonly type: "session.created" | "message.updated" | "message.part.updated" | "session.idle";
  readonly properties: Record<string, unknown>;
}

interface DeferredPromise<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

interface OpenCodePluginHooks {
  readonly event?: (input: { event: PluginEvent }) => Promise<void>;
  readonly "session.created"?: (input: { event: PluginEvent }) => Promise<void>;
  readonly "message.updated"?: (input: { event: PluginEvent }) => Promise<void>;
  readonly "session.idle"?: (input: { event: PluginEvent }) => Promise<void>;
  readonly "experimental.session.compacting"?: (input: unknown, output: unknown) => Promise<void>;
  readonly tool?: {
    readonly [toolName: string]: {
      readonly description?: string;
      readonly args?: Record<string, unknown>;
      readonly execute?: (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

type OpenCodePluginModule = Pick<PluginModule, "id"> & {
  readonly server: (input: PluginInput, options?: Record<string, unknown>) => Promise<OpenCodePluginHooks>;
};

function createSessionCreatedEvent(sessionId = "session-1"): PluginEvent {
  return {
    type: "session.created",
    properties: {
      sessionID: sessionId,
      info: {
        id: sessionId,
        title: "Memory plugin contract session",
      },
    },
  };
}

function createMessageUpdatedEvent(
  sessionId = "session-1",
  message = "Summarize recent memory context for this turn.",
  messageId = `${sessionId}-message-1`,
): PluginEvent {
  return {
    type: "message.updated",
    properties: {
      sessionID: sessionId,
      messageID: messageId,
      info: {
        role: "user",
      },
      parts: [
        {
          type: "text",
          text: message,
        },
      ],
    },
  };
}

function createMessageUpdatedEventWithoutText(
  sessionId = "session-1",
  messageId = `${sessionId}-message-1`,
): PluginEvent {
  return {
    type: "message.updated",
    properties: {
      sessionID: sessionId,
      messageID: messageId,
      parts: [],
    },
  };
}

function createMessagePartUpdatedEvent(
  sessionId = "session-1",
  message = "partial turn",
  messageId = `${sessionId}-message-1`,
): PluginEvent {
  return {
    type: "message.part.updated",
    properties: {
      sessionID: sessionId,
      messageID: messageId,
      part: {
        type: "text",
        ...(message ? { text: message } : {}),
      },
    },
  };
}

function createSessionIdleEvent(sessionId = "session-1"): PluginEvent {
  return {
    type: "session.idle",
    properties: {
      sessionID: sessionId,
      idle: true,
    },
  };
}

function createPrepareTurnResult(context: string) {
  return {
    context,
    items: [context],
    truncated: false,
    degraded: false,
    memorySuggestions: {
      recommendation: "strong_candidate" as const,
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [],
    },
    conservativePolicy: {
      recommendation: "strong_candidate" as const,
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [{ candidateIndex: 0, reason: "incomplete_scope_ids" as const }],
      reviewOnlySuggestions: [],
    },
  };
}

function createPrepareHostTurnResult(context: string) {
  return {
    context,
    items: [context],
    truncated: false,
    degraded: false,
    memorySuggestions: {
      recommendation: "strong_candidate" as const,
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [
        {
          kind: "decision" as const,
          scope: "session" as const,
          reason: "Explicit durable language",
          draftContent: context,
          confidence: "high" as const,
        },
      ],
    },
    conservativePolicy: {
      recommendation: "strong_candidate" as const,
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [
        {
          kind: "decision" as const,
          scope: "session" as const,
          reason: "Explicit durable language",
          draftContent: context,
          confidence: "high" as const,
        },
      ],
      autoSaved: [],
      autoSaveSkipped: [{ candidateIndex: 0, reason: "incomplete_scope_ids" as const }],
      reviewOnlySuggestions: [],
    },
  };
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: DeferredPromise<T>["resolve"];
  let reject!: DeferredPromise<T>["reject"];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function parsePluginToolResult(result: unknown): unknown {
  expect(typeof result).toBe("string");
  return JSON.parse(result as string);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceFakeTimeBy(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await flushMicrotasks();
}

async function importPluginModule(): Promise<OpenCodePluginModule> {
  try {
    const imported = (await import(pluginModulePath)) as Partial<OpenCodePluginModule>;
    expect(imported.server).toEqual(expect.any(Function));
    return imported as OpenCodePluginModule;
  } catch (error) {
    const wrappedError = new Error(
      "Expected an OpenCode plugin module at src/features/opencode-plugin/index.ts exporting a `server` plugin function.",
    ) as Error & { cause?: unknown };
    wrappedError.cause = error;
    throw wrappedError;
  }
}

function createOptionalBunSpawnSpy() {
  const bunGlobal = (globalThis as { Bun?: { spawn?: (...args: unknown[]) => unknown } }).Bun;

  if (!bunGlobal || typeof bunGlobal.spawn !== "function") {
    return undefined;
  }

  try {
    return vi
      .spyOn(bunGlobal as { spawn: (...args: unknown[]) => unknown }, "spawn")
      .mockImplementation((() => {
        throw new Error("OpenCode plugin path must not self-spawn the local stdio MCP server.");
      }) as (...args: unknown[]) => unknown);
  } catch {
    return undefined;
  }
}

function createToolTestMemoryBackend(overrides?: Partial<MemoryToolBackend>): MemoryToolBackend {
  return {
    remember: vi.fn().mockResolvedValue({ id: "remembered-memory" }),
    search: vi.fn().mockResolvedValue({ items: [], degraded: false }),
    buildContext: vi.fn().mockResolvedValue({
      context: "built-context",
      items: ["built-context"],
      truncated: false,
      degraded: false,
    }),
    upsertDocument: vi.fn().mockResolvedValue({ id: "upserted-document" }),
    list: vi.fn().mockResolvedValue([]),
    suggestMemoryCandidates: vi.fn().mockReturnValue({
      recommendation: "likely_skip",
      signals: { durable: [], ephemeral: [] },
      candidates: [],
    }),
    applyConservativeMemoryPolicy: vi.fn().mockResolvedValue({
      recommendation: "likely_skip",
      signals: { durable: [], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    }),
    inspectMemoryRetrieval: vi.fn().mockResolvedValue({
      status: "empty",
      lookup: "latest",
    }),
    prepareHostTurnMemory: vi.fn().mockResolvedValue(createPrepareHostTurnResult("host context")),
    wakeUpMemory: vi.fn().mockResolvedValue({
      wakeUpContext: "profile\n\n---\n\nrecent",
      profile: {
        context: "profile",
        items: ["profile-item"],
        truncated: false,
        degraded: false,
      },
      recent: {
        context: "recent",
        items: ["recent-item"],
        truncated: false,
        degraded: false,
      },
      truncated: false,
      degraded: false,
    }),
    prepareTurnMemory: vi.fn().mockResolvedValue(createPrepareTurnResult("turn context")),
    ...overrides,
  };
}

async function createPluginHarness(options?: {
  readonly memoryOverrides?: Partial<MemoryToolBackend>;
  readonly createMemoryBackend?: ReturnType<typeof vi.fn>;
  readonly messageDebounceMs?: number;
  readonly standaloneMcpAvailable?: boolean;
  readonly sessionVisibleRemindersAvailable?: boolean;
  readonly sessionPromptAsyncAvailable?: boolean;
  readonly tuiShowToastAvailable?: boolean;
  readonly homeDirectory?: string;
  readonly opencodeConfigDirectory?: string;
  readonly resetModules?: boolean;
}) {
  const resetModules = (vi as typeof vi & { resetModules?: () => void }).resetModules;

  if (options?.resetModules !== false && typeof resetModules === "function") {
    resetModules();
  }

  const shell = vi.fn(async (...args: unknown[]) => args);
  const log = vi.fn().mockResolvedValue(undefined);
  const promptAsync = vi.fn().mockResolvedValue(undefined);
  const showToast = vi.fn().mockResolvedValue(true);
  const childProcessSpawn = childProcess.spawn as unknown as MockInstance;
  const bunSpawn = createOptionalBunSpawnSpy();

  const memory = createToolTestMemoryBackend(options?.memoryOverrides);
  const isolatedUserConfigDirectory = path.join(repoRoot, ".opencode-plugin-test-user-config");

  const module = await importPluginModule();
  const testOptions = {
    ...(options?.createMemoryBackend ? {} : { memory }),
    ...(options?.createMemoryBackend ? { createMemoryBackend: options.createMemoryBackend } : {}),
    messageDebounceMs: options?.messageDebounceMs ?? 25,
    standaloneMcpAvailable: options?.standaloneMcpAvailable ?? false,
    sessionVisibleRemindersAvailable: options?.sessionVisibleRemindersAvailable,
    homeDirectory: options?.homeDirectory,
    opencodeConfigDirectory:
      options?.opencodeConfigDirectory ?? (options?.homeDirectory ? undefined : isolatedUserConfigDirectory),
  };
  const hooks = await module.server(
    {
      project: {
        id: "mahiro-mcp-memory-layer",
        name: "mahiro-mcp-memory-layer",
        directory: repoRoot,
      },
      directory: repoRoot,
      worktree: repoRoot,
      serverUrl: new URL("http://localhost:4096"),
      client: {
        ...(options?.sessionPromptAsyncAvailable
          ? {
              session: {
                promptAsync,
              },
            }
          : {}),
        ...(options?.tuiShowToastAvailable
          ? {
              tui: {
                showToast,
              },
            }
          : {}),
        app: {
          log,
        },
      },
      $: shell,
    } as unknown as PluginInput,
    {
      __test: testOptions,
    } as unknown as Record<string, unknown>,
  );

  expect(hooks.event).toEqual(expect.any(Function));

  return {
    hooks,
    memory,
    shell,
    log,
    promptAsync,
    showToast,
    childProcessSpawn,
    bunSpawn,
  };
}

function expectNoSelfSpawn(harness: {
  readonly shell: ReturnType<typeof vi.fn>;
  readonly childProcessSpawn: MockInstance;
  readonly bunSpawn?: MockInstance;
}) {
  expect(harness.shell).not.toHaveBeenCalled();
  expect(harness.childProcessSpawn).not.toHaveBeenCalled();
  if (harness.bunSpawn) {
    expect(harness.bunSpawn).not.toHaveBeenCalled();
  }
}

afterEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("../src/features/opencode-plugin/config-loader.js");
  const runtimeShell = await import("../src/features/opencode-plugin/runtime-shell.js");
  runtimeShell.resetOpenCodePluginMemoryBackendSingletonForTests();
});

describe("product memory OpenCode plugin contract", () => {
  it("initializes as an OpenCode plugin module with the shared native memory tool surface, memory_context, runtime_capabilities, and no stdio self-spawn", async () => {
    const harness = await createPluginHarness();
    const sharedMemoryToolNames = getMemoryToolDefinitions().map((tool) => tool.name).sort();

    expect(harness.hooks.event).toEqual(expect.any(Function));
    expect(harness.hooks["session.created"]).toEqual(expect.any(Function));
    expect(harness.hooks["message.updated"]).toEqual(expect.any(Function));
    expect(harness.hooks["session.idle"]).toEqual(expect.any(Function));
    expect(harness.hooks["experimental.session.compacting"]).toEqual(expect.any(Function));
    expect(Object.keys(harness.hooks.tool ?? {}).sort()).toEqual(
      [...sharedMemoryToolNames, "mark_orchestration_task_verification", "memory_context", "runtime_capabilities"].sort(),
    );
    for (const sharedMemoryTool of getMemoryToolDefinitions()) {
      expect(harness.hooks.tool?.[sharedMemoryTool.name]?.description).toBe(sharedMemoryTool.description);
      expect(Object.keys(harness.hooks.tool?.[sharedMemoryTool.name]?.args ?? {}).sort()).toEqual(
        Object.keys(sharedMemoryTool.inputSchema).sort(),
      );
      expect(harness.hooks.tool?.[sharedMemoryTool.name]?.execute).toEqual(expect.any(Function));
    }
    expect(harness.hooks.tool?.memory_context?.description).toContain("cached memory context");
    expect(harness.hooks.tool?.memory_context?.args).toEqual({});
    expect(harness.hooks.tool?.memory_context?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.runtime_capabilities?.description).toContain("runtime capability contract");
    expect(harness.hooks.tool?.runtime_capabilities?.args).toEqual({});
    expect(harness.hooks.tool?.runtime_capabilities?.execute).toEqual(expect.any(Function));
    expectNoSelfSpawn(harness);
  });

  it("reports plugin-native-only capabilities when standalone MCP orchestration is unavailable", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: false,
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities?.execute?.({}, {}));

    expect(result).toEqual({
      mode: "plugin-native",
      memory: {
        toolNames: expect.arrayContaining(["remember", "prepare_host_turn_memory", "wake_up_memory", "memory_context"]),
        sessionStartWakeUpAvailable: true,
        turnPreflightAvailable: true,
        idlePersistenceAvailable: true,
        memoryContextToolAvailable: true,
      },
      orchestration: {
        available: false,
        toolNames: [],
        activation: "unavailable",
      },
      facade: {
        categoryRoutingAvailable: true,
        categoryRoutes: {},
        remindersConfigured: false,
        sessionVisibleRemindersAvailable: false,
        sessionTaskFlowAvailable: false,
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("loads user-level plugin config through the plugin server entrypoint", async () => {
    const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "opencode-plugin-home-"));

    try {
      const userConfigDirectory = path.join(homeDirectory, ".config", "opencode");
      await mkdir(userConfigDirectory, { recursive: true });
      await writeFile(
        path.join(userConfigDirectory, "mahiro-mcp-memory-layer.jsonc"),
        JSON.stringify({
          runtime: {
            remindersEnabled: true,
          },
        }),
      );

      const harness = await createPluginHarness({
        homeDirectory,
        standaloneMcpAvailable: true,
      });
      const capabilities = parsePluginToolResult(
        await harness.hooks.tool?.runtime_capabilities?.execute?.({}, { sessionID: "session-1" }),
      );

      expect(capabilities).toMatchObject({
        facade: {
          remindersConfigured: true,
        },
      });
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it("reports session-visible reminder support when session prompt injection is available", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: true,
      sessionPromptAsyncAvailable: true,
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities?.execute?.({}, {}));

    expect(result).toMatchObject({
      facade: {
        sessionVisibleRemindersAvailable: true,
        sessionTaskFlowAvailable: true,
      },
    });
  });

  it("does not advertise session task flow when prompt injection exists without MCP orchestration", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: false,
      sessionPromptAsyncAvailable: true,
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities?.execute?.({}, {}));

    expect(result).toMatchObject({
      mode: "plugin-native",
      orchestration: {
        available: false,
      },
      facade: {
        sessionVisibleRemindersAvailable: true,
        sessionTaskFlowAvailable: false,
      },
    });
  });

  it("returns compact plugin-facing call_worker output while preserving warnings", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: true,
    });

    const result = parsePluginToolResult(
      await harness.hooks.tool?.call_worker?.execute?.(
        {
          worker: "gemini",
          prompt: "Summarize this repo.",
          mode: "ask",
          force: true,
          trust: false,
        },
        { sessionID: "session-1" },
      ),
    ) as Record<string, unknown>;

    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^workflow_/),
      status: "running",
      worker: "gemini",
      ignoredFields: ["mode", "force", "trust"],
      warning: "Ignored incompatible gemini worker fields: mode, force, trust.",
    });
    expect(result).not.toHaveProperty("message");
    expect(result).not.toHaveProperty("recommendedFollowUp");
    expect(result).not.toHaveProperty("superviseWith");
    expect(result).not.toHaveProperty("superviseResultWith");
    expect(result).not.toHaveProperty("waitWith");

    harness.childProcessSpawn.mockClear();
    harness.bunSpawn?.mockClear();
  });

  it("reports MCP-capable capabilities when standalone orchestration is available", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: true,
    });

    harness.shell.mockClear();
    harness.childProcessSpawn.mockClear();
    harness.bunSpawn?.mockClear();

    const result = parsePluginToolResult(await harness.hooks.tool?.runtime_capabilities?.execute?.({}, {}));

    expect(result).toMatchObject({
      mode: "plugin-native+mcp",
      orchestration: {
        available: true,
        serverName: "mahiro-mcp-memory-layer",
        activation: "source-checkout-mcp-injection",
      },
      facade: {
        categoryRoutingAvailable: true,
        categoryRoutes: {},
        remindersConfigured: false,
        sessionVisibleRemindersAvailable: false,
        sessionTaskFlowAvailable: false,
      },
    });
    expect((result as { orchestration: { toolNames: string[] } }).orchestration.toolNames).toContain(
      "orchestrate_workflow",
    );
    expect((result as { orchestration: { toolNames: string[] } }).orchestration.toolNames).toContain(
      "start_agent_task",
    );
    expect((result as { orchestration: { toolNames: string[] } }).orchestration.toolNames).toContain(
      "call_worker",
    );
    expectNoSelfSpawn(harness);
  });

  it("exposes orchestration tools on the plugin path when MCP-backed orchestration is available", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: true,
    });

    expect(harness.hooks.tool?.start_agent_task?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.call_worker?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.get_orchestration_result?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.supervise_orchestration_result?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.get_orchestration_supervision_result?.execute).toEqual(expect.any(Function));
    expect(harness.hooks.tool?.orchestrate_workflow).toBeUndefined();
    expect(harness.hooks.tool?.wait_for_orchestration_result).toBeUndefined();
    expect(harness.hooks.tool?.list_orchestration_traces).toBeUndefined();
  });

  it("serves the native memory_context tool from cached singleton runtime state", async () => {
    const harness = await createPluginHarness({
      standaloneMcpAvailable: false,
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "profile\n\n---\n\nrecent",
          profile: {
            context: "profile",
          items: ["profile-item"],
          truncated: false,
          degraded: false,
        },
        recent: {
          context: "recent",
          items: ["recent-item"],
          truncated: false,
          degraded: false,
        },
        truncated: false,
        degraded: false,
        }),
      },
    });

    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-tool") });
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-tool",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      latestSessionId: "session-tool",
      session: {
        sessionId: "session-tool",
        scopeResolution: {
          status: "complete",
          scope: {
            userId: expectedLocalUserId,
          },
        },
        lastEventType: "session.created",
        coordination: {
          messageDebounceMs: 25,
          messageVersion: 0,
          hasPendingMessageDebounce: false,
        },
        startupBrief: expect.stringContaining("Runtime startup brief"),
        capabilities: {
          memory: {
            sessionStartWakeUpAvailable: true,
          },
        },
        cached: {
          wakeUp: {
            wakeUpContext: expect.stringContaining("Runtime startup brief"),
            truncated: false,
            degraded: false,
          },
        },
      },
    });
    expect(harness.memory.wakeUpMemory).toHaveBeenCalledTimes(1);
    expectNoSelfSpawn(harness);
  });

  it("returns empty when memory_context is called without an explicit session id", async () => {
    const harness = await createPluginHarness();

    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-tool-a") });
    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-tool-b") });
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toEqual({
      status: "empty",
      latestSessionId: "session-tool-b",
    });
    expectNoSelfSpawn(harness);
  });

  it("keeps memory_context strictly session-scoped when multiple sessions are cached", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "profile\n\n---\n\nrecent",
          profile: {
            context: "profile",
          items: ["profile-item"],
          truncated: false,
          degraded: false,
        },
        recent: {
          context: "recent",
          items: ["recent-item"],
          truncated: false,
          degraded: false,
        },
        truncated: false,
        degraded: false,
        }),
      },
    });

    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-one") });
    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-two") });
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-one",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      latestSessionId: "session-two",
      session: {
        sessionId: "session-one",
      },
    });
    expect(result).not.toHaveProperty("availableSessionIds");
    expectNoSelfSpawn(harness);
  });

  it("scopes inspect_memory_retrieval latest lookups to the active session worktree on the plugin path", async () => {
    const harness = await createPluginHarness();

    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-trace") });
    await flushMicrotasks();

    await harness.hooks.tool?.inspect_memory_retrieval?.execute?.(
      {},
      {
        sessionID: "session-trace",
        directory: repoRoot,
        worktree: repoRoot,
      },
    );

    expect(harness.memory.inspectMemoryRetrieval).toHaveBeenCalledWith({
      latestScopeFilter: {
        userId: expectedLocalUserId,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-trace",
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("runs session-start wake-up once per new session across generic and dedicated hooks", async () => {
    const harness = await createPluginHarness();

    await harness.hooks.event?.({ event: createSessionCreatedEvent("session-a") });
    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-a") });
    await harness.hooks.event?.({ event: createMessageUpdatedEvent("session-a", "draft one") });
    await harness.hooks.event?.({ event: createSessionIdleEvent("session-a") });
    await flushMicrotasks();

    expect(harness.memory.wakeUpMemory).toHaveBeenCalledTimes(1);
    expect(harness.memory.wakeUpMemory).toHaveBeenCalledWith({
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-a",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session-start",
      phase: "wake-up",
    });
    expect(harness.memory.prepareTurnMemory).not.toHaveBeenCalled();
    expect(harness.memory.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalled();
    expectNoSelfSpawn(harness);
  });

  it("logs session-start lifecycle breadcrumbs for wake-up diagnostics", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "profile\n\n---\n\nrecent",
          profile: {
            context: "profile",
            items: ["profile-item"],
            truncated: false,
            degraded: false,
          },
          recent: {
            context: "recent",
            items: ["recent-item"],
            truncated: false,
            degraded: false,
          },
          truncated: false,
          degraded: false,
        }),
      },
    });

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-debug") });
    await flushMicrotasks();

    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "debug",
          message: "OpenCode plugin session-start wake-up started.",
          extra: expect.objectContaining({
            sessionId: "session-debug",
            userId: expectedLocalUserId,
            projectId: "mahiro-mcp-memory-layer",
            containerId: `worktree:${repoRoot}`,
            scopeSessionId: "session-debug",
          }),
        }),
      }),
    );
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "debug",
          message: "OpenCode plugin session-start wake-up cached.",
          extra: expect.objectContaining({
            sessionId: "session-debug",
            sessionStillPresent: true,
            hadCachedWakeUpBeforeWrite: false,
            hasCachedWakeUpAfterWrite: true,
          }),
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("starts wake-up from the generic event hook when session.created is absent", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "profile\n\n---\n\nrecent",
          profile: {
            context: "profile",
            items: ["profile-item"],
            truncated: false,
            degraded: false,
          },
          recent: {
            context: "recent",
            items: ["recent-item"],
            truncated: false,
            degraded: false,
          },
          truncated: false,
          degraded: false,
        }),
      },
    });

    await harness.hooks.event?.({ event: createMessagePartUpdatedEvent("session-fallback") });
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-fallback",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(harness.memory.wakeUpMemory).toHaveBeenCalledTimes(1);
    expect(harness.memory.wakeUpMemory).toHaveBeenCalledWith({
      userId: expectedLocalUserId,
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-fallback",
    }, {
      surface: "opencode-plugin",
      trigger: "session-start",
      phase: "wake-up",
    });
    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-fallback",
        lastEventType: "message.part.updated",
        cached: {
          wakeUp: {
            wakeUpContext: expect.stringContaining("Runtime startup brief"),
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("debounces repeated message.updated events into one read-only precompute", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory: vi.fn().mockResolvedValue(createPrepareTurnResult("turn context: draft three")),
      },
      messageDebounceMs: 25,
    });

    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-turn", "draft one") });
    await advanceFakeTimeBy(20);
    await harness.hooks.event?.({ event: createMessageUpdatedEvent("session-turn", "draft two") });
    await advanceFakeTimeBy(20);
    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-turn", "draft three") });

    expect(harness.memory.prepareTurnMemory).not.toHaveBeenCalled();

    const whilePending = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(whilePending).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-turn",
        coordination: {
          messageVersion: 3,
          hasPendingMessageDebounce: true,
        },
        cached: {},
      },
    });

    await advanceFakeTimeBy(25);

    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledTimes(1);
    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledWith({
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "draft three",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "message.updated",
      phase: "turn-preflight",
    });
    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expect(harness.memory.wakeUpMemory).not.toHaveBeenCalled();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-turn",
        coordination: {
          messageVersion: 3,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareTurn: {
            context: "turn context: draft three",
            conservativePolicy: {
              autoSaved: [],
            },
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("uses a stronger continuity-focused preflight task for recall-heavy message.updated prompts", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory: vi.fn().mockResolvedValue(createPrepareTurnResult("turn context: continue previous work")),
      },
      messageDebounceMs: 25,
    });

    await harness.hooks["message.updated"]?.({
      event: createMessageUpdatedEvent(
        "session-continuity",
        "Continue from the previous orchestration debugging session and recall what we decided earlier.",
      ),
    });
    await advanceFakeTimeBy(25);

    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledWith({
      task:
        "Summarize relevant memory context, prior decisions, and earlier work that help continue the latest OpenCode turn. Focus on this live turn: Continue from the previous orchestration debugging session and recall what we decided earlier.",
      mode: "query",
      recentConversation:
        "Continue from the previous orchestration debugging session and recall what we decided earlier.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-continuity",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "message.updated",
      phase: "turn-preflight",
    });
    expectNoSelfSpawn(harness);
  });

  it("uses a stronger continuity-focused preflight task for recall-heavy message.part.updated prompts", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory: vi.fn().mockResolvedValue(createPrepareTurnResult("turn context: partial continuity")),
      },
      messageDebounceMs: 25,
    });

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent(
        "session-part-continuity",
        "Continue from the previous session and compare it with what we decided earlier.",
        "session-part-continuity-message-1",
      ),
    });
    await advanceFakeTimeBy(25);

    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledWith({
      task:
        "Summarize relevant memory context, prior decisions, and earlier work that help continue the latest OpenCode turn. Focus on this live turn: Continue from the previous session and compare it with what we decided earlier.",
      mode: "query",
      recentConversation: "Continue from the previous session and compare it with what we decided earlier.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-part-continuity",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "message.part.updated",
      phase: "turn-preflight",
    });
    expectNoSelfSpawn(harness);
  });

  it("drops stale message.updated completions so older results cannot overwrite newer cache", async () => {
    vi.useFakeTimers();
    const firstTurn = createDeferredPromise<ReturnType<typeof createPrepareTurnResult>>();
    const secondTurn = createDeferredPromise<ReturnType<typeof createPrepareTurnResult>>();
    const prepareTurnMemory = vi
      .fn()
      .mockImplementationOnce(() => firstTurn.promise)
      .mockImplementationOnce(() => secondTurn.promise);
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory,
      },
      messageDebounceMs: 25,
    });

    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-stale", "first draft") });
    await advanceFakeTimeBy(25);
    expect(prepareTurnMemory).toHaveBeenCalledTimes(1);

    await harness.hooks.event?.({ event: createMessageUpdatedEvent("session-stale", "second draft") });
    await advanceFakeTimeBy(25);
    expect(prepareTurnMemory).toHaveBeenCalledTimes(2);

    secondTurn.resolve(createPrepareTurnResult("turn context: second draft"));
    await flushMicrotasks();

    firstTurn.resolve(createPrepareTurnResult("turn context: first draft"));
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-stale",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-stale",
        coordination: {
          messageVersion: 2,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareTurn: {
            context: "turn context: second draft",
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("debounces message.part.updated precompute and caches the latest part text", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory: vi.fn().mockResolvedValue(createPrepareTurnResult("turn context: partial draft three")),
      },
      messageDebounceMs: 25,
    });

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-turn", "partial draft one", "session-part-turn-message-1"),
    });
    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-turn", "partial draft two", "session-part-turn-message-1"),
    });
    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-turn", "partial draft three", "session-part-turn-message-1"),
    });

    const whilePending = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-part-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(whilePending).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-part-turn",
        lastEventType: "message.part.updated",
        coordination: {
          messageVersion: 3,
          hasPendingMessageDebounce: true,
        },
        cached: {},
      },
    });

    await advanceFakeTimeBy(25);

    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledTimes(1);
    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledWith({
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "partial draft three",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-part-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "message.part.updated",
      phase: "turn-preflight",
    });
    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-part-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-part-turn",
        coordination: {
          messageVersion: 3,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareTurn: {
            context: "turn context: partial draft three",
            conservativePolicy: {
              autoSaved: [],
            },
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("drops stale message.part.updated completions so older results cannot overwrite newer cache", async () => {
    vi.useFakeTimers();
    const firstTurn = createDeferredPromise<ReturnType<typeof createPrepareTurnResult>>();
    const secondTurn = createDeferredPromise<ReturnType<typeof createPrepareTurnResult>>();
    const prepareTurnMemory = vi
      .fn()
      .mockImplementationOnce(() => firstTurn.promise)
      .mockImplementationOnce(() => secondTurn.promise);
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory,
      },
      messageDebounceMs: 25,
    });

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-stale", "first partial", "session-part-stale-message-1"),
    });
    await advanceFakeTimeBy(25);
    expect(prepareTurnMemory).toHaveBeenCalledTimes(1);

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-stale", "second partial", "session-part-stale-message-1"),
    });
    await advanceFakeTimeBy(25);
    expect(prepareTurnMemory).toHaveBeenCalledTimes(2);

    secondTurn.resolve(createPrepareTurnResult("turn context: second partial"));
    await flushMicrotasks();

    firstTurn.resolve(createPrepareTurnResult("turn context: first partial"));
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-part-stale",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-part-stale",
        coordination: {
          messageVersion: 2,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareTurn: {
            context: "turn context: second partial",
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("keeps message.updated fail-open when precompute errors", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareTurnMemory: vi.fn().mockRejectedValue(new Error("turn precompute unavailable")),
      },
      messageDebounceMs: 25,
    });

    await expect(
      harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-turn-error", "draft fail") }),
    ).resolves.toBeUndefined();

    await advanceFakeTimeBy(25);

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-turn-error",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-turn-error",
        cached: {},
      },
    });
    expect(harness.memory.prepareTurnMemory).toHaveBeenCalledTimes(1);
    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "warn",
          message: "OpenCode plugin message.updated precompute failed open.",
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("skips low-value chatter for message.updated and session.idle preflight", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      messageDebounceMs: 25,
    });

    await harness.hooks["message.updated"]?.({
      event: createMessageUpdatedEvent("session-small-talk", "thanks"),
    });
    await advanceFakeTimeBy(25);
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-small-talk") });
    await flushMicrotasks();

    expect(harness.memory.prepareTurnMemory).not.toHaveBeenCalled();
    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expectNoSelfSpawn(harness);
  });

  it("skips low-value chatter for message.part.updated preflight", async () => {
    vi.useFakeTimers();
    const harness = await createPluginHarness({
      messageDebounceMs: 25,
    });

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-part-small-talk", "ping", "session-part-small-talk-message-1"),
    });
    await advanceFakeTimeBy(25);

    expect(harness.memory.prepareTurnMemory).not.toHaveBeenCalled();
    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expectNoSelfSpawn(harness);
  });

  it("runs session.idle conservative persistence once per handled turn and caches the result", async () => {
    const prepareHostTurnMemory = vi
      .fn()
      .mockResolvedValue(createPrepareHostTurnResult("host context: latest turn"));
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory,
      },
    });

    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-idle", "latest turn") });
    await harness.hooks.event?.({ event: createSessionIdleEvent("session-idle") });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-idle") });
    await flushMicrotasks();

    expect(prepareHostTurnMemory).toHaveBeenCalledTimes(1);
    expect(prepareHostTurnMemory).toHaveBeenCalledWith({
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "latest turn",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-idle",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-idle",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-idle",
        cached: {
          prepareHostTurn: {
            context: "host context: latest turn",
            conservativePolicy: {
              autoSaved: [],
            },
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("uses a stronger continuity-focused preflight task for recall-heavy session.idle persistence", async () => {
    const prepareHostTurnMemory = vi
      .fn()
      .mockResolvedValue(createPrepareHostTurnResult("host turn context: continue previous work"));
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory,
      },
      messageDebounceMs: 0,
    });

    await harness.hooks["message.updated"]?.({
      event: createMessageUpdatedEvent(
        "session-idle-continuity",
        "Resume from the previous session and remember the project context before we continue.",
      ),
    });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-idle-continuity") });
    await flushMicrotasks();

    expect(prepareHostTurnMemory).toHaveBeenCalledWith({
      task:
        "Summarize relevant memory context, prior decisions, and earlier work that help continue the latest OpenCode turn. Focus on this live turn: Resume from the previous session and remember the project context before we continue.",
      mode: "query",
      recentConversation:
        "Resume from the previous session and remember the project context before we continue.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-idle-continuity",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });
    expectNoSelfSpawn(harness);
  });

  it("allows session.idle to persist again after a new turn arrives", async () => {
    const prepareHostTurnMemory = vi
      .fn()
      .mockResolvedValueOnce(createPrepareHostTurnResult("host context: first turn"))
      .mockResolvedValueOnce(createPrepareHostTurnResult("host context: second turn"));
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory,
      },
    });

    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-next-turn", "first turn", "session-next-turn-message-1") });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-next-turn") });
    await flushMicrotasks();

    await harness.hooks.event?.({ event: createMessageUpdatedEvent("session-next-turn", "second turn", "session-next-turn-message-2") });
    await harness.hooks.event?.({ event: createSessionIdleEvent("session-next-turn") });
    await flushMicrotasks();

    expect(prepareHostTurnMemory).toHaveBeenCalledTimes(2);
    expect(prepareHostTurnMemory).toHaveBeenNthCalledWith(1, {
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "first turn",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-next-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });
    expect(prepareHostTurnMemory).toHaveBeenNthCalledWith(2, {
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "second turn",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-next-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });
    expectNoSelfSpawn(harness);
  });

  it("does not reuse stale recentConversation when a new turn has no extractable text", async () => {
    const prepareHostTurnMemory = vi
      .fn()
      .mockResolvedValueOnce(createPrepareHostTurnResult("host context: first turn"));
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory,
      },
    });

    await harness.hooks["message.updated"]?.({
      event: createMessageUpdatedEvent("session-empty-turn", "first turn", "session-empty-turn-message-1"),
    });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-empty-turn") });
    await flushMicrotasks();

    await harness.hooks["message.updated"]?.({
      event: createMessageUpdatedEventWithoutText("session-empty-turn", "session-empty-turn-message-2"),
    });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-empty-turn") });
    await flushMicrotasks();

    expect(prepareHostTurnMemory).toHaveBeenCalledTimes(1);
    expect(prepareHostTurnMemory).toHaveBeenCalledWith({
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "first turn",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-empty-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-empty-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-empty-turn",
        lastMessageId: "session-empty-turn-message-2",
        coordination: {
          messageVersion: 2,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareHostTurn: {
            context: "host context: first turn",
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("does not reuse stale recentConversation for a new textless message.part.updated turn", async () => {
    const prepareHostTurnMemory = vi
      .fn()
      .mockResolvedValueOnce(createPrepareHostTurnResult("host context: first partial turn"));
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory,
      },
    });

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent(
        "session-empty-part-turn",
        "first partial turn",
        "session-empty-part-turn-message-1",
      ),
    });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-empty-part-turn") });
    await flushMicrotasks();

    await harness.hooks.event?.({
      event: createMessagePartUpdatedEvent("session-empty-part-turn", "", "session-empty-part-turn-message-2"),
    });
    await harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-empty-part-turn") });
    await flushMicrotasks();

    expect(prepareHostTurnMemory).toHaveBeenCalledTimes(1);
    expect(prepareHostTurnMemory).toHaveBeenCalledWith({
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "first partial turn",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoRoot}`,
      sessionId: "session-empty-part-turn",
      userId: expectedLocalUserId,
    }, {
      surface: "opencode-plugin",
      trigger: "session.idle",
      phase: "host-turn-persistence",
    });

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-empty-part-turn",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-empty-part-turn",
        lastMessageId: "session-empty-part-turn-message-2",
        coordination: {
          messageVersion: 2,
          hasPendingMessageDebounce: false,
        },
        cached: {
          prepareHostTurn: {
            context: "host context: first partial turn",
          },
        },
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("skips session.idle safely when no turn has been cached yet", async () => {
    const harness = await createPluginHarness();

    await expect(
      harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-skip") }),
    ).resolves.toBeUndefined();
    await flushMicrotasks();

    expect(harness.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expectNoSelfSpawn(harness);
  });

  it("keeps session.idle fail-open when conservative persistence errors", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        prepareHostTurnMemory: vi.fn().mockRejectedValue(new Error("idle persistence unavailable")),
      },
    });

    await harness.hooks["message.updated"]?.({ event: createMessageUpdatedEvent("session-idle-error", "turn fail") });
    await expect(
      harness.hooks["session.idle"]?.({ event: createSessionIdleEvent("session-idle-error") }),
    ).resolves.toBeUndefined();
    await flushMicrotasks();

    expect(harness.memory.prepareHostTurnMemory).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "warn",
          message: "OpenCode plugin session.idle persistence failed open.",
        }),
      }),
    );

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-idle-error",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-idle-error",
        cached: {},
      },
    });
    expectNoSelfSpawn(harness);
  });

  it("appends best-effort compaction continuity from cached session state and logs invoked outcome", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "wake-up continuity",
          profile: {
            context: "profile",
          items: [],
          truncated: false,
          degraded: false,
        },
        recent: {
          context: "recent",
          items: [],
          truncated: false,
          degraded: false,
        },
        truncated: false,
        degraded: false,
        }),
      },
    });

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-compact") });
    await flushMicrotasks();

    const output = { context: [] as string[] };
    await harness.hooks["experimental.session.compacting"]?.(
      {
        sessionID: "session-compact",
      },
      output,
    );

    expect(output.context).toHaveLength(1);
    expect(output.context[0]).toContain("## Cached memory continuity");
    expect(output.context[0]).toContain("wake-up continuity");
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "info",
          message: "OpenCode plugin experimental.session.compacting invoked.",
          extra: expect.objectContaining({
            sessionId: "session-compact",
            reason: "cached_session_state_appended",
          }),
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("logs skipped compaction outcome when no cached continuity exists", async () => {
    const harness = await createPluginHarness();
    const output = { context: [] as string[] };

    await harness.hooks["experimental.session.compacting"]?.(
      {
        sessionID: "session-compact-skip",
      },
      output,
    );

    expect(output.context).toEqual([]);
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "info",
          message: "OpenCode plugin experimental.session.compacting skipped.",
          extra: expect.objectContaining({
            sessionId: "session-compact-skip",
            reason: "missing_cached_session_state",
          }),
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("logs degraded compaction outcome when output prompt is already set", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "wake-up continuity",
          profile: {
            context: "profile",
          items: [],
          truncated: false,
          degraded: false,
        },
        recent: {
          context: "recent",
          items: [],
          truncated: false,
          degraded: false,
        },
        truncated: false,
        degraded: false,
        }),
      },
    });

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-compact-degraded") });
    await flushMicrotasks();

    const output = { context: [] as string[], prompt: "existing prompt" };
    await harness.hooks["experimental.session.compacting"]?.(
      {
        sessionID: "session-compact-degraded",
      },
      output,
    );

    expect(output.context).toEqual([]);
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "info",
          message: "OpenCode plugin experimental.session.compacting degraded.",
          extra: expect.objectContaining({
            sessionId: "session-compact-degraded",
            reason: "output_prompt_already_set",
          }),
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("logs compaction error outcome when continuity append fails", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockResolvedValue({
          wakeUpContext: "wake-up continuity",
          profile: {
            context: "profile",
          items: [],
          truncated: false,
          degraded: false,
        },
        recent: {
          context: "recent",
          items: [],
          truncated: false,
          degraded: false,
        },
        truncated: false,
        degraded: false,
        }),
      },
    });

    await harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-compact-error") });
    await flushMicrotasks();

    const output = {
      context: {
        push: () => {
          throw new Error("append failed");
        },
      },
    };
    await harness.hooks["experimental.session.compacting"]?.(
      {
        sessionID: "session-compact-error",
      },
      output,
    );

    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "warn",
          message: "OpenCode plugin experimental.session.compacting error.",
          extra: expect.objectContaining({
            sessionId: "session-compact-error",
            reason: "context_append_failed",
            error: "append failed",
          }),
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("keeps session.created fail-open while wake-up is still pending", async () => {
    const deferredWakeUp = createDeferredPromise<{
      wakeUpContext: string;
      profile: { context: string; items: string[]; truncated: boolean; degraded: boolean };
      recent: { context: string; items: string[]; truncated: boolean; degraded: boolean };
      truncated: boolean;
      degraded: boolean;
    }>();
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockImplementation(() => deferredWakeUp.promise),
      },
    });

    await expect(
      harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-pending") }),
    ).resolves.toBeUndefined();

    expect(harness.memory.wakeUpMemory).toHaveBeenCalledTimes(1);

    const whilePending = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-pending",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(whilePending).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-pending",
        cached: {},
      },
    });

    deferredWakeUp.resolve({
      wakeUpContext: "ready",
      profile: {
        context: "profile",
        items: [],
        truncated: false,
        degraded: false,
      },
      recent: {
        context: "recent",
        items: [],
        truncated: false,
        degraded: false,
      },
      truncated: false,
      degraded: false,
    });
    await flushMicrotasks();
    expectNoSelfSpawn(harness);
  });

  it("keeps session.created fail-open when wake-up errors", async () => {
    const harness = await createPluginHarness({
      memoryOverrides: {
        wakeUpMemory: vi.fn().mockRejectedValue(new Error("backend unavailable")),
      },
    });

    await expect(
      harness.hooks["session.created"]?.({ event: createSessionCreatedEvent("session-error") }),
    ).resolves.toBeUndefined();
    await flushMicrotasks();

    const result = parsePluginToolResult(await harness.hooks.tool?.memory_context?.execute?.(
      {},
      {
        sessionID: "session-error",
        directory: repoRoot,
        worktree: repoRoot,
      },
    ));

    expect(result).toMatchObject({
      status: "ready",
      session: {
        sessionId: "session-error",
        cached: {},
      },
    });
    expect(harness.memory.wakeUpMemory).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          level: "warn",
          message: "OpenCode plugin session-start wake-up failed open.",
        }),
      }),
    );
    expectNoSelfSpawn(harness);
  });

  it("creates the backend lazily and reuses the singleton across plugin server instances", async () => {
    const createMemoryBackend = vi.fn().mockResolvedValue(createToolTestMemoryBackend());

    const first = await createPluginHarness({ createMemoryBackend });
    const second = await createPluginHarness({ createMemoryBackend, resetModules: false });

    expect(createMemoryBackend).not.toHaveBeenCalled();

    await first.hooks.event?.({ event: createSessionCreatedEvent("session-b") });
    await second.hooks.event?.({ event: createMessageUpdatedEvent("session-b", "draft two") });
    await flushMicrotasks();

    expect(createMemoryBackend).toHaveBeenCalledTimes(1);
    expect(second.memory.prepareTurnMemory).not.toHaveBeenCalled();
    expect(second.memory.prepareHostTurnMemory).not.toHaveBeenCalled();
    expectNoSelfSpawn(first);
    expectNoSelfSpawn(second);
  });
});
