import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

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

  it("publishes a plugin-first package surface without unrelated worker or orchestration sources", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--json", "--dry-run"], {
      cwd: repoRoot,
    });
    const [{ files }] = JSON.parse(stdout) as Array<{ readonly files: Array<{ readonly path: string }> }>;
    const packagedPaths = files.map((file) => file.path);

    expect(packagedPaths).toContain("src/features/opencode-plugin/index.ts");
    expect(packagedPaths).toContain("src/features/memory/memory-service.ts");
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

  it("keeps plugin and MCP adapters aligned on fixed inputs", async () => {
    vi.useFakeTimers();

    try {
      const wakeUpMemory = vi.fn().mockResolvedValue(createFixedWakeUpResult("wake-up-context"));
      const prepareTurnMemory = vi.fn().mockResolvedValue(createFixedPrepareTurnResult("turn-context"));
      const prepareHostTurnMemory = vi
        .fn()
        .mockResolvedValue(createFixedPrepareHostTurnResult("host-turn-context"));

      const pluginModule = (await import("mahiro-mcp-memory-layer")) as {
        readonly server: (
          context: {
            readonly project: { readonly id: string; readonly name: string; readonly directory: string };
            readonly directory: string;
            readonly worktree: string;
            readonly serverUrl: URL;
            readonly client: { readonly app: { readonly log: (entry: unknown) => Promise<void> } };
            readonly $: (...args: unknown[]) => Promise<unknown>;
          },
          options?: {
            readonly __test?: {
              readonly memory?: {
                readonly wakeUpMemory: typeof wakeUpMemory;
                readonly prepareTurnMemory: typeof prepareTurnMemory;
                readonly prepareHostTurnMemory: typeof prepareHostTurnMemory;
              };
              readonly messageDebounceMs?: number;
            };
          },
        ) => Promise<{
          readonly "session.created": (input: { readonly event: ReturnType<typeof createSessionCreatedEvent> }) => Promise<void>;
          readonly "message.updated": (input: { readonly event: ReturnType<typeof createMessageUpdatedEvent> }) => Promise<void>;
          readonly "session.idle": (input: { readonly event: ReturnType<typeof createSessionIdleEvent> }) => Promise<void>;
          readonly tool: {
            readonly memory_context: {
              readonly execute: (args: Record<string, never>, context: Record<string, unknown>) => Promise<unknown>;
            };
          };
        }>;
      };

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
            memory: {
              wakeUpMemory,
              prepareTurnMemory,
              prepareHostTurnMemory,
            },
            messageDebounceMs: 0,
          },
        },
      );

      await pluginHooks["session.created"]({ event: createSessionCreatedEvent() });
      await flushMicrotasks();

      await pluginHooks["message.updated"]({ event: createMessageUpdatedEvent() });
      await advanceFakeTimeBy(0);

      await pluginHooks["session.idle"]({ event: createSessionIdleEvent() });
      await flushMicrotasks();

      const pluginResult = await pluginHooks.tool.memory_context.execute({}, { sessionID: "session-1" });

      expect(wakeUpMemory).toHaveBeenCalledWith({
        userId: undefined,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(prepareTurnMemory).toHaveBeenCalledWith({
        task: "Summarize relevant memory context for the latest OpenCode turn.",
        mode: "query",
        recentConversation: "Summarize recent memory context for this turn.",
        userId: undefined,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(prepareHostTurnMemory).toHaveBeenCalledWith({
        task: "Summarize relevant memory context for the latest OpenCode turn.",
        mode: "query",
        recentConversation: "Summarize recent memory context for this turn.",
        userId: undefined,
        projectId: "mahiro-mcp-memory-layer",
        containerId: `worktree:${repoRoot}`,
        sessionId: "session-1",
      });
      expect(pluginResult).toMatchObject({
        status: "ready",
        latestSessionId: "session-1",
        availableSessionIds: ["session-1"],
        session: {
          sessionId: "session-1",
          scopeResolution: {
            status: "incomplete",
            reason: "incomplete_scope_ids",
            scope: {
              projectId: "mahiro-mcp-memory-layer",
              containerId: `worktree:${repoRoot}`,
              sessionId: "session-1",
            },
            missing: ["userId"],
            resolvedFrom: {
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
          cached: {
            wakeUp: createFixedWakeUpResult("wake-up-context"),
            prepareTurn: createFixedPrepareTurnResult("turn-context"),
            prepareHostTurn: createFixedPrepareHostTurnResult("host-turn-context"),
          },
        },
      });
      expect((pluginResult as { readonly session: { readonly lastUpdatedAt: string } }).session.lastUpdatedAt).toEqual(
        expect.any(String),
      );

      const sharedWakeUp = vi.fn().mockResolvedValue(createFixedWakeUpResult("wake-up-context"));
      const sharedPrepareTurn = vi.fn().mockResolvedValue(createFixedPrepareTurnResult("turn-context"));
      const sharedPrepareHostTurn = vi
        .fn()
        .mockResolvedValue(createFixedPrepareHostTurnResult("host-turn-context"));

      const tools = getRegisteredMemoryTools(
        {
          wakeUpMemory: sharedWakeUp,
          prepareTurnMemory: sharedPrepareTurn,
          prepareHostTurnMemory: sharedPrepareHostTurn,
        } as unknown as MemoryService,
      );

      const wakeUpTool = tools.find((tool) => tool.name === "wake_up_memory");
      const prepareTurnTool = tools.find((tool) => tool.name === "prepare_turn_memory");
      const prepareHostTurnTool = tools.find((tool) => tool.name === "prepare_host_turn_memory");

      expect(wakeUpTool).toBeDefined();
      expect(prepareTurnTool).toBeDefined();
      expect(prepareHostTurnTool).toBeDefined();

      await expect(
        wakeUpTool?.execute({
          projectId: "mahiro-mcp-memory-layer",
          containerId: `worktree:${repoRoot}`,
          sessionId: "session-1",
        }),
      ).resolves.toEqual(createFixedWakeUpResult("wake-up-context"));

      await expect(
        prepareTurnTool?.execute({
          task: "Summarize relevant memory context for the latest OpenCode turn.",
          mode: "query",
          recentConversation: "Summarize recent memory context for this turn.",
          projectId: "mahiro-mcp-memory-layer",
          containerId: `worktree:${repoRoot}`,
          sessionId: "session-1",
        }),
      ).resolves.toEqual(createFixedPrepareTurnResult("turn-context"));

      await expect(
        prepareHostTurnTool?.execute({
          task: "Summarize relevant memory context for the latest OpenCode turn.",
          mode: "query",
          recentConversation: "Summarize recent memory context for this turn.",
          projectId: "mahiro-mcp-memory-layer",
          containerId: `worktree:${repoRoot}`,
          sessionId: "session-1",
        }),
      ).resolves.toEqual(createFixedPrepareHostTurnResult("host-turn-context"));
    } finally {
      vi.useRealTimers();
    }
  });
});
