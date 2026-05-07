import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readRepoDoc(fileName: string) {
  return readFile(path.join(repoRoot, fileName), "utf8");
}

describe("continuity debugging docs", () => {
  it("covers empty vs degraded retrieval guidance without brittle snapshots", async () => {
    const [continuityDebugging, mcpUsage] = await Promise.all([
      readRepoDoc("CONTINUITY_DEBUGGING.md"),
      readRepoDoc("MCP_USAGE.md"),
    ]);

    expect(continuityDebugging).toContain("## Empty vs degraded retrieval");
    expect(continuityDebugging).toContain("no_trace_found");
    expect(continuityDebugging).toContain("empty_success");
    expect(continuityDebugging).toContain("normal_hit");
    expect(continuityDebugging).toContain("degraded_retrieval");
    expect(continuityDebugging).toContain("`contextSize` is the returned item payload size");
    expect(continuityDebugging).toContain("`requestId` only as public input");
    expect(continuityDebugging).toContain("latestScopeFilter");

    expect(mcpUsage).toContain("`requestId` as the public input");
    expect(mcpUsage).toContain("`contextSize` is the returned item text payload size");
    expect(mcpUsage).toContain("`latestScopeFilter` is not a user-facing input");
    expect(mcpUsage).toContain("returnedMemoryIds: []");
  });
});
