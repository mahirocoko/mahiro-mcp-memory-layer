import { describe, expect, it, vi } from "vitest";

import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";
import type { PrepareHostTurnMemoryResult } from "../src/features/memory/types.js";

describe("prepareHostTurnMemory", () => {
  it("exposes prepare_host_turn_memory via MCP registration", async () => {
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

    const prepareHostTurnMemory = vi.fn().mockResolvedValue(fixed);
    const stub = { prepareHostTurnMemory } as unknown as MemoryService;

    const tools = getRegisteredMemoryTools(stub);
    const tool = tools.find((item) => item.name === "prepare_host_turn_memory");
    expect(tool).toBeDefined();

    const out = await tool?.execute({
      task: "Summarize",
      mode: "query",
      recentConversation: "hello",
    });

    expect(prepareHostTurnMemory).toHaveBeenCalled();
    expect(out).toEqual(fixed);
  });

  it("runs build context then conservative policy on the same suggestion snapshot", async () => {
    const { MemoryService } = await import("../src/features/memory/memory-service.js");
    const svc = await MemoryService.create();
    const out = await svc.prepareHostTurnMemory({
      task: "test task",
      mode: "query",
      recentConversation: "short chat",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(out.context.length).toBeGreaterThan(0);
    expect(out.memorySuggestions.recommendation).toBe(out.conservativePolicy.recommendation);
    expect(out.conservativePolicy).toMatchObject({
      recommendation: out.memorySuggestions.recommendation,
      signals: out.memorySuggestions.signals,
      candidates: out.memorySuggestions.candidates,
    });
  });
});
