import { describe, expect, it, vi } from "vitest";

import { applyConservativeMemoryPolicy } from "../src/features/memory/core/apply-conservative-memory-policy.js";
import { suggestMemoryCandidates } from "../src/features/memory/core/suggest-memory-candidates.js";
import { getRegisteredMemoryTools } from "../src/features/memory/mcp/register-tools.js";
import { applyConservativeMemoryPolicyInputSchema } from "../src/features/memory/schemas.js";
import type { MemoryService } from "../src/features/memory/memory-service.js";
import type { SuggestMemoryCandidatesResult } from "../src/features/memory/types.js";

describe("applyConservativeMemoryPolicy", () => {
  it("does not write on likely_skip", async () => {
    const remember = vi.fn();
    const out = await applyConservativeMemoryPolicy({
      payload: { conversation: "hi" },
      remember,
    });

    expect(out.recommendation).toBe("likely_skip");
    expect(remember).not.toHaveBeenCalled();
    expect(out.autoSaved).toHaveLength(0);
    expect(out.reviewOnlySuggestions).toHaveLength(0);
  });

  it("returns review-only candidates on consider_saving without calling remember", async () => {
    const remember = vi.fn();
    const out = await applyConservativeMemoryPolicy({
      payload: {
        conversation: "Next step: migrate the legacy auth module to the new API.",
      },
      remember,
    });

    expect(out.recommendation).toBe("consider_saving");
    expect(remember).not.toHaveBeenCalled();
    expect(out.reviewOnlySuggestions.length).toBeGreaterThan(0);
    expect(out.reviewOnlySuggestions).toEqual(out.candidates);
  });

  it("auto-remembers strong_candidate when scope ids are complete for project scope", async () => {
    const remember = vi.fn().mockResolvedValue({ id: "mem-1", status: "accepted" as const, indexed: true });
    const out = await applyConservativeMemoryPolicy({
      payload: {
        conversation: "We decided to use Bun for all runtime scripts in this repository.",
        projectId: "p1",
        containerId: "c1",
      },
      remember,
    });

    expect(out.recommendation).toBe("strong_candidate");
    expect(remember).toHaveBeenCalled();
    expect(out.autoSaved.length).toBeGreaterThan(0);
    expect(out.autoSaved[0]!.id).toBe("mem-1");
    expect(out.reviewOnlySuggestions).toHaveLength(0);
    expect(remember.mock.calls[0]![0]!.tags).toContain("conservative_auto_save");
  });

  it("skips auto-save when project scope ids are incomplete", async () => {
    const remember = vi.fn();
    const out = await applyConservativeMemoryPolicy({
      payload: {
        conversation: "We decided to use Bun for all runtime scripts in this repository.",
        projectId: "p1",
      },
      remember,
    });

    expect(out.recommendation).toBe("strong_candidate");
    expect(remember).not.toHaveBeenCalled();
    expect(out.autoSaveSkipped.length).toBeGreaterThan(0);
    expect(out.autoSaveSkipped[0]!.reason).toBe("incomplete_scope_ids");
  });

  it("accepts a precomputed suggestion without requiring conversation", async () => {
    const remember = vi.fn();
    const suggestion: SuggestMemoryCandidatesResult = suggestMemoryCandidates({
      conversation: "   ",
    });

    expect(suggestion.recommendation).toBe("likely_skip");

    const out = await applyConservativeMemoryPolicy({
      payload: { suggestion },
      remember,
    });

    expect(out.recommendation).toBe("likely_skip");
    expect(remember).not.toHaveBeenCalled();
  });

  it("auto-saves from a precomputed strong_candidate with global scope", async () => {
    const remember = vi.fn().mockResolvedValue({ id: "mem-global", status: "accepted" as const, indexed: true });
    const suggestion: SuggestMemoryCandidatesResult = {
      recommendation: "strong_candidate",
      signals: { durable: ["test"], ephemeral: [] },
      candidates: [
        {
          kind: "fact",
          scope: "global",
          reason: "unit test snapshot",
          draftContent: "Pinned fact for policy test.",
          confidence: "high",
        },
      ],
    };

    const out = await applyConservativeMemoryPolicy({
      payload: { suggestion },
      remember,
    });

    expect(remember).toHaveBeenCalledTimes(1);
    expect(out.autoSaved).toEqual([{ candidateIndex: 0, id: "mem-global" }]);
  });

  it("rejects input with neither conversation nor suggestion", () => {
    expect(() => applyConservativeMemoryPolicyInputSchema.parse({})).toThrow();
  });

  it("exposes apply_conservative_memory_policy via MCP registration", async () => {
    const stub = {
      applyConservativeMemoryPolicy: (payload: { conversation: string }) =>
        applyConservativeMemoryPolicy({
          payload,
          remember: vi.fn().mockResolvedValue({ id: "id", status: "accepted", indexed: true }),
        }),
    } as unknown as MemoryService;

    const tools = getRegisteredMemoryTools(stub);
    const tool = tools.find((item) => item.name === "apply_conservative_memory_policy");

    expect(tool).toBeDefined();
    const out = await tool?.execute({
      conversation: "Next step: migrate the legacy auth module to the new API.",
    });
    expect(out).toMatchObject({
      recommendation: "consider_saving",
    });
  });
});
