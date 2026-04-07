import { describe, expect, it } from "vitest";

import { parseOrchestrateCliArgs } from "../src/features/orchestration/orchestrate-cli.js";

describe("parseOrchestrateCliArgs", () => {
  it("fails when file is omitted", async () => {
    await expect(parseOrchestrateCliArgs([])).rejects.toThrowError("--file is required.");
  });

  it("fails for unknown flags", async () => {
    await expect(parseOrchestrateCliArgs(["--mystery", "value"])).rejects.toThrowError("Unknown flag: --mystery");
  });

  it("fails for unexpected positional arguments", async () => {
    await expect(parseOrchestrateCliArgs(["workflow.json"])).rejects.toThrowError("Unexpected argument: workflow.json");
  });

  it("parses parallel workflows from a file and applies default cwd", async () => {
    const spec = await parseOrchestrateCliArgs(
      ["--file", "workflow.json", "--cwd", "/tmp/project"],
      {
        readFileText: async () => JSON.stringify({
          mode: "parallel",
          maxConcurrency: 2,
          timeoutMs: 120000,
          jobs: [
            {
              kind: "gemini",
              input: {
                prompt: "Summarize this repo.",
                model: "gemini-3-flash-preview",
              },
              retries: 2,
              retryDelayMs: 500,
            },
            {
              kind: "cursor",
              input: {
                taskId: "cursor-custom",
                prompt: "Review this diff.",
                model: "composer-2",
              },
            },
          ],
        }),
      },
    );

    expect(spec.dryRun).toBe(false);
    expect(spec.spec.mode).toBe("parallel");
    expect(spec.spec.maxConcurrency).toBe(2);
    expect(spec.spec.timeoutMs).toBe(120000);
    expect(spec.spec.jobs).toHaveLength(2);
    expect(spec.spec.jobs[0]).toMatchObject({
      kind: "gemini",
      input: {
        prompt: "Summarize this repo.",
        model: "gemini-3-flash-preview",
        cwd: "/tmp/project",
      },
      retries: 2,
      retryDelayMs: 500,
    });
    expect(spec.spec.jobs[0]?.input.taskId).toMatch(/^gemini_/);
    expect(spec.spec.jobs[1]).toEqual({
      kind: "cursor",
      input: {
        taskId: "cursor-custom",
        prompt: "Review this diff.",
        model: "composer-2",
        cwd: "/tmp/project",
      },
    });
  });

  it("parses sequential workflows from stdin and preserves job-level cwd", async () => {
    const spec = await parseOrchestrateCliArgs(
      ["--file", "-", "--cwd", "/tmp/default"],
      {
        readStdinText: async () => JSON.stringify({
          mode: "sequential",
          timeoutMs: 30000,
          steps: [
            {
              kind: "gemini",
              input: {
                prompt: "Summarize this repo.",
                model: "gemini-3-flash-preview",
                cwd: "/tmp/custom",
              },
            },
          ],
        }),
      },
    );

    expect(spec).toEqual({
      dryRun: false,
      spec: {
        mode: "sequential",
        timeoutMs: 30000,
        steps: [
          {
            kind: "gemini",
            input: {
              taskId: expect.stringMatching(/^gemini_/),
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
              cwd: "/tmp/custom",
            },
          },
        ],
      },
    });
  });

  it("parses dry-run mode", async () => {
    const parsed = await parseOrchestrateCliArgs(
      ["--file", "workflow.json", "--dry-run"],
      {
        readFileText: async () => JSON.stringify({
          mode: "parallel",
          jobs: [
            {
              kind: "gemini",
              input: {
                prompt: "Summarize this repo.",
                model: "gemini-3-flash-preview",
              },
            },
          ],
        }),
      },
    );

    expect(parsed.dryRun).toBe(true);
    expect(parsed.spec.mode).toBe("parallel");
  });

  it("fails when the workflow json shape is invalid", async () => {
    await expect(
      parseOrchestrateCliArgs(
        ["--file", "workflow.json"],
        {
          readFileText: async () => JSON.stringify({ mode: "parallel", jobs: [] }),
        },
      ),
    ).rejects.toThrowError();
  });

  it("fails fast for invalid sequential template syntax", async () => {
    await expect(
      parseOrchestrateCliArgs(
        ["--file", "workflow.json"],
        {
          readFileText: async () => JSON.stringify({
            mode: "sequential",
            steps: [
              {
                kind: "cursor",
                input: {
                  prompt: "Broken helper: {{mystery(last.result.response)}}",
                  model: "composer-2",
                },
              },
            ],
          }),
        },
      ),
    ).rejects.toThrowError("Unknown template helper 'mystery'.");
  });

  it("fails when maxConcurrency is not a positive integer", async () => {
    await expect(
      parseOrchestrateCliArgs(
        ["--file", "workflow.json"],
        {
          readFileText: async () => JSON.stringify({ mode: "parallel", maxConcurrency: 0, jobs: [{ kind: "gemini", input: { prompt: "Summarize this repo.", model: "gemini-3-flash-preview" } }] }),
        },
      ),
    ).rejects.toThrowError();
  });

  it("fails when timeoutMs is not a positive integer", async () => {
    await expect(
      parseOrchestrateCliArgs(
        ["--file", "workflow.json"],
        {
          readFileText: async () => JSON.stringify({ mode: "parallel", timeoutMs: 0, jobs: [{ kind: "gemini", input: { prompt: "Summarize this repo.", model: "gemini-3-flash-preview" } }] }),
        },
      ),
    ).rejects.toThrowError();
  });
});
