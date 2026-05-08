import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { paths } from "../src/config/paths.js";
import { defaultWikiMaterializerFilters, type WikiGeneratedPage, type WikiMaterializerManifest } from "../src/features/memory/wiki-materializer/contracts.js";
import { writeWikiMaterialization } from "../src/features/memory/wiki-materializer/writer.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directoryPath) => {
      await rm(directoryPath, { recursive: true, force: true });
    }),
  );
});

async function createTempDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "wiki-materializer-writer-"));
  tempDirectories.push(directoryPath);
  return directoryPath;
}

describe("wiki materializer writer", () => {
  it("writes into a sibling staging directory and replaces stale files with the generated tree", async () => {
    const rootDirectory = await createTempDirectory();
    const outputDir = path.join(rootDirectory, "nested", "wiki", "project-alpha", "container-main");

    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "obsolete.md"), "stale file", "utf8");
    await mkdir(path.join(outputDir, "records"), { recursive: true });
    await writeFile(path.join(outputDir, "records", "stale.md"), "stale record", "utf8");

    const result = await writeWikiMaterialization({
      layoutOptions: {
        projectSlug: "project-alpha",
        containerSlug: "container-main",
        outputDir,
      },
      manifest: createManifest(),
      pages: [
        createSourcePage(),
        createRecordPage(),
        createLogPage(),
        createIndexPage(),
      ],
    });

    expect(result.layout.scopeDirectory).toBe(path.resolve(outputDir));
    expect(result.writtenPagePaths).toEqual([
      "index.md",
      "log.md",
      "records/mem-doc-001.md",
      "sources/guide-0123456789ab.md",
    ]);
    expect(await readFile(path.join(outputDir, "index.md"), "utf8")).toContain("# Memory wiki projection index");
    expect(await readFile(path.join(outputDir, "log.md"), "utf8")).toContain("# Memory wiki materialization log");
    expect(await readFile(path.join(outputDir, "manifest.json"), "utf8")).toContain('"schemaVersion": 1');
    expect(await readFile(path.join(outputDir, "records", "mem-doc-001.md"), "utf8")).toContain("# Memory record: mem-doc-001");
    expect(await readFile(path.join(outputDir, "sources", "guide-0123456789ab.md"), "utf8")).toContain("# Source: Guide");
    await expect(readFile(path.join(outputDir, "obsolete.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(outputDir, "records", "stale.md"), "utf8")).rejects.toThrow();
  });

  it("keeps the previous final directory unchanged when validation fails before replacement", async () => {
    const rootDirectory = await createTempDirectory();
    const outputDir = path.join(rootDirectory, "wiki", "project-alpha", "container-main");

    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "keep.txt"), "keep-me", "utf8");

    await expect(writeWikiMaterialization({
      layoutOptions: {
        projectSlug: "project-alpha",
        containerSlug: "container-main",
        outputDir,
      },
      manifest: createManifest(),
      pages: [createIndexPage()],
    })).rejects.toThrow(/Expected file to exist: .*log\.md/);

    expect(await readFile(path.join(outputDir, "keep.txt"), "utf8")).toBe("keep-me");
  });

  it("refuses output directories that overlap canonical memory storage", async () => {
    await expect(writeWikiMaterialization({
      layoutOptions: {
        projectSlug: "project-alpha",
        containerSlug: "container-main",
        outputDir: path.join(paths.dataDirectory, "wiki-output"),
      },
      manifest: createManifest(),
      pages: [createIndexPage(), createLogPage()],
    })).rejects.toThrow("Unsafe wiki output directory");
  });
});

function createManifest(): WikiMaterializerManifest {
  return {
    schemaVersion: 1,
    materializerVersion: "0.0.0-test",
    projectId: "project-alpha",
    containerId: "container-main",
    generatedAt: "2026-05-08T10:00:00.000Z",
    filters: defaultWikiMaterializerFilters,
    records: [],
    includedCount: 1,
    excludedCount: 0,
  };
}

function createIndexPage(): WikiGeneratedPage {
  return {
    kind: "index",
    relativePath: "index.md",
    title: "Memory wiki projection index",
    content: "# Memory wiki projection index\n",
    sourceRecordIds: ["mem-doc-001"],
  };
}

function createLogPage(): WikiGeneratedPage {
  return {
    kind: "log",
    relativePath: "log.md",
    title: "Memory wiki materialization log",
    content: "# Memory wiki materialization log\n",
    sourceRecordIds: ["mem-doc-001"],
  };
}

function createRecordPage(): WikiGeneratedPage {
  return {
    kind: "record",
    relativePath: "records/mem-doc-001.md",
    title: "Memory record: mem-doc-001",
    content: "# Memory record: mem-doc-001\n",
    sourceRecordIds: ["mem-doc-001"],
  };
}

function createSourcePage(): WikiGeneratedPage {
  return {
    kind: "source",
    relativePath: "sources/guide-0123456789ab.md",
    title: "Source: Guide",
    content: "# Source: Guide\n",
    sourceRecordIds: ["mem-doc-001"],
  };
}
