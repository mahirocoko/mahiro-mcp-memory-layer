import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { PluginInput, PluginModule } from "@opencode-ai/plugin";
import { describe, expect, it, vi } from "vitest";

import { getMemoryToolDefinitions, type MemoryToolBackend } from "../src/features/memory/lib/tool-definitions.js";
import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const expectedLocalUserId = `local:${os.userInfo().username}`;

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

function createFixedWakeUpResult(context: string) {
  return {
    wakeUpContext: context,
    profile: { context: `${context}:profile`, items: [], truncated: false, degraded: false },
    recent: { context: `${context}:recent`, items: [], truncated: false, degraded: false },
    truncated: false,
    degraded: false,
  };
}

function createFixedPrepareTurnResult(context: string) {
  return {
    context,
    items: [context],
    truncated: false,
    degraded: false,
    memorySuggestions: {
      recommendation: "likely_skip" as const,
      signals: { durable: [], ephemeral: [] },
      candidates: [],
    },
    conservativePolicy: {
      recommendation: "likely_skip" as const,
      signals: { durable: [], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    },
  };
}

function createFixedPrepareHostTurnResult(context: string) {
  return {
    context,
    items: [context],
    truncated: false,
    degraded: false,
    memorySuggestions: {
      recommendation: "likely_skip" as const,
      signals: { durable: [], ephemeral: [] },
      candidates: [],
    },
    conservativePolicy: {
      recommendation: "likely_skip" as const,
      signals: { durable: [], ephemeral: [] },
      candidates: [],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    },
  };
}

function parsePluginToolResult(result: unknown): unknown {
  expect(typeof result).toBe("string");
  return JSON.parse(result as string);
}

function createSharedMemoryBackend(): MemoryToolBackend {
  return {
    remember: vi.fn().mockResolvedValue({ id: "remembered-memory" }),
    search: vi.fn().mockResolvedValue({ items: [{ id: "search-hit" }], degraded: false }),
    buildContext: vi.fn().mockResolvedValue({
      context: "built-context",
      items: ["built-context"],
      truncated: false,
      degraded: false,
    }),
    upsertDocument: vi.fn().mockResolvedValue({ id: "upserted-document" }),
    list: vi.fn().mockResolvedValue([{ id: "listed-memory" }]),
    suggestMemoryCandidates: vi.fn().mockReturnValue({
      recommendation: "consider_saving",
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [
        {
          kind: "decision",
          scope: "project",
          reason: "Explicit durable language.",
          draftContent: "Use the plugin-native memory surface.",
          confidence: "high",
        },
      ],
    }),
    applyConservativeMemoryPolicy: vi.fn().mockResolvedValue({
      recommendation: "consider_saving",
      signals: { durable: ["explicit_durable_language"], ephemeral: [] },
      candidates: [
        {
          kind: "decision",
          scope: "project",
          reason: "Explicit durable language.",
          draftContent: "Use the plugin-native memory surface.",
          confidence: "high",
        },
      ],
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [
        {
          kind: "decision",
          scope: "project",
          reason: "Explicit durable language.",
          draftContent: "Use the plugin-native memory surface.",
          confidence: "high",
        },
      ],
    }),
    inspectMemoryRetrieval: vi.fn().mockResolvedValue({
      status: "empty",
      lookup: "latest",
    }),
    prepareHostTurnMemory: vi.fn().mockResolvedValue(createFixedPrepareHostTurnResult("host-turn-context")),
    wakeUpMemory: vi.fn().mockResolvedValue(createFixedWakeUpResult("wake-up-context")),
    prepareTurnMemory: vi.fn().mockResolvedValue(createFixedPrepareTurnResult("turn-context")),
  };
}

function createSharedToolPayloads(repoPath: string): Record<string, Record<string, unknown>> {
  return {
    remember: {
      content: "Persist the chosen memory.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      source: { type: "tool", title: "plugin-test" },
    },
    search_memories: {
      query: "plugin-native memory tools",
      mode: "query",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
    },
    build_context_for_task: {
      task: "Summarize plugin-native memory support.",
      mode: "query",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoPath}`,
      sessionId: "session-1",
    },
    upsert_document: {
      projectId: "mahiro-mcp-memory-layer",
      source: { type: "document", uri: "file:///README.md", title: "README" },
      content: "Plugin-first install docs.",
    },
    list_memories: {
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
    },
    suggest_memory_candidates: {
      conversation: "We decided plugin users should get memory tools without MCP setup.",
      projectId: "mahiro-mcp-memory-layer",
    },
    apply_conservative_memory_policy: {
      conversation: "We decided plugin users should get memory tools without MCP setup.",
      projectId: "mahiro-mcp-memory-layer",
    },
    prepare_host_turn_memory: {
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "Summarize recent memory context for this turn.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoPath}`,
      sessionId: "session-1",
    },
    wake_up_memory: {
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoPath}`,
      sessionId: "session-1",
    },
    prepare_turn_memory: {
      task: "Summarize relevant memory context for the latest OpenCode turn.",
      mode: "query",
      recentConversation: "Summarize recent memory context for this turn.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: `worktree:${repoPath}`,
      sessionId: "session-1",
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceFakeTimeBy(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await flushMicrotasks();
}

describe("OpenCode plugin package", () => {
  it("exports the plugin server from the package root", async () => {
    const pluginModule = await import("mahiro-mcp-memory-layer");

    expect(pluginModule.server).toEqual(expect.any(Function));
  });

  it("depends on the official OpenCode plugin package for the published plugin contract", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });

    expect(packageJson.default.dependencies["@opencode-ai/plugin"]).toBeDefined();
  });

  it("publishes a plugin-first package surface without unrelated worker or orchestration sources", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--json", "--dry-run"], {
      cwd: repoRoot,
    });
    const [{ files }] = JSON.parse(stdout) as Array<{ readonly files: Array<{ readonly path: string }> }>;
    const packagedPaths = files.map((file) => file.path);

    expect(packagedPaths).toContain("src/features/opencode-plugin/index.ts");
    expect(packagedPaths).toContain("src/features/memory/memory-service.ts");
    expect(packagedPaths).toContain("MCP_USAGE.md");
    expect(packagedPaths).toContain("ORCHESTRATION.md");
    expect(packagedPaths).not.toContain("src/index.ts");
    expect(packagedPaths).not.toContain("src/cursor.ts");
    expect(packagedPaths).not.toContain("src/cursor-worker.ts");
    expect(packagedPaths).not.toContain("src/gemini.ts");
    expect(packagedPaths).not.toContain("src/gemini-worker.ts");
    expect(packagedPaths).not.toContain("src/orchestrate.ts");
    expect(packagedPaths).not.toContain("src/list-orchestration-traces.ts");
    expect(packagedPaths).not.toContain("src/eval-retrieval.ts");
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/features/cursor/"))).toBe(false);
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/features/gemini/"))).toBe(false);
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/features/orchestration/"))).toBe(false);
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/features/memory/eval/"))).toBe(false);
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/features/memory/mcp/"))).toBe(false);
    expect(packagedPaths.some((filePath) => filePath.startsWith("src/lib/"))).toBe(false);
  });

  it("keeps plugin and MCP adapters aligned on the shared native memory tool surface", async () => {
    vi.useFakeTimers();

    try {
      const sharedMemoryBackend = createSharedMemoryBackend();
      const sharedToolDefinitions = getMemoryToolDefinitions();
      const sharedToolPayloads = createSharedToolPayloads(repoRoot);

      const pluginModule = (await import("mahiro-mcp-memory-layer")) as {
        readonly server: (
          context: PluginInput,
          options?: {
            readonly __test?: {
              readonly memory?: MemoryToolBackend;
              readonly messageDebounceMs?: number;
            };
          },
        ) => Promise<{
          readonly "session.created": (input: { readonly event: ReturnType<typeof createSessionCreatedEvent> }) => Promise<void>;
          readonly "message.updated": (input: { readonly event: ReturnType<typeof createMessageUpdatedEvent> }) => Promise<void>;
          readonly "session.idle": (input: { readonly event: ReturnType<typeof createSessionIdleEvent> }) => Promise<void>;
          readonly tool: {
            readonly [toolName: string]: {
              readonly description: string;
              readonly args: Record<string, unknown>;
              readonly execute: (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;
            };
          };
        }>;
      } & Pick<PluginModule, "id">;

      const pluginHooks = await pluginModule.server(
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
            app: {
              log: vi.fn().mockResolvedValue(undefined),
            },
          },
          $: vi.fn(),
        },
        {
          __test: {
            memory: sharedMemoryBackend,
            messageDebounceMs: 0,
            standaloneMcpAvailable: false,
          },
        },
      );

      await pluginHooks["session.created"]({ event: createSessionCreatedEvent() });
      await flushMicrotasks();

      await pluginHooks["message.updated"]({ event: createMessageUpdatedEvent() });
      await advanceFakeTimeBy(0);

      await pluginHooks["session.idle"]({ event: createSessionIdleEvent() });
      await flushMicrotasks();

      const pluginResult = parsePluginToolResult(
        await pluginHooks.tool.memory_context.execute({}, { sessionID: "session-1" }),
      );

      expect(sharedMemoryBackend.wakeUpMemory).toHaveBeenCalledWith({
        userId: expectedLocalUserId,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(sharedMemoryBackend.prepareTurnMemory).toHaveBeenCalledWith({
        task: "Summarize relevant memory context for the latest OpenCode turn.",
        mode: "query",
        recentConversation: "Summarize recent memory context for this turn.",
        userId: expectedLocalUserId,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(sharedMemoryBackend.prepareHostTurnMemory).toHaveBeenCalledWith({
        task: "Summarize relevant memory context for the latest OpenCode turn.",
        mode: "query",
        recentConversation: "Summarize recent memory context for this turn.",
        userId: expectedLocalUserId,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(pluginResult).toMatchObject({
        status: "ready",
        latestSessionId: "session-1",
        session: {
          sessionId: "session-1",
          scopeResolution: {
            status: "complete",
            scope: {
              userId: expectedLocalUserId,
              projectId: "mahiro-mcp-memory-layer",
              containerId: `worktree:${repoRoot}`,
              sessionId: "session-1",
            },
            missing: [],
            resolvedFrom: {
              userId: "providedUserId",
              projectId: "context.project.id",
              containerId: "context.worktree",
              sessionId: "event.properties.sessionID",
            },
          },
          lastEventType: "session.idle",
          lastMessageId: "session-1-message-1",
          coordination: {
            messageDebounceMs: 0,
            messageVersion: 1,
            hasPendingMessageDebounce: false,
          },
          startupBrief: expect.stringContaining("Runtime startup brief"),
          capabilities: {
            memory: {
              sessionStartWakeUpAvailable: true,
            },
            orchestration: {
              available: false,
            },
          },
          cached: {
            wakeUp: expect.objectContaining({
              ...createFixedWakeUpResult("wake-up-context"),
              wakeUpContext: expect.stringContaining("Runtime startup brief"),
            }),
            prepareTurn: createFixedPrepareTurnResult("turn-context"),
            prepareHostTurn: createFixedPrepareHostTurnResult("host-turn-context"),
          },
        },
      });
      expect(pluginResult).not.toHaveProperty("availableSessionIds");
      expect((pluginResult as { readonly session: { readonly lastUpdatedAt: string } }).session.lastUpdatedAt).toEqual(
        expect.any(String),
      );

      const tools = getRegisteredMemoryTools(
        sharedMemoryBackend as unknown as MemoryService,
      );

      const expectedToolNames = [
        ...sharedToolDefinitions.map((tool) => tool.name),
        "memory_context",
        "runtime_capabilities",
      ].sort();

      expect(Object.keys(pluginHooks.tool).sort()).toEqual(expectedToolNames);
      expect(tools.map((tool) => tool.name).sort()).toEqual(sharedToolDefinitions.map((tool) => tool.name).sort());

      for (const sharedToolDefinition of sharedToolDefinitions) {
        const pluginTool = pluginHooks.tool[sharedToolDefinition.name];
        const mcpTool = tools.find((tool) => tool.name === sharedToolDefinition.name);
        const payload = sharedToolPayloads[sharedToolDefinition.name];

        expect(pluginTool).toBeDefined();
        expect(pluginTool.description).toBe(sharedToolDefinition.description);
        expect(pluginTool.args).toEqual(sharedToolDefinition.inputSchema);

        expect(mcpTool).toBeDefined();
        expect(mcpTool?.description).toBe(sharedToolDefinition.description);
        expect(mcpTool?.inputSchema).toBe(sharedToolDefinition.inputSchema);

        await expect(pluginTool.execute(payload, { sessionID: "session-1" })).resolves.toEqual(
          JSON.stringify(await mcpTool?.execute(payload), null, 2),
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
