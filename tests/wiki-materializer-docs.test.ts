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


describe("memory boundary docs", () => {
  it("documents that source, docs, and code corpus indexing belongs outside this curated memory package", async () => {
    const [readme, architecture, boundaries, mcpUsage, nextSteps] = await Promise.all([
      readFile(path.join(repoRoot, "README.md"), "utf8"),
      readFile(path.join(repoRoot, "ARCHITECTURE.md"), "utf8"),
      readFile(path.join(repoRoot, "ARCHITECTURE_BOUNDARIES.md"), "utf8"),
      readFile(path.join(repoRoot, "MCP_USAGE.md"), "utf8"),
      readFile(path.join(repoRoot, "AGENT_NEXT_STEPS.md"), "utf8"),
    ]);
    const combined = [readme, architecture, boundaries, mcpUsage, nextSteps].join("\n");

    expect(combined).toContain("cocoindex-code owns source, docs, and code corpus indexing");
    expect(combined).toContain("`mahiro-mcp-memory-layer` owns curated memory only");
    expect(combined).toContain("Do not use this package as a source, docs, or code corpus indexer");
    expect(combined).toContain("`upsert_document` stores curated document-shaped memory only");
    expect(combined).toContain("It is not a source, docs, or code corpus indexing API");
  });

  it("documents authority, evidence, rejected quarantine, and lifecycle boundaries", async () => {
    const [architecture, boundaries, mcpUsage] = await Promise.all([
      readFile(path.join(repoRoot, "ARCHITECTURE.md"), "utf8"),
      readFile(path.join(repoRoot, "ARCHITECTURE_BOUNDARIES.md"), "utf8"),
      readFile(path.join(repoRoot, "MCP_USAGE.md"), "utf8"),
    ]);
    const combined = [architecture, boundaries, mcpUsage].join("\n");

    expect(combined).toContain("Ownership, truth status, freshness, and retrieval eligibility are separate axes");
    expect(combined).toContain("Preferences may be authoritative as user intent");
    expect(combined).toContain("Retrieval traces are diagnostics");
    expect(combined).toContain("Rejected records stay out of normal retrieval/context");
    expect(combined).toContain("Lifecycle helpers are trusted memory persistence and continuity triggers only");
    expect(combined).toContain("They must not expose task execution, worker routing, supervision, executor ownership, or workflow-control state");
  });
});
