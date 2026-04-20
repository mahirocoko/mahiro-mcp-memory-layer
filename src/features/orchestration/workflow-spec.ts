import { newId } from "../../lib/ids.js";
import type { CursorWorkerInput, CursorWorkerRuntime } from "../cursor/types.js";
import type { GeminiCacheStore } from "../gemini/core/gemini-cache-store.js";
import type { GeminiWorkerInput, GeminiWorkerRuntime } from "../gemini/types.js";

export type WorkerRuntimeKind = "shell" | "mcp";
export type WorkflowSource = "cli" | "mcp";
export type DelegatedTaskIntent = "proposal" | "implementation";
export type DelegatedTaskExecutor = "gemini" | "cursor";

export interface GeminiWorkflowJob {
  readonly kind: "gemini";
  readonly intent?: DelegatedTaskIntent;
  readonly requestedExecutor?: DelegatedTaskExecutor;
  readonly workerRuntime?: WorkerRuntimeKind;
  readonly routeReason?: string;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly continueOnFailure?: boolean;
  readonly dependencies?: {
    readonly runtime?: GeminiWorkerRuntime;
    readonly cacheStore?: GeminiCacheStore;
  };
  readonly input: GeminiWorkerInput;
}

export interface CursorWorkflowJob {
  readonly kind: "cursor";
  readonly intent?: DelegatedTaskIntent;
  readonly requestedExecutor?: DelegatedTaskExecutor;
  readonly workerRuntime?: WorkerRuntimeKind;
  readonly routeReason?: string;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly continueOnFailure?: boolean;
  readonly dependencies?: {
    readonly runtime?: CursorWorkerRuntime;
  };
  readonly input: CursorWorkerInput;
}

export type WorkflowJob = GeminiWorkflowJob | CursorWorkflowJob;

export interface ParallelWorkflowSpec {
  readonly mode: "parallel";
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly defaultTrust?: boolean;
  readonly jobs: WorkflowJob[];
}

export interface SequentialWorkflowSpec {
  readonly mode: "sequential";
  readonly timeoutMs?: number;
  readonly defaultTrust?: boolean;
  readonly steps: WorkflowJob[];
}

export type OrchestrateWorkflowSpec = ParallelWorkflowSpec | SequentialWorkflowSpec;
export type WorkflowSpecInput = OrchestrateWorkflowSpec;

function normalizeCursorInput(input: CursorWorkerInput, defaultCwd?: string, defaultTrust?: boolean): CursorWorkerInput {
  return {
    ...input,
    taskId: input.taskId || newId("cursor"),
    cwd: input.cwd ?? defaultCwd,
    trust: input.trust ?? defaultTrust,
  };
}

function normalizeGeminiInput(input: GeminiWorkerInput, defaultCwd?: string): GeminiWorkerInput {
  return {
    ...input,
    taskId: input.taskId || newId("gemini"),
    cwd: input.cwd ?? defaultCwd,
  };
}

function normalizeJob(job: WorkflowJob, defaultCwd?: string, defaultTrust?: boolean): WorkflowJob {
  if (job.kind === "cursor") {
    return {
      ...job,
      input: normalizeCursorInput(job.input, defaultCwd, defaultTrust),
    };
  }
  return {
    ...job,
    input: normalizeGeminiInput(job.input, defaultCwd),
  };
}

export function normalizeWorkflowSpec(
  spec: WorkflowSpecInput,
  defaultCwd?: string,
  _controlPlane?: WorkflowSource,
): OrchestrateWorkflowSpec {
  if (spec.mode === "parallel") {
    return {
      ...spec,
      jobs: spec.jobs.map((job) => normalizeJob(job, defaultCwd, spec.defaultTrust)),
    };
  }
  return {
    ...spec,
    steps: spec.steps.map((job) => normalizeJob(job, defaultCwd, spec.defaultTrust)),
  };
}
