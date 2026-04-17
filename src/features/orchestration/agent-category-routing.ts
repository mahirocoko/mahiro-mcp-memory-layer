import type { CursorWorkerInput } from "../cursor/types.js";
import type { GeminiAllowedMcpServerNames, GeminiApprovalMode, GeminiTaskKind, GeminiWorkerInput } from "../gemini/types.js";
import type { WorkerJob, WorkerRuntimeSelection } from "./types.js";

export const agentTaskCategories = [
  "visual-engineering",
  "artistry",
  "ultrabrain",
  "deep",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
] as const;

export type AgentTaskCategory = (typeof agentTaskCategories)[number];

export interface AgentTaskRoute {
  readonly category: AgentTaskCategory;
  readonly workerKind: WorkerJob["kind"];
  readonly model: string;
  readonly workerRuntime?: WorkerRuntimeSelection;
}

export interface AgentTaskRouteOverride {
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeSelection;
}

export type AgentTaskRouteOverrides = Partial<Record<AgentTaskCategory, AgentTaskRouteOverride>>;

interface AgentTaskRoutePreset {
  readonly workerKind: WorkerJob["kind"];
  readonly model: string;
}

const defaultAgentTaskRoutePresets: Record<AgentTaskCategory, AgentTaskRoutePreset> = {
  "visual-engineering": {
    workerKind: "gemini",
    model: "gemini-3.1-pro-preview",
  },
  artistry: {
    workerKind: "gemini",
    model: "gemini-3.1-pro-preview",
  },
  ultrabrain: {
    workerKind: "cursor",
    model: "claude-4.6-opus-high",
  },
  deep: {
    workerKind: "cursor",
    model: "composer-2",
  },
  quick: {
    workerKind: "cursor",
    model: "composer-2",
  },
  "unspecified-low": {
    workerKind: "cursor",
    model: "composer-2",
  },
  "unspecified-high": {
    workerKind: "cursor",
    model: "composer-2",
  },
  writing: {
    workerKind: "cursor",
    model: "composer-2",
  },
};

export interface ResolveAgentTaskRouteInput {
  readonly category: AgentTaskCategory;
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeSelection;
  readonly routeOverrides?: AgentTaskRouteOverrides;
}

export function resolveAgentTaskRoute(input: ResolveAgentTaskRouteInput): AgentTaskRoute {
  const preset = defaultAgentTaskRoutePresets[input.category];
  const override = input.routeOverrides?.[input.category];

  return {
    category: input.category,
    workerKind: preset.workerKind,
    model: normalizeOptionalString(input.model) ?? normalizeOptionalString(override?.model) ?? preset.model,
    ...(input.workerRuntime ?? override?.workerRuntime
      ? { workerRuntime: input.workerRuntime ?? override?.workerRuntime }
      : {}),
  };
}

export interface BuildAgentTaskWorkerJobBaseInput {
  readonly category: AgentTaskCategory;
  readonly taskId: string;
  readonly prompt: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly binaryPath?: string;
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeSelection;
  readonly routeOverrides?: AgentTaskRouteOverrides;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly continueOnFailure?: boolean;
}

export interface BuildGeminiCategoryWorkerJobInput extends BuildAgentTaskWorkerJobBaseInput {
  readonly taskKind?: GeminiTaskKind;
  readonly approvalMode?: GeminiApprovalMode;
  readonly allowedMcpServerNames?: GeminiAllowedMcpServerNames;
}

export interface BuildCursorCategoryWorkerJobInput extends BuildAgentTaskWorkerJobBaseInput {
  readonly mode?: CursorWorkerInput["mode"];
  readonly force?: boolean;
  readonly trust?: boolean;
}

export type BuildAgentTaskWorkerJobInput =
  | BuildGeminiCategoryWorkerJobInput
  | BuildCursorCategoryWorkerJobInput;

export function buildAgentTaskWorkerJob(input: BuildAgentTaskWorkerJobInput): WorkerJob {
  const route = resolveAgentTaskRoute(input);

  if (route.workerKind === "gemini") {
    const geminiInput: GeminiWorkerInput = {
      taskId: input.taskId,
      prompt: input.prompt,
      model: route.model,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
      ...("taskKind" in input && input.taskKind ? { taskKind: input.taskKind } : {}),
      ...("approvalMode" in input && input.approvalMode ? { approvalMode: input.approvalMode } : {}),
      ...("allowedMcpServerNames" in input && input.allowedMcpServerNames
        ? { allowedMcpServerNames: input.allowedMcpServerNames }
        : {}),
    };

    return {
      kind: "gemini",
      input: geminiInput,
      ...(route.workerRuntime ? { workerRuntime: route.workerRuntime } : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
      ...(input.continueOnFailure !== undefined ? { continueOnFailure: input.continueOnFailure } : {}),
    };
  }

  const cursorInput: CursorWorkerInput = {
    taskId: input.taskId,
    prompt: input.prompt,
    model: route.model,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
    ...("mode" in input && input.mode ? { mode: input.mode } : {}),
    ...("force" in input && input.force !== undefined ? { force: input.force } : {}),
    ...("trust" in input && input.trust !== undefined ? { trust: input.trust } : {}),
  };

  return {
    kind: "cursor",
    input: cursorInput,
    ...(route.workerRuntime ? { workerRuntime: route.workerRuntime } : {}),
    ...(input.retries !== undefined ? { retries: input.retries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.continueOnFailure !== undefined ? { continueOnFailure: input.continueOnFailure } : {}),
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}
