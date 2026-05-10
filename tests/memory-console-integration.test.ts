import type { Server } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryConsoleBackend } from "../src/features/memory-console/reader.js";
import { createMemoryConsoleServer, memoryConsoleHost } from "../src/features/memory-console/server.js";
import type { MemoryConsoleBackend, ReadOnlyMemoryReader } from "../src/features/memory-console/types.js";
import { DeterministicEmbeddingProvider } from "../src/features/memory/index/embedding-provider.js";
import { connectToLanceDb } from "../src/features/memory/index/lancedb-client.js";
import { MemoryRecordsTable } from "../src/features/memory/index/memory-records-table.js";
import { JsonlLogStore } from "../src/features/memory/log/jsonl-log-store.js";
import { MemoryService } from "../src/features/memory/memory-service.js";
import { RetrievalTraceStore } from "../src/features/memory/observability/retrieval-trace.js";
import type { MemoryRecord } from "../src/features/memory/types.js";

const projectScope = {
  scope: "project",
  projectId: "project-alpha",
  containerId: "workspace:project-alpha",
} as const;

const otherProjectScope = {
  scope: "project",
  projectId: "project-beta",
  containerId: "workspace:project-beta",
} as const;

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirectories.splice(0).map(async (directoryPath) => {
    await rm(directoryPath, { recursive: true, force: true });
  }));
});

describe("memory console integration", () => {
  it("serves browse, review, rejected, and graph GET routes from fixture storage without mutations", async () => {
    const fixture = await createConsoleFixture();
    const seeded = await seedConsoleMemories(fixture.service);
    clearCanonicalWriteSpies(fixture);
    const backend = createInstrumentedBackend(fixture);

    await withConsoleServer(backend.backend, async (baseUrl) => {
      const browseResponse = await fetch(new URL("/", baseUrl));
      const browseHtml = await browseResponse.text();

      expect(browseResponse.status).toBe(200);
      expect(browseResponse.headers.get("content-type")).toContain("text/html");
      expect(browseHtml).toContain("Local memory console");
      expect(browseHtml).toContain("Browse integration verified memory.");
      expect(browseHtml).toContain('method="post" action="/actions/review"');
      expect(browseHtml).toContain("Reject verified memory");
      expect(browseHtml).not.toContain('action="/actions/promote"');
      expect(browseHtml).not.toContain('action="/actions/purge-rejected"');

      const reviewUrl = new URL("/review", baseUrl);
      reviewUrl.searchParams.set("scope", "project");
      reviewUrl.searchParams.set("projectId", projectScope.projectId);
      reviewUrl.searchParams.set("containerId", projectScope.containerId);
      const reviewResponse = await fetch(reviewUrl);
      const reviewHtml = await reviewResponse.text();

      expect(reviewResponse.status).toBe(200);
      expect(reviewHtml).toContain("Review Queue");
      expect(reviewHtml).toContain("Console duplicate review memory.");
      expect(reviewHtml).toContain("likely_duplicate");
      expect(reviewHtml).toContain("Matches the content of existing verified memory.");
      expect(reviewHtml).toContain('method="post" action="/actions/review"');
      expect(reviewHtml).toContain('method="post" action="/actions/promote"');

      const rejectedUrl = new URL("/rejected", baseUrl);
      rejectedUrl.searchParams.set("scope", "project");
      rejectedUrl.searchParams.set("projectId", projectScope.projectId);
      rejectedUrl.searchParams.set("containerId", projectScope.containerId);
      const rejectedResponse = await fetch(rejectedUrl);
      const rejectedHtml = await rejectedResponse.text();

      expect(rejectedResponse.status).toBe(200);
      expect(rejectedHtml).toContain("Rejected memory quarantine");
      expect(rejectedHtml).toContain("Rejected integration purge target.");
      expect(rejectedHtml).not.toContain("Promote POST target.");
      expect(rejectedHtml).not.toContain("Deferred integration memory.");
      expect(rejectedHtml).not.toContain("Wrong scope rejected skip.");
      expect(rejectedHtml).not.toContain('action="/actions/review"');
      expect(rejectedHtml).not.toContain('action="/actions/promote"');

      const graphUrl = new URL("/graph", baseUrl);
      graphUrl.searchParams.set("scope", "project");
      graphUrl.searchParams.set("projectId", projectScope.projectId);
      graphUrl.searchParams.set("containerId", projectScope.containerId);
      graphUrl.searchParams.set("edgeType", "related_memory");
      graphUrl.searchParams.set("id", `memory:${seeded.reviewTarget.id}`);
      const recordsBeforeGraph = await fixture.logStore.readAll();
      const graphResponse = await fetch(graphUrl);
      const graphHtml = await graphResponse.text();
      const recordsAfterGraph = await fixture.logStore.readAll();

      expect(graphResponse.status).toBe(200);
      expect(graphHtml).toContain("Memory graph");
      expect(graphHtml).toContain("Read-only projection of canonical memory metadata");
      expect(graphHtml).toContain("related memory");
      expect(graphHtml).not.toContain('method="post"');
      expect(recordsAfterGraph).toEqual(recordsBeforeGraph);
    });

    expect(backend.reader.readAll).toHaveBeenCalled();
    expect(backend.writer.listReviewQueueOverview).toHaveBeenCalled();
    expect(backend.writer.getReviewAssist).toHaveBeenCalled();
    expectNoWriteMethods(backend);
    expectNoCanonicalWriteMethods(fixture);
  });

  it("routes review and promote POSTs to exactly one intended service method", async () => {
    const fixture = await createConsoleFixture();
    const seeded = await seedConsoleMemories(fixture.service);
    const backend = createInstrumentedBackend(fixture);

    await withConsoleServer(backend.backend, async (baseUrl) => {
      clearBackendActionSpies(backend);
      const reviewResponse = await fetch(new URL("/actions/review", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          id: seeded.reviewPostTarget.id,
          action: "defer",
          note: "Integration route deferred this memory.",
        }),
        redirect: "manual",
      });
      const reviewBody = await reviewResponse.text();

      expect(reviewResponse.status).toBe(303);
      expect(reviewResponse.headers.get("location")).toBe("/review");
      expect(reviewBody).toBe("Action accepted: review");
      expect(backend.writer.reviewMemory).toHaveBeenCalledTimes(1);
      expect(backend.writer.reviewMemory).toHaveBeenCalledWith({
        id: seeded.reviewPostTarget.id,
        action: "defer",
        note: "Integration route deferred this memory.",
      });
      expect(backend.writer.promoteMemory).not.toHaveBeenCalled();
      expect(backend.writer.purgeRejectedMemories).not.toHaveBeenCalled();
      expect(await expectMemory(fixture.logStore, seeded.reviewPostTarget.id)).toMatchObject({ reviewStatus: "deferred" });

      clearBackendActionSpies(backend);
      const promoteResponse = await fetch(new URL("/actions/promote", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          id: seeded.promoteTarget.id,
          evidenceType: "test",
          evidenceValue: "memory-console-integration promote POST",
          evidenceNote: "Fixture-backed route verification.",
        }),
        redirect: "manual",
      });
      const promoteBody = await promoteResponse.text();

      expect(promoteResponse.status).toBe(303);
      expect(promoteResponse.headers.get("location")).toBe("/");
      expect(promoteBody).toBe("Action accepted: promote");
      expect(backend.writer.promoteMemory).toHaveBeenCalledTimes(1);
      expect(backend.writer.promoteMemory).toHaveBeenCalledWith({
        id: seeded.promoteTarget.id,
        evidence: [{
          type: "test",
          value: "memory-console-integration promote POST",
          note: "Fixture-backed route verification.",
        }],
      });
      expect(backend.writer.reviewMemory).not.toHaveBeenCalled();
      expect(backend.writer.purgeRejectedMemories).not.toHaveBeenCalled();
      expect(await expectMemory(fixture.logStore, seeded.promoteTarget.id)).toMatchObject({ verificationStatus: "verified" });
    });
  });

  it("purges rejected memories through fixture storage while preserving wrong-scope and non-rejected records", async () => {
    const fixture = await createConsoleFixture();
    const seeded = await seedConsoleMemories(fixture.service);
    const backend = createInstrumentedBackend(fixture);

    await withConsoleServer(backend.backend, async (baseUrl) => {
      clearBackendActionSpies(backend);
      const dryRunBody = new URLSearchParams({
        scope: "project",
        projectId: projectScope.projectId,
        containerId: projectScope.containerId,
        dryRun: "true",
      });
      dryRunBody.append("ids", seeded.rejectedTarget.id);
      dryRunBody.append("ids", seeded.pendingPurgeSkip.id);

      const dryRunResponse = await fetch(new URL("/actions/purge-rejected", baseUrl), {
        method: "POST",
        body: dryRunBody,
      });
      const dryRunHtml = await dryRunResponse.text();

      expect(dryRunResponse.status).toBe(200);
      expect(dryRunHtml).toContain("Rejected purge preview");
      expect(dryRunHtml).toContain("dry_run");
      expect(dryRunHtml).toContain("skipped_not_rejected");
      expect(backend.writer.purgeRejectedMemories).toHaveBeenCalledTimes(1);
      expect(backend.writer.purgeRejectedMemories).toHaveBeenCalledWith({
        ids: [seeded.rejectedTarget.id, seeded.pendingPurgeSkip.id],
        scope: "project",
        projectId: projectScope.projectId,
        containerId: projectScope.containerId,
        confirmation: "DELETE REJECTED",
        dryRun: true,
      });
      expect(backend.writer.reviewMemory).not.toHaveBeenCalled();
      expect(backend.writer.promoteMemory).not.toHaveBeenCalled();
      expect(await expectMemory(fixture.logStore, seeded.rejectedTarget.id)).toBeDefined();

      clearBackendActionSpies(backend);
      const missingConfirmationResponse = await fetch(new URL("/actions/purge-rejected", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          ids: seeded.rejectedTarget.id,
          scope: "project",
          projectId: projectScope.projectId,
          containerId: projectScope.containerId,
        }),
      });

      expect(missingConfirmationResponse.status).toBe(400);
      expect(await missingConfirmationResponse.text()).toBe("Invalid purge-rejected action: confirmation must be DELETE REJECTED.");
      expect(backend.writer.purgeRejectedMemories).not.toHaveBeenCalled();
      expect(await expectMemory(fixture.logStore, seeded.rejectedTarget.id)).toBeDefined();

      clearBackendActionSpies(backend);
      const finalBody = new URLSearchParams({
        scope: "project",
        projectId: projectScope.projectId,
        containerId: projectScope.containerId,
        confirmation: "DELETE REJECTED",
      });
      finalBody.append("ids", seeded.rejectedTarget.id);
      finalBody.append("ids", seeded.pendingPurgeSkip.id);
      finalBody.append("ids", seeded.wrongScopeRejected.id);
      finalBody.append("ids", "missing-memory-id");

      const finalResponse = await fetch(new URL("/actions/purge-rejected", baseUrl), {
        method: "POST",
        body: finalBody,
      });
      const finalHtml = await finalResponse.text();

      expect(finalResponse.status).toBe(200);
      expect(finalHtml).toContain("Rejected purge result");
      expect(finalHtml).toContain(seeded.rejectedTarget.id);
      expect(finalHtml).toContain("deleted");
      expect(finalHtml).toContain(seeded.pendingPurgeSkip.id);
      expect(finalHtml).toContain("skipped_not_rejected");
      expect(finalHtml).toContain(seeded.wrongScopeRejected.id);
      expect(finalHtml).toContain("skipped_scope_mismatch");
      expect(finalHtml).toContain("missing-memory-id");
      expect(finalHtml).toContain("skipped_not_found");
      expect(backend.writer.purgeRejectedMemories).toHaveBeenCalledTimes(1);
      expect(backend.writer.purgeRejectedMemories).toHaveBeenCalledWith({
        ids: [seeded.rejectedTarget.id, seeded.pendingPurgeSkip.id, seeded.wrongScopeRejected.id, "missing-memory-id"],
        scope: "project",
        projectId: projectScope.projectId,
        containerId: projectScope.containerId,
        confirmation: "DELETE REJECTED",
      });
      expect(backend.writer.reviewMemory).not.toHaveBeenCalled();
      expect(backend.writer.promoteMemory).not.toHaveBeenCalled();
    });

    const remainingRecords = await fixture.logStore.readAll();
    expect(remainingRecords.map((record) => record.id)).not.toContain(seeded.rejectedTarget.id);
    expect(remainingRecords.map((record) => record.id)).toEqual(expect.arrayContaining([
      seeded.pendingPurgeSkip.id,
      seeded.wrongScopeRejected.id,
    ]));
    expect(remainingRecords.find((record) => record.id === seeded.pendingPurgeSkip.id)?.reviewStatus).toBe("pending");
    expect(remainingRecords.find((record) => record.id === seeded.wrongScopeRejected.id)?.projectId).toBe(otherProjectScope.projectId);

    const deletedSearch = await fixture.service.search({
      query: "Rejected integration purge target",
      mode: "full",
      ...projectScope,
    });
    expect(deletedSearch.items.map((item) => item.id)).not.toContain(seeded.rejectedTarget.id);

    const wrongScopeSearch = await fixture.service.search({
      query: "Wrong scope rejected skip",
      mode: "full",
      ...otherProjectScope,
    });
    expect(wrongScopeSearch.items.map((item) => item.id)).not.toContain(seeded.wrongScopeRejected.id);
  });

  it("returns deterministic statuses for unknown routes and unsupported methods without reading or mutating", async () => {
    const fixture = await createConsoleFixture();
    const backend = createInstrumentedBackend(fixture);

    await withConsoleServer(backend.backend, async (baseUrl) => {
      const unknownResponse = await fetch(new URL("/missing", baseUrl));
      expect(unknownResponse.status).toBe(404);
      expect(unknownResponse.headers.get("content-type")).toContain("text/plain");
      expect(await unknownResponse.text()).toBe("Not found");

      const pageMethodResponse = await fetch(new URL("/", baseUrl), { method: "PUT" });
      expect(pageMethodResponse.status).toBe(405);
      expect(pageMethodResponse.headers.get("allow")).toBe("GET, HEAD");
      expect(await pageMethodResponse.text()).toBe("Method PUT is not allowed for /. Allowed methods: GET, HEAD.");

      const actionMethodResponse = await fetch(new URL("/actions/review", baseUrl));
      expect(actionMethodResponse.status).toBe(405);
      expect(actionMethodResponse.headers.get("allow")).toBe("POST");
      expect(await actionMethodResponse.text()).toBe("Method GET is not allowed for /actions/review. Allowed methods: POST.");
    });

    expect(backend.reader.readAll).not.toHaveBeenCalled();
    expect(backend.reader.list).not.toHaveBeenCalled();
    expect(backend.reader.search).not.toHaveBeenCalled();
    expect(backend.writer.listReviewQueueOverview).not.toHaveBeenCalled();
    expect(backend.writer.getReviewAssist).not.toHaveBeenCalled();
    expectNoWriteMethods(backend);
    expectNoCanonicalWriteMethods(fixture);
  });
});

async function createConsoleFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "memory-console-integration-"));
  tempDirectories.push(root);
  await Promise.all([
    mkdir(path.join(root, "log"), { recursive: true }),
    mkdir(path.join(root, "traces"), { recursive: true }),
    mkdir(path.join(root, "lancedb"), { recursive: true }),
  ]);

  const logStore = new JsonlLogStore(path.join(root, "log", "canonical-log.jsonl"));
  const embeddingProvider = new DeterministicEmbeddingProvider(64);
  const connection = await connectToLanceDb(path.join(root, "lancedb"));
  const table = new MemoryRecordsTable(connection);
  const traceStore = new RetrievalTraceStore(path.join(root, "traces", "retrieval-trace.jsonl"));
  const service = new MemoryService(logStore, table, embeddingProvider, traceStore);

  return {
    root,
    logStore,
    table,
    service,
    appendSpy: vi.spyOn(logStore, "append"),
    replaceSpy: vi.spyOn(logStore, "replaceRecordById"),
    deleteSpy: vi.spyOn(logStore, "deleteRecordsByIds"),
    upsertRowsSpy: vi.spyOn(table, "upsertRows"),
    deleteRowsSpy: vi.spyOn(table, "deleteRowsByIds"),
  };
}

async function seedConsoleMemories(service: MemoryService) {
  const browseVerified = await service.remember({
    content: "Browse integration verified memory.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Integration fixture" },
    verificationStatus: "verified",
    tags: ["browse", "graph"],
    importance: 0.7,
  });
  const duplicateVerified = await service.remember({
    content: "Console duplicate review memory.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Verified duplicate" },
    verificationStatus: "verified",
    tags: ["review"],
    importance: 0.8,
  });
  const reviewTarget = await service.remember({
    content: "Console duplicate review memory.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Review target" },
    reviewStatus: "pending",
    tags: ["review"],
    importance: 0.9,
  });
  const reviewPostTarget = await service.remember({
    content: "Review POST target memory.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Review POST" },
    reviewStatus: "pending",
    tags: ["post"],
    importance: 0.6,
  });
  const promoteTarget = await service.remember({
    content: "Promote POST target.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Promote POST" },
    reviewStatus: "pending",
    tags: ["post"],
    importance: 0.6,
  });
  const rejectedTarget = await service.remember({
    content: "Rejected integration purge target.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Rejected target" },
    tags: ["purge"],
    importance: 0.7,
  });
  await service.reviewMemory({ id: rejectedTarget.id, action: "reject", note: "Rejected for purge integration." });

  const pendingPurgeSkip = await service.remember({
    content: "Pending integration purge skip.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Pending purge skip" },
    reviewStatus: "pending",
    tags: ["purge"],
    importance: 0.4,
  });
  const deferredMemory = await service.remember({
    content: "Deferred integration memory.",
    kind: "fact",
    ...projectScope,
    source: { type: "manual", title: "Deferred memory" },
    tags: ["review"],
    importance: 0.4,
  });
  await service.reviewMemory({ id: deferredMemory.id, action: "defer", note: "Deferred for rejected route exclusion." });

  const wrongScopeRejected = await service.remember({
    content: "Wrong scope rejected skip.",
    kind: "fact",
    ...otherProjectScope,
    source: { type: "manual", title: "Wrong scope rejected" },
    tags: ["purge"],
    importance: 0.7,
  });
  await service.reviewMemory({ id: wrongScopeRejected.id, action: "reject", note: "Rejected in another scope." });

  return {
    browseVerified,
    duplicateVerified,
    reviewTarget,
    reviewPostTarget,
    promoteTarget,
    rejectedTarget,
    pendingPurgeSkip,
    deferredMemory,
    wrongScopeRejected,
  };
}

function createInstrumentedBackend(fixture: Awaited<ReturnType<typeof createConsoleFixture>>) {
  const reader: ReadOnlyMemoryReader = {
    readAll: vi.fn(() => fixture.logStore.readAll()),
    list: vi.fn((payload) => fixture.service.list(payload)),
    search: vi.fn((payload) => fixture.service.search(payload)),
  };
  const writer = {
    listReviewQueueOverview: vi.fn((payload) => fixture.service.listReviewQueueOverview(payload)),
    getReviewAssist: vi.fn((payload) => fixture.service.getReviewAssist(payload)),
    reviewMemory: vi.fn((payload) => fixture.service.reviewMemory(payload)),
    promoteMemory: vi.fn((payload) => fixture.service.promoteMemory(payload)),
    purgeRejectedMemories: vi.fn((payload) => fixture.service.purgeRejectedMemories(payload)),
  };

  return {
    reader,
    writer,
    backend: createMemoryConsoleBackend(reader, writer),
  };
}

async function withConsoleServer(
  reader: MemoryConsoleBackend,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createMemoryConsoleServer(reader);
  const baseUrl = await listen(server);
  try {
    await run(baseUrl);
  } finally {
    await close(server);
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Memory console integration server did not expose a TCP address."));
        return;
      }
      resolve(`http://${memoryConsoleHost}:${address.port}/`);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, memoryConsoleHost);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function expectMemory(logStore: JsonlLogStore, id: string): Promise<MemoryRecord | undefined> {
  return (await logStore.readAll()).find((record) => record.id === id);
}

function expectNoWriteMethods(backend: ReturnType<typeof createInstrumentedBackend>): void {
  expect(backend.writer.reviewMemory).not.toHaveBeenCalled();
  expect(backend.writer.promoteMemory).not.toHaveBeenCalled();
  expect(backend.writer.purgeRejectedMemories).not.toHaveBeenCalled();
}

function expectNoCanonicalWriteMethods(fixture: Awaited<ReturnType<typeof createConsoleFixture>>): void {
  expect(fixture.appendSpy).not.toHaveBeenCalled();
  expect(fixture.replaceSpy).not.toHaveBeenCalled();
  expect(fixture.deleteSpy).not.toHaveBeenCalled();
  expect(fixture.upsertRowsSpy).not.toHaveBeenCalled();
  expect(fixture.deleteRowsSpy).not.toHaveBeenCalled();
}

function clearCanonicalWriteSpies(fixture: Awaited<ReturnType<typeof createConsoleFixture>>): void {
  fixture.appendSpy.mockClear();
  fixture.replaceSpy.mockClear();
  fixture.deleteSpy.mockClear();
  fixture.upsertRowsSpy.mockClear();
  fixture.deleteRowsSpy.mockClear();
}

function clearBackendActionSpies(backend: ReturnType<typeof createInstrumentedBackend>): void {
  backend.writer.reviewMemory.mockClear();
  backend.writer.promoteMemory.mockClear();
  backend.writer.purgeRejectedMemories.mockClear();
}
