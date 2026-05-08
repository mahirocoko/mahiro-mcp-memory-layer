## 2026-05-08 - Task 1 contract seam

- The safe internal seam for wiki foundation work is `src/features/memory/wiki-materializer/`, separate from `lib/tool-definitions.ts`, `mcp/register-tools.ts`, and the OpenCode plugin `tool-adapter.ts`.
- Default wiki layout should be resolved from centralized `paths.appRoot` to `.agent-state/wiki/<projectSlug>/<containerSlug>/`; `outputDir` is reserved as a CLI/test override for the final scope directory.
- The no-MCP guard can stay simple and targeted by asserting `getMemoryToolDefinitions()` contains no wiki/materializer tool name or description.

## 2026-05-08 - Deterministic slug/hash utilities

- Source slugs should stay readable by normalizing unsafe filename characters, but the collision suffix should come from a stable hash of source identity plus record id so duplicate titles/URIs do not depend on runtime order.
- Record hashes should use recursive key-sorted JSON over the projected wiki fields only; trace-only metadata must stay out of the hash input so content/verification changes are the meaningful hash boundaries.

## 2026-05-08 - Task 2 scoped selector

- The wiki selector can stay read-only by depending on a narrow `{ readAll(): Promise<readonly MemoryRecord[]> }` seam instead of `CanonicalLogStore`; tests can attach mutation traps to prove append/replace/index-like calls are not used.
- Scope selection should validate `scope: "project"` with both `projectId` and `containerId`, then treat wrong project, wrong container, and global records as `scope_mismatch` for manifest counts.
- Default selector filtering is safest when review-status exclusions are counted before unverified status, so pending/deferred/rejected records get precise manifest exclusion reasons while plain hypotheses remain `unverified`.
- Selector `recordHash` must call `hashWikiMaterializerRecord()` from `utils.ts`; keeping even a small local hash helper risks diverging from manifest/staleness projected-field semantics.

## 2026-05-08 - Task 4 markdown renderers

- Keep the renderer as a pure projection layer that accepts selected records plus filter/count context and returns `WikiGeneratedPage[]`; that keeps writer/CLI integration separate for later tasks.
- Deterministic page order needs to follow the selector's sort contract for record pages and stable source-slug ordering for source pages, otherwise repeated renders with the same selected records can drift.
- Missing wiki-facing metadata should be labeled explicitly as `(missing)` or `(none)` instead of omitted, so minimal records stay provenance-only without inferred filler text.

## 2026-05-08 - Task 5 atomic writer

- The writer works best as a sibling staging-tree writer: generate under a temp directory in the same parent, validate `index.md`, `log.md`, `manifest.json`, `records/`, and `sources/`, then swap the whole directory into place.
- Path safety should block canonical memory directories even when an explicit output override is present, while the default path must still stay under the resolved `.agent-state/wiki` root.

## 2026-05-08 - Task 6 CLI surface

- The CLI should stay fully explicit: require `--project-id` and `--container-id`, derive safe default output slugs locally, and let `--output-dir` remain an override for tests or external projections.
- Success output is most useful when it reports the final scope directory, manifest path, counts, and a short verification hint block, because those are the actionable checks after materialization finishes.
- `--include-hypotheses` is best treated as a direct pass-through to the selector contract, not a new filtering policy in the CLI layer.

## 2026-05-08 - Task 7 manifest staleness

- Staleness validation should rebuild the current manifest view from canonical scoped JSONL records using the saved manifest filter flags, then compare included record IDs and `recordHash` values only; this keeps validation read-only and aligned with selector/hash semantics.
- The CLI validation mode can safely return exit code 2 for stale while still printing a structured status, because stale is an actionable validation result rather than a materialization write failure.

## 2026-05-08 - Task 8 projection boundary docs

- `wiki:materialize` belongs in the docs as a standalone projection command, not in the MCP memory tool surface.
- The package docs now describe generated wiki output as derived from canonical reviewed memory records, and they keep `memory_context` continuity cache data plus retrieval traces outside the wiki projection boundary.

## 2026-05-08 - Task 9 e2e materializer verification

- The e2e seam can stay hermetic by using a temp `JsonlLogStore` plus `runWikiMaterializerCli()` dependency injection; this exercises real canonical JSONL append/read and the CLI/materializer/writer/staleness flow without touching user `.agent-state`.
- Deterministic rerun assertions should snapshot generated wiki files and normalize only `manifest.generatedAt` plus rendered `generated at` lines, so source pages, record pages, filters, hashes, and paths must remain byte-stable.
- Duplicate source titles are best asserted through manifest `sourceSlug` uniqueness and generated `sources/<slug>.md` pages, because the slug contract intentionally includes a stable identity hash rather than relying on display title uniqueness.

## 2026-05-08 - Final Verification Wave F4 scope fidelity

- Scope-fidelity review evidence should cite both docs and implementation: docs establish source-of-truth and one-way projection boundaries, while `selector.ts`, `materialize.ts`, `writer.ts`, and focused tests prove exact scope filtering, read-only canonical access, trace/cache exclusion, and deterministic field passthrough.
- The strongest no-synthesis evidence is the renderer contract plus tests for explicit `(missing)` labels; wiki output should remain a direct projection of selected memory record fields, not a summarization or inference layer.

## F1 plan compliance audit — 2026-05-08

- Final compliance audit approved the implementation against the memory wiki materializer plan: CLI-only surface, one-way projection, canonical JSONL read source, scoped `.agent-state/wiki/<projectSlug>/<containerSlug>/` output, cache/trace exclusion, deterministic rendering/hash/slug/writer behavior, and manifest/staleness coverage all passed.
- Verification command passed: `rtk bun run typecheck && rtk bun run test && rtk bun run build` (27 test files, 199 tests).
- Evidence written to `.sisyphus/evidence/f1-plan-compliance.md`.

## 2026-05-08 F3 manual QA

- Ran wiki materializer manual QA with explicit scope `f3-manual-qa-project` / `f3-manual-qa-container` and temp output under /var/folders/.../opencode/f3-manual-qa/wiki-output. Materialization produced index/log/manifest plus one record and one source page.
- Confirmed canonical JSONL hash did not change during materialization, staleness fresh returned exit 0, controlled appended record returned stale with `record_added` and exit 2, and missing-arg/unsafe-output paths returned exit 1 with clear errors.
- Restored `data/log/canonical-log.jsonl` from the pre-QA backup after the controlled fixture changes. Evidence report: `.sisyphus/evidence/f3-manual-qa.md`.

## 2026-05-08 - F2 remediation

- Source grouping now has a single implementation seam in `source-groups.ts`; renderers and manifest rows both consume the same source identity -> slug mapping so multi-record source pages cannot diverge from `manifest.records[*].sourceSlug`.
- Source slugs are identity-based over `{ type, uri, title }`, not memory-record-ID-based, which keeps identical source records grouped under one emitted `sources/<slug>.md` page while preserving deterministic collision suffixes for different identities.
- Explicit wiki output overrides should be treated as destructive replacements: allow temp/output roots and the default wiki root, but reject repo root, app-root ancestors, and non-wiki repo paths before staging begins.

## 2026-05-08 - F2 final code-quality re-review

- Re-review approved the F2 remediation: `source-groups.ts` is now the shared seam for source-page slugs, and manifest `sourceSlug` values align with emitted `sources/<slug>.md` pages for identical source identities.
- Explicit `--output-dir` safety is enforced before staging or replacement in `writer.ts`, with writer and CLI regression tests covering repo root, app-root ancestors, `.sisyphus`, source/test paths, and canonical memory storage overlap.
- Final verification passed: `rtk bun run typecheck`, `rtk bun run test` (27 files, 202 tests), and `rtk bun run build`. Evidence written to `.sisyphus/evidence/f2-code-quality.md`.
