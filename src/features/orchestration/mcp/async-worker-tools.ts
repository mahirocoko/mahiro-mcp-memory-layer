import { z, type ZodObject, type ZodRawShape } from "zod";

import { getAppEnv } from "../../../config/env.js";
import { newId, WORKFLOW_REQUEST_ID_PATTERN } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import type { CursorWorkerResult } from "../../cursor/types.js";
import type { GeminiWorkerResult } from "../../gemini/types.js";
import { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import { type OrchestrationResultRecord, OrchestrationResultStore } from "../observability/orchestration-result-store.js";
import { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { type OrchestrationRunSummary, runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import type { WorkerJob, WorkerJobResult } from "../types.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

const getAsyncWorkerResultInputSchema = z.object({
  requestId: z
    .string()
    .trim()
    .regex(WORKFLOW_REQUEST_ID_PATTERN, "requestId must be the workflow_* id returned by the async worker tool"),
});

export interface AsyncWorkerStartResponse {
  readonly requestId: string;
  readonly taskId: string;
  readonly kind: WorkerJob["kind"];
  readonly status: "running";
  readonly executionMode: "async";
  readonly pollIntervalMs: number;
  readonly resultTool: string;
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly warning: string;
}

export interface AsyncWorkerRunningResponse {
  readonly requestId: string;
  readonly taskId: string;
  readonly kind: WorkerJob["kind"];
  readonly status: "running";
  readonly executionMode: "async";
  readonly pollIntervalMs: number;
  readonly configuredRetries?: number;
  readonly configuredRetryDelayMs?: number;
  readonly workflowStatus: "running";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resultTool: string;
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly warning: string;
}

function buildAsyncWorkerRunningWarning(resultTool: string): string {
  return `This async worker is still running. Treat status=running as healthy in-progress state and keep polling ${resultTool} until terminal; do not switch to a synchronous/local worker run just because the async job has not finished yet or a bounded wait timed out.`;
}

export interface AsyncWorkerFailedResponse {
  readonly requestId: string;
  readonly taskId: string;
  readonly kind: WorkerJob["kind"];
  readonly status: "runner_failed";
  readonly workflowStatus: Exclude<OrchestrationResultRecord["status"], "running">;
  readonly error: string;
  readonly configuredRetries?: number;
  readonly configuredRetryDelayMs?: number;
  readonly retryCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AsyncWorkerCompletedResponse<TResult extends GeminiWorkerResult | CursorWorkerResult> {
  readonly requestId: string;
  readonly taskId: string;
  readonly kind: WorkerJob["kind"];
  readonly status: TResult["status"];
  readonly workflowStatus: Exclude<OrchestrationResultRecord["status"], "running" | "runner_failed">;
  readonly configuredRetries?: number;
  readonly configuredRetryDelayMs?: number;
  readonly retryCount: number;
  readonly result: TResult;
  readonly summary: OrchestrationRunSummary;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AsyncWorkerResultResponse<TResult extends GeminiWorkerResult | CursorWorkerResult> =
  | AsyncWorkerRunningResponse
  | AsyncWorkerFailedResponse
  | AsyncWorkerCompletedResponse<TResult>;

interface CreateAsyncWorkerToolsOptions<TStartShape extends ZodRawShape, TJob extends WorkerJob> {
  readonly kind: WorkerJob["kind"];
  readonly startInputSchema: ZodObject<TStartShape>;
  readonly startToolName: string;
  readonly getToolName: string;
  readonly startDescription: string;
  readonly getDescription: string;
  readonly buildJob: (input: z.infer<ZodObject<TStartShape>>) => TJob;
}

export function createAsyncWorkerTools<TStartShape extends ZodRawShape, TJob extends WorkerJob>(
  options: CreateAsyncWorkerToolsOptions<TStartShape, TJob>,
): readonly RegisteredTool[] {
  const env = getAppEnv();
  const orchestrationTraceStore = new OrchestrationTraceStore(env.dataPaths.orchestrationTraceFilePath);
  const orchestrationResultStore = new OrchestrationResultStore(env.dataPaths.orchestrationResultDirectory);
  const orchestrationLifecycle = new OrchestrationLifecycle(orchestrationTraceStore, orchestrationResultStore);

  return [
    {
      name: options.startToolName,
      description: options.startDescription,
      inputSchema: options.startInputSchema.shape,
      execute: async (input) => {
        const parsed = options.startInputSchema.parse(input);
        const requestId = newId("workflow");
        const job = options.buildJob(parsed);
        const spec: OrchestrateWorkflowSpec = {
          mode: "parallel",
          jobs: [job],
        };
        const startedAt = new Date().toISOString();

        await orchestrationLifecycle.markRunning({
          requestId,
          source: "mcp",
          spec,
        });

        void runOrchestrationWorkflow(spec, {
          traceStore: orchestrationTraceStore,
          traceSource: "mcp",
          traceRequestId: requestId,
        })
          .then(async (result) => {
            await orchestrationLifecycle.markCompleted({
              requestId,
              source: "mcp",
              spec,
              result,
            });
          })
          .catch(async (error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);

            await orchestrationLifecycle.markRunnerFailed({
              requestId,
              source: "mcp",
              spec,
              error: errorMessage,
              startedAt,
            });
          });

        const response: AsyncWorkerStartResponse = {
          requestId,
          taskId: job.input.taskId,
          kind: options.kind,
          status: "running",
          executionMode: "async",
          pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
          resultTool: options.getToolName,
          nextArgs: {
            requestId,
          },
          warning: buildAsyncWorkerRunningWarning(options.getToolName),
        };

        return response;
      },
    },
    {
      name: options.getToolName,
      description: options.getDescription,
      inputSchema: getAsyncWorkerResultInputSchema.shape,
      execute: async (input) => {
        const parsed = getAsyncWorkerResultInputSchema.parse(input);
        const record = await orchestrationResultStore.read(parsed.requestId);

        if (!record) {
          return null;
        }

        return mapAsyncWorkerResultRecord(record, options.kind, options.getToolName);
      },
    },
  ];
}

function mapAsyncWorkerResultRecord<TResult extends GeminiWorkerResult | CursorWorkerResult>(
  record: OrchestrationResultRecord,
  expectedKind: WorkerJob["kind"],
  resultTool: string,
): AsyncWorkerResultResponse<TResult> {
  const taskIdFromMetadata = record.metadata.taskIds[0] ?? "";
  const primaryJobMetadata = record.metadata.jobs?.find((job) => job.taskId === taskIdFromMetadata);

  if (record.status === "running") {
    return {
      requestId: record.requestId,
      taskId: taskIdFromMetadata,
      kind: expectedKind,
      status: "running",
      executionMode: "async",
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      ...(typeof primaryJobMetadata?.configuredRetries === "number"
        ? { configuredRetries: primaryJobMetadata.configuredRetries }
        : {}),
      ...(typeof primaryJobMetadata?.configuredRetryDelayMs === "number"
        ? { configuredRetryDelayMs: primaryJobMetadata.configuredRetryDelayMs }
        : {}),
      workflowStatus: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      resultTool,
      nextArgs: {
        requestId: record.requestId,
      },
      warning: buildAsyncWorkerRunningWarning(resultTool),
    };
  }

  if (record.status === "runner_failed") {
    return {
      requestId: record.requestId,
      taskId: taskIdFromMetadata,
      kind: expectedKind,
      status: "runner_failed",
      workflowStatus: record.status,
      error: record.error,
      ...(typeof primaryJobMetadata?.configuredRetries === "number"
        ? { configuredRetries: primaryJobMetadata.configuredRetries }
        : {}),
      ...(typeof primaryJobMetadata?.configuredRetryDelayMs === "number"
        ? { configuredRetryDelayMs: primaryJobMetadata.configuredRetryDelayMs }
        : {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  const firstResult = record.result.results[0];

  if (!firstResult) {
    return {
      requestId: record.requestId,
      taskId: taskIdFromMetadata,
      kind: expectedKind,
      status: "runner_failed",
      workflowStatus: record.status,
      error: "Async worker result is missing the first job output.",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  if (firstResult.kind !== expectedKind) {
    throw new Error(`Expected ${expectedKind} async worker result, received ${firstResult.kind}.`);
  }

  return mapWorkerJobResult(record, firstResult);
}

function mapWorkerJobResult<TResult extends GeminiWorkerResult | CursorWorkerResult>(
  record: Extract<OrchestrationResultRecord, { status: "completed" | "failed" | "step_failed" | "timed_out" }>,
  workerResult: WorkerJobResult,
): AsyncWorkerResultResponse<TResult> {
  const taskId = workerResult.input.taskId;
  const jobMetadata = record.metadata.jobs?.find((job) => job.taskId === taskId);

  if ("result" in workerResult) {
    return {
      requestId: record.requestId,
      taskId,
      kind: workerResult.kind,
      status: workerResult.result.status,
      workflowStatus: record.status,
      ...(typeof jobMetadata?.configuredRetries === "number" ? { configuredRetries: jobMetadata.configuredRetries } : {}),
      ...(typeof jobMetadata?.configuredRetryDelayMs === "number"
        ? { configuredRetryDelayMs: jobMetadata.configuredRetryDelayMs }
        : {}),
      retryCount: workerResult.retryCount,
      result: workerResult.result as TResult,
      summary: record.result.summary,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  return {
    requestId: record.requestId,
    taskId,
      kind: workerResult.kind,
      status: "runner_failed",
      workflowStatus: record.status,
      error: workerResult.error,
      ...(typeof jobMetadata?.configuredRetries === "number" ? { configuredRetries: jobMetadata.configuredRetries } : {}),
      ...(typeof jobMetadata?.configuredRetryDelayMs === "number"
        ? { configuredRetryDelayMs: jobMetadata.configuredRetryDelayMs }
        : {}),
      retryCount: workerResult.retryCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
  };
}
