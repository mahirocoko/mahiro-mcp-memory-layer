import { runCursorWorker } from "../cursor/cursor-worker-service.js";
import { resolveCursorWorkerRuntimeDependency } from "../cursor/runtime/resolve-cursor-runtime.js";
import { runGeminiWorker } from "../gemini/gemini-worker-service.js";
import { resolveGeminiWorkerRuntimeDependency } from "../gemini/runtime/resolve-gemini-runtime.js";
import type { WorkerJob, WorkerJobResult } from "./types.js";

const defaultRetryDelayMs = 250;
const maxRetryDelayMs = 5_000;

export interface RunWorkerJobOptions {
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export async function runWorkerJob(
  job: WorkerJob,
  options: RunWorkerJobOptions = {},
): Promise<WorkerJobResult> {
  const sleep = options.sleep ?? wait;
  const maxRetries = job.retries ?? 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const result = await runWorkerJobOnce(job, attempt);

    if (attempt >= maxRetries || !isRetryableResult(result)) {
      return result;
    }

    await sleep(calculateRetryDelayMs(job.retryDelayMs, attempt));
  }

  return runWorkerJobOnce(job, maxRetries);
}

async function runWorkerJobOnce(job: WorkerJob, retryCount: number): Promise<WorkerJobResult> {
  if (job.kind === "gemini") {
    try {
      return {
        kind: job.kind,
        input: job.input,
        retryCount,
        result: await runGeminiWorker(job.input, {
          ...job.dependencies,
          workerRuntimeSelection: job.workerRuntime,
          runtime: resolveGeminiWorkerRuntimeDependency(
            job.dependencies?.runtime,
            job.workerRuntime,
            process.env,
          ),
        }),
      };
    } catch (error) {
      return {
        kind: job.kind,
        input: job.input,
        retryCount,
        status: "runner_failed",
        error: formatUnexpectedError(error),
      };
    }
  }

  try {
    return {
      kind: job.kind,
      input: job.input,
      retryCount,
        result: await runCursorWorker(job.input, {
          ...job.dependencies,
          workerRuntimeSelection: job.workerRuntime,
          runtime: resolveCursorWorkerRuntimeDependency(
            job.dependencies?.runtime,
            job.workerRuntime,
          process.env,
        ),
      }),
    };
  } catch (error) {
    return {
      kind: job.kind,
      input: job.input,
      retryCount,
      status: "runner_failed",
      error: formatUnexpectedError(error),
    };
  }
}

function isRetryableResult(result: WorkerJobResult): boolean {
  if (!("result" in result)) {
    return true;
  }

  return result.result.status !== "completed" && result.result.status !== "invalid_input";
}

function calculateRetryDelayMs(
  baseDelayMs: number | undefined,
  attempt: number,
): number {
  const initialDelayMs = baseDelayMs ?? defaultRetryDelayMs;
  return Math.min(initialDelayMs * (2 ** attempt), maxRetryDelayMs);
}

function formatUnexpectedError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown worker execution error.";
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
