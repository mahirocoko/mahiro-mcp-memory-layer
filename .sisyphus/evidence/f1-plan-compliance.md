VERDICT: APPROVE

# F1 Plan Compliance Audit

Scope audited against `.sisyphus/plans/memory-wiki-materializer.md`, with emphasis on the six required Final Verification Wave F1 checks.

## Verdict

APPROVE. The current branch implements the wiki materializer as a CLI-only, deterministic, one-way projection from canonical durable memory records into scoped Markdown output. I found no plan-compliance blockers and no required fixes for F1.

## Passed checks

### 1. CLI-only surface; no MCP tool or plugin lifecycle ownership

Passed.

Concrete evidence:
- `package.json:42` exposes only the package script `wiki:materialize` as `tsx src/wiki-materializer.ts`.
- `src/wiki-materializer.ts:1-11` is a thin CLI entrypoint around `runWikiMaterializerCli`.
- `src/features/memory/wiki-materializer/cli.ts:31-127` handles CLI flags, materialization mode, and staleness-validation mode.
- `src/features/memory/lib/tool-definitions.ts:53-170` contains only memory tools; no wiki/materializer tool definition is present.
- `src/features/memory/mcp/register-tools.ts:5-12` registers only `getMemoryToolDefinitions()` for standalone MCP.
- `src/features/memory/mcp/server.ts:13-38` registers tools from `getRegisteredMemoryTools()` only.
- `src/features/opencode-plugin/tool-adapter.ts:37-53` exposes memory tools plus `runtime_capabilities` and `memory_context`; no wiki tool is added.
- Static grep over `src/features/opencode-plugin/**/*.ts` and `src/features/memory/mcp/**/*.ts` found no `wiki` or `materializ` matches.
- `tests/wiki-materializer-contract.test.ts:89-96` asserts no MCP memory tool name or description matches wiki/materialization.
- `tests/wiki-materializer-docs.test.ts:28-35` asserts the AI-facing docs keep `wiki:materialize` outside the MCP tool surface.

### 2. One-way projection only; no bidirectional sync/import

Passed.

Concrete evidence:
- `src/features/memory/wiki-materializer/materialize.ts:34-81` selects records, renders pages, builds a manifest, and writes output; it has no import/sync path back into memory.
- `src/features/memory/wiki-materializer/staleness.ts:24-73` validates stale/fresh status by comparing manifest records against current selected canonical records; it does not update wiki pages or memory records.
- `src/features/memory/wiki-materializer/cli.ts:92-103` exposes staleness validation as a read-only mode and returns status without invoking materialization.
- `README.md:57-61`, `ARCHITECTURE.md:92-96`, and `MCP_USAGE.md:58-64` explicitly document generated wiki files as derived artifacts with no bidirectional sync or import path.

### 3. Canonical durable records are the read source; no materialization mutation side effects

Passed.

Concrete evidence:
- `src/features/memory/wiki-materializer/materialize.ts:1,35-43` uses `JsonlLogStore(paths.canonicalLogFilePath)` by default and passes it into `selectWikiCanonicalRecords`.
- `src/features/memory/wiki-materializer/selector.ts:13-15` defines a read-only `WikiCanonicalRecordReader` with only `readAll()`.
- `src/features/memory/wiki-materializer/selector.ts:30-66` reads all canonical records once, filters/sorts them, and returns selected records/counts without writes.
- Grep over `src/features/memory/wiki-materializer/**/*.ts` found no mutation API calls: `remember`, `upsertDocument`/`upsert_document`, `promoteMemory`/`promote_memory`, `reviewMemory`/`review_memory`, or `applyConservativeMemoryPolicy`/`apply_conservative_memory_policy`.
- `tests/wiki-materializer-selector.test.ts:156-181` uses mutation traps and asserts the selector calls only `readAll()`.
- `tests/wiki-materializer-e2e.test.ts:26-57` and `tests/wiki-materializer-e2e.test.ts:59-156` snapshot canonical JSONL before/after materialization and assert it remains unchanged.

### 4. Scoped output `.agent-state/wiki/<projectSlug>/<containerSlug>/` semantics and output override behavior

Passed.

Concrete evidence:
- `src/features/memory/wiki-materializer/contracts.ts:16-24` defines `.agent-state/wiki`, `index.md`, `log.md`, `manifest.json`, `records`, and `sources` layout constants.
- `src/features/memory/wiki-materializer/contracts.ts:173-187` resolves the default output root to `<repo>/.agent-state/wiki/<projectSlug>/<containerSlug>` and lets explicit `outputDir` replace the final scope directory.
- `src/features/memory/wiki-materializer/materialize.ts:67-73` slugifies explicit `projectId` and `containerId`, applies optional `outputDir`, and writes through `writeWikiMaterialization`.
- `src/features/memory/wiki-materializer/writer.ts:36-65` writes the complete tree into the resolved scope directory and reports written paths.
- `src/features/memory/wiki-materializer/writer.ts:110-126` rejects output paths overlapping canonical memory storage and ensures default output stays under the wiki root when no override is provided.
- `tests/wiki-materializer-contract.test.ts:19-55` asserts default scope layout and output override behavior.
- `tests/wiki-materializer-writer.test.ts:28-66` asserts stale generated files are replaced by the new scoped tree.
- `tests/wiki-materializer-cli.test.ts:44-66` asserts CLI output includes resolved target path, manifest path, and counts.

### 5. `memory_context`, retrieval traces, and continuity cache are excluded from durable wiki source data

Passed.

Concrete evidence:
- `src/features/memory/wiki-materializer/materialize.ts:35-43` sources records only from canonical log reader selection.
- `src/features/memory/wiki-materializer/staleness.ts:32-52` validates against the canonical reader selection, not traces or cache.
- Grep over `src/features/memory/wiki-materializer/**/*.ts` found `memory_context`, retrieval trace, trace, continuity, or LanceDB references only in the generated warning text and writer unsafe-path denylist, not as read sources.
- `src/features/memory/wiki-materializer/renderers.ts:9` embeds the generated warning that `memory_context`, retrieval traces, and continuity caches are diagnostics, not durable wiki content.
- `src/features/memory/wiki-materializer/writer.ts:27-34` lists traces and LanceDB paths only as unsafe output destinations to avoid overwriting them.
- `README.md:61`, `ARCHITECTURE.md:96`, and `MCP_USAGE.md:58-60` state the projection excludes `memory_context`, continuity cache, and retrieval traces.
- `tests/wiki-materializer-utils.test.ts:94-121` asserts trace-like/noisy metadata does not affect record hashes.
- `tests/wiki-materializer-docs.test.ts:9-35` asserts docs preserve the cache/trace exclusion boundary.

### 6. Deterministic rendering/hash/slug/writer behavior and manifest/staleness coverage

Passed.

Concrete evidence:
- `src/features/memory/wiki-materializer/selector.ts:55,159-178` sorts selected records deterministically by kind, source URI/title, timestamps, then ID.
- `src/features/memory/wiki-materializer/utils.ts:39-79` canonicalizes JSON values with stable object-key ordering.
- `src/features/memory/wiki-materializer/utils.ts:81-120` provides deterministic filesystem-safe slug helpers for source and scope IDs.
- `src/features/memory/wiki-materializer/utils.ts:122-141` hashes projected record fields only.
- `src/features/memory/wiki-materializer/renderers.ts:37-54,252-259` sorts input records and renders deterministic pages from record fields without LLM synthesis.
- `src/features/memory/wiki-materializer/manifest.ts:25-37` writes schema/materializer version, project/container scope, generated timestamp, filters, records, included/excluded counts, and excluded reason counts.
- `src/features/memory/wiki-materializer/manifest.ts:40-55` writes per-record IDs, page paths, source metadata, source slugs, hashes, and timestamps.
- `src/features/memory/wiki-materializer/staleness.ts:24-73` compares the saved manifest to current canonical selection and reports stale/fresh status.
- `src/features/memory/wiki-materializer/staleness.ts:80-113` detects removed, added, and hash-changed records.
- `src/features/memory/wiki-materializer/writer.ts:45-65` stages output, validates expected files, then replaces the final tree; `writer.ts:66-80` cleans staging and best-effort restores backups on failure.
- `tests/wiki-materializer-utils.test.ts:35-130` covers slug sanitization, collision suffixes, non-ASCII source titles, stable hashes, and hash changes for projected-field changes.
- `tests/wiki-materializer-renderers.test.ts:13-109` covers generated warnings, provenance, missing metadata labels, relative links, source grouping, and deterministic render order.
- `tests/wiki-materializer-staleness.test.ts:24-105` covers fresh validation, stale-on-content/source mutation, added records, and removed records.
- `tests/wiki-materializer-e2e.test.ts:59-156` covers full CLI-to-files materialization, manifest freshness, stale-file cleanup, deterministic reruns except allowed timestamps, scope/filter exclusion, duplicate source titles, non-ASCII titles, and no canonical mutation.

## Failed checks

None.

## Verification commands run

Command:

```bash
rtk bun run typecheck && rtk bun run test && rtk bun run build
```

Result: passed.

Observed summary:
- `tsc -p tsconfig.json --noEmit`: passed.
- `vitest run`: 27 test files passed, 199 tests passed.
- `tsc -p tsconfig.json`: passed.

## Required fixes if reject

None; verdict is APPROVE.
