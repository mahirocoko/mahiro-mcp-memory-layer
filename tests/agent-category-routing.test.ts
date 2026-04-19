import { describe, expect, it } from "vitest";

import {
  buildAgentTaskWorkerJob,
  resolveEscalatedAgentTaskRoute,
  resolveAgentTaskRoute,
} from "../src/features/orchestration/agent-category-routing.js";
import { interactiveShellGeminiRuntime } from "../src/features/gemini/runtime/shell/shell-gemini-runtime.js";
import type { RuntimeModelInventorySnapshot } from "../src/features/orchestration/runtime-model-inventory.js";

const sampleRuntimeModelInventory: RuntimeModelInventorySnapshot = {
  source: "live",
  fetchedAt: "2026-04-17T13:47:00.000Z",
  cursor: {
    models: ["composer-2", "claude-opus-4-7-high", "claude-opus-4-7-thinking-high", "gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
    modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
    supportsPrint: true,
    supportsCloud: true,
    supportsAcp: true,
  },
};

const fallbackOnlyRuntimeModelInventory: RuntimeModelInventorySnapshot = {
  source: "live",
  fetchedAt: "2026-04-17T13:47:00.000Z",
  cursor: {
    models: ["composer-2", "claude-4.6-sonnet-medium", "claude-4.6-opus-high", "gemini-2.5-pro", "gemini-2.5-flash"],
    modes: ["agent", "plan", "ask", "print"],
    supportsPrint: true,
    supportsCloud: false,
    supportsAcp: false,
  },
};

describe("resolveAgentTaskRoute", () => {
  it("routes visual-engineering to Gemini Pro by default", () => {
    expect(resolveAgentTaskRoute({ category: "visual-engineering" })).toEqual({
      category: "visual-engineering",
      workerKind: "gemini",
      model: "gemini-3-pro-preview",
      reason: "default_visual-engineering_lane",
    });
  });

  it("routes interactive-gemini to Gemini Pro on the shell lane by default", () => {
    expect(resolveAgentTaskRoute({ category: "interactive-gemini" })).toEqual({
      category: "interactive-gemini",
      workerKind: "gemini",
      model: "gemini-3-pro-preview",
      reason: "default_interactive-gemini_lane",
    });
  });

  it("routes ultrabrain to Cursor Opus by default", () => {
    expect(resolveAgentTaskRoute({ category: "ultrabrain" })).toEqual({
      category: "ultrabrain",
      workerKind: "cursor",
      model: "claude-opus-4-7-thinking-high",
      reason: "default_ultrabrain_lane",
    });
  });

  it("routes deep and unspecified-high categories to the primary Opus lane", () => {
    expect(resolveAgentTaskRoute({ category: "deep" })).toEqual({
      category: "deep",
      workerKind: "cursor",
      model: "claude-opus-4-7-high",
      reason: "default_deep_lane",
    });
    expect(resolveAgentTaskRoute({ category: "unspecified-high" })).toEqual({
      category: "unspecified-high",
      workerKind: "cursor",
      model: "claude-opus-4-7-high",
      reason: "default_unspecified-high_lane",
    });
  });

  it("routes artistry to the Gemini fast lane by default", () => {
    expect(resolveAgentTaskRoute({ category: "artistry" })).toEqual({
      category: "artistry",
      workerKind: "gemini",
      model: "gemini-3-flash-preview",
      reason: "default_artistry_lane",
    });
  });

  it("routes general-purpose categories to composer-2 by default", () => {
    expect(resolveAgentTaskRoute({ category: "quick" })).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "composer-2",
      reason: "default_quick_lane",
    });
    expect(resolveAgentTaskRoute({ category: "writing" })).toEqual({
      category: "writing",
      workerKind: "cursor",
      model: "composer-2",
      reason: "default_writing_lane",
    });
  });

  it("lets explicit model and runtime overrides win", () => {
    expect(
      resolveAgentTaskRoute({
        category: "artistry",
        model: "gemini-3-flash-preview",
        workerRuntime: "mcp",
      }),
    ).toEqual({
      category: "artistry",
      workerKind: "gemini",
      model: "gemini-3-flash-preview",
      reason: "explicit_model_override",
      workerRuntime: "mcp",
    });
  });

  it("uses configured category route overrides before falling back to defaults", () => {
    expect(
      resolveAgentTaskRoute({
        category: "quick",
        routeOverrides: {
          quick: {
            model: "claude-opus-4-7-high",
            workerRuntime: "mcp",
          },
        },
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "claude-opus-4-7-high",
      reason: "config_route_override",
      workerRuntime: "mcp",
    });
  });

  it("accepts a runtime model inventory snapshot without changing current defaults", () => {
    expect(
      resolveAgentTaskRoute({
        category: "quick",
        runtimeModelInventory: sampleRuntimeModelInventory,
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "composer-2",
      reason: "default_quick_lane",
    });
  });

  it("falls back to compatibility lanes when preferred models are unavailable at runtime", () => {
    expect(
      resolveAgentTaskRoute({
        category: "ultrabrain",
        runtimeModelInventory: fallbackOnlyRuntimeModelInventory,
      }),
    ).toEqual({
      category: "ultrabrain",
      workerKind: "cursor",
      model: "claude-4.6-opus-high",
      reason: "runtime_fallback_missing_primary_model",
    });

    expect(
      resolveAgentTaskRoute({
        category: "artistry",
        runtimeModelInventory: fallbackOnlyRuntimeModelInventory,
      }),
    ).toEqual({
      category: "artistry",
      workerKind: "gemini",
      model: "gemini-2.5-flash",
      reason: "runtime_fallback_missing_primary_model",
    });
  });
});

describe("buildAgentTaskWorkerJob", () => {
  it("builds Gemini jobs from Gemini-routed categories and preserves Gemini-specific fields", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "visual-engineering",
        taskId: "ui-task",
        prompt: "Design the sidebar.",
        cwd: "/repo",
        timeoutMs: 30_000,
        taskKind: "general",
        approvalMode: "plan",
        allowedMcpServerNames: ["context7"],
        retries: 2,
        retryDelayMs: 750,
      }),
    ).toEqual({
      kind: "gemini",
      input: {
        taskId: "ui-task",
        prompt: "Design the sidebar.",
        model: "gemini-3-pro-preview",
        cwd: "/repo",
        timeoutMs: 30_000,
        taskKind: "general",
        approvalMode: "plan",
        allowedMcpServerNames: ["context7"],
      },
      routeReason: "default_visual-engineering_lane",
      retries: 2,
      retryDelayMs: 750,
    });
  });

  it("injects the interactive tmux Gemini runtime for the interactive-gemini category", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "interactive-gemini",
        taskId: "interactive-task",
        prompt: "Reply once.",
      }),
    ).toEqual({
      kind: "gemini",
      input: {
        taskId: "interactive-task",
        prompt: "Reply once.",
        model: "gemini-3-pro-preview",
      },
      routeReason: "default_interactive-gemini_lane",
      workerRuntime: "shell",
      dependencies: {
        runtime: interactiveShellGeminiRuntime,
      },
    });
  });

  it("lets explicit mcp runtime override disable the interactive tmux Gemini runtime", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "interactive-gemini",
        taskId: "interactive-task",
        prompt: "Reply once.",
        workerRuntime: "mcp",
      }),
    ).toEqual({
      kind: "gemini",
      input: {
        taskId: "interactive-task",
        prompt: "Reply once.",
        model: "gemini-3-pro-preview",
      },
      routeReason: "default_interactive-gemini_lane",
      workerRuntime: "mcp",
    });
  });

  it("builds Cursor jobs from Cursor-routed categories and preserves Cursor-specific fields", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "quick",
        taskId: "code-task",
        prompt: "Review this diff.",
        cwd: "/repo",
        mode: "ask",
        trust: true,
        force: false,
        continueOnFailure: true,
      }),
    ).toEqual({
      kind: "cursor",
      input: {
        taskId: "code-task",
        prompt: "Review this diff.",
        model: "composer-2",
        cwd: "/repo",
        mode: "ask",
        trust: true,
        force: false,
      },
      routeReason: "default_quick_lane",
      continueOnFailure: true,
    });
  });

  it("applies explicit model and runtime overrides without changing the chosen worker family", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "deep",
        taskId: "deep-task",
        prompt: "Investigate this architecture.",
        model: "claude-opus-4-7-high",
        workerRuntime: "mcp",
        mode: "plan",
      }),
    ).toEqual({
      kind: "cursor",
      routeReason: "explicit_model_override",
      workerRuntime: "mcp",
        input: {
          taskId: "deep-task",
          prompt: "Investigate this architecture.",
          model: "claude-opus-4-7-high",
          mode: "plan",
        },
      });
  });

  it("uses route overrides when no explicit model/runtime is provided", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "writing",
        taskId: "doc-task",
        prompt: "Write release notes.",
        routeOverrides: {
          writing: {
            model: "claude-opus-4-7-high",
            workerRuntime: "mcp",
          },
        },
        mode: "plan",
      }),
    ).toEqual({
      kind: "cursor",
      routeReason: "config_route_override",
      workerRuntime: "mcp",
        input: {
          taskId: "doc-task",
          prompt: "Write release notes.",
          model: "claude-opus-4-7-high",
          mode: "plan",
        },
      });
  });

  it("uses runtime-backed fallback selection when building worker jobs", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "ultrabrain",
        taskId: "debug-task",
        prompt: "Explain the root cause.",
        runtimeModelInventory: fallbackOnlyRuntimeModelInventory,
        mode: "plan",
      }),
    ).toEqual({
      kind: "cursor",
      routeReason: "runtime_fallback_missing_primary_model",
      input: {
        taskId: "debug-task",
        prompt: "Explain the root cause.",
        model: "claude-4.6-opus-high",
        mode: "plan",
      },
    });
  });
});

describe("resolveEscalatedAgentTaskRoute", () => {
  it("escalates composer-2 to Opus high for failed or high-risk cursor work", () => {
    expect(
      resolveEscalatedAgentTaskRoute({
        category: "quick",
        currentModel: "composer-2",
        signals: {
          previousAttemptFailed: true,
        },
        runtimeModelInventory: sampleRuntimeModelInventory,
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "claude-opus-4-7-high",
      reason: "failed_attempt_escalation",
    });
  });

  it("escalates Opus high to thinking-high when deep reasoning is required", () => {
    expect(
      resolveEscalatedAgentTaskRoute({
        category: "deep",
        currentModel: "claude-opus-4-7-high",
        signals: {
          requiresDeepReasoning: true,
        },
        runtimeModelInventory: sampleRuntimeModelInventory,
      }),
    ).toEqual({
      category: "deep",
      workerKind: "cursor",
      model: "claude-opus-4-7-thinking-high",
      reason: "deep_reasoning_escalation",
    });
  });

  it("escalates gemini-3-flash to gemini-3.1-pro when higher quality is needed", () => {
    expect(
      resolveEscalatedAgentTaskRoute({
        category: "artistry",
        currentModel: "gemini-3-flash-preview",
        signals: {
          requiresHigherQualityGemini: true,
        },
        runtimeModelInventory: sampleRuntimeModelInventory,
      }),
    ).toEqual({
      category: "artistry",
      workerKind: "gemini",
      model: "gemini-3-pro-preview",
      reason: "higher_quality_gemini_escalation",
    });
  });

  it("falls back to compatibility lanes during escalation when preferred models are unavailable", () => {
    expect(
      resolveEscalatedAgentTaskRoute({
        category: "quick",
        currentModel: "composer-2",
        signals: {
          verificationRisk: true,
        },
        runtimeModelInventory: fallbackOnlyRuntimeModelInventory,
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "claude-4.6-opus-high",
      reason: "verification_risk_escalation",
    });

    expect(
      resolveEscalatedAgentTaskRoute({
        category: "ultrabrain",
        currentModel: "claude-opus-4-7-high",
        signals: {
          requiresDeepReasoning: true,
        },
        runtimeModelInventory: fallbackOnlyRuntimeModelInventory,
      }),
    ).toEqual({
      category: "ultrabrain",
      workerKind: "cursor",
      model: "claude-4.6-opus-high",
      reason: "deep_reasoning_escalation",
    });
  });

  it("keeps the current route when no escalation signal is present", () => {
    expect(
      resolveEscalatedAgentTaskRoute({
        category: "quick",
        currentModel: "composer-2",
        signals: {
          uncertaintyLevel: "low",
        },
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "composer-2",
      reason: "default_quick_lane",
    });
  });
});
