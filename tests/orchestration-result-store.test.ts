import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { OrchestrationResultStore } from "../src/features/orchestration/observability/orchestration-result-store.js";
import type { OrchestrateWorkflowSpec } from "../src/features/orchestration/workflow-spec.js";

/** 32 hex chars after `workflow_`, matching {@link newId}("workflow"). */
const VALID_WORKFLOW_REQUEST_ID = "workflow_0123456789abcdef0123456789abcdef";

const minimalParallelSpec = {
  mode: "parallel" as const,
  jobs: [
    {
      kind: "gemini" as const,
      input: { prompt: "p", model: "gemini-3-flash-preview" },
    },
  ],
} satisfies OrchestrateWorkflowSpec;

describe("OrchestrationResultStore", () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("writes and reads a result file confined to the store directory", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-result-"));
    const store = new OrchestrationResultStore(workDir);

    await store.writeRunning({
      requestId: VALID_WORKFLOW_REQUEST_ID,
      source: "mcp",
      spec: minimalParallelSpec,
    });

    const readBack = await store.read(VALID_WORKFLOW_REQUEST_ID);
    expect(readBack?.requestId).toBe(VALID_WORKFLOW_REQUEST_ID);
    expect(readBack?.metadata.workerRuntimes).toBeUndefined();

    const onDisk = path.join(workDir, `${VALID_WORKFLOW_REQUEST_ID}.json`);
    await expect(readFile(onDisk, "utf8")).resolves.toContain(VALID_WORKFLOW_REQUEST_ID);
  });

  it("read returns null for ids outside the workflow_* shape (blocks path-like input)", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-result-"));
    const store = new OrchestrationResultStore(workDir);

    await expect(store.read("../etc/passwd")).resolves.toBeNull();
    await expect(store.read("workflow_short")).resolves.toBeNull();
    await expect(store.read("workflow_0123456789abcdef0123456789abcdeG")).resolves.toBeNull();
  });

  it("rejects writes for ids outside the workflow_* shape", async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "orch-result-"));
    const store = new OrchestrationResultStore(workDir);

    await expect(
      store.writeRunning({
        requestId: "evil/../x",
        source: "mcp",
        spec: minimalParallelSpec,
      }),
    ).rejects.toThrow("Invalid orchestration result requestId");
  });
});
