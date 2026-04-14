import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { OrchestrationSupervisionStore } from "../src/features/orchestration/observability/orchestration-supervision-store.js";

const VALID_SUPERVISOR_REQUEST_ID = "supervisor_0123456789abcdef0123456789abcdef";
const VALID_WORKFLOW_REQUEST_ID = "workflow_0123456789abcdef0123456789abcdef";

describe("OrchestrationSupervisionStore", () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("writes and reads a supervision record confined to the store directory", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-supervision-"));
    const store = new OrchestrationSupervisionStore(workDir);

    await store.writeRunning({
      requestId: VALID_SUPERVISOR_REQUEST_ID,
      targetRequestId: VALID_WORKFLOW_REQUEST_ID,
      source: "mcp",
      pollIntervalMs: 1000,
      pollCount: 1,
      lastObservedWorkflowStatus: "running",
    });

    const readBack = await store.read(VALID_SUPERVISOR_REQUEST_ID);
    expect(readBack).toMatchObject({
      requestId: VALID_SUPERVISOR_REQUEST_ID,
      targetRequestId: VALID_WORKFLOW_REQUEST_ID,
      status: "running",
      pollIntervalMs: 1000,
      pollCount: 1,
      lastObservedWorkflowStatus: "running",
    });

    const onDisk = path.join(workDir, `${VALID_SUPERVISOR_REQUEST_ID}.json`);
    await expect(readFile(onDisk, "utf8")).resolves.toContain(VALID_SUPERVISOR_REQUEST_ID);
  });

  it("read returns null for ids outside the supervisor_* shape", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-supervision-"));
    const store = new OrchestrationSupervisionStore(workDir);

    await expect(store.read("../etc/passwd")).resolves.toBeNull();
    await expect(store.read("supervisor_short")).resolves.toBeNull();
  });

  it("rejects writes for ids outside the supervisor_* shape", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-supervision-"));
    const store = new OrchestrationSupervisionStore(workDir);

    await expect(
      store.writeRunning({
        requestId: "evil/../x",
        targetRequestId: VALID_WORKFLOW_REQUEST_ID,
        source: "mcp",
        pollIntervalMs: 1000,
        pollCount: 0,
      }),
    ).rejects.toThrow("Invalid orchestration supervision requestId");
  });
});
