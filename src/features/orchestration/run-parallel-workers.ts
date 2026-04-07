import type { JobCompleteEvent, ParallelWorkersResult, WorkerJob, WorkerJobResult } from "./types.js";
import { runWorkerJob } from "./run-worker-job.js";
import { prepareJobForWorkflowTimeout } from "./workflow-timeout.js";

export interface RunParallelWorkersOptions {
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly onJobComplete?: (event: JobCompleteEvent) => Promise<void> | void;
}

export async function runParallelWorkers(
  jobs: readonly WorkerJob[],
  options: RunParallelWorkersOptions = {},
): Promise<ParallelWorkersResult> {
  const maxConcurrency = normalizeMaxConcurrency(jobs.length, options.maxConcurrency);
  const deadlineAt = options.timeoutMs ? Date.now() + options.timeoutMs : undefined;

  if (jobs.length === 0) {
    return {
      results: [],
      timedOut: false,
    };
  }

  const results = new Array<WorkerJobResult | undefined>(jobs.length);
  let nextIndex = 0;
  let timedOut = false;
  let finishedJobs = 0;

  const workers = Array.from({ length: maxConcurrency }, async () => {
    while (nextIndex < jobs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const preparedJob = prepareJobForWorkflowTimeout(jobs[currentIndex] as WorkerJob, deadlineAt);

      if (!preparedJob) {
        timedOut = true;
        return;
      }

      const result = await runWorkerJob(preparedJob.job);
      results[currentIndex] = result;
      finishedJobs += 1;

      await options.onJobComplete?.({
        mode: "parallel",
        jobIndex: currentIndex,
        finishedJobs,
        totalJobs: jobs.length,
        job: preparedJob.job,
        result,
      });

      if (preparedJob.workflowTimeoutBounded && "result" in result && result.result.status === "timeout") {
        timedOut = true;
      }
    }
  });

  await Promise.all(workers);

  return {
    results: results.filter((result): result is WorkerJobResult => result !== undefined),
    timedOut,
  };
}

function normalizeMaxConcurrency(jobCount: number, maxConcurrency: number | undefined): number {
  if (!maxConcurrency) {
    return Math.max(jobCount, 1);
  }

  return Math.min(maxConcurrency, Math.max(jobCount, 1));
}
