import type { CursorWorkerInput } from "../cursor/types.js";
import type { GeminiAllowedMcpServerNames, GeminiApprovalMode, GeminiTaskKind, GeminiWorkerInput } from "../gemini/types.js";
import type { WorkerJob, WorkerRuntimeSelection } from "./types.js";
import type { RuntimeModelInventorySnapshot } from "./runtime-model-inventory.js";

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
  readonly preferredModels: readonly string[];
}

const defaultAgentTaskRoutePresets: Record<AgentTaskCategory, AgentTaskRoutePreset> = {
  "visual-engineering": {
    workerKind: "gemini",
    preferredModels: ["gemini-3.1-pro", "gemini-3-flash"],
  },
  artistry: {
    workerKind: "gemini",
    preferredModels: ["gemini-3-flash", "gemini-3.1-pro"],
  },
  ultrabrain: {
    workerKind: "cursor",
    preferredModels: [
      "claude-opus-4-7-thinking-high",
      "claude-opus-4-7-high",
      "claude-4.6-opus-high",
      "claude-4.6-sonnet-medium",
    ],
  },
  deep: {
    workerKind: "cursor",
    preferredModels: ["claude-opus-4-7-high", "composer-2", "claude-4.6-opus-high", "claude-4.6-sonnet-medium"],
  },
  quick: {
    workerKind: "cursor",
    preferredModels: ["composer-2", "claude-4.6-sonnet-medium"],
  },
  "unspecified-low": {
    workerKind: "cursor",
    preferredModels: ["composer-2", "claude-4.6-sonnet-medium"],
  },
  "unspecified-high": {
    workerKind: "cursor",
    preferredModels: ["claude-opus-4-7-high", "composer-2", "claude-4.6-opus-high", "claude-4.6-sonnet-medium"],
  },
  writing: {
    workerKind: "cursor",
    preferredModels: ["composer-2", "claude-4.6-sonnet-medium"],
  },
};

export interface ResolveAgentTaskRouteInput {
  readonly category: AgentTaskCategory;
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeSelection;
  readonly routeOverrides?: AgentTaskRouteOverrides;
  readonly runtimeModelInventory?: RuntimeModelInventorySnapshot;
}

export interface EscalationSignals {
  readonly uncertaintyLevel?: "low" | "medium" | "high";
  readonly previousAttemptFailed?: boolean;
  readonly verificationRisk?: boolean;
  readonly requiresDeepReasoning?: boolean;
  readonly requiresHigherQualityGemini?: boolean;
}

export function resolveAgentTaskRoute(input: ResolveAgentTaskRouteInput): AgentTaskRoute {
  const preset = defaultAgentTaskRoutePresets[input.category];
  const override = input.routeOverrides?.[input.category];
  const inventoryBackedModel = resolveInventoryBackedModel(preset.preferredModels, input.runtimeModelInventory);

  return {
    category: input.category,
    workerKind: preset.workerKind,
    model: normalizeOptionalString(input.model) ?? normalizeOptionalString(override?.model) ?? inventoryBackedModel,
    ...(input.workerRuntime ?? override?.workerRuntime
      ? { workerRuntime: input.workerRuntime ?? override?.workerRuntime }
      : {}),
  };
}

export function resolveEscalatedAgentTaskRoute(input: ResolveAgentTaskRouteInput & {
  readonly currentModel?: string;
  readonly signals: EscalationSignals;
}): AgentTaskRoute {
  const baseRoute = resolveAgentTaskRoute(input);
  const currentModel = normalizeOptionalString(input.currentModel) ?? baseRoute.model;
  const preferredEscalatedModels = resolvePreferredEscalatedModels(baseRoute.workerKind, currentModel, input.signals);

  if (preferredEscalatedModels.length === 0 || preferredEscalatedModels[0] === currentModel) {
    return baseRoute;
  }

  return {
    ...baseRoute,
    model: resolveInventoryBackedModel(preferredEscalatedModels, input.runtimeModelInventory),
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
  readonly runtimeModelInventory?: RuntimeModelInventorySnapshot;
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

function resolveInventoryBackedModel(
  preferredModels: readonly string[],
  runtimeModelInventory: RuntimeModelInventorySnapshot | undefined,
): string {
  const availableModels = new Set(runtimeModelInventory?.cursor.models ?? []);

  if (availableModels.size === 0) {
    return preferredModels[0] ?? "composer-2";
  }

  for (const model of preferredModels) {
    if (availableModels.has(model)) {
      return model;
    }
  }

  return preferredModels[0] ?? "composer-2";
}

function resolvePreferredEscalatedModels(
  workerKind: AgentTaskRoute["workerKind"],
  currentModel: string,
  signals: EscalationSignals,
): readonly string[] {
  if (workerKind === "cursor") {
    if (currentModel === "composer-2") {
      if (signals.requiresDeepReasoning) {
        return [
          "claude-opus-4-7-thinking-high",
          "claude-opus-4-7-high",
          "claude-4.6-opus-high",
          "claude-4.6-sonnet-medium",
          currentModel,
        ];
      }

      if (signals.previousAttemptFailed || signals.verificationRisk || signals.uncertaintyLevel === "high") {
        return ["claude-opus-4-7-high", "claude-4.6-opus-high", "claude-4.6-sonnet-medium", currentModel];
      }
    }

    if (currentModel === "claude-opus-4-7-high" && signals.requiresDeepReasoning) {
      return ["claude-opus-4-7-thinking-high", "claude-4.6-opus-high", "claude-4.6-sonnet-medium", currentModel];
    }

    return [];
  }

  if (currentModel === "gemini-3-flash") {
    if (signals.requiresHigherQualityGemini || signals.verificationRisk || signals.uncertaintyLevel === "high") {
      return ["gemini-3.1-pro", currentModel];
    }
  }

  return [];
}
