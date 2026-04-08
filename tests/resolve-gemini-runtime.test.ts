import { describe, expect, it } from "vitest";

import { mcpGeminiRuntime } from "../src/features/gemini/runtime/mcp/mcp-gemini-runtime.js";
import { resolveGeminiWorkerRuntimeDependency } from "../src/features/gemini/runtime/resolve-gemini-runtime.js";
import type { GeminiWorkerRuntime } from "../src/features/gemini/runtime/gemini-worker-runtime.js";

describe("resolveGeminiWorkerRuntimeDependency", () => {
  it("prefers an injected runtime over MAHIRO_GEMINI_RUNTIME and workerRuntime", () => {
    const explicit: GeminiWorkerRuntime = { run: async () => ({}) as never };

    expect(
      resolveGeminiWorkerRuntimeDependency(explicit, "mcp", { MAHIRO_GEMINI_RUNTIME: "mcp" }),
    ).toBe(explicit);
  });

  it("selects MCP runtime when MAHIRO_GEMINI_RUNTIME is mcp and no injected runtime or selection", () => {
    expect(resolveGeminiWorkerRuntimeDependency(undefined, undefined, { MAHIRO_GEMINI_RUNTIME: "mcp" })).toBe(
      mcpGeminiRuntime,
    );
  });

  it("selects MCP when workerRuntime is mcp even if env is unset", () => {
    expect(resolveGeminiWorkerRuntimeDependency(undefined, "mcp", {})).toBe(mcpGeminiRuntime);
  });

  it("workerRuntime shell overrides MAHIRO_GEMINI_RUNTIME=mcp", () => {
    expect(
      resolveGeminiWorkerRuntimeDependency(undefined, "shell", { MAHIRO_GEMINI_RUNTIME: "mcp" }),
    ).toBeUndefined();
  });

  it("returns undefined when unset so shell remains the default in runGeminiWorker", () => {
    expect(resolveGeminiWorkerRuntimeDependency(undefined, undefined, {})).toBeUndefined();
    expect(resolveGeminiWorkerRuntimeDependency(undefined, undefined, { MAHIRO_GEMINI_RUNTIME: "" })).toBeUndefined();
  });
});
