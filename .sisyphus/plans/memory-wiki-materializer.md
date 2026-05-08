# Memory Wiki Materializer

## TL;DR
> **Summary**: Add a thin, deterministic, one-way Markdown wiki materializer on top of the existing memory engine. The core memory layer remains canonical; generated wiki files are human-readable projections with manifest-backed provenance and staleness checks.
> **Deliverables**:
> - CLI-only materialization command for explicit `projectId` + `containerId` scopes
> - Read-only canonical memory record selector with verified/non-rejected defaults
> - Markdown writer for scoped `index.md`, `log.md`, record pages, source pages, and manifest
> - Staleness/manifest validation and deterministic regeneration tests
> - Documentation that defines source-of-truth and wiki projection boundaries
> **Effort**: Medium
> **Parallel**: YES - 3 implementation waves + final verification wave
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 6 → Task 8

## Context

### Original Request

The user asked to plan an architecture direction based on this recommendation:

> Add a thin, derived memory-wiki / wiki materializer layer. Do not rewrite the core mcp-memory-layer. The MVP should be one-way: memory/doc/reviewed records → generated Markdown wiki. The wiki should be treated as a readable projection, not the source of truth.

### Interview Summary

- The current `mahiro-mcp-memory-layer` package is memory-only and must remain the memory engine/kernel.
- The wiki layer should be a generated human-readable materialized view, not a new canonical database.
- The first MVP must be one-way only: canonical memory/doc/reviewed records → generated Markdown.
- The materializer must preserve project/container scoping and must not export runtime continuity cache or retrieval traces as durable knowledge.
- The implementation should align with Karpathy's LLM Wiki idea by separating raw/source material from accumulated Markdown synthesis, while adapting it to this repo's stronger canonical memory/review/scoping contracts.

### Metis Review (gaps addressed)

Metis identified and this plan fixes these gaps:

- **Invocation surface**: CLI-only MVP, not a new MCP tool or plugin runtime behavior.
- **Filtering semantics**: default includes only `verificationStatus === "verified"`; excludes `reviewStatus === "rejected"`, `"pending"`, and `"deferred"` by default.
- **Input boundary**: read canonical durable memory records only; exclude `memory_context`, retrieval traces, continuity cache, and transient session state.
- **Output contract**: scoped wiki under `.agent-state/wiki/<projectSlug>/<containerSlug>/` with `index.md`, `log.md`, `records/`, `sources/`, `manifest.json`.
- **Atomic writes**: generate into a temp directory and atomically replace the target scope directory.
- **Staleness**: manifest must include source record IDs, hashes, timestamps, filter settings, schema/materializer version, included/excluded counts.
- **Scope creep control**: no bidirectional sync, no LLM synthesis/topic clustering in MVP, no mutation of memory records.

## Work Objectives

### Core Objective

Implement a CLI-only, deterministic, one-way Markdown wiki materializer that reads canonical memory records for an explicit project/container scope and writes a rebuildable, provenance-rich wiki projection without mutating memory storage.

### Deliverables

- New materializer module that selects records from canonical log-backed memory state.
- New CLI/script entrypoint invoked through `bun run wiki:materialize -- --project-id <id> --container-id <id>`.
- Generated wiki structure:
  ```txt
  .agent-state/wiki/<projectSlug>/<containerSlug>/
    index.md
    log.md
    manifest.json
    records/<memory-id>.md
    sources/<source-slug>.md
  ```
- Deterministic slugging/sorting/hashing utilities.
- Atomic output write flow with stale-file cleanup.
- Tests for scope isolation, filtering, deterministic output, provenance, staleness detection, and no memory mutation.
- Docs update explaining wiki projection boundaries and source-of-truth hierarchy.

### Definition of Done (verifiable conditions with commands)

- `bun run wiki:materialize -- --project-id test-project --container-id test-container --output-dir <temp>` generates the expected wiki structure from seeded canonical records in tests.
- `bun run typecheck` passes.
- `bun run test` passes.
- `bun run build` passes.
- Tests prove records from other project/container scopes are excluded.
- Tests prove pending/deferred/rejected records are excluded by default.
- Tests prove the materializer does not call or trigger memory mutation flows (`remember`, `upsert_document`, `promote_memory`, `review_memory`).
- Generated Markdown pages clearly state they are generated projections and not source of truth.
- Manifest can detect stale wiki output by comparing current canonical record hashes against stored hashes.

### Must Have

- CLI-only MVP.
- Explicit `--project-id` and `--container-id` required.
- Default filter: include verified records only; exclude rejected, pending, and deferred records.
- Optional `--include-hypotheses` may include `verificationStatus === "hypothesis"` records only in a clearly marked `hypotheses/` section or with explicit status labels; if this option is too large for MVP, omit it entirely rather than weakening defaults.
- Deterministic output: same canonical records + same options produce same file contents except for isolated `generatedAt` metadata in `manifest.json` and `log.md`.
- Every generated page includes provenance: memory ID, kind, verification status, review status, source type/URI/title when present, record timestamps.
- Atomic write: write to temp path first, then replace final scope directory.
- Manifest schema version and materializer version.
- Documentation that wiki is projection/cache, not canonical truth.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- MUST NOT rewrite core memory storage into Markdown.
- MUST NOT make Markdown wiki canonical database.
- MUST NOT add bidirectional Markdown sync/import in MVP.
- MUST NOT call mutation APIs from materializer: `remember`, `upsert_document`, `promote_memory`, `review_memory`, `apply_conservative_memory_policy`.
- MUST NOT export `memory_context`, session continuity cache, retrieval traces, or runtime diagnostics as durable wiki knowledge.
- MUST NOT auto-run after `upsert_document` in MVP.
- MUST NOT mix global/project/container scopes.
- MUST NOT export records without explicit `projectId` and `containerId`.
- MUST NOT flatten hypothesis/pending/rejected records beside verified records without status labels.
- MUST NOT introduce LLM-generated synthesis/topic clustering in MVP; deterministic formatting only.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after with the existing Bun test infrastructure.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`.
- Repo default verification order from `AGENTS.md`: `bun run typecheck`, `bun run test`, `bun run build`.

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 foundation contract, Task 2 record selector, Task 3 slug/hash utilities
Wave 2: Task 4 Markdown renderers, Task 5 atomic writer, Task 6 CLI entrypoint
Wave 3: Task 7 manifest/staleness validation, Task 8 docs + package script, Task 9 integration/e2e test coverage

### Dependency Matrix (full, all tasks)

| Task | Depends On | Blocks |
| --- | --- | --- |
| 1. Define wiki materializer contract | None | 2, 4, 5, 6, 7, 8, 9 |
| 2. Implement scoped canonical record selector | 1 | 4, 6, 7, 9 |
| 3. Implement deterministic slug/hash utilities | 1 | 4, 5, 7, 9 |
| 4. Implement Markdown projection renderers | 1, 2, 3 | 5, 6, 9 |
| 5. Implement atomic wiki writer | 1, 3, 4 | 6, 7, 9 |
| 6. Add CLI command surface | 1, 2, 4, 5 | 9 |
| 7. Add manifest staleness validation | 1, 2, 3, 5 | 9 |
| 8. Document boundaries and usage | 1, 6, 7 | 9 |
| 9. Add integration/e2e verification | 2, 4, 5, 6, 7, 8 | Final verification |

### Agent Dispatch Summary (wave → task count → categories)

- Wave 1 → 3 tasks → `ultrabrain`, `deep`, `quick`
- Wave 2 → 3 tasks → `deep`, `quick`, `quick`
- Wave 3 → 3 tasks → `deep`, `writing`, `deep`
- Final → 4 review tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Define wiki materializer contract and file layout

  **What to do**: Create the internal TypeScript contract for the MVP materializer: options, selected record shape, manifest shape, generated page shape, output layout constants, and filtering enum/flags. Lock output path to `.agent-state/wiki/<projectSlug>/<containerSlug>/` by default, with test-only/CLI `--output-dir` override. Define schema version as `1`. Keep it internal; do not add MCP tool definitions.
  **Must NOT do**: Do not add a new MCP tool. Do not call memory mutation APIs. Do not introduce LLM synthesis or topic clustering.

  **Recommended Agent Profile**:
  - Category: `ultrabrain` - Reason: establishes source-of-truth boundaries and downstream contracts.
  - Skills: [] - No extra skill needed.
  - Omitted: [`uncodixify`, `frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 4, 5, 6, 7, 8, 9 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `README.md:3-7` - package is memory-only and must not become workflow/runtime ownership.
  - Pattern: `ARCHITECTURE.md:20-24` - architecture separates log, index, traces, and continuity cache.
  - Pattern: `ARCHITECTURE.md:72-80` - canonical JSONL, LanceDB, trace, and cache boundaries.
  - API/Type: `src/features/memory/types.ts:29-47` - `MemoryRecord` fields to project.
  - API/Type: `src/features/memory/schemas.ts:26-44` - verification/review schema fields.
  - API/Type: `src/config/paths.ts:10-18` - existing data path conventions.
  - External: `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f` - Karpathy LLM Wiki separates raw sources from generated wiki artifact; implementation details are domain-specific.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Contract types compile under `bun run typecheck`.
  - [ ] Tests assert the default wiki output layout is `.agent-state/wiki/<projectSlug>/<containerSlug>/`.
  - [ ] Tests assert there is no new exported MCP tool definition for wiki materialization.
  - [ ] Tests or static assertions prove manifest schema includes `schemaVersion`, `materializerVersion`, `projectId`, `containerId`, `generatedAt`, `filters`, `records`, `includedCount`, `excludedCount`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Contract compiles and exposes expected manifest fields
    Tool: Bash
    Steps: Run `rtk bun run typecheck` and the targeted test file for wiki contract.
    Expected: Typecheck exits 0; targeted tests assert manifest/layout fields.
    Evidence: .sisyphus/evidence/task-1-contract.txt

  Scenario: No accidental MCP tool surface
    Tool: Bash
    Steps: Run a targeted search/test that fails if `wiki` materialization appears in memory tool definitions.
    Expected: No new `wiki` MCP tool is exposed.
    Evidence: .sisyphus/evidence/task-1-no-mcp-tool.txt
  ```

  **Commit**: YES | Message: `feat(wiki): define materializer contract` | Files: [new internal materializer contract files, targeted tests]

- [x] 2. Implement scoped canonical record selector

  **What to do**: Implement a read-only selector that loads canonical memory records and filters by exact `projectId` + `containerId`. Default selection includes only `verificationStatus === "verified"` and excludes `reviewStatus` values `"pending"`, `"deferred"`, and `"rejected"`. Include `kind: "doc"` and other verified durable memory kinds. Sort deterministically by `kind`, source URI/title, `createdAt`, `updatedAt`, then stable `id`. Return excluded counts by reason for manifest.
  **Must NOT do**: Do not read from LanceDB as source of truth. Do not read retrieval traces. Do not read `memory_context`. Do not mutate JSONL.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: needs correctness around canonical storage, filters, and scoping.
  - Skills: [] - No extra skill needed.
  - Omitted: [`frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 6, 7, 9 | Blocked By: 1

  **References**:
  - Pattern: `src/features/memory/log/jsonl-log-store.ts:11-14` - canonical append/read pattern.
  - Pattern: `src/features/memory/log/jsonl-log-store.ts:69-82` - canonical replacement behavior; selector must be read-only.
  - Pattern: `src/features/memory/core/upsert-document.ts:57-72` - documents are stored as project-scoped `kind: "doc"` records.
  - Pattern: `src/features/memory/lib/scope.ts:3-16` - project scope requires both `projectId` and `containerId`.
  - Pattern: `src/features/memory/index/memory-records-table.ts:137-140` - existing retrieval filtering reinforces scope matching; do not use index as truth.
  - API/Type: `src/features/memory/types.ts:29-47` - selected record source fields.

  **Acceptance Criteria**:
  - [ ] Selector returns only records matching exact `projectId` and `containerId`.
  - [ ] Selector excludes pending/deferred/rejected records by default.
  - [ ] Selector excludes unverified hypotheses by default.
  - [ ] Selector reports included/excluded counts by reason.
  - [ ] Selector performs no writes to canonical log or index.

  **QA Scenarios**:
  ```
  Scenario: Scope isolation
    Tool: Bash
    Steps: Run targeted selector tests with records across two project/container pairs.
    Expected: Output contains only records for the requested pair; excluded counts include scope mismatches.
    Evidence: .sisyphus/evidence/task-2-scope.txt

  Scenario: Review/verification filtering
    Tool: Bash
    Steps: Run targeted selector tests with verified, hypothesis, pending, deferred, and rejected records.
    Expected: Default output includes only verified non-rejected/non-pending/non-deferred records.
    Evidence: .sisyphus/evidence/task-2-filters.txt
  ```

  **Commit**: YES | Message: `feat(wiki): select scoped verified records` | Files: [selector module, selector tests]

- [x] 3. Implement deterministic slug and source hash utilities

  **What to do**: Add utilities for filename-safe slugs, collision suffixing, and source record hashing. Slugs must preserve readability but sanitize filesystem-unsafe characters. Non-ASCII titles/content must be supported; filenames may be normalized/transliterated/fallback to ID. Hash input must be canonical JSON over fields that affect wiki content: id, kind, scope, projectId, containerId, source, content, summary, tags, verificationStatus, reviewStatus, verifiedAt, verificationEvidence, updatedAt. Use stable object key ordering.
  **Must NOT do**: Do not hash retrieval rank, traces, or continuity cache. Do not use random IDs or wall-clock time in slugs.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused utility work with clear test cases.
  - Skills: [] - No extra skill needed.
  - Omitted: [`deep-research`] - No external research needed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 7, 9 | Blocked By: 1

  **References**:
  - API/Type: `src/features/memory/types.ts:23-27` - source metadata fields for slug/hash.
  - API/Type: `src/features/memory/types.ts:29-47` - record fields for hash.
  - Pattern: `src/features/memory/core/upsert-document.ts:17-29` - source URI/title identity and collision risk.
  - Pattern: `src/features/memory/lib/tool-definitions.ts:99-101` - title-only identity can collide; slug collisions must be handled.

  **Acceptance Criteria**:
  - [ ] Same input records always produce same hashes.
  - [ ] Slug collisions produce stable suffixes.
  - [ ] Missing source title/URI falls back to stable memory ID.
  - [ ] Non-ASCII source titles do not crash and produce valid paths.

  **QA Scenarios**:
  ```
  Scenario: Stable slugs and collision suffixes
    Tool: Bash
    Steps: Run targeted slug utility tests with duplicate titles and duplicate source URIs.
    Expected: Filenames are deterministic and unique.
    Evidence: .sisyphus/evidence/task-3-slugs.txt

  Scenario: Hash changes only when projected content changes
    Tool: Bash
    Steps: Run targeted hash tests with identical records, changed content, changed trace-only metadata, and changed verification status.
    Expected: Identical records hash equally; projected field changes alter hash; trace-only data is not part of hash.
    Evidence: .sisyphus/evidence/task-3-hashes.txt
  ```

  **Commit**: YES | Message: `feat(wiki): add deterministic projection utilities` | Files: [slug/hash utility module, utility tests]

- [x] 4. Implement Markdown projection renderers

  **What to do**: Implement deterministic renderers for `index.md`, `log.md`, `records/<memory-id>.md`, and `sources/<source-slug>.md`. Every Markdown file must start with a generated-projection warning. Record pages must include memory ID, kind, scope, verification status, review status, source metadata, tags, summary, content, and verification evidence if present. Source pages must group records by stable source identity and link to record pages. `index.md` must link to all sections and summarize included/excluded counts. `log.md` must contain materialization history for the current generation only or append-like generated entries derived from manifest history if available; do not treat it as canonical history.
  **Must NOT do**: Do not perform LLM synthesis. Do not infer facts beyond record fields. Do not flatten rejected/pending records into verified pages.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: output must preserve provenance and truth boundaries.
  - Skills: [] - No extra skill needed.
  - Omitted: [`uncodixify`] - Markdown content, not UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6, 9 | Blocked By: 1, 2, 3

  **References**:
  - Pattern: `README.md:3-7` - package is memory-only; page warning must match this boundary.
  - Pattern: `ARCHITECTURE.md:135-143` - review hints are advisory; pages must not overstate advisory data.
  - Pattern: `MCP_USAGE.md:75-104` - `memory_context` is cache inspection, not durable memory.
  - API/Type: `src/features/memory/types.ts:29-47` - record content fields.
  - External: `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f` - wiki artifact includes index/log/topic/source-style pages; this MVP implements deterministic record/source/index/log pages first.

  **Acceptance Criteria**:
  - [ ] Every Markdown file begins with generated-projection warning.
  - [ ] Record pages contain memory ID, scope, statuses, source metadata, and content.
  - [ ] Source pages group records by source identity with collision-safe slugs.
  - [ ] Index links are relative and valid for generated files.
  - [ ] Rendering is deterministic for the same selected records.

  **QA Scenarios**:
  ```
  Scenario: Verified record page provenance
    Tool: Bash
    Steps: Run targeted renderer tests for a verified doc record with source URI/title/evidence.
    Expected: Markdown includes warning, memory ID, project/container scope, source metadata, statuses, evidence, and content.
    Evidence: .sisyphus/evidence/task-4-record-page.txt

  Scenario: No LLM synthesis or unsupported inference
    Tool: Bash
    Steps: Run renderer tests with records containing only minimal fields.
    Expected: Output uses only provided fields and labels missing source metadata explicitly.
    Evidence: .sisyphus/evidence/task-4-no-inference.txt
  ```

  **Commit**: YES | Message: `feat(wiki): render scoped markdown projection` | Files: [renderer module, renderer tests]

- [x] 5. Implement atomic wiki writer

  **What to do**: Implement filesystem writer that renders all wiki files to a temporary directory under the same parent, validates expected files exist, then atomically replaces the final scoped wiki directory. Remove stale generated files by replacing the whole scoped directory, not by selective deletion. Support CLI/test `--output-dir` override. Ensure parent directories are created. Preserve no user-edited generated files; generated directory is disposable by contract.
  **Must NOT do**: Do not write outside `.agent-state/wiki/<projectSlug>/<containerSlug>/` unless `--output-dir` is explicitly provided. Do not partially update final output. Do not touch `.agent-state/raw`, `.agent-state/memory`, canonical log, LanceDB, traces, or `.sisyphus`.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused filesystem implementation with atomicity tests.
  - Skills: [] - No extra skill needed.
  - Omitted: [`librarian`] - No external docs needed if using existing Bun/Node fs APIs.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 6, 7, 9 | Blocked By: 1, 3, 4

  **References**:
  - Pattern: `src/config/paths.ts:10-18` - existing path centralization pattern.
  - Pattern: `ARCHITECTURE.md:74-80` - must not confuse generated wiki with canonical log/index/traces.
  - Guardrail: Metis review - atomic output writes required to avoid partial materialization.

  **Acceptance Criteria**:
  - [ ] Writer creates full scoped wiki structure in temp output.
  - [ ] Writer replaces stale final directory atomically enough for local filesystem use.
  - [ ] Interrupted/failed render leaves previous final wiki intact in tests.
  - [ ] Writer refuses unsafe output paths that would overwrite canonical memory directories.

  **QA Scenarios**:
  ```
  Scenario: Atomic replacement removes stale files
    Tool: Bash
    Steps: Run writer tests with an existing stale file in target directory, then materialize new output.
    Expected: Stale file is gone; all expected new files exist.
    Evidence: .sisyphus/evidence/task-5-stale-cleanup.txt

  Scenario: Failed generation preserves previous output
    Tool: Bash
    Steps: Run writer test that injects a render/write failure before replace.
    Expected: Existing final wiki directory remains unchanged.
    Evidence: .sisyphus/evidence/task-5-atomic-failure.txt
  ```

  **Commit**: YES | Message: `feat(wiki): write projection atomically` | Files: [writer module, writer tests]

- [x] 6. Add CLI command surface and package script

  **What to do**: Add a CLI entrypoint for materialization and wire it through `package.json` as `wiki:materialize`. Required args: `--project-id`, `--container-id`. Optional args: `--output-dir`, `--include-hypotheses` only if Task 1 implemented it explicitly; otherwise omit. CLI should print generated path, included/excluded counts, manifest path, and verification hints. CLI must exit non-zero for missing scope args, unsafe output path, or materialization failure.
  **Must NOT do**: Do not add plugin-native lifecycle hooks. Do not add a memory MCP tool. Do not run automatically after `upsert_document`.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: CLI wiring and argument validation.
  - Skills: [] - No extra skill needed.
  - Omitted: [`frontend-ui-ux`] - No frontend.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 1, 2, 4, 5

  **References**:
  - Pattern: `README.md:90-99` - command list style.
  - Pattern: `package.json` - existing script shape; preserve repo-native command style.
  - Pattern: `src/features/opencode-plugin/resolve-scope.ts:58-90` - scope naming conventions; CLI uses explicit IDs, not implicit runtime resolution.
  - Pattern: `ARCHITECTURE_BOUNDARIES.md:60-64` - memory-only boundary; CLI is projection tooling, not workflow ownership.

  **Acceptance Criteria**:
  - [ ] `bun run wiki:materialize -- --project-id X --container-id Y --output-dir <tmp>` runs successfully in tests/fixtures.
  - [ ] Missing `--project-id` exits non-zero with clear message.
  - [ ] Missing `--container-id` exits non-zero with clear message.
  - [ ] CLI output prints target path and manifest path.
  - [ ] No plugin lifecycle or MCP tool surface is added.

  **QA Scenarios**:
  ```
  Scenario: CLI materializes scoped wiki
    Tool: Bash
    Steps: Run the CLI against test-seeded data with explicit project/container and temp output dir.
    Expected: Exit 0; stdout includes target path, manifest path, included/excluded counts.
    Evidence: .sisyphus/evidence/task-6-cli-success.txt

  Scenario: CLI rejects missing scope
    Tool: Bash
    Steps: Run CLI without `--container-id`.
    Expected: Exit non-zero; stderr says `--container-id` is required; no wiki files are written.
    Evidence: .sisyphus/evidence/task-6-cli-missing-scope.txt
  ```

  **Commit**: YES | Message: `feat(wiki): add materialize cli` | Files: [CLI entrypoint, package.json script, CLI tests]

- [x] 7. Add manifest and staleness validation

  **What to do**: Write `manifest.json` for each generated scoped wiki. Manifest must include `schemaVersion`, `materializerVersion`, `projectId`, `containerId`, `generatedAt`, `filters`, `records` with IDs/hashes/timestamps/source metadata/page path, `includedCount`, `excludedCount`, and excluded reason counts. Add validation utility or CLI mode that compares manifest hashes against current canonical records for the same scope and returns stale/fresh status.
  **Must NOT do**: Do not use LanceDB rows, traces, or continuity cache for staleness. Do not update wiki pages during validation unless materialization is explicitly invoked.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: manifest defines rebuildability and stale detection correctness.
  - Skills: [] - No extra skill needed.
  - Omitted: [`librarian`] - Repo-local correctness only.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8, 9 | Blocked By: 1, 2, 3, 5

  **References**:
  - Pattern: `src/features/memory/types.ts:387-404` - retrieval trace fields are diagnostics; do not use as staleness truth.
  - Pattern: `MCP_USAGE.md:96-102` - `contextSize`/trace fields are not rendered context or continuity-cache size.
  - Pattern: `src/features/memory/memory-service.ts:609-645` - review freshness uses evidence-origin timestamps; avoid treating bookkeeping-only updates as truth unless projected fields changed.
  - Guardrail: Metis review - manifest must include source hashes and filter settings.

  **Acceptance Criteria**:
  - [ ] Manifest is valid JSON and includes required fields.
  - [ ] Manifest record hashes match deterministic hash utility output.
  - [ ] Validation reports fresh when canonical records are unchanged.
  - [ ] Validation reports stale when included record content/status/source fields change.
  - [ ] Validation reports stale when records matching default filters are added/removed.

  **QA Scenarios**:
  ```
  Scenario: Fresh manifest validation
    Tool: Bash
    Steps: Materialize a fixture wiki, then immediately run staleness validation.
    Expected: Validation exits 0 and reports fresh.
    Evidence: .sisyphus/evidence/task-7-fresh.txt

  Scenario: Stale manifest after canonical record change
    Tool: Bash
    Steps: Materialize fixture, change a projected canonical record in test setup, then run validation.
    Expected: Validation exits non-zero or returns stale status with changed memory ID.
    Evidence: .sisyphus/evidence/task-7-stale.txt
  ```

  **Commit**: YES | Message: `feat(wiki): validate projection manifest` | Files: [manifest module, validation utility/CLI mode, tests]

- [x] 8. Document wiki projection boundaries and usage

  **What to do**: Update human-facing and AI-facing docs with a concise section for the memory wiki materializer. `README.md` should mention the command and projection nature. `ARCHITECTURE.md` should define source-of-truth hierarchy: raw sources/original materials, canonical reviewed memory records, derived LanceDB index, generated wiki, runtime cache/traces. `MCP_USAGE.md` should state that the wiki is not an MCP memory tool and must not be confused with `memory_context` or retrieval traces. Add a generated-file warning template to docs.
  **Must NOT do**: Do not promise bidirectional sync, automatic generation, Obsidian-only behavior, workflow ownership, or new MCP tools.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: docs must express boundaries precisely.
  - Skills: [] - No extra skill needed.
  - Omitted: [`deep-research`] - External LLM Wiki citation can be included only if already documented; no need for more research.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9 | Blocked By: 1, 6, 7

  **References**:
  - Pattern: `README.md:3-7` - package identity and memory-only boundary.
  - Pattern: `README.md:90-99` - command reference format.
  - Pattern: `ARCHITECTURE.md:145-148` - separation supports derived projections.
  - Pattern: `ARCHITECTURE.md:175-183` - raw/verbatim/source fanout is not shipped without privacy/review/scope work.
  - Pattern: `MCP_USAGE.md:75-104` - cache/diagnostics boundaries.
  - Pattern: `CONTINUITY_DEBUGGING.md:58-62` - durable memory vs continuity cache boundary.

  **Acceptance Criteria**:
  - [ ] README documents `bun run wiki:materialize -- --project-id <id> --container-id <id>`.
  - [ ] Docs explicitly say generated wiki is projection/cache, not source of truth.
  - [ ] Docs explicitly say no bidirectional sync/import in MVP.
  - [ ] Docs explicitly say continuity cache and retrieval traces are excluded from wiki materialization.
  - [ ] Docs do not promise unimplemented automatic generation or MCP tools.

  **QA Scenarios**:
  ```
  Scenario: Docs contain required boundary statements
    Tool: Bash
    Steps: Run targeted docs tests or grep assertions for projection/source-of-truth/no-bidirectional/no-cache-export statements.
    Expected: Required statements are present in README/ARCHITECTURE/MCP_USAGE.
    Evidence: .sisyphus/evidence/task-8-doc-boundaries.txt

  Scenario: Docs do not promise unsupported features
    Tool: Bash
    Steps: Run targeted grep assertions for forbidden phrases such as automatic wiki generation, bidirectional sync, wiki MCP tool.
    Expected: Unsupported promises are absent or explicitly marked future/non-MVP.
    Evidence: .sisyphus/evidence/task-8-no-overpromise.txt
  ```

  **Commit**: YES | Message: `docs(wiki): document projection boundaries` | Files: [README.md, ARCHITECTURE.md, MCP_USAGE.md, targeted docs tests if existing]

- [x] 9. Add integration/e2e materializer verification

  **What to do**: Add end-to-end tests that seed canonical memory records, run the CLI/materializer, inspect generated files, validate manifest freshness, and confirm no canonical memory mutation occurred. Cover empty scope, duplicate source titles, missing source metadata, non-ASCII titles, large content handling, rejected/pending/deferred filtering, cross-scope isolation, stale-file cleanup, and deterministic reruns.
  **Must NOT do**: Do not rely on a real user home `.agent-state`. Use temp directories/fixtures. Do not use network. Do not require human inspection.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: comprehensive verification across storage, CLI, files, and docs.
  - Skills: [] - No extra skill needed.
  - Omitted: [`playwright`] - No browser/UI.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: final verification | Blocked By: 2, 4, 5, 6, 7, 8

  **References**:
  - Test: `tests/memory-service.test.ts` - existing memory service behavior patterns.
  - Test: `tests/product-memory-plugin.test.ts` - scope/diagnostic plugin behavior patterns.
  - Test: `tests/continuity-debugging-docs.test.ts` - docs-boundary test pattern.
  - Pattern: `AGENTS.md:31-33` - default verification order.
  - Pattern: `src/features/memory/core/remember.ts:45-49` - memory writes index records; e2e must prove materializer does not write.
  - Pattern: `src/features/memory/core/upsert-document.ts:106-122` - doc records come through memory write path; materializer only reads them.

  **Acceptance Criteria**:
  - [ ] E2E test materializes expected files from seeded verified records.
  - [ ] E2E test proves rerun output is deterministic except allowed manifest/log timestamp fields.
  - [ ] E2E test proves canonical log record count/content is unchanged after materialization.
  - [ ] E2E test covers empty scope with valid empty wiki.
  - [ ] E2E test covers duplicate source title slug collisions.
  - [ ] E2E test covers non-ASCII title/path handling.
  - [ ] `bun run typecheck`, `bun run test`, and `bun run build` pass.

  **QA Scenarios**:
  ```
  Scenario: Full materialization e2e
    Tool: Bash
    Steps: Run full targeted e2e test suite for wiki materializer, then `rtk bun run typecheck`, `rtk bun run test`, `rtk bun run build`.
    Expected: All commands exit 0; generated fixture output matches expected assertions.
    Evidence: .sisyphus/evidence/task-9-e2e.txt

  Scenario: No memory mutation during materialization
    Tool: Bash
    Steps: Run e2e test that snapshots canonical JSONL before and after CLI materialization.
    Expected: Snapshot is byte-for-byte unchanged or semantically unchanged if test harness normalizes line endings; no index/log mutation occurs.
    Evidence: .sisyphus/evidence/task-9-no-mutation.txt
  ```

  **Commit**: YES | Message: `test(wiki): verify materializer end to end` | Files: [integration tests, fixtures, evidence]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. Plan Compliance Audit — oracle
  - Verify implementation matches this plan exactly: CLI-only, one-way, canonical-record read-only, scoped output, no new MCP tool, no runtime cache/traces as wiki source.
  - Evidence: `.sisyphus/evidence/f1-plan-compliance.md`

- [ ] F2. Code Quality Review — unspecified-high
  - Review module boundaries, deterministic utilities, atomic writer correctness, tests, and maintainability.
  - Evidence: `.sisyphus/evidence/f2-code-quality.md`

- [ ] F3. Real Manual QA — unspecified-high
  - Run actual CLI against temp/fixture data, inspect generated file tree and manifest, verify stale detection and no mutation.
  - Evidence: `.sisyphus/evidence/f3-manual-qa.md`

- [ ] F4. Scope Fidelity Check — deep
  - Confirm no source-of-truth confusion, no scope leakage, no continuity-cache leakage, no bidirectional sync, no hidden LLM synthesis.
  - Evidence: `.sisyphus/evidence/f4-scope-fidelity.md`

## Commit Strategy

- Commit after each task if tests for that task pass and files are logically complete.
- Use conventional messages listed per task.
- Do not push unless explicitly requested.
- Do not commit `.agent-state/wiki/` generated fixture output unless tests require checked-in snapshots; prefer temp directories and inline assertions.
- Do not commit secrets, local runtime state, or unrelated `.agent-state` artifacts.

## Success Criteria

- The memory core remains canonical and unchanged in architectural role.
- Wiki materialization is deterministic, one-way, scoped, and rebuildable.
- Markdown pages are useful to humans while clearly labeled as generated projection.
- Manifest provides machine-readable provenance and staleness detection.
- Review/verification states are preserved, not flattened.
- Project/container scope leakage is tested and prevented.
- Runtime continuity cache and retrieval traces remain excluded from durable wiki content.
- Full verification (`bun run typecheck`, `bun run test`, `bun run build`) passes.
