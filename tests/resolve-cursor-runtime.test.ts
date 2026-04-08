import { describe, expect, it } from "vitest";

import { mcpCursorRuntime } from "../src/features/cursor/runtime/mcp/mcp-cursor-runtime.js";
import { resolveCursorWorkerRuntimeDependency } from "../src/features/cursor/runtime/resolve-cursor-runtime.js";
import type { CursorWorkerRuntime } from "../src/features/cursor/runtime/cursor-worker-runtime.js";

describe("resolveCursorWorkerRuntimeDependency", () => {
  it("prefers an injected runtime over MAHIRO_CURSOR_RUNTIME and workerRuntime", () => {
    const explicit: CursorWorkerRuntime = { run: async () => ({}) as never };

    expect(
      resolveCursorWorkerRuntimeDependency(explicit, "mcp", { MAHIRO_CURSOR_RUNTIME: "mcp" }),
    ).toBe(explicit);
  });

  it("selects MCP runtime when MAHIRO_CURSOR_RUNTIME is mcp and no injected runtime or selection", () => {
    expect(resolveCursorWorkerRuntimeDependency(undefined, undefined, { MAHIRO_CURSOR_RUNTIME: "mcp" })).toBe(
      mcpCursorRuntime,
    );
  });

  it("selects MCP when workerRuntime is mcp even if env is unset", () => {
    expect(resolveCursorWorkerRuntimeDependency(undefined, "mcp", {})).toBe(mcpCursorRuntime);
  });

  it("workerRuntime shell overrides MAHIRO_CURSOR_RUNTIME=mcp", () => {
    expect(
      resolveCursorWorkerRuntimeDependency(undefined, "shell", { MAHIRO_CURSOR_RUNTIME: "mcp" }),
    ).toBeUndefined();
  });

  it("returns undefined when unset so shell remains the default in runCursorWorker", () => {
    expect(resolveCursorWorkerRuntimeDependency(undefined, undefined, {})).toBeUndefined();
    expect(resolveCursorWorkerRuntimeDependency(undefined, undefined, { MAHIRO_CURSOR_RUNTIME: "" })).toBeUndefined();
  });
});
