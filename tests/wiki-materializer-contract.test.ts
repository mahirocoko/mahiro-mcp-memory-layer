import path from "node:path";

import { describe, expect, it } from "vitest";

import { paths } from "../src/config/paths.js";
import { getMemoryToolDefinitions } from "../src/features/memory/lib/tool-definitions.js";
import {
  defaultWikiMaterializerFilters,
  resolveWikiOutputDirectory,
  resolveWikiOutputLayout,
  wikiMaterializerSchemaVersion,
  wikiOutputLayout,
  type WikiMaterializerManifest,
} from "../src/features/memory/wiki-materializer/contracts.js";

const wikiToolSurfacePattern = /wiki|materializ/i;

describe("wiki materializer contract", () => {
  it("resolves the default scoped output layout under .agent-state/wiki/<projectSlug>/<containerSlug>", () => {
    const options = { projectSlug: "project-alpha", containerSlug: "container-main" };
    const expectedScopeDirectory = path.join(
      paths.appRoot,
      wikiOutputLayout.stateDirectoryName,
      wikiOutputLayout.wikiDirectoryName,
      options.projectSlug,
      options.containerSlug,
    );
    const layout = resolveWikiOutputLayout(options);

    expect(resolveWikiOutputDirectory(options)).toBe(expectedScopeDirectory);
    expect(layout.scopeDirectory).toBe(expectedScopeDirectory);
    expect(path.relative(paths.appRoot, layout.scopeDirectory).split(path.sep)).toEqual([
      ".agent-state",
      "wiki",
      "project-alpha",
      "container-main",
    ]);
    expect(layout.indexFilePath).toBe(path.join(expectedScopeDirectory, "index.md"));
    expect(layout.logFilePath).toBe(path.join(expectedScopeDirectory, "log.md"));
    expect(layout.manifestFilePath).toBe(path.join(expectedScopeDirectory, "manifest.json"));
    expect(layout.recordsDirectory).toBe(path.join(expectedScopeDirectory, "records"));
    expect(layout.sourcesDirectory).toBe(path.join(expectedScopeDirectory, "sources"));
  });

  it("allows the CLI/test output directory override to replace only the final scope directory", () => {
    const outputDir = path.join(paths.appRoot, ".tmp", "wiki-contract-output");
    const layout = resolveWikiOutputLayout({
      projectSlug: "project-alpha",
      containerSlug: "container-main",
      outputDir,
    });

    expect(layout.scopeDirectory).toBe(path.resolve(outputDir));
    expect(layout.indexFilePath).toBe(path.join(path.resolve(outputDir), "index.md"));
  });

  it("defines the manifest schema version and required manifest fields", () => {
    const manifest: WikiMaterializerManifest = {
      schemaVersion: wikiMaterializerSchemaVersion,
      materializerVersion: "0.0.0-test",
      projectId: "project-alpha",
      containerId: "container-main",
      generatedAt: "2026-05-08T03:42:00.000Z",
      filters: defaultWikiMaterializerFilters,
      records: [],
      includedCount: 0,
      excludedCount: 0,
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(Object.keys(manifest).sort()).toEqual([
      "containerId",
      "excludedCount",
      "filters",
      "generatedAt",
      "includedCount",
      "materializerVersion",
      "projectId",
      "records",
      "schemaVersion",
    ].sort());
    expect(manifest.filters).toMatchObject({
      mode: "verified_only",
      includeVerificationStatuses: ["verified"],
      excludeReviewStatuses: ["pending", "deferred", "rejected"],
    });
  });

  it("does not expose wiki materialization as an MCP memory tool", () => {
    const toolDefinitions = getMemoryToolDefinitions();
    const forbiddenTools = toolDefinitions.filter((tool) => (
      wikiToolSurfacePattern.test(tool.name) || wikiToolSurfacePattern.test(tool.description)
    ));

    expect(forbiddenTools).toEqual([]);
  });
});
