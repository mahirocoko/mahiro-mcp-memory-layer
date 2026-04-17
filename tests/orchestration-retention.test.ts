import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  pruneExpiredOrchestrationResultRecords,
  pruneExpiredOrchestrationSupervisionRecords,
  pruneExpiredOrchestrationTraceEntries,
} from "../src/features/orchestration/observability/orchestration-retention.js";

describe("orchestration retention", () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("prunes expired orchestration result records by updatedAt timestamp", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-retention-results-"));

    await writeFile(
      path.join(workDir, "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"),
      JSON.stringify({ updatedAt: "2026-04-01T00:00:00.000Z" }),
      "utf8",
    );
    await writeFile(
      path.join(workDir, "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json"),
      JSON.stringify({ updatedAt: "2026-04-20T00:00:00.000Z" }),
      "utf8",
    );

    await pruneExpiredOrchestrationResultRecords({
      directoryPath: workDir,
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      now: () => new Date("2026-04-21T00:00:00.000Z"),
    });

    await expect(readFile(path.join(workDir, "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(workDir, "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json"), "utf8")).resolves.toContain("2026-04-20");
  });

  it("prunes expired orchestration supervision records by updatedAt timestamp", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-retention-supervision-"));

    await writeFile(
      path.join(workDir, "supervisor_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"),
      JSON.stringify({ updatedAt: "2026-04-01T00:00:00.000Z" }),
      "utf8",
    );
    await writeFile(
      path.join(workDir, "supervisor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json"),
      JSON.stringify({ updatedAt: "2026-04-20T00:00:00.000Z" }),
      "utf8",
    );

    await pruneExpiredOrchestrationSupervisionRecords({
      directoryPath: workDir,
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      now: () => new Date("2026-04-21T00:00:00.000Z"),
    });

    await expect(readFile(path.join(workDir, "supervisor_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(workDir, "supervisor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json"), "utf8")).resolves.toContain("2026-04-20");
  });

  it("prunes expired orchestration trace lines by createdAt/updatedAt/start timestamp", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-retention-trace-"));
    const traceFilePath = path.join(workDir, "orchestration-trace.jsonl");

    await writeFile(
      traceFilePath,
      [
        JSON.stringify({ requestId: "old", createdAt: "2026-04-01T00:00:00.000Z" }),
        JSON.stringify({ requestId: "new", createdAt: "2026-04-20T00:00:00.000Z" }),
      ].join("\n") + "\n",
      "utf8",
    );

    await pruneExpiredOrchestrationTraceEntries({
      filePath: traceFilePath,
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      now: () => new Date("2026-04-21T00:00:00.000Z"),
    });

    await expect(readFile(traceFilePath, "utf8")).resolves.toBe('{"requestId":"new","createdAt":"2026-04-20T00:00:00.000Z"}\n');
  });
});
