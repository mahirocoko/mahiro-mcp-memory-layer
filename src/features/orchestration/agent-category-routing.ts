import type { CursorWorkerInput } from "../cursor/types.js";
import { newId } from "../../lib/ids.js";
import { interactiveTmuxGeminiRuntime } from "../gemini/runtime/tmux/interactive-gemini-tmux-runtime.js";
import type { GeminiWorkerInput } from "../gemini/types.js";
import type { RuntimeModelInventorySnapshot } from "./runtime-model-inventory.js";
import type { WorkerRuntimeKind, WorkflowJob } from "./workflow-spec.js";

export type AgentTaskCategory =
  | "visual-engineering"
  | "interactive-gemini"
  | "artistry"
  | "ultrabrain"
  | "deep"
  | "unspecified-high"
  | "quick"
  | "unspecified-low"
  | "writing";

type WorkerKind = "gemini" | "cursor";

interface RouteDefaults {
  readonly workerKind: WorkerKind;
  readonly primaryModel: string;
  readonly fallbacks: readonly string[];
}

const routeDefaults: Record<AgentTaskCategory, RouteDefaults> = {
  "visual-engineering": { workerKind: "gemini", primaryModel: "gemini-3.1-pro-preview", fallbacks: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  "interactive-gemini": { workerKind: "gemini", primaryModel: "gemini-3.1-pro-preview", fallbacks: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  artistry: { workerKind: "gemini", primaryModel: "gemini-3-flash-preview", fallbacks: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  ultrabrain: { workerKind: "cursor", primaryModel: "claude-opus-4-7-thinking-high", fallbacks: ["claude-4.6-opus-high", "composer-2"] },
  deep: { workerKind: "cursor", primaryModel: "claude-opus-4-7-high", fallbacks: ["claude-4.6-opus-high", "composer-2"] },
  "unspecified-high": { workerKind: "cursor", primaryModel: "claude-opus-4-7-high", fallbacks: ["claude-4.6-opus-high", "composer-2"] },
  quick: { workerKind: "cursor", primaryModel: "composer-2", fallbacks: ["claude-4.6-sonnet-medium", "claude-4.6-opus-high"] },
  "unspecified-low": { workerKind: "cursor", primaryModel: "composer-2", fallbacks: ["claude-4.6-sonnet-medium", "claude-4.6-opus-high"] },
  writing: { workerKind: "cursor", primaryModel: "composer-2", fallbacks: ["claude-4.6-sonnet-medium", "claude-4.6-opus-high"] },
};

export interface AgentTaskRoute {
  readonly category: AgentTaskCategory;
  readonly workerKind: WorkerKind;
  readonly model: string;
  readonly reason: string;
  readonly workerRuntime?: WorkerRuntimeKind;
}

export interface AgentTaskRouteOverrides {
  readonly [category: string]: {
    readonly model?: string;
    readonly workerRuntime?: WorkerRuntimeKind;
  };
}

function pickAvailableModel(primary: string, fallbacks: readonly string[], inventory?: RuntimeModelInventorySnapshot): { model: string; fallback: boolean } {
  if (!inventory) {
    return { model: primary, fallback: false };
  }
  const models = new Set(inventory.cursor.models);
  if (models.has(primary)) {
    return { model: primary, fallback: false };
  }
  for (const fallback of fallbacks) {
    if (models.has(fallback)) {
      return { model: fallback, fallback: true };
    }
  }
  return { model: primary, fallback: false };
}

export function resolveAgentTaskRoute(input: {
  readonly category: AgentTaskCategory;
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeKind;
  readonly routeOverrides?: AgentTaskRouteOverrides;
  readonly runtimeModelInventory?: RuntimeModelInventorySnapshot;
}): AgentTaskRoute {
  const defaults = routeDefaults[input.category];
  const override = input.routeOverrides?.[input.category];

  if (input.model) {
    return {
      category: input.category,
      workerKind: defaults.workerKind,
      model: input.model,
      reason: "explicit_model_override",
      ...(input.workerRuntime ? { workerRuntime: input.workerRuntime } : {}),
    };
  }

  if (override?.model) {
    return {
      category: input.category,
      workerKind: defaults.workerKind,
      model: override.model,
      reason: "config_route_override",
      ...(override.workerRuntime ? { workerRuntime: override.workerRuntime } : {}),
    };
  }

  const selected = pickAvailableModel(defaults.primaryModel, defaults.fallbacks, input.runtimeModelInventory);
  return {
    category: input.category,
    workerKind: defaults.workerKind,
    model: selected.model,
    reason: selected.fallback ? "runtime_fallback_missing_primary_model" : `default_${input.category}_lane`,
    ...(input.workerRuntime ? { workerRuntime: input.workerRuntime } : {}),
  };
}

export function buildAgentTaskWorkerJob(input: {
  readonly category: AgentTaskCategory;
  readonly taskId: string;
  readonly prompt: string;
  readonly model?: string;
  readonly workerRuntime?: WorkerRuntimeKind;
  readonly routeOverrides?: AgentTaskRouteOverrides;
  readonly runtimeModelInventory?: RuntimeModelInventorySnapshot;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly mode?: "plan" | "ask";
  readonly trust?: boolean;
  readonly force?: boolean;
  readonly continueOnFailure?: boolean;
  readonly taskKind?: string;
  readonly approvalMode?: "default" | "auto_edit" | "yolo" | "plan";
  readonly allowedMcpServerNames?: string[] | "none";
  readonly retries?: number;
  readonly retryDelayMs?: number;
}): WorkflowJob {
  const route = resolveAgentTaskRoute(input);
  if (route.workerKind === "gemini") {
    const geminiInput: GeminiWorkerInput = {
      ...(route.workerRuntime !== "mcp" ? { subagentId: newId("subagent") } : {}),
      taskId: input.taskId,
      prompt: input.prompt,
      model: route.model,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.taskKind ? { taskKind: input.taskKind } : {}),
      ...(input.approvalMode ? { approvalMode: input.approvalMode } : {}),
      ...(input.allowedMcpServerNames ? { allowedMcpServerNames: input.allowedMcpServerNames } : {}),
    };
    const interactive = route.workerRuntime !== "mcp";
    return {
      kind: "gemini",
      input: geminiInput,
      routeReason: route.reason,
      ...(route.workerRuntime || interactive ? { workerRuntime: route.workerRuntime ?? "shell" } : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
      ...(interactive ? { dependencies: { runtime: interactiveTmuxGeminiRuntime } } : {}),
      ...(input.continueOnFailure !== undefined ? { continueOnFailure: input.continueOnFailure } : {}),
    };
  }

  const cursorInput: CursorWorkerInput = {
    ...(route.workerRuntime !== "mcp" ? { subagentId: newId("subagent") } : {}),
    taskId: input.taskId,
    prompt: input.prompt,
    model: route.model,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.trust !== undefined ? { trust: input.trust } : {}),
    ...(input.force !== undefined ? { force: input.force } : {}),
  };
  return {
    kind: "cursor",
    input: cursorInput,
    routeReason: route.reason,
    ...(route.workerRuntime ? { workerRuntime: route.workerRuntime } : {}),
    ...(input.retries !== undefined ? { retries: input.retries } : {}),
    ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
    ...(input.continueOnFailure !== undefined ? { continueOnFailure: input.continueOnFailure } : {}),
  };
}

export function resolveEscalatedAgentTaskRoute(input: {
  readonly category: AgentTaskCategory;
  readonly currentModel: string;
  readonly signals: {
    readonly previousAttemptFailed?: boolean;
    readonly verificationRisk?: boolean;
    readonly requiresDeepReasoning?: boolean;
    readonly requiresHigherQualityGemini?: boolean;
    readonly uncertaintyLevel?: "low" | "medium" | "high";
  };
  readonly runtimeModelInventory?: RuntimeModelInventorySnapshot;
}): AgentTaskRoute {
  const inventory = input.runtimeModelInventory;
  if ((input.signals.previousAttemptFailed || input.signals.verificationRisk) && routeDefaults[input.category].workerKind === "cursor") {
    return resolveAgentTaskRoute({ category: input.category, model: pickAvailableModel("claude-opus-4-7-high", ["claude-4.6-opus-high"], inventory).model }).reason === "explicit_model_override"
      ? {
          category: input.category,
          workerKind: "cursor",
          model: pickAvailableModel("claude-opus-4-7-high", ["claude-4.6-opus-high"], inventory).model,
          reason: input.signals.previousAttemptFailed ? "failed_attempt_escalation" : "verification_risk_escalation",
        }
      : {
          category: input.category,
          workerKind: "cursor",
          model: pickAvailableModel("claude-opus-4-7-high", ["claude-4.6-opus-high"], inventory).model,
          reason: input.signals.previousAttemptFailed ? "failed_attempt_escalation" : "verification_risk_escalation",
        };
  }
  if (input.signals.requiresDeepReasoning && routeDefaults[input.category].workerKind === "cursor") {
    return {
      category: input.category,
      workerKind: "cursor",
      model: pickAvailableModel("claude-opus-4-7-thinking-high", ["claude-4.6-opus-high"], inventory).model,
      reason: "deep_reasoning_escalation",
    };
  }
  if (input.signals.requiresHigherQualityGemini && routeDefaults[input.category].workerKind === "gemini") {
    return {
      category: input.category,
      workerKind: "gemini",
      model: pickAvailableModel("gemini-3.1-pro-preview", ["gemini-2.5-pro"], inventory).model,
      reason: "higher_quality_gemini_escalation",
    };
  }
  return resolveAgentTaskRoute({ category: input.category, runtimeModelInventory: inventory });
}
