# Trusted Memory Diagnostics

## TL;DR
> **Summary**: Harden the memory diagnostics contract so retrieval and continuity failures are explainable, testable, and aligned with the memory-only package boundary. Focus on `inspect_memory_retrieval`, retrieval traces, scoped/latest behavior, empty vs degraded outcomes, and docs that match tested runtime behavior.
> **Deliverables**:
> - Concrete trace semantics for `contextSize`, summary classification, provenance, scoped latest lookup, and request-id lookup.
> - Targeted tests for normal hit, empty success, degraded-empty, scoped miss, request-id lookup, provenance, and docs alignment.
> - Documentation updates limited to tested diagnostics behavior.
> - Evidence files for every task under `.sisyphus/evidence/`.
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 → Tasks 2/3/4 → Task 5 → Final Verification Wave

## Context
### Original Request
User approved planning after direction analysis: "งั้นเริ่มวางแผนได้เลย".

### Interview Summary
- User wanted a more rigorous next-direction decision after today's diagnostics hardening.
- Audits concluded the next safe/high-leverage milestone is trusted memory diagnostics, not feature expansion.
- Repo state at planning time: `main` synced to `origin/main`, working tree clean.
- Existing product posture: memory-only package; host lifecycle events are memory-facing inputs only.

### Metis Review (gaps addressed)
- Added explicit guardrail: no retrieval/ranking behavior changes unless needed only for diagnostics capture and explicitly justified.
- Added required tests for degraded-empty, scoped latest miss, request-id bypassing scope, provenance labels, and `contextSize` semantics.
- Added decision: preserve existing trace field names and clarify semantics by default; additive split is allowed only if required and non-breaking.
- Added requirement that `latestScopeFilter` stays plugin-injected/output-only, not public input.
- Added explicit deferral for malformed JSONL unless implemented cheaply and tested.

## Work Objectives
### Core Objective
Make retrieval/continuity diagnostics trustworthy enough that an agent can answer: "Did memory hit, miss, degrade, use the wrong scope, or lack any trace?" without guessing or falling back to broad recap search first.

### Deliverables
- Diagnostics contract hardening in source/types/tests for retrieval traces and inspection output.
- Machine-testable `inspectMemoryRetrieval` summary classification.
- Clear semantics for `contextSize` and related docs/tests.
- Edge-case coverage for empty success vs degraded-empty and scoped latest misses.
- Docs updates in `MCP_USAGE.md`, `CONTINUITY_DEBUGGING.md`, and optionally `ARCHITECTURE.md` only where behavior is implemented and tested.

### Definition of Done (verifiable conditions with commands)
- `bun run typecheck` exits `0`.
- `bun run test` exits `0`.
- `bun run build` exits `0`.
- Targeted tests prove no-trace, empty success, normal hit, degraded retrieval, scoped latest miss, request-id lookup, provenance, and `contextSize` semantics.
- Docs contain no claim about diagnostics behavior that lacks a corresponding source/test assertion.

### Must Have
- Preserve memory-only package identity.
- Preserve request-id inspection as unscoped lookup by exact ID.
- Preserve latest scoped lookup as plugin path behavior where active session scope is injected by the plugin/runtime shell.
- Keep `latestScopeFilter` output-only/internal diagnostic metadata; do not add it to public MCP input schema.
- Use concrete fixtures in tests: `project-alpha`, `container-main`, `container-other`, `req-hit-001`, `req-empty-001`, `req-degraded-empty-001`, `mem-001`.

### Must NOT Have
- No knowledge graph.
- No raw/verbatim replay.
- No source-to-derived public contract.
- No review truth-engine or automatic supersession resolution.
- No workflow control, worker routing, task lifecycle state, supervision, executor ownership, or hook dispatch.
- No ranking/search behavior changes except explicitly justified diagnostic metadata capture.
- No public `latestScopeFilter` input parameter.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + existing Bun test suite.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.txt`.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Contract foundation
- Task 1: Freeze diagnostics contract and test matrix.

Wave 2: Parallel implementation tracks
- Task 2: Harden `contextSize` and trace payload semantics.
- Task 3: Improve inspection summary classification.
- Task 4: Pin scoped/request-id/provenance edge cases.

Wave 3: Alignment and resilience
- Task 5: Align docs and optional trace-store resilience.
- Task 6: Run full verification and evidence packaging.

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
| --- | --- | --- |
| 1 | none | 2, 3, 4, 5 |
| 2 | 1 | 5, 6 |
| 3 | 1 | 5, 6 |
| 4 | 1 | 5, 6 |
| 5 | 1, 2, 3, 4 | 6 |
| 6 | 2, 3, 4, 5 | Final Verification Wave |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Count | Categories |
| --- | ---: | --- |
| 1 | 1 | `unspecified-high` |
| 2 | 3 | `unspecified-high`, `deep` |
| 3 | 2 | `writing`, `unspecified-high` |
| Final | 4 | `oracle`, `unspecified-high`, `deep` |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Freeze Trusted Diagnostics Contract

  **What to do**: Define the exact contract for this milestone before editing implementation. Inspect current `RetrievalTraceEntry`, `InspectMemoryRetrieval*Result`, `inspectMemoryRetrieval`, plugin scoped lookup, and docs. Record decisions in `.sisyphus/notepads/trusted-memory-diagnostics/contract.md`: `contextSize` meaning, summary classification shape, scoped/latest semantics, request-id semantics, provenance expectations, and explicitly deferred malformed JSONL behavior if not included.
  **Must NOT do**: Do not edit runtime behavior in this task. Do not choose a breaking rename unless all downstream tasks explicitly support it. Do not introduce source-pointer/review/graph work.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: requires precise source/test/doc synthesis, not code churn.
  - Skills: [] - No special skill needed.
  - Omitted: [`uncodixify`, `frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/types.ts` - `RetrievalTraceEntry`, inspect result types, review hint boundaries.
  - Pattern: `src/features/memory/memory-service.ts` - `inspectMemoryRetrieval` summary and lookup behavior.
  - Pattern: `src/features/memory/retrieval/hybrid-search.ts` - trace emission and current `contextSize` calculation.
  - Pattern: `src/features/opencode-plugin/runtime-shell.ts` - plugin injection of active session scope into `inspect_memory_retrieval`.
  - Test: `tests/memory-service.test.ts` - existing trace, degraded, provenance, scoped lookup, and review tests.
  - Test: `tests/product-memory-plugin.test.ts` - plugin scoped inspection expectations.
  - Docs: `MCP_USAGE.md`, `CONTINUITY_DEBUGGING.md`, `ARCHITECTURE.md` - diagnostics contract docs.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `.sisyphus/notepads/trusted-memory-diagnostics/contract.md` exists and contains decisions for `contextSize`, summary classification, latest scoped lookup, request-id lookup, provenance, and malformed JSONL include/defer.
  - [ ] `grep -n "latestScopeFilter" src/features/memory/schemas.ts` shows no public input schema addition.
  - [ ] Evidence file `.sisyphus/evidence/task-1-contract.txt` records the inspected files and final contract decisions.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Contract file covers required decisions
    Tool: Bash
    Steps: test -f .sisyphus/notepads/trusted-memory-diagnostics/contract.md && grep -E "contextSize|summary classification|latestScopeFilter|requestId|provenance|malformed" .sisyphus/notepads/trusted-memory-diagnostics/contract.md
    Expected: command exits 0 and prints all required terms.
    Evidence: .sisyphus/evidence/task-1-contract.txt

  Scenario: latestScopeFilter remains non-public input
    Tool: Bash
    Steps: grep -n "latestScopeFilter" src/features/memory/schemas.ts; test $? -ne 0
    Expected: no schema match; command exits 0 via inverted check.
    Evidence: .sisyphus/evidence/task-1-latest-scope-schema.txt
  ```

  **Commit**: NO | Message: `test(memory): define trusted diagnostics contract` | Files: [.sisyphus/notepads/trusted-memory-diagnostics/contract.md, .sisyphus/evidence/task-1-*.txt]

- [x] 2. Harden `contextSize` and Trace Payload Semantics

  **What to do**: Implement the Task 1 contract for trace size semantics. Default decision: preserve `contextSize` as returned retrieval item text payload size and document/test that it is not rendered context length. If executor proves this name is too misleading, add a non-breaking field such as `returnedItemTextSize` while preserving `contextSize` compatibility, then update types/tests/docs accordingly.
  **Must NOT do**: Do not change actual retrieval ranking, filtering, or context builder output. Do not remove `contextSize` without compatibility handling.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: source/types/tests changes require precision.
  - Skills: [] - No special skill needed.
  - Omitted: [`frontend-ui-ux`] - No browser/UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 1

  **References**:
  - Pattern: `src/features/memory/retrieval/hybrid-search.ts` - current trace append and size computation.
  - API/Type: `src/features/memory/types.ts` - trace entry type.
  - Test: `tests/memory-service.test.ts` - existing `contextSize` assertion around latest trace inspection.
  - Test: `tests/context-builder.test.ts` - rendered context/truncation patterns if needed to prove distinction.

  **Acceptance Criteria**:
  - [ ] Targeted tests assert `contextSize > 0` for normal hits and equals the expected returned item text payload size for fixture `mem-001`.
  - [ ] A targeted test demonstrates `contextSize` is independent from rendered context truncation if `maxChars` or build-context rendering is involved.
  - [ ] Types and docs comments clarify the field meaning.
  - [ ] `bun run test -- tests/memory-service.test.ts` exits 0.

  **QA Scenarios**:
  ```
  Scenario: Normal hit trace has deterministic contextSize
    Tool: Bash
    Steps: bun run test -- tests/memory-service.test.ts -t "contextSize"
    Expected: command exits 0; output includes the contextSize-focused test name.
    Evidence: .sisyphus/evidence/task-2-context-size.txt

  Scenario: Trace size does not claim rendered context length
    Tool: Bash
    Steps: grep -R "contextSize" -n src/features/memory tests/memory-service.test.ts MCP_USAGE.md CONTINUITY_DEBUGGING.md
    Expected: matches clarify returned-item/payload semantics or show an additive replacement field; no docs call it rendered context length unless implementation proves that.
    Evidence: .sisyphus/evidence/task-2-context-size-docs.txt
  ```

  **Commit**: YES | Message: `test(memory): clarify retrieval trace size semantics` | Files: [src/features/memory/retrieval/hybrid-search.ts, src/features/memory/types.ts, tests/memory-service.test.ts, docs if touched]

- [x] 3. Improve `inspectMemoryRetrieval` Summary Classification

  **What to do**: Extend inspection summary so callers can distinguish at least: `no_trace_found`, `empty_success`, `normal_hit`, and `degraded_retrieval`. Keep existing fields `hit`, `returnedCount`, and `degraded` for compatibility. Add stable machine-testable fields only; optional human-readable text must be derived from those fields.
  **Must NOT do**: Do not make summary decide truth or prescribe user workflow actions. Do not hide raw trace fields.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: requires API compatibility and diagnostic classification reasoning.
  - Skills: [] - No special skill needed.
  - Omitted: [`uncodixify`] - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 1

  **References**:
  - API/Type: `src/features/memory/types.ts` - `InspectMemoryRetrieval*Result` and summary shape.
  - Pattern: `src/features/memory/memory-service.ts` - `inspectMemoryRetrieval` return construction.
  - Test: `tests/memory-service.test.ts` - missing request id, latest trace, scoped latest miss cases.
  - Docs: `CONTINUITY_DEBUGGING.md:39-56` - empty vs degraded matrix.

  **Acceptance Criteria**:
  - [ ] No-trace result returns status `empty` and summary/classification equivalent to `no_trace_found` if summary is present for empty results.
  - [ ] Normal hit summary includes `classification: "normal_hit"`, `hit: true`, `returnedCount > 0`, `degraded: false`.
  - [ ] Empty success summary includes `classification: "empty_success"`, `hit: false`, `returnedCount: 0`, `degraded: false`.
  - [ ] Degraded-empty summary includes `classification: "degraded_retrieval"`, `hit: false`, `returnedCount: 0`, `degraded: true`.
  - [ ] Existing callers/tests that rely on `hit`, `returnedCount`, `degraded` still pass.

  **QA Scenarios**:
  ```
  Scenario: Inspect summary classifies normal hit and empty success
    Tool: Bash
    Steps: bun run test -- tests/memory-service.test.ts -t "inspect.*retrieval|empty.*success|normal.*hit"
    Expected: command exits 0; tests assert classification and compatibility fields.
    Evidence: .sisyphus/evidence/task-3-summary-classification.txt

  Scenario: Degraded-empty is distinct from empty success
    Tool: Bash
    Steps: bun run test -- tests/memory-service.test.ts -t "degraded.*empty|empty.*degraded"
    Expected: command exits 0; test asserts degraded-empty classification is not empty_success.
    Evidence: .sisyphus/evidence/task-3-degraded-empty.txt
  ```

  **Commit**: YES | Message: `feat(memory): classify retrieval inspection outcomes` | Files: [src/features/memory/memory-service.ts, src/features/memory/types.ts, tests/memory-service.test.ts]

- [x] 4. Pin Scoped Lookup, Request ID, Provenance, and Ranking Reason Boundaries

  **What to do**: Add/strengthen tests that lock the diagnostic boundaries without expanding API scope. Ensure latest lookup with plugin-injected scope returns `latestScopeFilter` on scoped misses; request-id lookup bypasses scope; provenance fields have deterministic surface/trigger/phase expectations; `rankingReasonsById` is tested only for currently true coarse reasons and docs avoid over-promising score explanations.
  **Must NOT do**: Do not expose `latestScopeFilter` as public input. Do not change ranking algorithm or add fake scoring details. Do not make provenance imply host workflow ownership.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: test/API boundary hardening.
  - Skills: [] - No special skill needed.
  - Omitted: [`frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 1

  **References**:
  - Pattern: `src/features/opencode-plugin/runtime-shell.ts` - plugin active-session scope injection.
  - Schema: `src/features/memory/schemas.ts` - public inspect input accepts `requestId` only.
  - Store: `src/features/memory/observability/retrieval-trace.ts` - `readLatestMatching` semantics.
  - Test: `tests/product-memory-plugin.test.ts` - scoped plugin inspection.
  - Test: `tests/memory-service.test.ts` - latest scoped lookup and request-id lookup.

  **Acceptance Criteria**:
  - [ ] Test proves plugin `inspect_memory_retrieval.execute({})` calls backend with `latestScopeFilter: { projectId: "project-alpha", containerId: "container-main" }` when session scope exists.
  - [ ] Test proves `inspect_memory_retrieval.execute({ requestId: "req-hit-001" })` calls backend with requestId only and no scope filter.
  - [ ] Test proves scoped latest miss includes the attempted `latestScopeFilter` in the empty response.
  - [ ] Test proves provenance phase for `prepareHostTurnMemory` or `prepare_turn_memory` is deterministic enough for docs.
  - [ ] Test or docs explicitly limit `rankingReasonsById` to coarse labels, not numeric explanation.

  **QA Scenarios**:
  ```
  Scenario: Plugin latest lookup injects active session scope
    Tool: Bash
    Steps: bun run test -- tests/product-memory-plugin.test.ts -t "inspect_memory_retrieval"
    Expected: command exits 0; tests assert scoped latest and unscoped requestId calls.
    Evidence: .sisyphus/evidence/task-4-plugin-scope.txt

  Scenario: Public schema does not expose latestScopeFilter
    Tool: Bash
    Steps: grep -n "latestScopeFilter" src/features/memory/schemas.ts; test $? -ne 0
    Expected: no schema match; latestScopeFilter remains output/plugin diagnostic only.
    Evidence: .sisyphus/evidence/task-4-schema-boundary.txt
  ```

  **Commit**: YES | Message: `test(memory): pin retrieval inspection boundaries` | Files: [tests/product-memory-plugin.test.ts, tests/memory-service.test.ts, docs if touched]

- [x] 5. Align Diagnostics Documentation and Optional Trace-Store Resilience

  **What to do**: Update `MCP_USAGE.md`, `CONTINUITY_DEBUGGING.md`, and optionally `ARCHITECTURE.md` to match the exact tested diagnostics contract from Tasks 2-4. If Task 1 included malformed JSONL handling, implement and test resilient trace parsing here; otherwise add an explicit deferred note in the notepad only, not public docs unless user-facing behavior is relevant.
  **Must NOT do**: Do not document unimplemented behavior. Do not present plugin-only scoped lookup as universal standalone MCP input behavior. Do not expand docs into workflow/orchestration guidance.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: docs alignment with tested runtime contract.
  - Skills: [] - No special skill needed.
  - Omitted: [`frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 6 | Blocked By: 1, 2, 3, 4

  **References**:
  - Docs: `MCP_USAGE.md:95-101` - practical safety reminders for inspect/retrieval.
  - Docs: `CONTINUITY_DEBUGGING.md:39-56` - empty vs degraded retrieval matrix.
  - Docs: `ARCHITECTURE.md:114-121` - diagnostic model summary.
  - Test: `tests/continuity-debugging-docs.test.ts` - docs contract tests.
  - Test: add/update docs tests if docs wording changes.

  **Acceptance Criteria**:
  - [ ] Docs clearly separate no trace found, empty success, normal hit, and degraded retrieval.
  - [ ] Docs clarify `contextSize` semantics using the exact Task 2 decision.
  - [ ] Docs clarify plugin-scoped latest lookup vs request-id lookup without exposing `latestScopeFilter` as public input.
  - [ ] `tests/continuity-debugging-docs.test.ts` passes and asserts key wording without brittle snapshots.
  - [ ] If malformed JSONL resilience is included, a test proves malformed lines do not crash inspect; otherwise notepad records explicit deferral.

  **QA Scenarios**:
  ```
  Scenario: Docs test covers diagnostics matrix
    Tool: Bash
    Steps: bun run test -- tests/continuity-debugging-docs.test.ts
    Expected: command exits 0; docs mention empty success and degraded retrieval distinctly.
    Evidence: .sisyphus/evidence/task-5-docs-test.txt

  Scenario: Docs avoid unsupported public latestScopeFilter input claim
    Tool: Bash
    Steps: grep -R "latestScopeFilter" -n README.md MCP_USAGE.md CONTINUITY_DEBUGGING.md ARCHITECTURE.md src/features/memory/schemas.ts
    Expected: docs describe it as returned diagnostic/plugin-injected scoped lookup metadata; schema still has no public input field.
    Evidence: .sisyphus/evidence/task-5-latest-scope-docs.txt
  ```

  **Commit**: YES | Message: `docs(memory): align trusted diagnostics contract` | Files: [MCP_USAGE.md, CONTINUITY_DEBUGGING.md, ARCHITECTURE.md, tests/continuity-debugging-docs.test.ts, optional trace-store files]

- [x] 6. Full Verification and Evidence Packaging

  **What to do**: Run focused tests from Tasks 2-5, then full verification in repo order. Capture outputs to evidence files. Confirm git status contains only intentional source/test/docs/evidence changes. Prepare commit summary if commits were not already created task-by-task.
  **Must NOT do**: Do not skip full verification because targeted tests pass. Do not include unrelated `.agent-state` or learning artifacts in source commits unless explicitly intentional.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: verification, evidence, and commit hygiene.
  - Skills: [] - No special skill needed.
  - Omitted: [`frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Final Verification Wave | Blocked By: 2, 3, 4, 5

  **References**:
  - Repo rule: `AGENTS.md` - default verification order: `bun run typecheck`, `bun run test`, `bun run build`.
  - Package scripts: `package.json` - command names.
  - Evidence path: `.sisyphus/evidence/`.

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` exits 0 and output saved to `.sisyphus/evidence/task-6-typecheck.txt`.
  - [ ] `bun run test` exits 0 and output saved to `.sisyphus/evidence/task-6-test.txt`.
  - [ ] `bun run build` exits 0 and output saved to `.sisyphus/evidence/task-6-build.txt`.
  - [ ] `git status --short` output saved to `.sisyphus/evidence/task-6-git-status.txt`.
  - [ ] Evidence index `.sisyphus/evidence/task-6-summary.txt` lists all task evidence files.

  **QA Scenarios**:
  ```
  Scenario: Full repo verification passes
    Tool: Bash
    Steps: bun run typecheck && bun run test && bun run build
    Expected: all commands exit 0.
    Evidence: .sisyphus/evidence/task-6-full-verification.txt

  Scenario: Evidence files exist for all tasks
    Tool: Bash
    Steps: test -f .sisyphus/evidence/task-1-contract.txt && test -f .sisyphus/evidence/task-2-context-size.txt && test -f .sisyphus/evidence/task-3-summary-classification.txt && test -f .sisyphus/evidence/task-4-plugin-scope.txt && test -f .sisyphus/evidence/task-5-docs-test.txt && test -f .sisyphus/evidence/task-6-full-verification.txt
    Expected: command exits 0.
    Evidence: .sisyphus/evidence/task-6-evidence-check.txt
  ```

  **Commit**: YES | Message: `chore(memory): verify trusted diagnostics hardening` | Files: [.sisyphus/evidence/task-*.txt, remaining intentional source/test/docs changes]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Prefer small commits by task if each task leaves the repo passing targeted tests.
- Commit messages:
  - `test(memory): clarify retrieval trace size semantics`
  - `feat(memory): classify retrieval inspection outcomes`
  - `test(memory): pin retrieval inspection boundaries`
  - `docs(memory): align trusted diagnostics contract`
  - `chore(memory): verify trusted diagnostics hardening`
- Do not commit `.agent-state` unless the task explicitly creates a retrospective or pulse update.
- Do not push unless the user explicitly requests it.

## Success Criteria
- Agents can use `inspect_memory_retrieval`, `memory_context`, and docs to distinguish no trace, empty success, normal hit, degraded retrieval, scoped miss, and request-id lookup.
- Diagnostics behavior is covered by tests, not only prose.
- Docs stay inside the memory-only boundary and do not promise standalone/plugin behavior interchangeably.
- Full verification passes: `bun run typecheck`, `bun run test`, `bun run build`.
- Final verification wave approves and user explicitly says okay before completion.
