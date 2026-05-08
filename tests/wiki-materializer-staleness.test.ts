import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runWikiMaterialization } from "../src/features/memory/wiki-materializer/materialize.js";
import { validateWikiMaterializerStaleness } from "../src/features/memory/wiki-materializer/staleness.js";
import { hashWikiMaterializerRecord } from "../src/features/memory/wiki-materializer/utils.js";
import type { MemoryRecord } from "../src/features/memory/types.js";

const scope = {
  projectId: "project-alpha",
  containerId: "container-main",
};
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(async (directoryPath) => {
    await rm(directoryPath, { recursive: true, force: true });
  }));
});

describe("wiki materializer staleness validation", () => {
  it("reports fresh immediately after materialization and preserves deterministic record hashes", async () => {
    const outputDir = await createTempDirectory();
    const records = [recordFixture({ id: "mem-1" })];
    const result = await runWikiMaterialization({
      ...scope,
      outputDir,
      logStore: readOnlyStore(records),
      generatedAt: "2026-05-08T12:00:00.000Z",
      materializerVersion: "0.0.0-test",
    });

    const report = await validateWikiMaterializerStaleness({
      ...scope,
      outputDir,
      logStore: readOnlyStore(records),
    });

    expect(report.status).toBe("fresh");
    expect(report.changes).toEqual([]);
    expect(result.manifest.records).toHaveLength(1);
    expect(result.manifest.records[0]?.recordHash).toBe(hashWikiMaterializerRecord(result.records[0]!));
  });

  it("reports stale when projected content or source fields mutate", async () => {
    const outputDir = await createTempDirectory();
    const original = recordFixture({ id: "mem-1" });

    await runWikiMaterialization({
      ...scope,
      outputDir,
      logStore: readOnlyStore([original]),
      generatedAt: "2026-05-08T12:00:00.000Z",
      materializerVersion: "0.0.0-test",
    });

    const contentReport = await validateWikiMaterializerStaleness({
      ...scope,
      outputDir,
      logStore: readOnlyStore([recordFixture({ id: "mem-1", content: "Updated wiki body" })]),
    });
    const sourceReport = await validateWikiMaterializerStaleness({
      ...scope,
      outputDir,
      logStore: readOnlyStore([recordFixture({ id: "mem-1", source: { type: "document", uri: "file:///docs/renamed.md", title: "Renamed" } })]),
    });

    expect(contentReport.status).toBe("stale");
    expect(contentReport.changes).toMatchObject([{ reason: "record_hash_changed", recordId: "mem-1" }]);
    expect(sourceReport.status).toBe("stale");
    expect(sourceReport.changes).toMatchObject([{ reason: "record_hash_changed", recordId: "mem-1" }]);
  });

  it("reports stale when default filtering adds or removes included records", async () => {
    const outputDir = await createTempDirectory();
    const original = recordFixture({ id: "mem-1" });

    await runWikiMaterialization({
      ...scope,
      outputDir,
      logStore: readOnlyStore([original]),
      generatedAt: "2026-05-08T12:00:00.000Z",
      materializerVersion: "0.0.0-test",
    });

    const addedReport = await validateWikiMaterializerStaleness({
      ...scope,
      outputDir,
      logStore: readOnlyStore([original, recordFixture({ id: "mem-2", createdAt: "2026-05-08T13:00:00.000Z" })]),
    });
    const removedReport = await validateWikiMaterializerStaleness({
      ...scope,
      outputDir,
      logStore: readOnlyStore([recordFixture({ id: "mem-1", verificationStatus: "hypothesis" })]),
    });

    expect(addedReport.status).toBe("stale");
    expect(addedReport.changes).toMatchObject([{ reason: "record_added", recordId: "mem-2" }]);
    expect(removedReport.status).toBe("stale");
    expect(removedReport.changes).toMatchObject([{ reason: "record_removed", recordId: "mem-1" }]);
  });
});

async function createTempDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "wiki-materializer-staleness-"));
  tempDirectories.push(directoryPath);
  return directoryPath;
}

function readOnlyStore(records: readonly MemoryRecord[]) {
  return {
    readAll: vi.fn(async () => records),
  };
}

function recordFixture(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id">): MemoryRecord {
  return {
    id: overrides.id,
    kind: "doc",
    scope: "project",
    verificationStatus: "verified",
    reviewDecisions: [],
    verificationEvidence: [],
    projectId: scope.projectId,
    containerId: scope.containerId,
    source: { type: "document", uri: "file:///docs/wiki.md", title: "Wiki" },
    content: "Wiki body",
    tags: ["wiki"],
    importance: 0.5,
    createdAt: "2026-05-08T01:00:00.000Z",
    ...overrides,
  };
}
