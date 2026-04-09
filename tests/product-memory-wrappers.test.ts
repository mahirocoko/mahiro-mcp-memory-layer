import { describe, expect, it, vi } from "vitest";

import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";
import type { PrepareHostTurnMemoryResult, WakeUpMemoryResult } from "../src/features/memory/types.js";

describe("product memory wrappers", () => {
  it("exposes wake_up_memory via MCP registration", async () => {
    const fixed: WakeUpMemoryResult = {
      wakeUpContext: "a\n\n---\n\nb",
      profile: { context: "a", items: [], truncated: false, degraded: false },
      recent: { context: "b", items: [], truncated: false, degraded: false },
      truncated: false,
      degraded: false,
    };

    const wakeUpMemory = vi.fn().mockResolvedValue(fixed);
    const stub = { wakeUpMemory } as unknown as MemoryService;

    const tools = getRegisteredMemoryTools(stub);
    const tool = tools.find((item) => item.name === "wake_up_memory");
    expect(tool).toBeDefined();

    const out = await tool?.execute({
      userId: "mahiro",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(wakeUpMemory).toHaveBeenCalled();
    expect(out).toEqual(fixed);
  });

  it("exposes prepare_turn_memory via MCP registration", async () => {
    const fixed: PrepareHostTurnMemoryResult = {
      context: "x",
      items: [],
      truncated: false,
      degraded: false,
      memorySuggestions: {
        recommendation: "likely_skip",
        signals: { durable: [], ephemeral: [] },
        candidates: [],
      },
      conservativePolicy: {
        recommendation: "likely_skip",
        signals: { durable: [], ephemeral: [] },
        candidates: [],
        autoSaved: [],
        autoSaveSkipped: [],
        reviewOnlySuggestions: [],
      },
    };

    const prepareTurnMemory = vi.fn().mockResolvedValue(fixed);
    const stub = { prepareTurnMemory } as unknown as MemoryService;

    const tools = getRegisteredMemoryTools(stub);
    const tool = tools.find((item) => item.name === "prepare_turn_memory");
    expect(tool).toBeDefined();

    const out = await tool?.execute({
      task: "Summarize",
      mode: "query",
      recentConversation: "hello",
    });

    expect(prepareTurnMemory).toHaveBeenCalled();
    expect(out).toEqual(fixed);
  });

  it("wakeUpMemory builds profile and recent sections for the same scope", async () => {
    const { MemoryService } = await import("../src/features/memory/memory-service.js");
    const svc = await MemoryService.create();
    const out = await svc.wakeUpMemory({
      userId: "mahiro",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(out.wakeUpContext).toContain("---");
    expect(out.wakeUpContext).toBe(`${out.profile.context}\n\n---\n\n${out.recent.context}`);
    expect(out.profile.context.length).toBeGreaterThan(0);
    expect(out.recent.context.length).toBeGreaterThan(0);
  });

  it("prepareTurnMemory matches prepareHostTurnMemory", async () => {
    const { MemoryService } = await import("../src/features/memory/memory-service.js");
    const svc = await MemoryService.create();
    const input = {
      task: "test task",
      mode: "query" as const,
      recentConversation: "short chat",
      userId: "mahiro",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    };
    const [a, b] = await Promise.all([svc.prepareHostTurnMemory(input), svc.prepareTurnMemory(input)]);
    expect(b).toEqual(a);
  });
});
