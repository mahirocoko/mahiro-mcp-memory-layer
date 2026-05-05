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
    expect(continuityDebugging).toContain("returnedMemoryIds: []");
    expect(continuityDebugging).toContain("degraded: false");
    expect(continuityDebugging).toContain("degraded: true");
    expect(continuityDebugging).toContain("projectId");
    expect(continuityDebugging).toContain("containerId");

    expect(mcpUsage).toContain("returnedMemoryIds: []");
    expect(mcpUsage).toContain("degraded: false");
  });
});
