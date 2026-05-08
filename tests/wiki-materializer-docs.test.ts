import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());

describe("wiki materializer docs", () => {
  it("documents the CLI command and projection boundary in the README", async () => {
    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toContain("bun run wiki:materialize -- --project-id <id> --container-id <id>");
    expect(readme).toContain("generated wiki is a derived projection, not the canonical source of truth");
    expect(readme).toContain("no bidirectional sync");
    expect(readme).toContain("The projection excludes `memory_context` continuity cache data and retrieval traces");
  });

  it("documents the source-of-truth hierarchy in the architecture guide", async () => {
    const architecture = await readFile(path.join(repoRoot, "ARCHITECTURE.md"), "utf8");

    expect(architecture).toContain("Source-of-truth hierarchy");
    expect(architecture).toContain("canonical reviewed memory records");
    expect(architecture).toContain("generated wiki projection");
    expect(architecture).toContain("runtime cache and traces");
    expect(architecture).toContain("The projection excludes `memory_context` continuity cache data and retrieval traces");
  });

  it("keeps the wiki materializer outside the MCP memory tool surface", async () => {
    const mcpUsage = await readFile(path.join(repoRoot, "MCP_USAGE.md"), "utf8");

    expect(mcpUsage).toContain("`wiki:materialize` is a CLI projection command, not an MCP memory tool");
    expect(mcpUsage).toContain("separate from `memory_context`, `runtime_capabilities`, and retrieval traces");
    expect(mcpUsage).toContain("no import path from wiki output back into memory");
    expect(mcpUsage).toContain("Generated wiki files are derived artifacts");
  });
});
