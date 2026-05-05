# Empty Retrieval Diagnostics Docs

## TL;DR
> **Summary**: Clarify the operator-facing distinction between an empty successful retrieval and a degraded retrieval, using existing `inspect_memory_retrieval` semantics as source of truth. This is docs-first and must not change retrieval behavior.
> **Deliverables**:
> - `CONTINUITY_DEBUGGING.md` troubleshooting matrix for empty vs degraded retrieval.
> - `MCP_USAGE.md` concise contract note for `inspect_memory_retrieval` interpretation.
> - Optional short `README.md` pointer only if discoverability is improved without bloat.
> - Targeted docs/content regression tests plus full verification.
> **Effort**: Quick
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 source-truth audit → Task 2/3 docs updates → Task 4 docs regression tests → Final verification

## Context
### Original Request
- User asked: “เริ่มวางแผนได้เลย” after discussing next work options.

### Interview Summary
- Candidate directions were memory viewer polish, retrieval diagnostics UX, and docs explaining empty retrieval but not degraded.
- Default decision: docs-first empty-vs-degraded retrieval plan.
- Reason: the current session found real evidence that retrieval can be empty and non-degraded when the current scope has no durable memory records. Existing code/tests already model this; docs do not teach it clearly enough.
- Test decision: tests-after, because this is a docs/contract update. Implementation should update docs, then add/adjust docs content tests and run targeted/full verification.

### Metis Review (gaps addressed)
- Use `CONTINUITY_DEBUGGING.md` as the primary explanation home.
- Update `MCP_USAGE.md` with a concise operator-facing note.
- Touch `README.md` only as a short pointer if it improves discoverability.
- Include an interpretation matrix and explicit edge cases.
- Preserve docs-first scope; no retrieval behavior changes, no new tools, no viewer polish, no raw/verbatim memory work.
- Verify exact field semantics from source before final wording.

## Work Objectives
### Core Objective
Make it unambiguous that `returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false` means retrieval completed successfully but returned no scoped context/matches; it is different from degraded retrieval.

### Deliverables
- Primary troubleshooting docs in `CONTINUITY_DEBUGGING.md`.
- Runtime/tool contract note in `MCP_USAGE.md`.
- Optional README pointer, not a full troubleshooting section.
- Automated docs/content regression coverage.

### Definition of Done (verifiable conditions with commands)
- `CONTINUITY_DEBUGGING.md` contains a matrix/table distinguishing:
  - no trace found by lookup,
  - trace found with zero returned IDs and `degraded: false`,
  - trace found with returned IDs and `degraded: false`,
  - trace found with `degraded: true`.
- `MCP_USAGE.md` explains the same distinction concisely near `inspect_memory_retrieval` guidance.
- If `README.md` is touched, it only points to `CONTINUITY_DEBUGGING.md` and does not duplicate detailed troubleshooting.
- A test asserts the new docs contain the core interpretation language.
- Commands pass: `bun run typecheck`, targeted Vitest command, `bun run test`, `bun run build`.

### Must Have
- Memory-only wording.
- Operator-facing semantics, not internal implementation exposition.
- Clear distinction between durable memory records and continuity cache.
- Exact next diagnostic actions for wrong/missing scope and empty stores.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- MUST NOT change retrieval behavior, schemas, trace shape, or tool result shape.
- MUST NOT add new diagnostics tools, viewer features, browser/e2e setup, or memory seeding workflows.
- MUST NOT describe empty successful retrieval as a failure.
- MUST NOT claim host workflow/runtime ownership.
- MUST NOT introduce raw/verbatim/drawer vocabulary into public API docs.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + Vitest/TypeScript.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = acceptable here because the plan is intentionally small and docs-first.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 source-truth audit.
Wave 2: Task 2 primary docs update and Task 3 contract/README docs in parallel.
Wave 3: Task 4 regression tests/verification.

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | none | 2, 3, 4 |
| 2 | 1 | 4 |
| 3 | 1 | 4 |
| 4 | 2, 3 | Final verification |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 1 | quick |
| 2 | 2 | writing |
| 3 | 1 | quick |
| Final | 4 review agents | oracle, unspecified-high, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Verify source-of-truth retrieval semantics

  **What to do**: Read the existing source/tests and write `.sisyphus/evidence/task-1-source-truth.txt` summarizing the exact semantics to document. Confirm:
  - `inspectMemoryRetrieval` returns `status: "empty"` only when no trace is found for the lookup.
  - A found trace reports `summary.hit`, `summary.returnedCount`, and `summary.degraded`.
  - `SearchMemoriesResult.degraded` is separate from zero returned items.
  - `contextSize: 0` should be worded as no rendered context returned by that trace/context assembly, not as proof that storage is empty unless `list_memories` also confirms it.

  **Must NOT do**: Do not edit docs or code in this task. Do not infer semantics from memory alone.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: bounded source/test audit.
  - Skills: `[]` - No special skill required.
  - Omitted: `frontend-ui-ux` - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 4 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/memory-service.ts:443-469` - `inspectMemoryRetrieval` lookup and summary behavior.
  - API/Type: `src/features/memory/types.ts:92-95` - `SearchMemoriesResult` includes `items` and `degraded` separately.
  - Test: `tests/memory-service.test.ts` - existing retrieval inspection and scope behavior tests.
  - Test: `tests/retrieval-eval.test.ts:125-144` - `expectEmpty` and `expectDegraded` are separate acceptance concepts.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `.sisyphus/evidence/task-1-source-truth.txt` exists and cites the files/line ranges above.
  - [ ] Evidence explicitly distinguishes “no trace found” from “trace found with zero returned IDs.”
  - [ ] Evidence explicitly states no behavior/schema/tool-output changes are needed for this plan.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Source audit captures empty-success semantics
    Tool: Bash
    Steps: Run `test -s .sisyphus/evidence/task-1-source-truth.txt && grep -E "no trace|zero returned|degraded" .sisyphus/evidence/task-1-source-truth.txt`
    Expected: Command exits 0 and prints all three semantic terms.
    Evidence: .sisyphus/evidence/task-1-source-truth.txt

  Scenario: Source audit rejects behavior changes
    Tool: Bash
    Steps: Run `grep -E "no behavior|no schema|no tool-output" .sisyphus/evidence/task-1-source-truth.txt`
    Expected: Command exits 0.
    Evidence: .sisyphus/evidence/task-1-source-truth-guardrail.txt
  ```

  **Commit**: NO | Message: `docs: clarify empty retrieval diagnostics` | Files: [`.sisyphus/evidence/task-1-source-truth.txt`]

- [ ] 2. Update `CONTINUITY_DEBUGGING.md` with the primary troubleshooting matrix

  **What to do**: Add a new section after `## What to inspect in inspect_memory_retrieval` or before `## Routing rule`. The section title must be `## Empty vs degraded retrieval`. Include a compact matrix with these rows:
  - No trace found: `inspect_memory_retrieval` returns `status: "empty"`; next action is confirm requestId/latest-scope lookup.
  - Trace found, zero returned IDs, `degraded: false`: retrieval completed; no matching/scoped context returned; next action is inspect scope, durable records, and whether memory was seeded.
  - Trace found, returned IDs, `degraded: false`: retrieval hit normally.
  - Trace found, `degraded: true`: retrieval used degraded/fail-open path; inspect trace/provenance and run verification/eval if unexpected.

  Add edge-case bullets:
  - wrong/missing `projectId` or `containerId`,
  - records exist globally but not in current project scope,
  - storage was reset or never seeded,
  - continuity cache can exist even when durable memory retrieval is empty.

  **Must NOT do**: Do not mention raw drawers/verbatim memory. Do not say empty retrieval is an error when `degraded: false`.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: technical docs update requiring precise wording.
  - Skills: `[]` - Repo docs patterns are enough.
  - Omitted: `frontend-ui-ux` - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 4 | Blocked By: 1

  **References**:
  - Pattern: `CONTINUITY_DEBUGGING.md:5-12` - preserve existing diagnostic order.
  - Pattern: `CONTINUITY_DEBUGGING.md:28-37` - existing `inspect_memory_retrieval` questions.
  - API/Type: `src/features/memory/memory-service.ts:443-469` - source of truth for found/empty/summary.
  - Evidence: `.sisyphus/evidence/task-1-source-truth.txt` - use exact wording verified in Task 1.

  **Acceptance Criteria**:
  - [ ] `CONTINUITY_DEBUGGING.md` has `## Empty vs degraded retrieval`.
  - [ ] The section includes exact strings `returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false`.
  - [ ] The section says this means retrieval completed but no matching/scoped context was returned.
  - [ ] The section separately explains `degraded: true`.

  **QA Scenarios**:
  ```
  Scenario: Happy path docs explain empty successful retrieval
    Tool: Bash
    Steps: Run `grep -F "## Empty vs degraded retrieval" CONTINUITY_DEBUGGING.md && grep -F "returnedMemoryIds: []" CONTINUITY_DEBUGGING.md && grep -F "degraded: false" CONTINUITY_DEBUGGING.md`
    Expected: Command exits 0 and all strings are present.
    Evidence: .sisyphus/evidence/task-2-continuity-empty-success.txt

  Scenario: Edge path docs explain degraded separately
    Tool: Bash
    Steps: Run `grep -F "degraded: true" CONTINUITY_DEBUGGING.md && grep -Ei "fail-open|degraded" CONTINUITY_DEBUGGING.md`
    Expected: Command exits 0 and degraded wording is separate from empty-success wording.
    Evidence: .sisyphus/evidence/task-2-continuity-degraded.txt
  ```

  **Commit**: NO | Message: `docs: clarify empty retrieval diagnostics` | Files: [`CONTINUITY_DEBUGGING.md`]

- [ ] 3. Update `MCP_USAGE.md` and only add a README pointer if needed

  **What to do**: In `MCP_USAGE.md`, under `## Practical safety reminders`, expand the `inspect_memory_retrieval` bullet into 2-4 bullets that say:
  - use it before guessing why recall is empty/unclear,
  - `returnedMemoryIds: []` with `degraded: false` means no scoped matches/context, not degraded retrieval,
  - check `projectId`/`containerId`, durable memory count, and `memory_context` cache separately.

  Decide README handling as follows:
  - If `README.md` already has enough discoverability through Docs map lines 106-114, do not touch README.
  - If touching README, add exactly one short sentence under `## Diagnostics` pointing detailed troubleshooting to `CONTINUITY_DEBUGGING.md`. Do not add a table to README.

  **Must NOT do**: Do not duplicate the full matrix in README. Do not change tool lists.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: contract docs wording.
  - Skills: `[]` - No external docs needed.
  - Omitted: `frontend-ui-ux` - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 4 | Blocked By: 1

  **References**:
  - Pattern: `MCP_USAGE.md:92-97` - current safety reminders location.
  - Pattern: `MCP_USAGE.md:36-41` - plugin-path notes about memory_context/runtime_capabilities.
  - Pattern: `README.md:88-92` - diagnostics overview; only add pointer if needed.
  - Pattern: `README.md:106-114` - Docs map already points to `CONTINUITY_DEBUGGING.md`.

  **Acceptance Criteria**:
  - [ ] `MCP_USAGE.md` contains a concise empty-vs-degraded interpretation near safety reminders.
  - [ ] `MCP_USAGE.md` tells agents to check scope/durable records separately from `memory_context` continuity cache.
  - [ ] If `README.md` is modified, its diff is at most a short pointer sentence in Diagnostics or Docs map.

  **QA Scenarios**:
  ```
  Scenario: MCP usage explains empty retrieval without degradation
    Tool: Bash
    Steps: Run `grep -F "returnedMemoryIds: []" MCP_USAGE.md && grep -F "degraded: false" MCP_USAGE.md`
    Expected: Command exits 0.
    Evidence: .sisyphus/evidence/task-3-mcp-empty-success.txt

  Scenario: README stays high-level
    Tool: Bash
    Steps: Run `git diff -- README.md | wc -l`
    Expected: Output is `0` if README untouched, or a small diff if one pointer sentence was added. If output exceeds 20 lines, task fails and README must be trimmed.
    Evidence: .sisyphus/evidence/task-3-readme-scope.txt
  ```

  **Commit**: NO | Message: `docs: clarify empty retrieval diagnostics` | Files: [`MCP_USAGE.md`, optional `README.md`]

- [ ] 4. Add docs regression tests and run targeted/full verification

  **What to do**: Add a new test file `tests/continuity-debugging-docs.test.ts` that reads `CONTINUITY_DEBUGGING.md` and `MCP_USAGE.md` and asserts:
  - `CONTINUITY_DEBUGGING.md` contains `## Empty vs degraded retrieval`.
  - Both docs mention `returnedMemoryIds: []` and `degraded: false`.
  - `CONTINUITY_DEBUGGING.md` mentions `degraded: true` separately.
  - At least one doc mentions `projectId` and `containerId` as scope checks.

  Then run targeted and full verification commands. Save outputs or concise summaries into `.sisyphus/evidence/`.

  **Must NOT do**: Do not add brittle snapshot tests for entire docs. Do not test exact paragraph wording beyond required core strings.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small Vitest docs-content test and verification.
  - Skills: `[]` - Existing Vitest patterns are enough.
  - Omitted: `playwright` - No browser QA needed for docs-only plan.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Final verification | Blocked By: 2, 3

  **References**:
  - Test: `tests/opencode-plugin-instructions-config.test.ts:17-112` - examples of reading package docs/paths and asserting docs packaging behavior.
  - Test: `tests/retrieval-eval.test.ts:125-144` - empty vs degraded concepts.
  - Command: `package.json:39-42` - `build`, `typecheck`, `test` scripts.
  - Docs: `CONTINUITY_DEBUGGING.md`, `MCP_USAGE.md`.

  **Acceptance Criteria**:
  - [ ] `tests/continuity-debugging-docs.test.ts` exists.
  - [ ] Targeted command exits 0: `bunx vitest run tests/continuity-debugging-docs.test.ts tests/memory-service.test.ts tests/retrieval-eval.test.ts tests/hybrid-search.test.ts tests/product-memory-plugin.test.ts tests/opencode-plugin-package.test.ts tests/opencode-plugin-instructions-config.test.ts`.
  - [ ] Full commands exit 0: `bun run typecheck`, `bun run test`, `bun run build`.
  - [ ] `git diff --stat` shows docs/test/evidence files only; no source behavior files under `src/` changed.

  **QA Scenarios**:
  ```
  Scenario: Targeted docs/retrieval tests pass
    Tool: Bash
    Steps: Run `bunx vitest run tests/continuity-debugging-docs.test.ts tests/memory-service.test.ts tests/retrieval-eval.test.ts tests/hybrid-search.test.ts tests/product-memory-plugin.test.ts tests/opencode-plugin-package.test.ts tests/opencode-plugin-instructions-config.test.ts`
    Expected: Exit code 0.
    Evidence: .sisyphus/evidence/task-4-targeted-tests.txt

  Scenario: Full repo verification passes without source behavior changes
    Tool: Bash
    Steps: Run `bun run typecheck && bun run test && bun run build && git diff --stat`
    Expected: Exit code 0; diff contains docs/test/evidence only and no `src/features/memory/` behavior files.
    Evidence: .sisyphus/evidence/task-4-full-verification.txt
  ```

  **Commit**: YES | Message: `docs: 📝 clarify empty retrieval diagnostics` | Files: [`CONTINUITY_DEBUGGING.md`, `MCP_USAGE.md`, optional `README.md`, `tests/continuity-debugging-docs.test.ts`, `.sisyphus/evidence/task-*`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Single implementation commit after Task 4 and before final handoff only if all verification passes.
- Commit message: `docs: 📝 clarify empty retrieval diagnostics`.
- Do not commit unrelated `.agent-state/learn` artifacts unless they are already intentionally present from previous work and unchanged.
- Do not push unless the user explicitly asks.

## Success Criteria
- Future agents can read `CONTINUITY_DEBUGGING.md` and correctly diagnose empty non-degraded retrieval without assuming a backend failure.
- `MCP_USAGE.md` reinforces the same contract for AI consumers.
- Docs content is regression-tested without brittle full-document snapshots.
- Source retrieval behavior remains unchanged.
- Full verification passes.
