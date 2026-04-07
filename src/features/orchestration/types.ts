import type { RunCursorWorkerDependencies } from "../cursor/cursor-worker-service.js";
import type { CursorWorkerInput, CursorWorkerResult } from "../cursor/types.js";
import type { RunGeminiWorkerDependencies } from "../gemini/gemini-worker-service.js";
import type { GeminiWorkerInput, GeminiWorkerResult } from "../gemini/types.js";
import type { JobErrorClass } from "./job-error-class.js";

export interface GeminiWorkerJob {
  readonly kind: "gemini";
  readonly input: GeminiWorkerInput;
  readonly dependencies?: RunGeminiWorkerDependencies;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly continueOnFailure?: boolean;
}

export interface CursorWorkerJob {
  readonly kind: "cursor";
  readonly input: CursorWorkerInput;
  readonly dependencies?: RunCursorWorkerDependencies;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly continueOnFailure?: boolean;
}

export type WorkerJob = GeminiWorkerJob | CursorWorkerJob;

export interface GeminiWorkerJobResult {
  readonly kind: "gemini";
  readonly input: GeminiWorkerInput;
  readonly retryCount: number;
  readonly result: GeminiWorkerResult;
}

export interface CursorWorkerJobResult {
  readonly kind: "cursor";
  readonly input: CursorWorkerInput;
  readonly retryCount: number;
  readonly result: CursorWorkerResult;
}

export interface GeminiWorkerJobFailure {
  readonly kind: "gemini";
  readonly input: GeminiWorkerInput;
  readonly retryCount: number;
  readonly status: "runner_failed";
  readonly error: string;
}

export interface CursorWorkerJobFailure {
  readonly kind: "cursor";
  readonly input: CursorWorkerInput;
  readonly retryCount: number;
  readonly status: "runner_failed";
  readonly error: string;
}

export type WorkerJobResult =
  | GeminiWorkerJobResult
  | CursorWorkerJobResult
  | GeminiWorkerJobFailure
  | CursorWorkerJobFailure;

export interface JobCompleteEvent {
  readonly mode: "parallel" | "sequential";
  readonly jobIndex: number;
  readonly finishedJobs: number;
  readonly totalJobs: number;
  readonly job: WorkerJob;
  readonly result: WorkerJobResult;
}

// Library-only runtime hook for callers that want incremental progress.
// Parallel events arrive in completion order, not job index order.
// Sequential totalJobs counts declared steps, including ones that may be skipped via `null`.

export interface SequentialWorkerContext {
  readonly results: readonly WorkerJobResult[];
  readonly lastResult?: WorkerJobResult;
  readonly stepIndex: number;
}

export type SequentialWorkerStep = WorkerJob | ((context: SequentialWorkerContext) => WorkerJob | null);

export type OrchestrationJobStatus = GeminiWorkerResult["status"] | CursorWorkerResult["status"] | "runner_failed";

/** Per-finished-job model telemetry persisted on orchestration traces (new entries only). */
export interface OrchestrationJobModelTelemetry {
  readonly kind: WorkerJob["kind"];
  readonly taskId: string;
  /** Normalized per-job execution status for later telemetry analysis. */
  readonly status: OrchestrationJobStatus;
  /** Number of retries before the terminal result. */
  readonly retryCount?: number;
  /** Worker-observed execution duration in milliseconds when available. */
  readonly durationMs?: number;
  /** Cache hit signal when the worker reports it. */
  readonly cached?: boolean;
  /** Provider/local cache token count when the worker reports it. */
  readonly cachedTokens?: number;
  /** Normalized error class derived from job status and diagnostics. */
  readonly errorClass?: JobErrorClass;
  /** Model requested for the job (worker input or normalized result). */
  readonly requestedModel: string;
  /** Model reported by the worker runtime when available. */
  readonly reportedModel?: string;
}

export interface OrchestrationTraceEntry {
  readonly requestId: string;
  readonly source: "cli" | "mcp";
  readonly mode: "parallel" | "sequential";
  readonly status: "completed" | "step_failed" | "timed_out" | "runner_failed";
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly jobKinds: readonly WorkerJob["kind"][];
  readonly taskIds: readonly string[];
  /** Present on traces written after this field was added; omitted on older JSONL lines. */
  readonly jobModels?: readonly OrchestrationJobModelTelemetry[];
  readonly totalJobs: number;
  readonly finishedJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly skippedJobs: number;
  readonly failedStepIndex?: number;
  readonly error?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface ListOrchestrationTracesInput {
  readonly source?: OrchestrationTraceEntry["source"];
  readonly mode?: OrchestrationTraceEntry["mode"];
  readonly status?: OrchestrationTraceEntry["status"];
  readonly requestId?: string;
  readonly taskId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly limit?: number;
}

export interface ParallelWorkersResult {
  readonly results: readonly WorkerJobResult[];
  readonly timedOut: boolean;
}

export interface SequentialWorkersResult {
  readonly status: "completed" | "step_failed" | "timed_out";
  readonly results: readonly WorkerJobResult[];
  readonly failedStepIndex?: number;
  readonly error?: string;
}
