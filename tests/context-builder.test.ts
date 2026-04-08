import { describe, expect, it } from "vitest";

import { buildContextFromItems } from "../src/features/memory/retrieval/context-builder.js";
import type { SearchMemoryItem } from "../src/features/memory/types.js";

const baseItem: SearchMemoryItem = {
  id: "mem-1",
  kind: "fact",
  content: "Detailed content body.",
  summary: "Short summary.",
  score: 0.9,
  reasons: ["keyword_match"],
  createdAt: "2026-04-05T12:34:56.000Z",
  importance: 0.8,
  source: {
    type: "manual",
  },
};

describe("buildContextFromItems", () => {
  it("prefers summaries in profile mode", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [baseItem],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context).toContain("Key user/project context:");
    expect(result.context).toContain("Facts:");
    expect(result.context).toContain("Short summary.");
    expect(result.context).not.toContain("Detailed content body.");
  });

  it("groups profile items by semantic kind", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        baseItem,
        {
          ...baseItem,
          id: "mem-2",
          kind: "decision",
          summary: "Use LanceDB for indexed retrieval.",
          content: "Decision body.",
        },
        {
          ...baseItem,
          id: "mem-3",
          kind: "task",
          summary: "Improve ranking coverage.",
          content: "Task body.",
        },
      ],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context.indexOf("Facts:")).toBeLessThan(result.context.indexOf("Decisions:"));
    expect(result.context.indexOf("Decisions:")).toBeLessThan(result.context.indexOf("Tasks:"));
    expect(result.context).toContain("Use LanceDB for indexed retrieval.");
    expect(result.context).toContain("Improve ranking coverage.");
  });

  it("preserves retrieval order within the same kind in profile mode", () => {
    const second = { ...baseItem, id: "mem-second", kind: "fact" as const, summary: "Second fact." };
    const first = { ...baseItem, id: "mem-first", kind: "fact" as const, summary: "First fact." };

    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [second, first],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.items).toEqual(["mem-second", "mem-first"]);
    expect(result.context.indexOf("Second fact.")).toBeLessThan(result.context.indexOf("First fact."));
  });

  it("includes timestamps in recent mode", () => {
    const result = buildContextFromItems({
      task: "Recent task",
      mode: "recent",
      items: [baseItem],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context).toContain("Recent activity:");
    expect(result.context).toContain("2026-04-05 12:34");
    expect(result.context).toContain("Detailed content body.");
  });

  it("keeps full mode formatting stable", () => {
    const result = buildContextFromItems({
      task: "Full task",
      mode: "full",
      items: [baseItem],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context).toContain("Relevant memories:");
    expect(result.context).toContain("[fact] Detailed content body.");
  });

  it("still truncates across modes", () => {
    const result = buildContextFromItems({
      task: "Truncate task",
      mode: "query",
      items: [baseItem],
      maxItems: 5,
      maxChars: 20,
      degraded: false,
    });

    expect(result.truncated).toBe(true);
    expect(result.items).toEqual([]);
  });
});
