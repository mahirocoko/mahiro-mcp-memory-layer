import { describe, expect, it } from "vitest";

import { mcpCursorRuntime } from "../src/features/cursor/runtime/mcp/mcp-cursor-runtime.js";
import { resolveCursorWorkerRuntimeDependency } from "../src/features/cursor/runtime/resolve-cursor-runtime.js";
import type { CursorWorkerRuntime } from "../src/features/cursor/runtime/cursor-worker-runtime.js";

describe("resolveCursorWorkerRuntimeDependency", () => {
  it("prefers an explicit runtime over MAHIRO_CURSOR_RUNTIME", () => {
    const explicit: CursorWorkerRuntime = { run: async () => ({}) as never };

    expect(
      resolveCursorWorkerRuntimeDependency(explicit, { MAHIRO_CURSOR_RUNTIME: "mcp" }),
    ).toBe(explicit);
  });

  it("selects MCP runtime when MAHIRO_CURSOR_RUNTIME is mcp and no explicit runtime", () => {
    expect(resolveCursorWorkerRuntimeDependency(undefined, { MAHIRO_CURSOR_RUNTIME: "mcp" })).toBe(
      mcpCursorRuntime,
    );
  });

  it("returns undefined when unset so shell remains the default in runCursorWorker", () => {
    expect(resolveCursorWorkerRuntimeDependency(undefined, {})).toBeUndefined();
    expect(resolveCursorWorkerRuntimeDependency(undefined, { MAHIRO_CURSOR_RUNTIME: "" })).toBeUndefined();
  });
});
