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

    expect(result.context.indexOf("Preferences:")).toBeLessThan(result.context.indexOf("Facts:"));
    expect(result.context.indexOf("Facts:")).toBeLessThan(result.context.indexOf("Tasks:"));
    expect(result.context).not.toContain("Stable Facts:");
    expect(result.context).toContain("Use LanceDB for indexed retrieval.");
    expect(result.context).toContain("Improve ranking coverage.");
  });

  it("lifts preference-like fact and decision lines into a Preferences section", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-fact-pref", kind: "fact", summary: "Standardize on Bun for the toolchain." },
        { ...baseItem, id: "mem-fact", kind: "fact", summary: "The stack uses LanceDB for retrieval." },
        {
          ...baseItem,
          id: "mem-fact-broad",
          kind: "fact",
          summary: "Loose notes and links collected during onboarding.",
        },
        { ...baseItem, id: "mem-decision-pref", kind: "decision", summary: "Prefer SQLite for local workflows." },
        { ...baseItem, id: "mem-decision", kind: "decision", summary: "JSONL is the canonical memory log." },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Stable Facts:");
    expect(result.context).toContain("Facts:");
    expect(result.context).toContain("Preferences:");
    expect(result.context).toContain("Decisions:");
    expect(result.context).toContain("The stack uses LanceDB for retrieval.");
    expect(result.context).toContain("Loose notes and links collected during onboarding.");
    expect(result.context).toContain("Standardize on Bun for the toolchain.");
    expect(result.context).toContain("Prefer SQLite for local workflows.");
    expect(result.context).toContain("JSONL is the canonical memory log.");
    expect(result.context.indexOf("Preferences:")).toBeLessThan(result.context.indexOf("Stable Facts:"));
    expect(result.context.indexOf("Stable Facts:")).toBeLessThan(result.context.indexOf("Facts:"));
    expect(result.context.indexOf("Facts:")).toBeLessThan(result.context.indexOf("Decisions:"));
  });

  it("flushes a pending Preferences section before later non-preference kinds", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-pref", kind: "fact", summary: "Avoid global mutable state in runtime code." },
        { ...baseItem, id: "mem-doc", kind: "doc", summary: "Runtime architecture reference." },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Preferences:");
    expect(result.context).toContain("Facts:");
    expect(result.context.indexOf("Preferences:")).toBeLessThan(result.context.indexOf("Facts:"));
  });

  it("groups preference-like fact and decision lines under Preferences (facts before decisions)", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-fpref", kind: "fact" as const, summary: "Prefer Vitest for unit tests." },
        {
          ...baseItem,
          id: "mem-dpref",
          kind: "decision" as const,
          summary: "Use Bun for scripts and CI.",
          content: "Decision body.",
        },
        { ...baseItem, id: "mem-plain", kind: "fact" as const, summary: "Repository is TypeScript-first." },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context.indexOf("Preferences:")).toBeLessThan(result.context.indexOf("Stable Facts:"));
    expect(result.context).not.toContain("Decisions:");
    expect(result.context).not.toContain("\nFacts:\n");
    expect(result.context).toContain("Prefer Vitest for unit tests.");
    expect(result.context).toContain("Use Bun for scripts and CI.");
    expect(result.context).toContain("Repository is TypeScript-first.");
    expect(result.context.indexOf("Prefer Vitest")).toBeLessThan(result.context.indexOf("Use Bun for scripts"));
    expect(result.context).toContain("Stable Facts:");
  });

  it("routes preference-like doc summaries to Preferences like facts and decisions", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-doc-pref",
          kind: "doc",
          summary: "Standardize on Markdown for design docs.",
        },
        {
          ...baseItem,
          id: "mem-doc-stable",
          kind: "doc",
          summary: "The API gateway is deployed on port 8080.",
        },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Preferences:");
    expect(result.context).toContain("Stable Facts:");
    expect(result.context).toContain("Standardize on Markdown for design docs.");
    expect(result.context).toContain("The API gateway is deployed on port 8080.");
    expect(result.context.indexOf("Preferences:")).toBeLessThan(result.context.indexOf("Stable Facts:"));
  });

  it("promotes declarative fact and doc lines into Stable Facts and keeps non-declarative lines under Facts", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-stable-fact",
          kind: "fact",
          summary: "The ingestion pipeline is idempotent for replay safety.",
        },
        {
          ...baseItem,
          id: "mem-broad-fact",
          kind: "fact",
          summary: "Short scratch.",
        },
        {
          ...baseItem,
          id: "mem-stable-doc",
          kind: "doc",
          summary: "This service runs the MCP stdio bridge on localhost.",
        },
        {
          ...baseItem,
          id: "mem-broad-doc",
          kind: "doc",
          summary: "Link dump: design references and drafts.",
        },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Stable Facts:");
    expect(result.context).toContain("Facts:");
    expect(result.context).toContain("The ingestion pipeline is idempotent for replay safety.");
    expect(result.context).toContain("This service runs the MCP stdio bridge on localhost.");
    expect(result.context).toContain("Short scratch.");
    expect(result.context).toContain("Link dump: design references and drafts.");
    expect(result.context.indexOf("Stable Facts:")).toBeLessThan(result.context.indexOf("Facts:"));
  });

  it("aggregates repeated preference evidence into one representative bullet", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-pref-short",
          kind: "fact",
          summary: "Prefer Bun for local scripts and tooling.",
        },
        {
          ...baseItem,
          id: "mem-pref-long",
          kind: "fact",
          summary: "Prefer Bun for local scripts, tooling, and package workflows.",
        },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Preferences:");
    expect(result.context).toContain("Prefer Bun for local scripts, tooling, and package workflows.");
    expect(result.context).not.toContain("Prefer Bun for local scripts and tooling.");
    expect(result.items).toEqual(["mem-pref-long"]);
  });

  it("aggregates repeated stable-fact evidence into one representative bullet", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-fact-short",
          kind: "fact",
          summary: "The service uses LanceDB for vector retrieval and keeps embeddings on disk.",
        },
        {
          ...baseItem,
          id: "mem-fact-long",
          kind: "doc",
          summary: "The service uses LanceDB for vector retrieval, keeps embeddings on disk, and reindexes from the canonical log.",
        },
      ],
      maxItems: 10,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Stable Facts:");
    expect(result.context).toContain(
      "The service uses LanceDB for vector retrieval, keeps embeddings on disk, and reindexes from the canonical log.",
    );
    expect(result.context).not.toContain("The service uses LanceDB for vector retrieval and keeps embeddings on disk.");
    expect(result.items).toEqual(["mem-fact-long"]);
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

    expect(result.context).toContain("Preferences:");
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

  it("dedupes case- and whitespace-normalized duplicate profile lines within a kind", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-a", summary: "Standardize on Bun for the toolchain." },
        {
          ...baseItem,
          id: "mem-b",
          summary: "  standardize ON BUN   for the toolchain.  ",
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Preferences:");
    expect(result.context.match(/Standardize on Bun/g)?.length).toBe(1);
    expect(result.items).toEqual(["mem-a"]);
  });

  it("collapses strict-prefix profile lines to the longer statement (same kind)", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-short", summary: "Uses LanceDB for vectors." },
        {
          ...baseItem,
          id: "mem-long",
          summary: "Uses LanceDB for vectors and keeps embeddings on disk.",
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("Uses LanceDB for vectors and keeps embeddings on disk.");
    expect(result.context).not.toContain("- Uses LanceDB for vectors.\n");
    expect(result.items).toEqual(["mem-long"]);
  });

  it("aggregates rephrased supporting evidence into one profile bullet (preferences/stable/facts sections)", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-long",
          kind: "fact",
          summary:
            "The stack uses LanceDB for local vector search and keeps embeddings on disk for offline use.",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
        {
          ...baseItem,
          id: "mem-rephrase",
          kind: "fact",
          summary: "LanceDB powers local vector search in this stack.",
          createdAt: "2026-04-02T00:00:00.000Z",
        },
        {
          ...baseItem,
          id: "mem-pref-a",
          kind: "fact",
          summary: "Prefer Vitest for unit tests in this repository with happy-dom.",
        },
        {
          ...baseItem,
          id: "mem-pref-b",
          kind: "fact",
          summary: "Prefer using Vitest and happy-dom for unit tests here in the repository.",
        },
      ],
      maxItems: 10,
      maxChars: 4000,
      degraded: false,
    });

    expect(result.context.match(/LanceDB/g)?.length).toBe(1);
    expect(result.context).toContain(
      "The stack uses LanceDB for local vector search and keeps embeddings on disk for offline use.",
    );
    expect(result.context).not.toContain("LanceDB powers local vector search");
    expect(result.items.filter((id) => id === "mem-long" || id === "mem-rephrase")).toEqual(["mem-long"]);

    expect(result.context.match(/Vitest/g)?.length).toBe(1);
    expect(result.context.match(/happy-dom/g)?.length).toBe(1);
    expect(result.items.filter((id) => id === "mem-pref-a" || id === "mem-pref-b")).toEqual(["mem-pref-b"]);
  });

  it("collapses embedded near-duplicate profile lines when the shorter phrase appears inside the longer (same kind)", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-shorter",
          summary: "uses LanceDB for local vector search",
        },
        {
          ...baseItem,
          id: "mem-longer",
          summary: "The stack uses LanceDB for local vector search and keeps embeddings on disk.",
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("The stack uses LanceDB for local vector search and keeps embeddings on disk.");
    expect(result.context.match(/uses LanceDB for local vector search/g)?.length).toBe(1);
    expect(result.items).toEqual(["mem-longer"]);
  });

  it("suppresses older conflicting profile lines that diverge after a shared prefix (newer createdAt wins)", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-old",
          summary: "The primary database is Postgres for this project.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          ...baseItem,
          id: "mem-new",
          summary: "The primary database is SQLite for this project.",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("SQLite");
    expect(result.context).not.toContain("Postgres");
    expect(result.items).toEqual(["mem-new"]);
  });

  it("on same createdAt and importance, keeps the later conflicting line in retrieval order", () => {
    const ts = "2026-04-05T12:00:00.000Z";
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-earlier",
          summary: "The retrieval mode default is full for memory lookups.",
          importance: 0.5,
          createdAt: ts,
        },
        {
          ...baseItem,
          id: "mem-later",
          summary: "The retrieval mode default is query for memory lookups.",
          importance: 0.5,
          createdAt: ts,
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("query");
    expect(result.context).not.toContain("full");
    expect(result.items).toEqual(["mem-later"]);
  });

  it("on same createdAt, keeps higher-importance conflicting stem match", () => {
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        {
          ...baseItem,
          id: "mem-low",
          summary: "The default package manager is npm for CI.",
          importance: 0.3,
          createdAt: "2026-04-05T12:00:00.000Z",
        },
        {
          ...baseItem,
          id: "mem-high",
          summary: "The default package manager is bun for CI.",
          importance: 0.9,
          createdAt: "2026-04-05T12:00:00.000Z",
        },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context).toContain("bun");
    expect(result.context).not.toContain("npm");
    expect(result.items).toEqual(["mem-high"]);
  });

  it("does not dedupe across different kinds in profile mode", () => {
    const line = "Same text in two sections.";
    const result = buildContextFromItems({
      task: "Profile task",
      mode: "profile",
      items: [
        { ...baseItem, id: "mem-fact", kind: "fact", summary: line },
        { ...baseItem, id: "mem-decision", kind: "decision", summary: line },
      ],
      maxItems: 5,
      maxChars: 2000,
      degraded: false,
    });

    expect(result.context.match(/Same text in two sections\./g)?.length).toBe(2);
    expect(result.items).toEqual(["mem-fact", "mem-decision"]);
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
