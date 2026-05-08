import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runWikiMaterializerCli } from "../src/features/memory/wiki-materializer/cli.js";
import type { WikiMaterializerManifest } from "../src/features/memory/wiki-materializer/contracts.js";
import { validateWikiMaterializerStaleness } from "../src/features/memory/wiki-materializer/staleness.js";
import { JsonlLogStore } from "../src/features/memory/log/jsonl-log-store.js";
import type { MemoryRecord } from "../src/features/memory/types.js";
import {
  wikiE2eCanonicalRecords,
  wikiE2eRecord,
  wikiE2eScope,
} from "./fixtures/wiki-materializer-e2e-fixtures.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(async (directoryPath) => {
    await rm(directoryPath, { recursive: true, force: true });
  }));
});

describe("wiki materializer e2e", () => {
  it("materializes an empty scope into a valid empty wiki without mutating canonical JSONL", async () => {
    const workspace = await createTempDirectory();
    const canonicalLogPath = path.join(workspace, "canonical", "memory.jsonl");
    const outputDir = path.join(workspace, "wiki", "empty-scope");
    const logStore = new JsonlLogStore(canonicalLogPath);
    const beforeCanonical = await readFileOrEmpty(canonicalLogPath);

    const result = await runWikiMaterializerCli([
      "--project-id", wikiE2eScope.projectId,
      "--container-id", wikiE2eScope.containerId,
      "--output-dir", outputDir,
    ], {
      logStore,
      materializerVersion: "0.0.0-test",
      stdout: sinkWriter(),
      stderr: sinkWriter(),
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(path.join(outputDir, "index.md"), "utf8")).toContain("- included records: 0");
    expect(await readFile(path.join(outputDir, "log.md"), "utf8")).toContain("## Included record IDs\n- (none)");
    expect(await readdir(path.join(outputDir, "records"))).toEqual([]);
    expect(await readdir(path.join(outputDir, "sources"))).toEqual([]);
    expect(await readManifest(outputDir)).toMatchObject({
      projectId: wikiE2eScope.projectId,
      containerId: wikiE2eScope.containerId,
      includedCount: 0,
      excludedCount: 0,
      records: [],
    });
    expect(await readFileOrEmpty(canonicalLogPath)).toBe(beforeCanonical);
  });

  it("runs through canonical JSONL, generated files, manifest freshness, cleanup, determinism, filters, and no mutation", async () => {
    const workspace = await createTempDirectory();
    const canonicalLogPath = path.join(workspace, "canonical", "memory.jsonl");
    const outputDir = path.join(workspace, "wiki", "project-alpha", "container-main");
    const logStore = new JsonlLogStore(canonicalLogPath);
    const records = wikiE2eCanonicalRecords();

    await seedCanonicalLog(logStore, records);
    const canonicalBefore = await readFile(canonicalLogPath, "utf8");

    await mkdir(path.join(outputDir, "records"), { recursive: true });
    await writeFile(path.join(outputDir, "obsolete.md"), "stale root", "utf8");
    await writeFile(path.join(outputDir, "records", "stale.md"), "stale record", "utf8");

    const firstRun = await runWikiMaterializerCli([
      "--project-id", wikiE2eScope.projectId,
      "--container-id", wikiE2eScope.containerId,
      "--output-dir", outputDir,
    ], {
      logStore,
      materializerVersion: "0.0.0-test",
      stdout: sinkWriter(),
      stderr: sinkWriter(),
    });
    const firstSnapshot = await readGeneratedWikiSnapshot(outputDir);
    const firstManifest = await readManifest(outputDir);
    const firstFreshness = await validateWikiMaterializerStaleness({
      ...wikiE2eScope,
      outputDir,
      logStore,
    });

    const secondRun = await runWikiMaterializerCli([
      "--project-id", wikiE2eScope.projectId,
      "--container-id", wikiE2eScope.containerId,
      "--output-dir", outputDir,
    ], {
      logStore,
      materializerVersion: "0.0.0-test",
      stdout: sinkWriter(),
      stderr: sinkWriter(),
    });
    const secondSnapshot = await readGeneratedWikiSnapshot(outputDir);
    const canonicalAfter = await readFile(canonicalLogPath, "utf8");

    expect(firstRun.exitCode).toBe(0);
    expect(secondRun.exitCode).toBe(0);
    expect(canonicalAfter).toBe(canonicalBefore);
    expect(firstFreshness).toMatchObject({ status: "fresh", changes: [] });
    expect(firstManifest.includedCount).toBe(4);
    expect(firstManifest.excludedCount).toBe(6);
    expect(firstManifest.excludedByReason).toEqual({
      unverified: 1,
      pending_review: 1,
      deferred_review: 1,
      rejected_review: 1,
      scope_mismatch: 2,
    });
    expect(firstManifest.records.map((record) => record.id)).toEqual([
      "mem-doc-alpha",
      "mem-doc-beta",
      "mem-non-ascii-title",
      "mem-manual-missing-source",
    ]);

    await expect(readFile(path.join(outputDir, "obsolete.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(outputDir, "records", "stale.md"), "utf8")).rejects.toThrow();

    const generatedPaths = Object.keys(firstSnapshot).sort();
    expect(generatedPaths).toEqual([
      "index.md",
      "log.md",
      "manifest.json",
      "records/mem-doc-alpha.md",
      "records/mem-doc-beta.md",
      "records/mem-manual-missing-source.md",
      "records/mem-non-ascii-title.md",
      ...firstManifest.records.map((record) => `sources/${record.sourceSlug}.md`),
    ].sort());

    expect(Object.keys(firstSnapshot).some((relativePath) => relativePath.includes("cafe"))).toBe(true);
    expect(new Set(firstManifest.records.map((record) => record.sourceSlug)).size).toBe(4);
    expect(firstManifest.records.filter((record) => record.source.title === "Duplicate Title")).toHaveLength(2);
    expect(firstManifest.records.filter((record) => record.source.title === "Duplicate Title").map((record) => record.sourceSlug)).toHaveLength(2);

    const index = firstSnapshot["index.md"] ?? "";
    const log = firstSnapshot["log.md"] ?? "";
    const missingSourceRecord = firstSnapshot["records/mem-manual-missing-source.md"] ?? "";
    expect(index).toContain("mem-doc-alpha");
    expect(index).not.toContain("mem-hypothesis-excluded");
    expect(log).toContain("mem-doc-beta");
    expect(log).not.toContain("mem-other-project-excluded");
    expect(missingSourceRecord).toContain("- source URI: `(missing)`");
    expect(missingSourceRecord).toContain("- source title: `(missing)`");
    expect(firstSnapshot["records/mem-non-ascii-title.md"]).toContain("Café 東京/研究");

    expect(normalizeSnapshotForAllowedTimestamps(secondSnapshot)).toEqual(normalizeSnapshotForAllowedTimestamps(firstSnapshot));
  });

  it("keeps manifest source slugs aligned with emitted source pages for identical source records", async () => {
    const workspace = await createTempDirectory();
    const canonicalLogPath = path.join(workspace, "canonical", "memory.jsonl");
    const outputDir = path.join(workspace, "wiki", "identical-source");
    const logStore = new JsonlLogStore(canonicalLogPath);
    const sharedSource = { type: "document", uri: "file:///docs/shared.md", title: "Shared source" } as const;

    await seedCanonicalLog(logStore, [
      wikiE2eRecord({
        id: "mem-shared-a",
        source: sharedSource,
        createdAt: "2026-05-08T01:00:00.000Z",
      }),
      wikiE2eRecord({
        id: "mem-shared-b",
        source: sharedSource,
        createdAt: "2026-05-08T01:01:00.000Z",
      }),
    ]);

    const result = await runWikiMaterializerCli([
      "--project-id", wikiE2eScope.projectId,
      "--container-id", wikiE2eScope.containerId,
      "--output-dir", outputDir,
    ], {
      logStore,
      materializerVersion: "0.0.0-test",
      stdout: sinkWriter(),
      stderr: sinkWriter(),
    });
    const snapshot = await readGeneratedWikiSnapshot(outputDir);
    const manifest = await readManifest(outputDir);
    const sourceSlugs = manifest.records.map((record) => record.sourceSlug);
    const emittedSourcePaths = Object.keys(snapshot).filter((relativePath) => relativePath.startsWith("sources/"));

    expect(result.exitCode).toBe(0);
    expect(manifest.records.map((record) => record.id)).toEqual(["mem-shared-a", "mem-shared-b"]);
    expect(new Set(sourceSlugs).size).toBe(1);
    expect(emittedSourcePaths).toEqual([`sources/${sourceSlugs[0]}.md`]);
    expect(snapshot[`sources/${sourceSlugs[0]}.md`]).toContain("mem-shared-a");
    expect(snapshot[`sources/${sourceSlugs[0]}.md`]).toContain("mem-shared-b");
  });
});

async function createTempDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "wiki-materializer-e2e-"));
  tempDirectories.push(directoryPath);
  return directoryPath;
}

async function seedCanonicalLog(logStore: JsonlLogStore, records: readonly MemoryRecord[]): Promise<void> {
  for (const record of records) {
    await logStore.append(record);
  }
}

async function readManifest(outputDir: string): Promise<WikiMaterializerManifest> {
  return JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8")) as WikiMaterializerManifest;
}

async function readGeneratedWikiSnapshot(outputDir: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};

  await readSnapshotDirectory(outputDir, outputDir, snapshot);

  return snapshot;
}

async function readSnapshotDirectory(rootDir: string, currentDir: string, snapshot: Record<string, string>): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await readSnapshotDirectory(rootDir, absolutePath, snapshot);
      continue;
    }

    if (entry.isFile()) {
      snapshot[toPosixPath(path.relative(rootDir, absolutePath))] = await readFile(absolutePath, "utf8");
    }
  }
}

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function normalizeSnapshotForAllowedTimestamps(snapshot: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(snapshot).map(([relativePath, content]) => {
    if (relativePath === "manifest.json") {
      const manifest = JSON.parse(content) as WikiMaterializerManifest;
      return [relativePath, JSON.stringify({ ...manifest, generatedAt: "<generatedAt>" }, null, 2)];
    }

    return [relativePath, content.replaceAll(/- generated at: `[^`]+`/g, "- generated at: `<generatedAt>`")];
  }));
}

function sinkWriter(): { write(chunk: string): boolean } {
  return { write: () => true };
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
