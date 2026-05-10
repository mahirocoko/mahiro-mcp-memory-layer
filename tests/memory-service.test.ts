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

const realDateNow = Date.now.bind(Date);
let testNowMs: number | undefined;

function setTestSystemTime(date: Date): void {
  testNowMs = date.getTime();
  vi.spyOn(Date, "now").mockImplementation(() => testNowMs ?? realDateNow());
}

function useRealTestTimers(): void {
  testNowMs = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
}

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

function retrievalTraceFixture(overrides: Partial<RetrievalTraceEntry>): RetrievalTraceEntry {
  return {
    requestId: "req-hit-001",
    query: "inspect retrieval classification",
    retrievalMode: "query",
    enforcedFilters: {
      scope: "project",
      projectId: "project-alpha",
      containerId: "container-main",
    },
    returnedMemoryIds: ["mem-001"],
    rankingReasonsById: {
      "mem-001": ["scope_match", "keyword_match"],
    },
    contextSize: 42,
    embeddingVersion: "test-embedding-v1",
    indexVersion: "test-index-v1",
    degraded: false,
    createdAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
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
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(remembered.status).toBe("accepted");
    expect(result.items.some((item) => item.id === remembered.id)).toBe(true);
    expect(result.items[0]?.scope).toBe("project");
    expect((await fixture.logStore.readAll())[0]?.verificationStatus).toBe("hypothesis");
    expect(result.items[0]?.verificationStatus).toBe("hypothesis");
  });

  it("excludes rejected memories from normal search", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Rejected normal search target.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejected.id, action: "reject", note: "Rejected for normal context." });

    const result = await service.search({
      query: "Rejected normal search target",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });

    expect(result.items.map((item) => item.id)).not.toContain(rejected.id);
    expect((await service.list({
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    })).map((item) => item.id)).toContain(rejected.id);
  });

  it("does not leak results across project scope", async () => {
    const fixture = await createFixture();

    await rememberMemory({
      payload: {
        content: "Private memory for project A.",
        kind: "fact",
        scope: "project",
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
    expect(result.context).toContain("project · hypothesis");
    expect(result.context.length).toBeLessThanOrEqual(500);
  });

  it("combines scoped project context with verified global context while preserving authority labels", async () => {
    const fixture = await createFixture();

    const global = await rememberMemory({
      payload: {
        content: "Always verify source-backed claims before changing memory retrieval.",
        kind: "decision",
        scope: "global",
        source: { type: "manual", title: "Global verification rule" },
        verificationStatus: "verified",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });
    const project = await rememberMemory({
      payload: {
        content: "This project uses LanceDB for memory retrieval.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual", title: "Project retrieval decision" },
        verificationStatus: "verified",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await buildContextForTask({
      payload: {
        task: "verify memory retrieval",
        mode: "full",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 1000,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toEqual(expect.arrayContaining([project.id, global.id]));
    expect(result.items.indexOf(project.id)).toBeLessThan(result.items.indexOf(global.id));
    expect(result.context).toContain("project · verified");
    expect(result.context).toContain("global · verified");
    expect(result.context).toContain("Project retrieval decision");
    expect(result.context).toContain("Global verification rule");
  });

  it("optionally attaches memory suggestions when includeMemorySuggestions is set", async () => {
    const fixture = await createFixture();

    const result = await buildContextForTask({
      payload: {
        task: "Continue implementation",
        mode: "full",
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

  it("preserves verificationStatus on document refresh and defaults new docs to hypothesis", async () => {
    const fixture = await createFixture();

    const first = await upsertDocument({
      payload: {
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "document", uri: "file:///README.md", title: "README" },
        content: "Version one.",
        verificationStatus: "verified",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    await upsertDocument({
      payload: {
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "document", uri: "file:///README.md", title: "README" },
        content: "Version two.",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const records = await fixture.logStore.readAll();
    const updated = records.find((record) => record.id === first.id);
    expect(updated?.verificationStatus).toBe("verified");

    const created = await upsertDocument({
      payload: {
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "document", uri: "file:///GUIDE.md", title: "GUIDE" },
        content: "Fresh document.",
      },
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const createdRecord = (await fixture.logStore.readAll()).find((record) => record.id === created.id);
    expect(createdRecord?.verificationStatus).toBe("hypothesis");
  });

  it("promotes a durable memory from hypothesis to verified", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const remembered = await service.remember({
      content: "Promotable memory.",
      kind: "fact",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    const promoted = await service.promoteMemory({
      id: remembered.id,
      evidence: [
        {
          type: "test",
          value: "tests/memory-service.test.ts#promotes-a-durable-memory-from-hypothesis-to-verified",
          note: "Verified by automated test.",
        },
      ],
    });
    expect(promoted).toMatchObject({
      id: remembered.id,
      status: "accepted",
      verificationStatus: "verified",
      verificationEvidence: [
        {
          type: "test",
          value: "tests/memory-service.test.ts#promotes-a-durable-memory-from-hypothesis-to-verified",
        },
      ],
    });
    expect(promoted.verifiedAt).toEqual(expect.any(String));

    const listed = await service.list({
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(listed.find((item) => item.id === remembered.id)?.verificationStatus).toBe("verified");
    expect(listed.find((item) => item.id === remembered.id)?.verificationEvidence).toEqual([
      {
        type: "test",
        value: "tests/memory-service.test.ts#promotes-a-durable-memory-from-hypothesis-to-verified",
        note: "Verified by automated test.",
      },
    ]);

    const search = await service.search({
      query: "Promotable memory",
      mode: "query",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(search.items.find((item) => item.id === remembered.id)?.verificationStatus).toBe("verified");
    expect(search.items.find((item) => item.id === remembered.id)?.verificationEvidence).toEqual([
      {
        type: "test",
        value: "tests/memory-service.test.ts#promotes-a-durable-memory-from-hypothesis-to-verified",
        note: "Verified by automated test.",
      },
    ]);
  });

  it("requires evidence to promote a durable memory", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const remembered = await service.remember({
      content: "Needs evidence.",
      kind: "fact",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    await expect(service.promoteMemory({ id: remembered.id, evidence: [] })).rejects.toThrow();
  });

  it("supports reject, defer, and edit_then_promote review decisions with history", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Reject me.",
      kind: "fact",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });
    const deferred = await service.remember({
      content: "Defer me.",
      kind: "fact",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });
    const edited = await service.remember({
      content: "Needs edit before promote.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    const rejectResult = await service.reviewMemory({
      id: rejected.id,
      action: "reject",
      note: "Not stable enough.",
    });
    expect(rejectResult).toMatchObject({
      id: rejected.id,
      action: "reject",
      reviewStatus: "rejected",
      verificationStatus: "hypothesis",
    });

    const deferResult = await service.reviewMemory({
      id: deferred.id,
      action: "defer",
      note: "Need more evidence.",
    });
    expect(deferResult).toMatchObject({
      id: deferred.id,
      action: "defer",
      reviewStatus: "deferred",
      verificationStatus: "hypothesis",
    });

    const editPromoteResult = await service.reviewMemory({
      id: edited.id,
      action: "edit_then_promote",
      content: "Edited and promoted memory.",
      note: "Edited for clarity before approval.",
      evidence: [{ type: "human", value: "review-panel", note: "Approved after edit." }],
    });
    expect(editPromoteResult).toMatchObject({
      id: edited.id,
      action: "edit_then_promote",
      verificationStatus: "verified",
      verificationEvidence: [{ type: "human", value: "review-panel" }],
    });

    const queue = await service.listReviewQueue({
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(queue.map((item) => item.id)).toEqual([deferred.id]);

    const records = await service.list({
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });
    expect(records.find((item) => item.id === rejected.id)?.reviewStatus).toBe("rejected");
    expect(records.find((item) => item.id === deferred.id)?.reviewStatus).toBe("deferred");
    expect(records.find((item) => item.id === edited.id)?.content).toBe("Edited and promoted memory.");
    expect(records.find((item) => item.id === edited.id)?.reviewDecisions?.map((entry) => entry.action)).toEqual(["edit_then_promote"]);
  });

  it("purge rejected deletes only rejected project records from canonical log and retrieval index", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Rejected purge target alpha.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejected.id, action: "reject", note: "Rejected by reviewer." });

    const beforeSearch = await service.search({
      query: "Rejected purge target alpha",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });
    expect(beforeSearch.items.map((item) => item.id)).not.toContain(rejected.id);

    const result = await service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    });

    expect(result).toMatchObject({
      status: "accepted",
      dryRun: false,
      outcomes: [{ id: rejected.id, status: "deleted" }],
      missingIds: [],
    });
    expect(result.deletedRecords.map((record) => record.id)).toEqual([rejected.id]);
    expect((await fixture.logStore.readAll()).map((record) => record.id)).not.toContain(rejected.id);

    const afterSearch = await service.search({
      query: "Rejected purge target alpha",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });
    expect(afterSearch.items.map((item) => item.id)).not.toContain(rejected.id);
  });

  it("purge rejected reports mixed batch outcomes without deleting non-rejected or wrong-scope records", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejectedInScope = await service.remember({
      content: "Rejected purge target beta.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    const nonRejected = await service.remember({
      content: "Pending purge skip beta.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
      reviewStatus: "pending",
    });
    const rejectedWrongScope = await service.remember({
      content: "Wrong scope purge skip beta.",
      kind: "fact",
      scope: "project",
      projectId: "project-beta",
      containerId: "workspace:project-beta",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejectedInScope.id, action: "reject", note: "Rejected in scope." });
    await service.reviewMemory({ id: rejectedWrongScope.id, action: "reject", note: "Rejected elsewhere." });

    const result = await service.purgeRejectedMemories({
      ids: [rejectedInScope.id, nonRejected.id, rejectedWrongScope.id, "missing-memory-id"],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    });

    expect(result.outcomes).toEqual([
      { id: rejectedInScope.id, status: "deleted" },
      { id: nonRejected.id, status: "skipped_not_rejected" },
      { id: rejectedWrongScope.id, status: "skipped_scope_mismatch" },
      { id: "missing-memory-id", status: "skipped_not_found" },
    ]);
    expect(result.deletedRecords.map((record) => record.id)).toEqual([rejectedInScope.id]);

    const remainingIds = (await fixture.logStore.readAll()).map((record) => record.id);
    expect(remainingIds).not.toContain(rejectedInScope.id);
    expect(remainingIds).toEqual(expect.arrayContaining([nonRejected.id, rejectedWrongScope.id]));
  });

  it("purge rejected skips verified pending and deferred records as not rejected", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const verified = await service.remember({
      content: "Verified purge skip gamma.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.promoteMemory({
      id: verified.id,
      evidence: [{ type: "test", value: "purge rejected skips verified pending and deferred records" }],
    });

    const pending = await service.remember({
      content: "Pending purge skip gamma.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
      reviewStatus: "pending",
    });

    const deferred = await service.remember({
      content: "Deferred purge skip gamma.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: deferred.id, action: "defer", note: "Keep for later review." });

    const result = await service.purgeRejectedMemories({
      ids: [verified.id, pending.id, deferred.id],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    });

    expect(result).toMatchObject({
      status: "accepted",
      dryRun: false,
      deletedRecords: [],
      missingIds: [],
    });
    expect(result.outcomes).toEqual([
      { id: verified.id, status: "skipped_not_rejected" },
      { id: pending.id, status: "skipped_not_rejected" },
      { id: deferred.id, status: "skipped_not_rejected" },
    ]);

    const remainingRecords = await fixture.logStore.readAll();
    expect(remainingRecords.map((record) => record.id)).toEqual(expect.arrayContaining([verified.id, pending.id, deferred.id]));
    expect(remainingRecords.find((record) => record.id === verified.id)?.verificationStatus).toBe("verified");
    expect(remainingRecords.find((record) => record.id === pending.id)?.reviewStatus).toBe("pending");
    expect(remainingRecords.find((record) => record.id === deferred.id)?.reviewStatus).toBe("deferred");

    const search = await service.search({
      query: "purge skip gamma",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });
    expect(search.items.map((item) => item.id)).toEqual(expect.arrayContaining([verified.id, pending.id, deferred.id]));
  });

  it("purge rejected dry run returns dry_run outcomes without modifying log or index", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Rejected purge dry run target.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejected.id, action: "reject", note: "Rejected for dry run." });

    const result = await service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
      dryRun: true,
    });

    expect(result).toMatchObject({
      status: "accepted",
      dryRun: true,
      outcomes: [{ id: rejected.id, status: "dry_run" }],
      deletedRecords: [],
      missingIds: [],
    });
    expect((await fixture.logStore.readAll()).map((record) => record.id)).toContain(rejected.id);

    const search = await service.search({
      query: "Rejected purge dry run target",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });
    expect(search.items.map((item) => item.id)).not.toContain(rejected.id);
  });

  it("purge rejected invalid confirmation fails before deletion", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Rejected purge confirmation target.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejected.id, action: "reject", note: "Rejected for confirmation." });

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE" as "DELETE REJECTED",
    })).rejects.toThrow();

    expect((await fixture.logStore.readAll()).map((record) => record.id)).toContain(rejected.id);
  });

  it("purge rejected validation rejects duplicate ids and invalid scope fields before deletion", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const rejected = await service.remember({
      content: "Rejected purge validation target.",
      kind: "fact",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      source: { type: "manual" },
    });
    await service.reviewMemory({ id: rejected.id, action: "reject", note: "Rejected for validation coverage." });

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id, rejected.id],
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    })).rejects.toThrow(/ids must be unique/);

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "project",
      projectId: "project-alpha",
      confirmation: "DELETE REJECTED",
    })).rejects.toThrow(/containerId is required/);

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "project",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    })).rejects.toThrow(/projectId is required/);

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "global",
      projectId: "project-alpha",
      confirmation: "DELETE REJECTED",
    })).rejects.toThrow(/projectId must not be provided/);

    await expect(service.purgeRejectedMemories({
      ids: [rejected.id],
      scope: "global",
      containerId: "workspace:project-alpha",
      confirmation: "DELETE REJECTED",
    })).rejects.toThrow(/containerId must not be provided/);

    expect((await fixture.logStore.readAll()).map((record) => record.id)).toContain(rejected.id);

    const search = await service.search({
      query: "Rejected purge validation target",
      mode: "full",
      scope: "project",
      projectId: "project-alpha",
      containerId: "workspace:project-alpha",
    });
    expect(search.items.map((item) => item.id)).not.toContain(rejected.id);
  });

  it("lists hypothesis memories in review queue order", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const first = await service.remember({
      content: "Old hypothesis.",
      kind: "fact",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    const second = await service.remember({
      content: "Newer hypothesis.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    await service.promoteMemory({
      id: first.id,
      evidence: [{ type: "human", value: "manual-review", note: "Approved during test." }],
    });

    const queue = await service.listReviewQueue({
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(queue.map((item) => item.id)).toEqual([second.id]);
    expect(queue[0]?.verificationStatus).toBe("hypothesis");
  });

  it("builds review queue overview with priority reasons and reviewer hints", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const verified = await service.remember({
      content: "Always run smoke tests before deploy.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
      verificationStatus: "verified",
      verifiedAt: "2026-04-22T00:00:00.000Z",
      verificationEvidence: [{ type: "human", value: "release-review" }],
    });

    await service.remember({
      content: "Always run smoke tests before deploy.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "tool", title: "enqueue_memory_proposal" },
      verificationStatus: "hypothesis",
      reviewStatus: "pending",
      tags: ["review_queue_candidate", "candidate_confidence:high"],
      importance: 0.8,
    });

    const contradiction = await service.remember({
      content: "Never run smoke tests before deploy.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "tool", title: "enqueue_memory_proposal" },
      verificationStatus: "hypothesis",
      reviewStatus: "pending",
      tags: ["review_queue_candidate", "candidate_confidence:medium"],
      importance: 0.7,
    });

    const overview = await service.listReviewQueueOverview({
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(overview[0]?.priorityScore).toBeGreaterThanOrEqual(overview[1]?.priorityScore ?? 0);
    expect(overview.find((item) => item.content === "Always run smoke tests before deploy.")?.hints).toEqual([
      {
        type: "likely_duplicate",
        relatedMemoryIds: [verified.id],
        note: "Matches the content of existing verified memory.",
      },
    ]);
    expect(overview.find((item) => item.id === contradiction.id)?.hints).toEqual([
      {
        type: "possible_contradiction",
        relatedMemoryIds: [verified.id],
        note: "Shares topic words with verified memory but flips policy-style polarity.",
      },
    ]);

    const contradictionAssist = await service.getReviewAssist({ id: contradiction.id });
      expect(contradictionAssist.suggestions).toEqual([
        {
          kind: "resolve_contradiction",
          rationale: "Shares topic words with verified memory but flips policy-style polarity.",
          relatedMemoryIds: [verified.id],
          draftContent: `Compare verified memory: "Always run smoke tests before deploy." against proposed memory: "Never run smoke tests before deploy." before deciding whether to edit/promote, defer, or reject.`,
          suggestedAction: "edit_then_promote",
        },
      ]);

    const duplicateAssist = await service.getReviewAssist({ id: overview.find((item) => item.content === "Always run smoke tests before deploy.")!.id });
    expect(duplicateAssist.suggestions).toEqual([
      {
        kind: "merge_duplicate",
        rationale: "Matches the content of existing verified memory.",
        relatedMemoryIds: [verified.id],
        draftContent: "Always run smoke tests before deploy.",
        suggestedAction: "edit_then_promote",
      },
    ]);
  });

  it("emits possible_supersession for newer same-scope updates and keeps verified records unchanged", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      const verified = await service.remember({
        content: "We run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-22T00:00:00.000Z",
        verificationEvidence: [{ type: "human", value: "release-review" }],
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      const supersession = await service.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      const beforeReview = await fixture.logStore.readAll();
      const verifiedBefore = beforeReview.find((record) => record.id === verified.id);

      const overview = await service.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(overview.find((item) => item.id === supersession.id)?.hints).toEqual([
        {
          type: "possible_supersession",
          relatedMemoryIds: [verified.id],
          note: "May supersede an existing verified memory; review newer evidence before changing memory status.",
        },
      ]);

      const assist = await service.getReviewAssist({ id: supersession.id });
      expect(assist.suggestions).toEqual([
        {
          kind: "gather_evidence",
          rationale: "May supersede an existing verified memory; review newer evidence before changing memory status.",
          relatedMemoryIds: [verified.id],
          draftContent: "Compare proposed memory against existing verified memory before deciding whether to edit/promote, defer, or reject.",
          suggestedAction: "collect_evidence",
        },
      ]);

      const afterReview = await fixture.logStore.readAll();
      const verifiedAfter = afterReview.find((record) => record.id === verified.id);

      expect(verifiedAfter).toEqual(verifiedBefore);
    } finally {
      useRealTestTimers();
    }
  });

  it("does not emit possible_supersession across scopes", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      await service.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "project-a",
        containerId: "workspace:project-a",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-22T00:00:00.000Z",
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      const pending = await service.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "project-b",
        containerId: "workspace:project-b",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      const overview = await service.listReviewQueueOverview({
        projectId: "project-b",
        containerId: "workspace:project-b",
      });

      expect(overview.find((item) => item.id === pending.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }
  });

  it("does not emit possible_supersession without a verified comparison memory or explicit update signal", async () => {
    const fixtureNoVerified = await createFixture();
    const serviceNoVerified = new MemoryService(
      fixtureNoVerified.logStore,
      fixtureNoVerified.table,
      fixtureNoVerified.embeddingProvider,
      fixtureNoVerified.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      const pendingNoVerified = await serviceNoVerified.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      const overviewNoVerified = await serviceNoVerified.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(overviewNoVerified.find((item) => item.id === pendingNoVerified.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }

    const fixtureNoSignal = await createFixture();
    const serviceNoSignal = new MemoryService(
      fixtureNoSignal.logStore,
      fixtureNoSignal.table,
      fixtureNoSignal.embeddingProvider,
      fixtureNoSignal.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      await serviceNoSignal.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-22T00:00:00.000Z",
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      const pendingNoSignal = await serviceNoSignal.remember({
        content: "We run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high"],
        importance: 0.8,
      });

      const overviewNoSignal = await serviceNoSignal.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(overviewNoSignal.find((item) => item.id === pendingNoSignal.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }
  });

  it("does not emit possible_supersession for older or same-timestamp evidence", async () => {
    const olderFixture = await createFixture();
    const olderService = new MemoryService(
      olderFixture.logStore,
      olderFixture.table,
      olderFixture.embeddingProvider,
      olderFixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      const olderPending = await olderService.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      await olderService.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-23T00:00:00.000Z",
      });

      const olderOverview = await olderService.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(olderOverview.find((item) => item.id === olderPending.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }

    const sameTimeFixture = await createFixture();
    const sameTimeService = new MemoryService(
      sameTimeFixture.logStore,
      sameTimeFixture.table,
      sameTimeFixture.embeddingProvider,
      sameTimeFixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      await sameTimeService.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-22T00:00:00.000Z",
      });

      const sameTimePending = await sameTimeService.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      const sameTimeOverview = await sameTimeService.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(sameTimeOverview.find((item) => item.id === sameTimePending.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }
  });

  it("does not treat review workflow updatedAt as supersession evidence freshness", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      const pending = await service.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      await service.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
        verifiedAt: "2026-04-23T00:00:00.000Z",
      });

      setTestSystemTime(new Date("2026-04-24T00:00:00.000Z"));
      await service.reviewMemory({
        id: pending.id,
        action: "defer",
        note: "Needs reviewer follow-up, not newer evidence.",
      });

      const overview = await service.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(overview.find((item) => item.id === pending.id)?.updatedAt).toBe("2026-04-24T00:00:00.000Z");
      expect(overview.find((item) => item.id === pending.id)?.hints).toEqual([]);
    } finally {
      useRealTestTimers();
    }
  });

  it("uses createdAt as evidence freshness when a verified comparison memory has no verifiedAt", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    try {
      setTestSystemTime(new Date("2026-04-22T00:00:00.000Z"));
      const verified = await service.remember({
        content: "Run smoke tests before deploy.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "manual" },
        verificationStatus: "verified",
      });

      setTestSystemTime(new Date("2026-04-23T00:00:00.000Z"));
      const pending = await service.remember({
        content: "We now run smoke tests before deploy instead of skipping them.",
        kind: "decision",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        source: { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: ["review_queue_candidate", "candidate_confidence:high", "supersedes"],
        importance: 0.8,
      });

      const overview = await service.listReviewQueueOverview({
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      });

      expect(overview.find((item) => item.id === pending.id)?.hints).toEqual([
        {
          type: "possible_supersession",
          relatedMemoryIds: [verified.id],
          note: "May supersede an existing verified memory; review newer evidence before changing memory status.",
        },
      ]);
    } finally {
      useRealTestTimers();
    }
  });

  it("enqueues memory proposals from conversation into the review queue", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    const proposed = await service.enqueueMemoryProposal({
      conversation: "Important: production deploys must go through staging first.",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(proposed.recommendation).toBe("strong_candidate");
    expect(proposed.proposed.length).toBeGreaterThan(0);

    const queue = await service.listReviewQueue({
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0]?.verificationStatus).toBe("hypothesis");
    expect(queue[0]?.reviewStatus).toBe("pending");
    expect(queue[0]?.source.title).toBe("enqueue_memory_proposal");
    expect(queue[0]?.tags).toContain("review_queue_candidate");
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

  it("buildContextForTask uses project scope directly", async () => {
    const fixture = await createFixture();

    const projectOnly = await rememberMemory({
      payload: {
        content: "Project-wide retrieval layer design using LanceDB.",
        kind: "fact",
        scope: "project",
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
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
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

  it("buildContextForTask ranks stronger project matches ahead of weaker ones", async () => {
    const fixture = await createFixture();

    const strongerProjectMem = await rememberMemory({
      payload: {
        content: "Project probe: prioritize LanceDB index tuning for retrieval work.",
        kind: "fact",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
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
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        maxItems: 5,
        maxChars: 4000,
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toContain(strongerProjectMem.id);
    expect(result.items).toContain(projectMem.id);
    expect(result.context).toContain("prioritize LanceDB index tuning");
  });

  it("rebuilds the LanceDB index from the canonical log", async () => {
    const fixture = await createFixture();

    const remembered = await rememberMemory({
      payload: {
        content: "Reindex should restore retrieval from the canonical log.",
        kind: "fact",
        scope: "project",
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
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items.some((item) => item.id === remembered.id)).toBe(true);
  });

  it("clears stale LanceDB rows when reindexing from an empty canonical log", async () => {
    const fixture = await createFixture();
    const embeddingVersion = fixture.embeddingProvider.version;

    await fixture.table.upsertRows([
      toRetrievalRow(
        {
          id: "mem-stale",
          kind: "fact",
          scope: "project",
          projectId: "mahiro-mcp-memory-layer",
          containerId: "workspace:mahiro-mcp-memory-layer",
          source: { type: "manual" },
          content: "Stale row that should vanish after empty reindex.",
          tags: [],
          importance: 0.5,
          createdAt: "2026-04-05T00:00:00.000Z",
        },
        await fixture.embeddingProvider.embedText("Stale row that should vanish after empty reindex."),
        embeddingVersion,
      ),
    ]);

    await reindexMemoryRecords({
      logStore: fixture.logStore,
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
    });

    const result = await searchMemories({
      payload: {
        query: "stale row vanish",
        mode: "full",
        scope: "project",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      table: fixture.table,
      embeddingProvider: fixture.embeddingProvider,
      traceStore: fixture.traceStore,
    });

    expect(result.items).toHaveLength(0);
  });

  it("keeps one active LanceDB row per memory id when upserting updates", async () => {
    const fixture = await createFixture();
    const embeddingVersion = fixture.embeddingProvider.version;
    const baseRecord = {
      id: "mem-repeat",
      kind: "fact" as const,
      scope: "project" as const,
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" as const },
      tags: [],
      importance: 0.5,
      createdAt: "2026-04-05T00:00:00.000Z",
    };

    await fixture.table.upsertRows([
      toRetrievalRow(
        { ...baseRecord, content: "Original retrieval row content." },
        await fixture.embeddingProvider.embedText("Original retrieval row content."),
        embeddingVersion,
      ),
    ]);
    await fixture.table.upsertRows([
      toRetrievalRow(
        { ...baseRecord, content: "Updated retrieval row content.", updatedAt: "2026-04-06T00:00:00.000Z" },
        await fixture.embeddingProvider.embedText("Updated retrieval row content."),
        embeddingVersion,
      ),
    ]);

    const rows = await fixture.table.queryScopedRows({
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(rows.filter((row) => row.id === "mem-repeat")).toHaveLength(1);
    expect(rows.find((row) => row.id === "mem-repeat")?.content).toBe("Updated retrieval row content.");
  });

  it("retrieval modes change ranking between recent and profile", async () => {
    const fixture = await createFixture();
    const embeddingVersion = fixture.embeddingProvider.version;
    setTestSystemTime(new Date("2026-04-05T00:00:00.000Z"));

    try {
      await fixture.table.upsertRows([
        toRetrievalRow(
          {
            id: "mem-important",
            kind: "fact",
            scope: "project",
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
      useRealTestTimers();
    }
  });

  it("upsert_document is idempotent for the same scope and source identity", async () => {
    const fixture = await createFixture();

    const base = {
      projectId: "mahiro-mcp-memory-layer",
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
    const lastTrace = JSON.parse(traceLines[traceLines.length - 1]!) as { degraded: boolean };
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
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    const searchResult = await service.search({
      query: "durable retrieval",
      mode: "query",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
    });

    expect(searchResult.items.length).toBeGreaterThan(0);

    const traceLines = (await readFile(fixture.traceFilePath, "utf8")).trim().split("\n");
    const latestTrace = JSON.parse(traceLines[traceLines.length - 1]!) as RetrievalTraceEntry;
    const audit = await service.inspectMemoryRetrieval({});

    expect(audit).toEqual({
      status: "found",
      lookup: "latest",
      trace: latestTrace,
      summary: {
        classification: "normal_hit",
        hit: true,
        returnedCount: latestTrace.returnedMemoryIds.length,
        degraded: latestTrace.degraded,
      },
    });
    expect(latestTrace.contextSize).toBeGreaterThan(0);
    expect(latestTrace.provenance).toEqual({
      surface: "tool",
      trigger: "search_memories",
      phase: "search",
      searchScope: "project",
    });
  });

  it("classifies inspect retrieval summary as normal hit for req-hit-001", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const trace = retrievalTraceFixture({ requestId: "req-hit-001" });

    await fixture.traceStore.append(trace);

    const audit = await service.inspectMemoryRetrieval({ requestId: "req-hit-001" });

    expect(audit).toEqual({
      status: "found",
      lookup: "request_id",
      trace,
      summary: {
        classification: "normal_hit",
        hit: true,
        returnedCount: 1,
        degraded: false,
      },
    });
  });

  it("classifies inspect retrieval summary as empty success for req-empty-001", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const trace = retrievalTraceFixture({
      requestId: "req-empty-001",
      returnedMemoryIds: [],
      rankingReasonsById: {},
      contextSize: 0,
    });

    await fixture.traceStore.append(trace);

    const audit = await service.inspectMemoryRetrieval({ requestId: "req-empty-001" });

    expect(audit).toEqual({
      status: "found",
      lookup: "request_id",
      trace,
      summary: {
        classification: "empty_success",
        hit: false,
        returnedCount: 0,
        degraded: false,
      },
    });
  });

  it("classifies inspect retrieval summary as degraded empty retrieval for req-degraded-empty-001", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const trace = retrievalTraceFixture({
      requestId: "req-degraded-empty-001",
      returnedMemoryIds: [],
      rankingReasonsById: {},
      contextSize: 0,
      degraded: true,
    });

    await fixture.traceStore.append(trace);

    const audit = await service.inspectMemoryRetrieval({ requestId: "req-degraded-empty-001" });

    expect(audit).toEqual({
      status: "found",
      lookup: "request_id",
      trace,
      summary: {
        classification: "degraded_retrieval",
        hit: false,
        returnedCount: 0,
        degraded: true,
      },
    });
  });

  it("records contextSize as the returned item text payload size for mem-001", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const content = "mem-001 deterministic trace payload content for contextSize.";
    const summary = "mem-001 deterministic trace summary.";
    const expectedContextSize = content.length + summary.length;

    await fixture.table.upsertRows([
      toRetrievalRow(
        {
          id: "mem-001",
          kind: "fact",
          scope: "project",
          projectId: "project-alpha",
          containerId: "container-main",
          source: { type: "manual" },
          content,
          summary,
          tags: [],
          importance: 0.8,
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z",
        },
        await fixture.embeddingProvider.embedText(`${content}\n${summary}`),
        fixture.embeddingProvider.version,
      ),
    ]);

    const searchResult = await service.search({
      query: "deterministic trace payload contextSize",
      mode: "query",
      scope: "project",
      projectId: "project-alpha",
      containerId: "container-main",
      limit: 1,
    });

    const audit = await service.inspectMemoryRetrieval({});

    expect(searchResult.items.map((item) => item.id)).toEqual(["mem-001"]);
    expect(audit.status).toBe("found");
    if (audit.status !== "found") {
      throw new Error("expected retrieval trace to be found");
    }
    expect(audit.trace.returnedMemoryIds).toEqual(["mem-001"]);
    expect(audit.trace.contextSize).toBe(expectedContextSize);
    expect(audit.trace.contextSize).toBeGreaterThan(0);
  });

  it("limits rankingReasonsById to coarse diagnostics for returned memory ids", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const coarseReasonLabels = ["scope_match", "keyword_match", "semantic_match"];

    await fixture.table.upsertRows([
      toRetrievalRow(
        {
          id: "mem-001",
          kind: "fact",
          scope: "project",
          projectId: "project-alpha",
          containerId: "container-main",
          source: { type: "manual" },
          content: "mem-001 coarse ranking reason boundary keyword payload.",
          summary: "coarse ranking reason boundary summary.",
          tags: [],
          importance: 0.8,
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z",
        },
        await fixture.embeddingProvider.embedText("mem-001 coarse ranking reason boundary keyword payload."),
        fixture.embeddingProvider.version,
      ),
    ]);

    await service.search({
      query: "coarse ranking reason boundary keyword",
      mode: "query",
      scope: "project",
      projectId: "project-alpha",
      containerId: "container-main",
      limit: 1,
    });

    const audit = await service.inspectMemoryRetrieval({});

    expect(audit.status).toBe("found");
    if (audit.status !== "found") {
      throw new Error("expected retrieval trace to be found");
    }
    expect(Object.keys(audit.trace.rankingReasonsById)).toEqual(["mem-001"]);
    expect(audit.trace.returnedMemoryIds).toEqual(["mem-001"]);
    expect(audit.trace.rankingReasonsById["mem-001"]).toEqual(expect.arrayContaining(["scope_match", "keyword_match"]));
    expect(audit.trace.rankingReasonsById["mem-001"]?.every((reason) => coarseReasonLabels.includes(reason))).toBe(true);
    expect(audit.trace.rankingReasonsById["mem-001"]?.some((reason) => /\d/.test(reason))).toBe(false);
  });

  it("keeps contextSize independent from rendered context truncation length", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );
    const content = "mem-001 long deterministic trace payload content for contextSize that cannot fit inside the tiny rendered context budget.";
    const summary = "mem-001 summary still counts toward trace payload size even when the rendered context is truncated.";
    const expectedContextSize = content.length + summary.length;

    await fixture.table.upsertRows([
      toRetrievalRow(
        {
          id: "mem-001",
          kind: "fact",
          scope: "project",
          projectId: "project-alpha",
          containerId: "container-main",
          source: { type: "manual" },
          content,
          summary,
          tags: [],
          importance: 0.8,
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z",
        },
        await fixture.embeddingProvider.embedText(`${content}\n${summary}`),
        fixture.embeddingProvider.version,
      ),
    ]);

    const contextResult = await service.buildContext({
      task: "deterministic trace payload contextSize",
      mode: "full",
      projectId: "project-alpha",
      containerId: "container-main",
      maxItems: 1,
      maxChars: 80,
    });

    const audit = await service.inspectMemoryRetrieval({});

    expect(contextResult.truncated).toBe(true);
    expect(contextResult.items).toEqual([]);
    expect(audit.status).toBe("found");
    if (audit.status !== "found") {
      throw new Error("expected retrieval trace to be found");
    }
    expect(audit.trace.returnedMemoryIds).toEqual(["mem-001"]);
    expect(audit.trace.contextSize).toBe(expectedContextSize);
    expect(audit.trace.contextSize).not.toBe(contextResult.context.length);
    expect(audit.trace.contextSize).toBeGreaterThan(contextResult.context.length);
  });

  it("threads explicit provenance through prepareHostTurnMemory traces", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    await service.remember({
      content: "We decided to inspect trace provenance in live plugin preflight.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "workspace:mahiro-mcp-memory-layer",
      source: { type: "manual" },
    });

    await service.prepareHostTurnMemory(
      {
        task: "Continue from the previous session and remember the earlier decision.",
        mode: "query",
        recentConversation: "Continue from the previous session and remember the earlier decision.",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
      },
      {
        surface: "opencode-plugin",
        trigger: "message.part.updated",
        phase: "turn-preflight",
      },
    );

    const audit = await service.inspectMemoryRetrieval({});

    expect(audit).toMatchObject({
      status: "found",
      lookup: "latest",
      trace: {
        provenance: {
          surface: "opencode-plugin",
          trigger: "message.part.updated",
          phase: "turn-preflight",
          searchScope: "project",
        },
      },
    });
  });

  it("inspects the latest retrieval trace for a matching project scope instead of the global latest", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    await service.remember({
      content: "Repo-local project memory.",
      kind: "decision",
      scope: "project",
      projectId: "mahiro-mcp-memory-layer",
      containerId: "worktree:/repo-a",
      source: { type: "manual" },
    });

    await service.remember({
      content: "Different workspace memory.",
      kind: "decision",
      scope: "project",
      projectId: "other-project",
      containerId: "worktree:/repo-b",
      source: { type: "manual" },
    });

    await service.prepareHostTurnMemory(
      {
        task: "Continue from the previous session in repo A.",
        mode: "query",
        recentConversation: "Continue from the previous session in repo A.",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "worktree:/repo-a",
      },
      {
        surface: "opencode-plugin",
        trigger: "message.part.updated",
        phase: "turn-preflight",
      },
    );

    await service.prepareHostTurnMemory(
      {
        task: "Continue from the previous session in repo B.",
        mode: "query",
        recentConversation: "Continue from the previous session in repo B.",
        projectId: "other-project",
        containerId: "worktree:/repo-b",
      },
      {
        surface: "opencode-plugin",
        trigger: "message.part.updated",
        phase: "turn-preflight",
      },
    );

    const audit = await service.inspectMemoryRetrieval({
      latestScopeFilter: {
        projectId: "mahiro-mcp-memory-layer",
        containerId: "worktree:/repo-a",
      },
    });

    expect(audit).toMatchObject({
      status: "found",
      lookup: "latest",
      trace: {
        enforcedFilters: {
          projectId: "mahiro-mcp-memory-layer",
          containerId: "worktree:/repo-a",
        },
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
      summary: {
        classification: "no_trace_found",
        hit: false,
        returnedCount: 0,
        degraded: false,
      },
    });
  });

  it("returns the attempted scope filter when scoped latest lookup is empty", async () => {
    const fixture = await createFixture();
    const service = new MemoryService(
      fixture.logStore,
      fixture.table,
      fixture.embeddingProvider,
      fixture.traceStore,
    );

    await expect(service.inspectMemoryRetrieval({
      latestScopeFilter: {
        projectId: "project-alpha",
        containerId: "container-main",
      },
    })).resolves.toEqual({
      status: "empty",
      lookup: "latest",
      latestScopeFilter: {
        projectId: "project-alpha",
        containerId: "container-main",
      },
      summary: {
        classification: "no_trace_found",
        hit: false,
        returnedCount: 0,
        degraded: false,
      },
    });
  });
});
