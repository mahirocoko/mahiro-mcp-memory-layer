import { describe, expect, it } from "vitest";

import { suggestMemoryCandidates } from "../src/features/memory/core/suggest-memory-candidates.js";
import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";

describe("suggestMemoryCandidates", () => {
  it("returns likely_skip for empty conversation", () => {
    const result = suggestMemoryCandidates({ conversation: "   " });

    expect(result.recommendation).toBe("likely_skip");
    expect(result.candidates).toHaveLength(0);
  });

  it("detects a decision line and suggests project scope when projectId is set", () => {
    const result = suggestMemoryCandidates({
      conversation:
        "After some discussion we agreed to ship features behind a flag.\nWe decided to use Bun for all runtime scripts in this repository.",
      projectId: "mahiro-mcp-memory-layer",
    });

    const decision = result.candidates.find((c) => c.kind === "decision");
    expect(decision).toBeDefined();
    expect(decision?.scope).toBe("project");
    expect(decision?.confidence).toBe("high");
    expect(result.recommendation).toBe("strong_candidate");
  });

  it("suggests global scope when no project identifiers are provided", () => {
    const result = suggestMemoryCandidates({
      conversation: "I prefer two-space indentation in this codebase.",
    });

    expect(result.candidates[0]?.scope).toBe("global");
    expect(result.candidates[0]?.kind).toBe("conversation");
  });

  it("flags explicit remember/important content as durable facts", () => {
    const result = suggestMemoryCandidates({
      conversation: "Important: production deploys must go through the staging branch first.",
    });

    const fact = result.candidates.find((c) => c.kind === "fact");
    expect(fact).toBeDefined();
    expect(fact?.draftContent).toContain("Important:");
    expect(result.recommendation).toBe("strong_candidate");
  });

  it("surfaces a medium-confidence task follow-up", () => {
    const result = suggestMemoryCandidates({
      conversation: "Next step: migrate the legacy auth module to the new API.",
    });

    const task = result.candidates.find((c) => c.kind === "task");
    expect(task).toBeDefined();
    expect(result.recommendation).toBe("consider_saving");
  });

  it("exposes suggest_memory_candidates via MCP registration", async () => {
    const stub = {
      suggestMemoryCandidates: (payload: Parameters<typeof suggestMemoryCandidates>[0]) =>
        suggestMemoryCandidates(payload),
    } as unknown as MemoryService;

    const tools = getRegisteredMemoryTools(stub);
    const tool = tools.find((item) => item.name === "suggest_memory_candidates");

    expect(tool).toBeDefined();
    const out = await tool?.execute({ conversation: "We decided to ship the fix on Tuesday." });
    expect(out).toMatchObject({
      recommendation: "strong_candidate",
    });
  });

  it("respects maxCandidates", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `We decided to use option ${i} for subsystem ${i}.`);
    const conversation = lines.join("\n");

    const result = suggestMemoryCandidates({
      conversation,
      maxCandidates: 3,
    });

    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });
});
