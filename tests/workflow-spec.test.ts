import { describe, expect, it } from "vitest";

import { normalizeWorkflowSpec } from "../src/features/orchestration/workflow-spec.js";
import type { WorkflowSpecInput } from "../src/features/orchestration/workflow-spec.js";

const baseCursorJob = {
  kind: "cursor" as const,
  input: {
    prompt: "Do something.",
    model: "composer-2" as const,
  },
};

const baseGeminiJob = {
  kind: "gemini" as const,
  input: {
    prompt: "Summarize this.",
    model: "gemini-3-flash-preview" as const,
  },
};

describe("normalizeWorkflowSpec - defaultTrust", () => {
  it("cursor job with explicit trust: true keeps true when defaultTrust: false", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      defaultTrust: false,
      jobs: [{ ...baseCursorJob, input: { ...baseCursorJob.input, trust: true } }],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "parallel") throw new Error("expected parallel");
    const job = result.jobs[0];
    if (!job || job.kind !== "cursor") throw new Error("expected cursor job");
    expect(job.input.trust).toBe(true);
  });

  it("cursor job with explicit trust: false keeps false when defaultTrust: true", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      defaultTrust: true,
      jobs: [{ ...baseCursorJob, input: { ...baseCursorJob.input, trust: false } }],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "parallel") throw new Error("expected parallel");
    const job = result.jobs[0];
    if (!job || job.kind !== "cursor") throw new Error("expected cursor job");
    expect(job.input.trust).toBe(false);
  });

  it("cursor job with no trust gets defaultTrust when set", () => {
    const spec: WorkflowSpecInput = {
      mode: "sequential",
      defaultTrust: true,
      steps: [baseCursorJob],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "sequential") throw new Error("expected sequential");
    const step = result.steps[0];
    if (typeof step === "function" || !step || step.kind !== "cursor") throw new Error("expected cursor step");
    expect(step.input.trust).toBe(true);
  });

  it("cursor job with no trust and no defaultTrust has trust: undefined", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      jobs: [baseCursorJob],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "parallel") throw new Error("expected parallel");
    const job = result.jobs[0];
    if (!job || job.kind !== "cursor") throw new Error("expected cursor job");
    expect(job.input.trust).toBeUndefined();
  });

  it("defaultTrust does not affect gemini jobs", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      defaultTrust: true,
      jobs: [baseGeminiJob],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "parallel") throw new Error("expected parallel");
    const job = result.jobs[0];
    if (!job || job.kind !== "gemini") throw new Error("expected gemini job");
    expect("trust" in job.input).toBe(false);
  });
});

describe("normalizeWorkflowSpec - workerRuntime", () => {
  it("passes workerRuntime through on gemini and cursor jobs", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      jobs: [
        { ...baseGeminiJob, workerRuntime: "mcp" },
        { ...baseCursorJob, workerRuntime: "shell" },
      ],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "parallel") throw new Error("expected parallel");
    expect(result.jobs[0]?.kind === "gemini" && result.jobs[0].workerRuntime).toBe("mcp");
    expect(result.jobs[1]?.kind === "cursor" && result.jobs[1].workerRuntime).toBe("shell");
  });

  it("omits workerRuntime when not set in the workflow job", () => {
    const spec: WorkflowSpecInput = {
      mode: "sequential",
      steps: [baseGeminiJob],
    };

    const result = normalizeWorkflowSpec(spec, undefined);

    if (result.mode !== "sequential") throw new Error("expected sequential");
    const step = result.steps[0];
    if (typeof step === "function" || !step || step.kind !== "gemini") throw new Error("expected gemini step");
    expect("workerRuntime" in step).toBe(false);
  });

  it("preserves requested worker runtimes when normalized for the mcp control plane", () => {
    const spec: WorkflowSpecInput = {
      mode: "parallel",
      jobs: [
        { ...baseGeminiJob },
        { ...baseCursorJob, workerRuntime: "shell" },
      ],
    };

    const result = normalizeWorkflowSpec(spec, undefined, "mcp");

    if (result.mode !== "parallel") throw new Error("expected parallel");
    expect("workerRuntime" in (result.jobs[0] ?? {})).toBe(false);
    expect(result.jobs[1]?.kind === "cursor" && result.jobs[1].workerRuntime).toBe("shell");
  });
});
