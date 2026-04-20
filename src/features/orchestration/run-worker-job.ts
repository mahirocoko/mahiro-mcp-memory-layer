import type { CursorCommandRunResult, CursorWorkerInput, CursorWorkerRunResult, CursorWorkerRuntime } from "../cursor/types.js";
import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerRunResult, GeminiWorkerRuntime } from "../gemini/types.js";
import type { WorkflowJob } from "./workflow-spec.js";

export type WorkerJobResult =
  | {
      readonly kind: WorkflowJob["kind"];
      readonly input: GeminiWorkerInput | CursorWorkerInput;
      readonly retryCount: number;
      readonly result: GeminiWorkerRunResult | CursorWorkerRunResult;
    }
  | {
      readonly kind: WorkflowJob["kind"];
      readonly input: GeminiWorkerInput | CursorWorkerInput;
      readonly retryCount: number;
      readonly status: "runner_failed";
      readonly error: string;
    };

export interface RunWorkerJobOptions {
  readonly sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidModel(model: string): boolean {
  return model.trim().length > 0;
}

function parseGeminiResult(input: GeminiWorkerInput, output: GeminiCommandRunResult): GeminiWorkerRunResult {
  if (output.timedOut) {
    return {
      status: "timeout",
      requestedModel: input.model,
      durationMs: output.durationMs,
      startedAt: output.startedAt,
      finishedAt: output.finishedAt,
      error: output.stderr || "Gemini command timed out.",
    };
  }

  if ((output.exitCode ?? 1) !== 0) {
    return {
      status: "failed",
      requestedModel: input.model,
      durationMs: output.durationMs,
      startedAt: output.startedAt,
      finishedAt: output.finishedAt,
      error: output.stderr || output.stdout || `Gemini command exited with code ${output.exitCode ?? "unknown"}.`,
    };
  }

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(output.stdout) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }

  const stats = parsed?.stats;
  const reportedModel = typeof stats === "object" && stats !== null && typeof (stats as Record<string, unknown>).model === "string"
    ? String((stats as Record<string, unknown>).model)
    : undefined;
  const response = typeof parsed?.response === "string" ? parsed.response : output.stdout.trim();

  if (parsed?.approvalRequired === true) {
    return {
      status: "approval_required",
      requestedModel: input.model,
      reportedModel,
      response,
      ...(typeof parsed?.approvalPrompt === "string" ? { approvalPrompt: parsed.approvalPrompt } : {}),
      ...(typeof parsed?.subagentId === "string" ? { subagentId: parsed.subagentId } : {}),
      ...(typeof parsed?.sessionName === "string" ? { sessionName: parsed.sessionName } : {}),
      ...(typeof parsed?.paneId === "string" ? { paneId: parsed.paneId } : {}),
      durationMs: output.durationMs,
      startedAt: output.startedAt,
      finishedAt: output.finishedAt,
    };
  }

  return {
    status: "completed",
    requestedModel: input.model,
    reportedModel,
    response,
    ...(typeof parsed?.subagentId === "string" ? { subagentId: parsed.subagentId } : {}),
    ...(typeof parsed?.sessionName === "string" ? { sessionName: parsed.sessionName } : {}),
    ...(typeof parsed?.paneId === "string" ? { paneId: parsed.paneId } : {}),
    durationMs: output.durationMs,
    startedAt: output.startedAt,
    finishedAt: output.finishedAt,
  };
}

function parseCursorResult(input: CursorWorkerInput, output: CursorCommandRunResult): CursorWorkerRunResult {
  if (output.timedOut) {
    return {
      status: "timeout",
      requestedModel: input.model,
      durationMs: output.durationMs,
      startedAt: output.startedAt,
      finishedAt: output.finishedAt,
      error: output.stderr || "Cursor command timed out.",
    };
  }

  if ((output.exitCode ?? 1) !== 0) {
    return {
      status: "failed",
      requestedModel: input.model,
      durationMs: output.durationMs,
      startedAt: output.startedAt,
      finishedAt: output.finishedAt,
      error: output.stderr || output.stdout || `Cursor command exited with code ${output.exitCode ?? "unknown"}.`,
    };
  }

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(output.stdout) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }

  return {
    status: "completed",
    requestedModel: input.model,
    reportedModel: typeof parsed?.model === "string" ? parsed.model : undefined,
    result: typeof parsed?.result === "string" ? parsed.result : output.stdout.trim(),
    ...(typeof parsed?.subagentId === "string" ? { subagentId: parsed.subagentId } : {}),
    ...(typeof parsed?.sessionName === "string" ? { sessionName: parsed.sessionName } : {}),
    ...(typeof parsed?.paneId === "string" ? { paneId: parsed.paneId } : {}),
    durationMs: output.durationMs,
    startedAt: output.startedAt,
    finishedAt: output.finishedAt,
  };
}

function getRetryDelay(job: WorkflowJob, retryCount: number): number {
  const base = job.retryDelayMs ?? 1000;
  return base * Math.max(1, retryCount);
}

export async function runWorkerJob(job: WorkflowJob, options: RunWorkerJobOptions = {}): Promise<WorkerJobResult> {
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = job.retries ?? 0;

  if (!isValidModel(job.input.model)) {
    return {
      kind: job.kind,
      input: job.input,
      retryCount: 0,
      result: {
        status: "invalid_input",
        requestedModel: job.input.model,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: "Worker model is required.",
      },
    };
  }

  let retryCount = 0;
  while (true) {
    try {
      if (job.kind === "gemini") {
        const runtime: GeminiWorkerRuntime | undefined = job.dependencies?.runtime;
        if (!runtime) {
          throw new Error("Missing Gemini runtime dependency.");
        }
        const result = parseGeminiResult(job.input, await runtime.run(job.input));
        if (result.status === "completed" || result.status === "approval_required" || retryCount >= maxRetries) {
          return { kind: job.kind, input: job.input, retryCount, result };
        }
      } else {
        const runtime: CursorWorkerRuntime | undefined = job.dependencies?.runtime;
        if (!runtime) {
          throw new Error("Missing Cursor runtime dependency.");
        }
        const result = parseCursorResult(job.input, await runtime.run(job.input));
        if (result.status === "completed" || retryCount >= maxRetries) {
          return { kind: job.kind, input: job.input, retryCount, result };
        }
      }
    } catch (error) {
      if (retryCount >= maxRetries) {
        return {
          kind: job.kind,
          input: job.input,
          retryCount,
          status: "runner_failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    retryCount += 1;
    await sleep(getRetryDelay(job, retryCount));
  }
}
