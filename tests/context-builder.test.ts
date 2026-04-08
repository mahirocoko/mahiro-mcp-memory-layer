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

  it("strips discourse hedges from profile lines", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          summary: "I think we standardize on Bun for the toolchain.",
          content: "Longer body.",
        },
      ],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context).toContain("we standardize on Bun for the toolchain.");
    expect(result.context).not.toContain("I think");
  });

  it("keeps the first substantive sentence for long non-conversation profile items", () => {
    const longFirst =
      "The service uses LanceDB for vector storage and keeps embeddings local. " +
      "This second sentence is elaboration that should not appear in the profile bullet.";
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [{ ...baseItem, kind: "fact", summary: longFirst, content: "Body." }],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("The service uses LanceDB for vector storage and keeps embeddings local.");
    expect(result.context).not.toContain("This second sentence");
  });

  it("prefers the first sentence for chatty conversation memories", () => {
    const summary =
      "User asked about ranking weights again. The assistant pointed to rank.ts and tests.";
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [{ ...baseItem, id: "mem-chat", kind: "conversation", summary, content: "Full thread." }],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("User asked about ranking weights again.");
    expect(result.context).not.toContain("The assistant pointed");
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

  it("extracts a stable first statement for profile items without summaries", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-conversation",
          kind: "conversation",
          summary: undefined,
          content: "First stable statement. Second sentence should not appear.\n- noisy bullet",
        },
      ],
      maxItems: 5,
      maxChars: 500,
      degraded: false,
    });

    expect(result.context).toContain("Conversation:");
    expect(result.context).toContain("First stable statement.");
    expect(result.context).not.toContain("Second sentence should not appear.");
    expect(result.context).not.toContain("noisy bullet");
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
