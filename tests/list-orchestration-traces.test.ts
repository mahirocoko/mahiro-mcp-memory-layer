import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { listOrchestrationTraces } from "../src/features/orchestration/observability/list-orchestration-traces.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("listOrchestrationTraces", () => {
  it("returns newest matching traces first and applies filters", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "orchestration-traces-"));
    tempDirectories.push(directory);

    const filePath = path.join(directory, "orchestration-trace.jsonl");

    await writeFile(
      filePath,
      [
        JSON.stringify({
          requestId: "workflow-1",
          source: "cli",
          mode: "parallel",
          status: "completed",
          jobKinds: ["gemini"],
          taskIds: ["gemini-1"],
          totalJobs: 1,
          finishedJobs: 1,
          completedJobs: 1,
          failedJobs: 0,
          skippedJobs: 0,
          startedAt: "2026-04-05T00:00:00.000Z",
          finishedAt: "2026-04-05T00:00:01.000Z",
          durationMs: 1000,
          createdAt: "2026-04-05T00:00:01.000Z",
        }),
        JSON.stringify({
          requestId: "workflow-2",
          source: "mcp",
          mode: "sequential",
          status: "runner_failed",
          jobKinds: ["gemini", "cursor"],
          taskIds: ["gemini-2", "cursor-2"],
          totalJobs: 2,
          finishedJobs: 0,
          completedJobs: 0,
          failedJobs: 2,
          skippedJobs: 0,
          error: "Workflow runner crashed.",
          startedAt: "2026-04-05T00:00:02.000Z",
          finishedAt: "2026-04-05T00:00:03.000Z",
          durationMs: 1000,
          createdAt: "2026-04-05T00:00:03.000Z",
        }),
      ].join("\n"),
      "utf8",
    );

    const traces = await listOrchestrationTraces({
      payload: {
        source: "mcp",
        taskId: "cursor-2",
      },
      filePath,
    });

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      requestId: "workflow-2",
      source: "mcp",
      status: "runner_failed",
    });
  });

  it("filters traces by started-at date range", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "orchestration-traces-"));
    tempDirectories.push(directory);

    const filePath = path.join(directory, "orchestration-trace.jsonl");

    await writeFile(
      filePath,
      [
        JSON.stringify({
          requestId: "workflow-1",
          source: "cli",
          mode: "parallel",
          status: "completed",
          jobKinds: ["gemini"],
          taskIds: ["gemini-1"],
          totalJobs: 1,
          finishedJobs: 1,
          completedJobs: 1,
          failedJobs: 0,
          skippedJobs: 0,
          startedAt: "2026-04-04T23:59:59.000Z",
          finishedAt: "2026-04-05T00:00:00.000Z",
          durationMs: 1000,
          createdAt: "2026-04-05T00:00:00.000Z",
        }),
        JSON.stringify({
          requestId: "workflow-2",
          source: "mcp",
          mode: "parallel",
          status: "completed",
          jobKinds: ["cursor"],
          taskIds: ["cursor-1"],
          totalJobs: 1,
          finishedJobs: 1,
          completedJobs: 1,
          failedJobs: 0,
          skippedJobs: 0,
          startedAt: "2026-04-05T12:00:00.000Z",
          finishedAt: "2026-04-05T12:00:01.000Z",
          durationMs: 1000,
          createdAt: "2026-04-05T12:00:01.000Z",
        }),
      ].join("\n"),
      "utf8",
    );

    const traces = await listOrchestrationTraces({
      payload: {
        fromDate: "2026-04-05T00:00:00.000Z",
        toDate: "2026-04-05T23:59:59.999Z",
      },
      filePath,
    });

    expect(traces).toHaveLength(1);
    expect(traces[0]?.requestId).toBe("workflow-2");
  });

  it("treats date-only filters as whole-day bounds", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "orchestration-traces-"));
    tempDirectories.push(directory);

    const filePath = path.join(directory, "orchestration-trace.jsonl");

    await writeFile(
      filePath,
      JSON.stringify({
        requestId: "workflow-day",
        source: "mcp",
        mode: "parallel",
        status: "completed",
        jobKinds: ["cursor"],
        taskIds: ["cursor-day"],
        totalJobs: 1,
        finishedJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-05T12:00:00.000Z",
        finishedAt: "2026-04-05T12:00:01.000Z",
        durationMs: 1000,
        createdAt: "2026-04-05T12:00:01.000Z",
      }),
      "utf8",
    );

    const traces = await listOrchestrationTraces({
      payload: {
        fromDate: "2026-04-05",
        toDate: "2026-04-05",
      },
      filePath,
    });

    expect(traces).toHaveLength(1);
    expect(traces[0]?.requestId).toBe("workflow-day");
  });

  it("returns an empty list when the trace file does not exist", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "orchestration-traces-"));
    tempDirectories.push(directory);

    await expect(
      listOrchestrationTraces({
        payload: {},
        filePath: path.join(directory, "missing.jsonl"),
      }),
    ).resolves.toEqual([]);
  });
});
