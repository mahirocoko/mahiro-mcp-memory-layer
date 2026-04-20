import { buildOrchestrationTraceEntry } from "./observability/orchestration-trace.js";
import { runWorkerJob, type WorkerJobResult } from "./run-worker-job.js";
import type { OrchestrateWorkflowSpec, WorkflowJob } from "./workflow-spec.js";

export interface OrchestrationRunSummary {
  readonly totalJobs: number;
  readonly finishedJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly skippedJobs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

export interface OrchestrationRunResult {
  readonly requestId?: string;
  readonly mode: OrchestrateWorkflowSpec["mode"];
  readonly status: "completed" | "failed" | "timed_out" | "step_failed";
  readonly results: Array<WorkerJobResult | { readonly kind: WorkflowJob["kind"]; readonly input: WorkflowJob["input"]; readonly retryCount: 0; readonly status: "skipped"; readonly error: string }>;
  readonly summary: OrchestrationRunSummary;
  readonly failedStepIndex?: number;
  readonly error?: string;
}

export interface RunOrchestrationWorkflowOptions {
  readonly traceStore?: { append(entry: unknown): Promise<void> };
  readonly traceSource?: "cli" | "mcp";
  readonly traceRequestId?: string;
  readonly onJobComplete?: (event: { mode: OrchestrateWorkflowSpec["mode"]; jobIndex: number; finishedJobs: number; totalJobs: number }) => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSummary(results: OrchestrationRunResult["results"], startedAt: string, finishedAt: string): OrchestrationRunSummary {
  const finishedJobs = results.filter((item) => !("status" in item && item.status === "skipped")).length;
  const completedJobs = results.filter((item) => "result" in item && item.result.status === "completed").length;
  const failedJobs = results.filter((item) => {
    if ("status" in item) {
      return item.status !== "skipped";
    }
    return item.result.status !== "completed";
  }).length;
  const skippedJobs = results.filter((item) => "status" in item && item.status === "skipped").length;
  return {
    totalJobs: results.length,
    finishedJobs,
    completedJobs,
    failedJobs,
    skippedJobs,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
  };
}

function hasFailure(result: WorkerJobResult): boolean {
  return !("result" in result && result.result.status === "completed");
}

function skipJob(job: WorkflowJob, reason: string) {
  return {
    kind: job.kind,
    input: job.input,
    retryCount: 0 as const,
    status: "skipped" as const,
    error: reason,
  };
}

async function runParallel(spec: Extract<OrchestrateWorkflowSpec, { mode: "parallel" }>, options: RunOrchestrationWorkflowOptions): Promise<OrchestrationRunResult> {
  const startedAt = nowIso();
  const deadline = spec.timeoutMs ? Date.now() + spec.timeoutMs : undefined;
  const results: OrchestrationRunResult["results"] = Array.from({ length: spec.jobs.length });
  let nextIndex = 0;
  let terminalStatus: OrchestrationRunResult["status"] | undefined;
  const maxConcurrency = spec.maxConcurrency ?? spec.jobs.length;

  const worker = async (): Promise<void> => {
    while (nextIndex < spec.jobs.length && !terminalStatus) {
      const index = nextIndex;
      nextIndex += 1;
      const job = spec.jobs[index];
      if (!job) return;
      const remainingMs = deadline ? Math.max(1, deadline - Date.now()) : undefined;
      const runJob: WorkflowJob = {
        ...job,
        input: {
          ...job.input,
          ...(remainingMs !== undefined ? { timeoutMs: Math.min(job.input.timeoutMs ?? remainingMs, remainingMs) } : {}),
        },
      } as WorkflowJob;
      const result = await runWorkerJob(runJob);
      results[index] = result;
      await options.onJobComplete?.({ mode: "parallel", jobIndex: index, finishedJobs: results.filter(Boolean).length, totalJobs: spec.jobs.length });
      if ("result" in result && result.result.status === "timeout") {
        terminalStatus = "timed_out";
      } else if (hasFailure(result)) {
        terminalStatus = "failed";
      } else if (deadline && Date.now() > deadline) {
        terminalStatus = "timed_out";
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, maxConcurrency) }, () => worker()));

  if (terminalStatus) {
    for (let index = 0; index < spec.jobs.length; index += 1) {
      if (!results[index]) {
        results[index] = skipJob(spec.jobs[index]!, terminalStatus === "timed_out" ? "Workflow timed out before this job started." : "Workflow failed before this job started.");
      }
    }
  }

  const finishedAt = nowIso();
  const status = terminalStatus ?? "completed";
  return {
    ...(options.traceRequestId ? { requestId: options.traceRequestId } : {}),
    mode: "parallel",
    status,
    results,
    summary: buildSummary(results, startedAt, finishedAt),
  };
}

async function runSequential(spec: Extract<OrchestrateWorkflowSpec, { mode: "sequential" }>, options: RunOrchestrationWorkflowOptions): Promise<OrchestrationRunResult> {
  const startedAt = nowIso();
  const results: OrchestrationRunResult["results"] = [];
  let failedStepIndex: number | undefined;
  let status: OrchestrationRunResult["status"] = "completed";
  let error: string | undefined;
  const deadline = spec.timeoutMs ? Date.now() + spec.timeoutMs : undefined;

  const steps = spec.steps as Array<WorkflowJob | ((context: { results: OrchestrationRunResult["results"]; lastResult?: WorkerJobResult }) => WorkflowJob | null)>;

  for (const [index, rawStep] of steps.entries()) {
    const resolvedStep = typeof rawStep === "function"
      ? rawStep({
          results,
          lastResult: [...results].reverse().find((item): item is WorkerJobResult => "result" in item || ("status" in item && item.status === "runner_failed")),
        })
      : rawStep;

    if (resolvedStep === null) {
      results.push({ kind: "cursor", input: { taskId: `skipped_${index}`, prompt: "", model: "" }, retryCount: 0, status: "skipped", error: "Step was conditionally skipped." });
      continue;
    }

    const interpolatedPrompt = interpolatePrompt(resolvedStep.input.prompt, results);
    if (interpolatedPrompt.error) {
      status = "step_failed";
      failedStepIndex = index;
      error = interpolatedPrompt.error;
      results.push(skipJob(resolvedStep, interpolatedPrompt.error));
      for (let remainder = index + 1; remainder < steps.length; remainder += 1) {
        const step = steps[remainder];
        if (step && typeof step !== "function") {
          results.push(skipJob(step, "Workflow stopped after a template resolution failure."));
        }
      }
      break;
    }

    const remainingMs = deadline ? Math.max(1, deadline - Date.now()) : undefined;
    const runJob: WorkflowJob = {
      ...resolvedStep,
      input: {
        ...resolvedStep.input,
        prompt: interpolatedPrompt.prompt,
        ...(remainingMs !== undefined ? { timeoutMs: Math.min(resolvedStep.input.timeoutMs ?? remainingMs, remainingMs) } : {}),
      },
    } as WorkflowJob;
    const result = await runWorkerJob(runJob);
    results.push(result);
    await options.onJobComplete?.({ mode: "sequential", jobIndex: index, finishedJobs: results.filter((item) => !("status" in item && item.status === "skipped")).length, totalJobs: steps.length });
    if ("result" in result && result.result.status === "timeout") {
      status = "timed_out";
      failedStepIndex = index;
      error = `Workflow timed out while running step ${index + 1}.`;
      break;
    }
    if (hasFailure(result) && resolvedStep.continueOnFailure === false) {
      status = "step_failed";
      failedStepIndex = index;
      error = `Workflow stopped after step ${index + 1} returned status 'command_failed'.`;
      break;
    }
    if (hasFailure(result)) {
      status = "failed";
    }
  }

  for (let index = results.length; index < steps.length; index += 1) {
    const step = steps[index];
    if (step && typeof step !== "function") {
      results.push(skipJob(step, status === "timed_out" ? "Workflow timed out before this step started." : "Sequential workflow stopped after a failed step."));
    }
  }

  const finishedAt = nowIso();
  return {
    ...(options.traceRequestId ? { requestId: options.traceRequestId } : {}),
    mode: "sequential",
    status,
    results,
    ...(failedStepIndex !== undefined ? { failedStepIndex } : {}),
    ...(error ? { error } : {}),
    summary: buildSummary(results, startedAt, finishedAt),
  };
}

function interpolatePrompt(prompt: string, results: OrchestrationRunResult["results"]): { prompt: string; error?: string } {
  const matches = [...prompt.matchAll(/{{\s*([^}]+)\s*}}/g)];
  let output = prompt;
  for (const match of matches) {
    const raw = match[1]?.trim() ?? "";
    let replacement: string | undefined;
    if (raw === "last.result.response") {
      const last = [...results].reverse().find((item) => "result" in item && "response" in item.result && typeof item.result.response === "string");
      replacement = last && "result" in last && "response" in last.result ? last.result.response : undefined;
    } else {
      const pathMatch = raw.match(/^results\.(\d+)\.result\.(.+)$/);
      if (pathMatch) {
        const index = Number(pathMatch[1]);
        const path = pathMatch[2]?.split(".") ?? [];
        const item = results[index];
        let value: unknown = item && "result" in item ? item.result : undefined;
        for (const segment of path) {
          value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[segment] : undefined;
        }
        replacement = typeof value === "string" ? value : undefined;
      }
    }
    if (replacement === undefined) {
      return { prompt, error: `Template '${raw}' could not be resolved.` };
    }
    output = output.replace(match[0], replacement);
  }
  return { prompt: output };
}

export async function runOrchestrationWorkflow(spec: OrchestrateWorkflowSpec, options: RunOrchestrationWorkflowOptions = {}): Promise<OrchestrationRunResult> {
  const result = spec.mode === "parallel" ? await runParallel(spec, options) : await runSequential(spec, options);
  if (options.traceStore && options.traceSource && options.traceRequestId) {
    await options.traceStore.append(buildOrchestrationTraceEntry(options.traceRequestId, options.traceSource, spec, result));
  }
  return result;
}

export function hasOrchestrationFailures(result: OrchestrationRunResult): boolean {
  return result.status !== "completed" || result.results.some((item) => !("result" in item && item.result.status === "completed"));
}
