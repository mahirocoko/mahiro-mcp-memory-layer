import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { hashWikiMaterializerRecord } from "../src/features/memory/wiki-materializer/utils.js";
import { runWikiMaterializerCli, parseWikiMaterializerCliArgs, formatWikiMaterializerCliOutput } from "../src/features/memory/wiki-materializer/cli.js";
import type { MemoryRecord } from "../src/features/memory/types.js";

describe("wiki materializer cli", () => {
  it("parses the required scope arguments and optional flags", () => {
    expect(parseWikiMaterializerCliArgs([
      "--project-id", "project-alpha",
      "--container-id", "container-main",
      "--output-dir", "/tmp/wiki",
      "--include-hypotheses",
    ])).toEqual({
      projectId: "project-alpha",
      containerId: "container-main",
      outputDir: "/tmp/wiki",
      includeHypotheses: true,
      validateStaleness: false,
      manifestPath: undefined,
    });
  });

  it("parses staleness validation mode without implying materialization", () => {
    expect(parseWikiMaterializerCliArgs([
      "--project-id", "project-alpha",
      "--container-id", "container-main",
      "--validate-staleness",
      "--manifest-path", "/tmp/wiki/manifest.json",
    ])).toEqual({
      projectId: "project-alpha",
      containerId: "container-main",
      outputDir: undefined,
      includeHypotheses: false,
      validateStaleness: true,
      manifestPath: "/tmp/wiki/manifest.json",
    });
  });

  it("prints the materialization paths and counts on success", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "wiki-materializer-"));
    const captured = captureWrites();
    const record = createRecord({ id: "mem-1" });
    const result = await runWikiMaterializerCli([
      "--project-id", "project-alpha",
      "--container-id", "container-main",
      "--output-dir", outputDir,
    ], {
      logStore: { readAll: vi.fn(async () => [record]) },
      stdout: captured.stdout,
      stderr: captured.stderr,
      materializerVersion: "0.0.0-test",
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stderrText).toBe("");
    expect(captured.stdoutText).toContain(`Wiki materialization scope: ${path.resolve(outputDir)}`);
    expect(captured.stdoutText).toContain("Manifest path:");
    expect(captured.stdoutText).toContain("Included records: 1");
    expect(captured.stdoutText).toContain("Excluded records: 0");
    expect(captured.stdoutText).toContain("verified records only");
  });

  it("fails with a clear stderr message when the container id is missing", async () => {
    const captured = captureWrites();
    const result = await runWikiMaterializerCli([
      "--project-id", "project-alpha",
    ], {
      logStore: { readAll: vi.fn(async () => []) },
      stdout: captured.stdout,
      stderr: captured.stderr,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stderrText).toContain("--container-id is required.");
  });

  it("fails with a clear stderr message when the project id is missing", async () => {
    const captured = captureWrites();
    const result = await runWikiMaterializerCli([
      "--container-id", "container-main",
    ], {
      logStore: { readAll: vi.fn(async () => []) },
      stdout: captured.stdout,
      stderr: captured.stderr,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stderrText).toContain("--project-id is required.");
  });

  it("fails for unsafe output paths", async () => {
    const captured = captureWrites();
    const unsafeOutputDir = path.join(process.cwd(), "data", "log", "wiki-output");
    await mkdir(path.dirname(unsafeOutputDir), { recursive: true });
    const result = await runWikiMaterializerCli([
      "--project-id", "project-alpha",
      "--container-id", "container-main",
      "--output-dir", unsafeOutputDir,
    ], {
      logStore: { readAll: vi.fn(async () => [createRecord({ id: "mem-1" })]) },
      stdout: captured.stdout,
      stderr: captured.stderr,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stderrText).toContain("Unsafe wiki output directory");
  });

  it("formats the final status output deterministically", () => {
    expect(formatWikiMaterializerCliOutput({
      scopeDirectory: "/tmp/wiki",
      manifestPath: "/tmp/wiki/manifest.json",
      includedCount: 2,
      excludedCount: 1,
      verificationHints: ["verified records only", "excluded review statuses: pending"],
    })).toBe([
      "Wiki materialization scope: /tmp/wiki",
      "Manifest path: /tmp/wiki/manifest.json",
      "Included records: 2",
      "Excluded records: 1",
      "Verification hints:",
      "- verified records only",
      "- excluded review statuses: pending",
    ].join("\n"));
  });

  it("prints staleness validation status without invoking materialization", async () => {
    const captured = captureWrites();
    const runWikiMaterialization = vi.fn();
    const validateWikiMaterializerStaleness = vi.fn(async () => ({
      status: "stale" as const,
      manifestPath: "/tmp/wiki/manifest.json",
      projectId: "project-alpha",
      containerId: "container-main",
      changes: [{ reason: "record_added" as const, recordId: "mem-2" }],
    }));

    const result = await runWikiMaterializerCli([
      "--project-id", "project-alpha",
      "--container-id", "container-main",
      "--validate-staleness",
      "--manifest-path", "/tmp/wiki/manifest.json",
    ], {
      runWikiMaterialization,
      validateWikiMaterializerStaleness,
      stdout: captured.stdout,
      stderr: captured.stderr,
    });

    expect(result.exitCode).toBe(2);
    expect(runWikiMaterialization).not.toHaveBeenCalled();
    expect(captured.stdoutText).toContain("Wiki materialization staleness: stale");
    expect(captured.stdoutText).toContain("- record_added: mem-2");
  });
});

function captureWrites() {
  let stdoutText = "";
  let stderrText = "";

  return {
    stdout: { write: vi.fn((chunk: string) => { stdoutText += chunk; }) },
    stderr: { write: vi.fn((chunk: string) => { stderrText += chunk; }) },
    get stdoutText() {
      return stdoutText;
    },
    get stderrText() {
      return stderrText;
    },
  };
}

function createRecord(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id">): MemoryRecord {
  const record: MemoryRecord = {
    id: overrides.id,
    kind: "doc",
    scope: "project",
    verificationStatus: "verified",
    reviewDecisions: [],
    verificationEvidence: [],
    projectId: "project-alpha",
    containerId: "container-main",
    source: { type: "document", uri: "file:///docs/wiki.md", title: "Wiki" },
    content: "Wiki body",
    tags: ["wiki"],
    importance: 0.5,
    createdAt: "2026-05-08T01:00:00.000Z",
  };

  const selected = { ...record, ...overrides };
  return {
    ...selected,
    recordHash: hashWikiMaterializerRecord(selected),
  } as MemoryRecord;
}
