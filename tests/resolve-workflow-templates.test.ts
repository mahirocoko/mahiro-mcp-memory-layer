import { describe, expect, it } from "vitest";

import { interpolateWorkerJob } from "../src/features/orchestration/resolve-workflow-templates.js";
import type { SequentialWorkerContext, WorkerJobResult } from "../src/features/orchestration/types.js";

function createContext(lastResponse = "Gemini summary"): SequentialWorkerContext {
  const lastResult: WorkerJobResult = {
    kind: "gemini",
    input: {
      taskId: "gemini-1",
      prompt: "Summarize this repo.",
      model: "gemini-3-flash-preview",
    },
    result: {
      taskId: "gemini-1",
      status: "completed",
      requestedModel: "gemini-3-flash-preview",
      response: lastResponse,
      durationMs: 1,
      startedAt: "2026-04-05T00:00:00.000Z",
      finishedAt: "2026-04-05T00:00:00.001Z",
    },
  };

  return {
    results: [lastResult],
    lastResult,
    stepIndex: 1,
  };
}

describe("interpolateWorkerJob", () => {
  it("supports default helper for missing paths", () => {
    const job = interpolateWorkerJob(
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Plan from summary: {{default(results.9.result.response, 'missing summary')}}",
          model: "composer-2",
        },
      },
      createContext(),
    );

    expect(job.input.prompt).toBe("Plan from summary: missing summary");
  });

  it("supports json helper and nested helpers", () => {
    const job = interpolateWorkerJob(
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Payload: {{json(default(last.result.raw, default(last.result.response, 'fallback'))) }}",
          model: "composer-2",
        },
      },
      createContext(),
    );

    expect(job.input.prompt).toBe('Payload: "Gemini summary"');
  });

  it("fails for unknown helpers", () => {
    expect(() =>
      interpolateWorkerJob(
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Plan from summary: {{mystery(last.result.response)}}",
            model: "composer-2",
          },
        },
        createContext(),
      ),
    ).toThrowError("Unknown template helper 'mystery'.");
  });
});
