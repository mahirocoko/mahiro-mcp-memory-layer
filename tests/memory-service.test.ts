import { describe, expect, it, vi } from "vitest";

import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonlLogStore } from "../src/features/memory/log/jsonl-log-store.js";
import { DeterministicEmbeddingProvider } from "../src/features/memory/index/embedding-provider.js";
import { connectToLanceDb } from "../src/features/memory/index/lancedb-client.js";
import { MemoryRecordsTable } from "../src/features/memory/index/memory-records-table.js";
import { RetrievalTraceStore } from "../src/features/memory/observability/retrieval-trace.js";
import { rememberMemory } from "../src/features/memory/core/remember.js";
import { upsertDocument } from "../src/features/memory/core/upsert-document.js";
import { upsertDocumentInputSchema } from "../src/features/memory/schemas.js";
import { searchMemories } from "../src/features/memory/core/search-memories.js";
import { buildContextForTask } from "../src/features/memory/core/build-context-for-task.js";
import { reindexMemoryRecords } from "../src/features/memory/index/reindex.js";
import { toRetrievalRow } from "../src/features/memory/retrieval/rank.js";
import { MemoryService } from "../src/features/memory/memory-service.js";
import type { RetrievalTraceEntry } from "../src/features/memory/types.js";

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahiro-mcp-memory-layer-"));
  await Promise.all([
    mkdir(path.join(root, "log"), { recursive: true }),
    mkdir(path.join(root, "traces"), { recursive: true }),
    mkdir(path.join(root, "lancedb"), { recursive: true }),
  ]);

  const logStore = new JsonlLogStore(path.join(root, "log", "canonical-log.jsonl"));
  const embeddingProvider = new DeterministicEmbeddingProvider(64);
  const connection = await connectToLanceDb(path.join(root, "lancedb"));
  const table = new MemoryRecordsTable(connection);
  const traceFilePath = path.join(root, "traces", "retrieval-trace.jsonl");
  const traceStore = new RetrievalTraceStore(traceFilePath);

  return {
    logStore,
    embeddingProvider,
    table,
    traceStore,
    traceFilePath,
  };
}

describe("memory service core", () => {
  it("stores a memory and retrieves it within the same scope", async () => {
    const fixture = await createFixture();

    const remembered = await rememberMemory({
      payload: {
        content: "The repo uses Bun for runtime scripts.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await searchMemories({
      payload: {
        query: "What runtime scripts does the repo use?",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(remembered.status).toBe("accepted");
    expect(result.items.some((item) => item.id === remembered.id)).toBe(true);
  });

  it("does not leak results across project scope", async () => {
    const fixture = await createFixture();

    await rememberMemory({
      payload: {
        content: "Private memory for project A.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "project-a",
        containerId: "workspace:project-a",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await searchMemories({
      payload: {
        query: "private memory",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "project-b",
        containerId: "workspace:project-b",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toHaveLength(0);
  });

  it("builds a bounded context block", async () => {
    const fixture = await createFixture();

    await rememberMemory({
      payload: {
        content: "Use LanceDB as the retrieval layer and keep a canonical append-only log.",
        kind: "decision",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await buildContextForTask({
      payload: {
        task: "Implement the memory retrieval layer",
        mode: "full",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 500,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.context).toContain("Relevant memories");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.context.length).toBeLessThanOrEqual(500);
  });

  it("optionally attaches memory suggestions when includeMemorySuggestions is set", async () => {
    const fixture = await createFixture();

    const result = await buildContextForTask({
      payload: {
        task: "Continue implementation",
        mode: "full",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 500,
        includeMemorySuggestions: true,
        recentConversation:
          "We decided that the integration point for suggestions is build_context_for_task with an opt-in flag.",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.memorySuggestions).toBeDefined();
    expect(result.memorySuggestions!.candidates.length).toBeGreaterThan(0);
    expect(result.memorySuggestions!.candidates[0]!.draftContent).toContain("decided");
  });

  it("rejects includeMemorySuggestions without recentConversation", async () => {
    const fixture = await createFixture();

    await expect(
      buildContextForTask({
        payload: {
          task: "Task",
          mode: "full",
          includeMemorySuggestions: true,
        },
        table: fixture.table,
        embeddingProvider: fixture.embeddingProvider,
        traceStore: fixture.traceStore,
      }),
    ).rejects.toThrow(/recentConversation/);
  });

  it("builds mode-aware context blocks for profile and recent", async () => {
    const fixture = await createFixture();

    await rememberMemory({
      payload: {
        content: "Raw content for recent context output.",
        summary: "Short profile summary.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const profileResult = await buildContextForTask({
      payload: {
        task: "Summarize stable project context",
        mode: "profile",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 500,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    const recentResult = await buildContextForTask({
      payload: {
        task: "Summarize recent project activity",
        mode: "recent",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 500,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(profileResult.context).toContain("Key user/project context");
    expect(profileResult.context).toContain("Facts:");
    expect(profileResult.context).toContain("Short profile summary.");
    expect(recentResult.context).toContain("Recent activity");
    expect(recentResult.context).toContain("Raw content for recent context output.");
    expect(recentResult.context).toContain("·");
  });

  it("buildContextForTask with sessionId backfills from project when session scope is sparse", async () => {
    const fixture = await createFixture();
    const sessionId = "session-backfill";

    const projectOnly = await rememberMemory({
      payload: {
        content: "Project-wide retrieval layer design using LanceDB.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await buildContextForTask({
      payload: {
        task: "How is retrieval implemented?",
        mode: "full",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        sessionId,
        maxItems: 5,
        maxChars: 2000,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toContain(projectOnly.id);
    expect(result.context).toContain("LanceDB");
  });

  it("buildContextForTask orders session memories before project when both match", async () => {
    const fixture = await createFixture();
    const sessionId = "session-order";

    const sessionMem = await rememberMemory({
      payload: {
        content: "Session note: prioritize LanceDB index tuning for this chat.",
        kind: "fact",
        scope: "session",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        sessionId,
        source: { type: "manual" },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const projectMem = await rememberMemory({
      payload: {
        content: "Project note: LanceDB is the canonical retrieval store.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await buildContextForTask({
      payload: {
        task: "LanceDB retrieval tuning and store choice",
        mode: "full",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        sessionId,
        maxItems: 5,
        maxChars: 4000,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toContain(sessionMem.id);
    expect(result.items).toContain(projectMem.id);
    expect(result.items.indexOf(sessionMem.id)).toBeLessThan(result.items.indexOf(projectMem.id));
  });

  it("rebuilds the LanceDB index from the canonical log", async () => {
    const fixture = await createFixture();

    const remembered = await rememberMemory({
      payload: {
        content: "Reindex should restore retrieval from the canonical log.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    await reindexMemoryRecords({
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await searchMemories({
      payload: {
        query: "restore retrieval from the canonical log",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items.some((item) => item.id === remembered.id)).toBe(true);
  });

  it("retrieval modes change ranking between recent and profile", async () => {
    const fixture = await createFixture();
    const embeddingVersion = fixture.embeddingProvider.version;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T00:00:00.000Z"));

    try {
      await fixture.table.upsertRows([
        toRetrievalRow(
          {
            id: "mem-important",
            kind: "fact",
            scope: "project",
            userId: "mahiro",
            projectId: "mahiro-mcp-memory-layer",
            containerId: "workspace:mahiro-mcp-memory-layer",
            source: {
              type: "manual",
            },
            content: "Important profile memory about bun runtime",
            tags: [],
            importance: 1,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
          await fixture.embeddingProvider.embedText("Important profile memory about bun runtime"),
          embeddingVersion,
        ),
        toRetrievalRow(
          {
            id: "mem-recent",
            kind: "conversation",
            scope: "project",
            userId: "mahiro",
            projectId: "mahiro-mcp-memory-layer",
            containerId: "workspace:mahiro-mcp-memory-layer",
            source: {
              type: "manual",
            },
            content: "Recent runtime memory about bun runtime",
            tags: [],
            importance: 0.3,
            createdAt: "2026-04-04T23:59:59.000Z",
            updatedAt: "2026-04-04T23:59:59.000Z",
          },
          await fixture.embeddingProvider.embedText("Recent runtime memory about bun runtime"),
          embeddingVersion,
        ),
      ]);

      const recentResult = await searchMemories({
        payload: {
          query: "runtime memory",
          mode: "recent",
          scope: "project",
          userId: "mahiro",
          projectId: "mahiro-mcp-memory-layer",
          containerId: "workspace:mahiro-mcp-memory-layer",
        },
        table: fixture.table,
        embeddingProvider: fixture.embeddingProvider,
        traceStore: fixture.traceStore,
      });

      const profileResult = await searchMemories({
        payload: {
          query: "runtime memory",
          mode: "profile",
          scope: "project",
          userId: "mahiro",
          projectId: "mahiro-mcp-memory-layer",
          containerId: "workspace:mahiro-mcp-memory-layer",
        },
        table: fixture.table,
        embeddingProvider: fixture.embeddingProvider,
        traceStore: fixture.traceStore,
      });

      expect(recentResult.items[0]?.id).toBe("mem-recent");
      expect(profileResult.items[0]?.id).toBe("mem-important");
    } finally {
      vi.useRealTimers();
    }
  });

  it("upsert_document is idempotent for the same scope and source identity", async () => {
    const fixture = await createFixture();

    const base = {
      projectId: "mahiro-mcp-memory-layer",
      userId: "mahiro",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: {
        type: "document" as const,
        uri: "file:///docs/architecture.md",
        title: "Architecture",
      },
    };

    const first = await upsertDocument({
      payload: {
        ...base,
        content: "Version one content.",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const second = await upsertDocument({
      payload: {
        ...base,
        content: "Version two replaces the first.",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    expect(second.id).toBe(first.id);

    const result = await searchMemories({
      payload: {
        query: "Version two replaces",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    const hits = result.items.filter((item) => item.id === first.id);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toContain("Version two replaces");
  });

  it("upsert_document creates distinct documents when source identity differs", async () => {
    const fixture = await createFixture();

    const scope = {
      projectId: "mahiro-mcp-memory-layer",
      userId: "mahiro",
      containerId: "workspace:mahiro-mcp-memory-layer",
    };

    const a = await upsertDocument({
      payload: {
        ...scope,
        source: { type: "document" as const, uri: "file:///a.md" },
        content: "Doc A",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const b = await upsertDocument({
      payload: {
        ...scope,
        source: { type: "document" as const, uri: "file:///b.md" },
        content: "Doc B",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    expect(b.id).not.toBe(a.id);
  });

  it("upsert_document rejects when source.uri and source.title are both absent", async () => {
    const parsed = upsertDocumentInputSchema.safeParse({
      projectId: "mahiro-mcp-memory-layer",
      userId: "mahiro",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "document" },
      content: "No stable identity.",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected schema failure");
    }
    expect(parsed.error.issues.some((i) => i.message.includes("Provide at least one of source.uri"))).toBe(true);

    const fixture = await createFixture();

    await expect(
      upsertDocument({
        payload: {
          projectId: "mahiro-mcp-memory-layer",
          userId: "mahiro",
          containerId: "workspace:mahiro-mcp-memory-layer",
          source: { type: "document" },
          content: "No stable identity.",
        },
        logStore: fixture.logStore,
        table: fixture.table,
        embeddingProvider: fixture.embeddingProvider,
      }),
    ).rejects.toThrow();
  });

  it("returns degraded results when the embedding provider fails during search", async () => {
    const fixture = await createFixture();

    await rememberMemory({
      payload: {
        content: "Graceful fallback should still return keyword matches.",
        kind: "fact",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: {
          type: "manual",
        },
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const failingEmbeddingProvider = {
      version: fixture.embeddingProvider.version,
      dimensions: fixture.embeddingProvider.dimensions,
      embedText: async () => {
        throw new Error("embedding unavailable");
      },
    };

    const result = await searchMemories({
      payload: {
        query: "keyword matches",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: failingEmbeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.degraded).toBe(true);
    expect(result.items[0]?.content).toContain("keyword matches");

    const traceLines = (await readFile(fixture.traceFilePath, "utf8")).trim().split("\n");
    const lastTrace = JSON.parse(traceLines.at(-1)!) as { degraded: boolean };
    expect(lastTrace.degraded).toBe(true);
  });

  it("inspects the latest retrieval trace with hit summary", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    await service.remember({
      content: "A durable project fact for retrieval.",
      kind: "fact",
      scope: "project",
      userId: "mahiro",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    const searchResult = await service.search({
      query: "durable retrieval",
      mode: "query",
      scope: "project",
      userId: "mahiro",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(searchResult.items.length).toBeGreaterThan(0);

    const traceLines = (await readFile(fixture.traceFilePath, "utf8")).trim().split("\n");
    const latestTrace = JSON.parse(traceLines.at(-1)!) as RetrievalTraceEntry;
    const audit = await service.inspectMemoryRetrieval({});

    expect(audit).toEqual({
      status: "found",
      lookup: "latest",
      trace: latestTrace,
      summary: {
        hit: true,
        returnedCount: latestTrace.returnedMemoryIds.length,
        degraded: latestTrace.degraded,
      },
    });
  });

  it("returns empty when requestId lookup does not exist", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    await expect(service.inspectMemoryRetrieval({ requestId: "req_missing" })).resolves.toEqual({
      status: "empty",
      lookup: "request_id",
      requestId: "req_missing",
    });
  });
});
