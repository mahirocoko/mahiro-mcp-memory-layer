import { describe, expect, it } from "vitest";

import {
  buildAgentTaskWorkerJob,
  resolveAgentTaskRoute,
} from "../src/features/orchestration/agent-category-routing.js";

describe("resolveAgentTaskRoute", () => {
  it("routes visual-engineering to Gemini Pro by default", () => {
    expect(resolveAgentTaskRoute({ category: "visual-engineering" })).toEqual({
      category: "visual-engineering",
      workerKind: "gemini",
      model: "gemini-3.1-pro-preview",
    });
  });

  it("routes ultrabrain to Cursor Opus by default", () => {
    expect(resolveAgentTaskRoute({ category: "ultrabrain" })).toEqual({
      category: "ultrabrain",
      workerKind: "cursor",
      model: "claude-4.6-opus-high",
    });
  });

  it("routes general-purpose categories to composer-2 by default", () => {
    expect(resolveAgentTaskRoute({ category: "quick" })).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "composer-2",
    });
    expect(resolveAgentTaskRoute({ category: "writing" })).toEqual({
      category: "writing",
      workerKind: "cursor",
      model: "composer-2",
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
      workerRuntime: "mcp",
    });
  });

  it("uses configured category route overrides before falling back to defaults", () => {
    expect(
      resolveAgentTaskRoute({
        category: "quick",
        routeOverrides: {
          quick: {
            model: "claude-4.6-opus-high",
            workerRuntime: "mcp",
          },
        },
      }),
    ).toEqual({
      category: "quick",
      workerKind: "cursor",
      model: "claude-4.6-opus-high",
      workerRuntime: "mcp",
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
        model: "gemini-3.1-pro-preview",
        cwd: "/repo",
        timeoutMs: 30_000,
        taskKind: "general",
        approvalMode: "plan",
        allowedMcpServerNames: ["context7"],
      },
      retries: 2,
      retryDelayMs: 750,
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
      continueOnFailure: true,
    });
  });

  it("applies explicit model and runtime overrides without changing the chosen worker family", () => {
    expect(
      buildAgentTaskWorkerJob({
        category: "deep",
        taskId: "deep-task",
        prompt: "Investigate this architecture.",
        model: "claude-4.6-opus-high",
        workerRuntime: "mcp",
        mode: "plan",
      }),
    ).toEqual({
      kind: "cursor",
      workerRuntime: "mcp",
      input: {
        taskId: "deep-task",
        prompt: "Investigate this architecture.",
        model: "claude-4.6-opus-high",
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
            model: "claude-4.6-opus-high",
            workerRuntime: "mcp",
          },
        },
        mode: "plan",
      }),
    ).toEqual({
      kind: "cursor",
      workerRuntime: "mcp",
      input: {
        taskId: "doc-task",
        prompt: "Write release notes.",
        model: "claude-4.6-opus-high",
        mode: "plan",
      },
    });
  });
});
