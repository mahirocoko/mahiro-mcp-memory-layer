# MemPalace-Inspired Review Hints Adaptation

## TL;DR
> **Summary**: Adapt useful MemPalace concepts into this repo as memory-native review and context-assembly improvements, without copying MemPalace vocabulary or broadening beyond memory-only ownership.
> **Deliverables**:
> - Thai `ARCHITECTURE.md` updates that classify MemPalace concepts as adapted, deferred, or rejected
> - Advisory `possible_supersession` review hint
> - Improved `get_review_assist` output for contradiction and supersession hints
> - Actor-attributed memory/diary metadata convention using existing memory fields
> - Automated tests and verification evidence
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3-4 → Task 5 → Final verification

## Context

### Original Request
User reviewed MemPalace concept pages and asked to start planning implementation for what should be adapted into `mahiro-mcp-memory-layer`.

### Interview Summary
- The repo must remain its own OpenCode-native memory layer, not a MemPalace clone.
- `wake_up_memory` is confirmed to auto-run on plugin-native session start and cache into `memory_context`.
- `ARCHITECTURE.md` already exists in Thai and documents the memory-only boundary.
- MemPalace Memory Stack is useful as a conceptual influence for layered context assembly.
- MemPalace Knowledge Graph, AAAK, and Specialist Agents must not be imported wholesale.
- Contradiction detection should become review assistance only, not a truth engine.

### Oracle Review (architecture risks addressed)
- Rename any stale/superseded wording to `possible_supersession`.
- Keep hints advisory, scoped, non-blocking, and reviewer-facing.
- Do not mutate or downgrade verified memories based on hints.
- Avoid `stale` terminology because lifecycle/cache diagnostics already use stale-related wording.
- Keep actor diary streams as metadata conventions only.

### Metis Review (gaps addressed)
- Use explicit same-scope evidence/update signals for supersession; semantic similarity alone is insufficient.
- Keep docs clear about implemented, convention-only, deferred, and rejected concepts.
- Add automated tests for cross-scope isolation and non-mutation behavior.
- Use repo verification order: `rtk bun run typecheck`, `rtk bun run test`, `rtk bun run build`.

## Work Objectives

### Core Objective
Strengthen the memory review and architecture model by adapting MemPalace ideas only where they fit this repo's memory-only boundary.

### Deliverables
- Updated `ARCHITECTURE.md` with an explicit MemPalace adaptation matrix and layered context assembly description.
- Updated docs or tests describing actor-attributed memory conventions using existing fields.
- Source update for a new advisory `possible_supersession` hint.
- Source update for `get_review_assist` suggestions that explain contradiction/supersession as review tasks, not decisions.
- Tests covering same-scope, cross-scope, no-update-signal, non-mutation, and existing behavior preservation.

### Definition of Done (verifiable conditions with commands)
- `rtk bun run typecheck` exits 0.
- `rtk bun run test` exits 0.
- `rtk bun run build` exits 0.
- `ARCHITECTURE.md` contains adapted/deferred/rejected MemPalace concept framing.
- `tests/memory-service.test.ts` covers `possible_supersession` and preserves existing review hint behavior.
- No public docs promise KG, AAAK, agent registry, hook dispatch, workflow control, worker routing, task lifecycle, supervision, executor ownership, or truth-engine behavior.

### Must Have
- Review hints remain advisory and non-blocking.
- `possible_supersession` is scoped to the same `projectId` and `containerId`.
- `possible_supersession` requires a verified related memory and explicit newer/update signal.
- Existing `likely_duplicate` and `possible_contradiction` behavior remains intact.
- `get_review_assist` returns reviewer-facing suggestions only.

### Must NOT Have
- No knowledge graph implementation.
- No AAAK storage/output/compression implementation.
- No agent registry, worker routing, executor routing, hook runtime, or task lifecycle ownership.
- No automatic rejection, demotion, invalidation, or retrieval-ranking change from review hints.
- No public L0/L1/L2/L3 or MemPalace palace vocabulary as this repo's architecture terms.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after using Vitest; source behavior is small and existing tests establish the pattern.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.txt`

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave. This plan is intentionally small; waves below target are acceptable because the critical path is tight and boundary-sensitive.

Wave 1: Task 1 docs contract and Task 2 test contract can run in parallel after reading source references.
Wave 2: Task 3 `possible_supersession` and Task 4 review assist can run after Task 2 defines expected behavior.
Wave 3: Task 5 actor-attributed convention and Task 6 full verification/final review.

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
| --- | --- | --- |
| 1 | none | 5, 6 |
| 2 | none | 3, 4, 6 |
| 3 | 2 | 4, 6 |
| 4 | 2, 3 | 6 |
| 5 | 1 | 6 |
| 6 | 1, 2, 3, 4, 5 | final completion |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 2 tasks → writing, quick
- Wave 2 → 2 tasks → deep, quick
- Wave 3 → 2 tasks → writing, unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Update architecture adaptation matrix

  **What to do**: Update `ARCHITECTURE.md` to include a concise section that classifies MemPalace concepts as adapted, deferred, or rejected. Keep Thai prose. Use this exact classification:
  - Memory Stack → adapted as layered context assembly (`startup brief`, `wake_up_memory`, `build_context_for_task`, `search_memories`, retrieval traces)
  - Knowledge Graph → deferred; only temporal/supersession review hints are allowed now
  - AAAK Dialect → deferred; optional future compact rendering only, never storage default
  - Specialist Agents → adapted only as actor-attributed metadata convention, no registry/routing
  - Contradiction Detection → adapted only as advisory review hints, no truth engine

  **Must NOT do**: Do not add MemPalace public vocabulary as repo vocabulary. Do not edit README unless a test already requires docs-map consistency.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: docs-only architecture update with precise boundaries.
  - Skills: [`mahiro-docs-rules-init`, `mahiro-style`] - Use repo-reality-first docs and boundary language.
  - Omitted: [`frontend-ui-ux`] - No UI work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5, 6 | Blocked By: none

  **References**:
  - Pattern: `ARCHITECTURE.md` - Current Thai architecture doc and Mermaid diagrams.
  - Boundary: `ARCHITECTURE_BOUNDARIES.md:9-23` - Current ownership boundary.
  - Runtime docs: `MCP_USAGE.md:43-50` - Lifecycle contract.
  - Direction: `AGENT_NEXT_STEPS.md:22-29` - Future raw/derived gates and MemPalace vocabulary warning.

  **Acceptance Criteria**:
  - [ ] `ARCHITECTURE.md` includes the exact five-row adapted/deferred/rejected concept classification above.
  - [ ] `ARCHITECTURE.md` states host lifecycle events remain memory-facing only.
  - [ ] `ARCHITECTURE.md` does not claim KG, AAAK, agent registry, or truth-engine behavior is shipped.
  - [ ] Command exits 0: `rtk bun run test -- tests/continuity-debugging-docs.test.ts` if docs assertions are added; otherwise record grep evidence in `.sisyphus/evidence/task-1-architecture-matrix.txt`.

  **QA Scenarios**:
  ```
  Scenario: Architecture matrix preserves memory-only scope
    Tool: Bash
    Steps: Run a script or grep that confirms `ARCHITECTURE.md` contains Memory Stack, Knowledge Graph, AAAK Dialect, Specialist Agents, Contradiction Detection, and the words adapted/deferred/rejected in the new section.
    Expected: All required terms are present and no shipped KG/AAAK/registry claim appears.
    Evidence: .sisyphus/evidence/task-1-architecture-matrix.txt

  Scenario: Forbidden public scope does not creep in
    Tool: Bash
    Steps: Search `ARCHITECTURE.md` for claims that this repo owns workflow control, worker routing, task lifecycle, supervision, executor ownership, hook dispatch, truth engine, or agent registry.
    Expected: Matches, if any, appear only under explicit non-goals/deferred/rejected wording.
    Evidence: .sisyphus/evidence/task-1-forbidden-scope.txt
  ```

  **Commit**: NO | Message: `docs: classify mempalace memory concepts` | Files: [`ARCHITECTURE.md`]

- [x] 2. Add review-hint contract tests first

  **What to do**: Extend `tests/memory-service.test.ts` around the existing review queue overview test. Add tests that define the `possible_supersession` contract before/with implementation:
  - same-scope pending memory with explicit newer update signal compared to older verified memory emits `possible_supersession`
  - different project/container does not emit `possible_supersession`
  - no verified comparison memory emits no hint
  - older or same-timestamp evidence emits no hint
  - semantically similar text without explicit update/supersession signal emits no hint
  - review hints do not mutate verified memory records
  Use existing fixture and `MemoryService` pattern from `tests/memory-service.test.ts:454-543`.

  **Must NOT do**: Do not weaken existing duplicate/contradiction assertions. Do not add brittle snapshot tests.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused Vitest additions in one existing test file.
  - Skills: [] - Repo test pattern is explicit enough.
  - Omitted: [`playwright`] - No browser/UI.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4, 6 | Blocked By: none

  **References**:
  - Test: `tests/memory-service.test.ts:454-543` - Existing review queue overview and assist tests.
  - Type: `src/features/memory/types.ts:164-170` - `MemoryReviewHintType` and hint shape.
  - Source: `src/features/memory/memory-service.ts:535-575` - Existing review hint collection.

  **Acceptance Criteria**:
  - [ ] New tests initially fail before implementation or are committed with implementation in the same task if executor uses red/green locally.
  - [ ] Tests assert `possible_supersession` is same-scope only.
  - [ ] Tests assert no automatic mutation of verified records.
  - [ ] Command exits 0 after implementation: `rtk bun run test -- tests/memory-service.test.ts`.

  **QA Scenarios**:
  ```
  Scenario: Same-scope supersession hint is contract-tested
    Tool: Bash
    Steps: Run `rtk bun run test -- tests/memory-service.test.ts` after adding the test and implementation.
    Expected: Test covering same-scope `possible_supersession` passes and asserts related verified memory id.
    Evidence: .sisyphus/evidence/task-2-review-hint-tests.txt

  Scenario: Cross-scope memory is ignored
    Tool: Bash
    Steps: Run the same test file; inspect test output and grep test source for the cross-scope case.
    Expected: Cross-project/container verified memory does not produce `possible_supersession`.
    Evidence: .sisyphus/evidence/task-2-cross-scope-tests.txt
  ```

  **Commit**: NO | Message: `test(memory): define supersession review hint contract` | Files: [`tests/memory-service.test.ts`]

- [x] 3. Implement advisory `possible_supersession` review hint

  **What to do**: Update memory review types and hint collection:
  - Add `"possible_supersession"` to `MemoryReviewHintType` in `src/features/memory/types.ts`.
  - Add priority reason handling if needed in `toReviewQueueOverviewItem`; modest priority boost only, lower than contradiction unless tests require otherwise.
  - Extend `collectReviewHints(record, verifiedRecords)` in `src/features/memory/memory-service.ts`.
  - Supersession should require all of:
    1. proposed/pending review record and related verified memory are already same-scope via existing `relevantVerified` filtering,
    2. normalized content is not identical,
    3. meaningful token/topic overlap (reuse existing token overlap threshold of at least 3 unless tests prove too noisy),
    4. proposed record has newer explicit evidence/update signal than verified record: prefer `verifiedAt`, then `updatedAt`, then `createdAt`, and only treat as explicit if proposed text/tags/source includes an update signal such as `supersedes`, `replaces`, `instead`, `changed`, `now`, `no longer`, `current`, `updated`, or Thai equivalents `เปลี่ยน`, `แทน`, `ปัจจุบัน`, `ไม่ใช้แล้ว`, `ยกเลิก`,
    5. related memory is verified.
  - Hint note must be exactly: `May supersede an existing verified memory; review newer evidence before changing memory status.` unless tests choose a clearer wording.

  **Must NOT do**: Do not mutate existing verified memory. Do not remove `possible_contradiction`. Do not make the hint affect retrieval ranking or promotion.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: small code change but boundary-sensitive semantics and tests.
  - Skills: [] - Existing source/test references are enough.
  - Omitted: [`mahiro-docs-rules-init`] - This task is source/test behavior, not docs.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 4, 6 | Blocked By: 2

  **References**:
  - Type: `src/features/memory/types.ts:164-170` - Extend review hint union.
  - Source: `src/features/memory/memory-service.ts:286-307` - Overview item construction.
  - Source: `src/features/memory/memory-service.ts:535-575` - Review hint collection.
  - Source: `src/features/memory/memory-service.ts:578-603` - Text normalization/token/polarity helpers.
  - Test: `tests/memory-service.test.ts:454-543` - Existing behavior to preserve.

  **Acceptance Criteria**:
  - [ ] `possible_supersession` appears in `MemoryReviewHintType`.
  - [ ] `listReviewQueueOverview` can emit `possible_supersession` only under the all-of conditions above.
  - [ ] Existing `likely_duplicate` and `possible_contradiction` tests continue passing.
  - [ ] Verified related memory remains unchanged after overview generation.
  - [ ] Command exits 0: `rtk bun run test -- tests/memory-service.test.ts`.

  **QA Scenarios**:
  ```
  Scenario: Supersession hint is advisory only
    Tool: Bash
    Steps: Run `rtk bun run test -- tests/memory-service.test.ts` and inspect the test that reads verified memory after overview generation.
    Expected: Hint is returned on the pending item; verified memory content/status/evidence remain unchanged.
    Evidence: .sisyphus/evidence/task-3-advisory-supersession.txt

  Scenario: Similarity without update signal is ignored
    Tool: Bash
    Steps: Run the memory service test that creates similar same-scope records without update/supersession words.
    Expected: No `possible_supersession` hint is emitted.
    Evidence: .sisyphus/evidence/task-3-no-signal-no-hint.txt
  ```

  **Commit**: NO | Message: `feat(memory): add advisory supersession review hint` | Files: [`src/features/memory/types.ts`, `src/features/memory/memory-service.ts`, `tests/memory-service.test.ts`]

- [x] 4. Improve review assist suggestions for contradiction and supersession

  **What to do**: Update `MemoryReviewAssistKind` and `buildReviewAssistSuggestions` if needed:
  - Keep existing `resolve_contradiction` for `possible_contradiction`, but revise wording to emphasize reviewer comparison, not automatic replacement.
  - Add `review_supersession` to `MemoryReviewAssistKind` if a distinct kind is clearer than reusing `gather_evidence`.
  - For `possible_supersession`, suggestion should include related memory id, rationale from the hint, draft content that says: `Compare proposed memory against existing verified memory before deciding whether to edit/promote, defer, or reject.`
  - Suggested action should be `collect_evidence` unless the test proves `edit_then_promote` is safer; default is `collect_evidence` per Metis.

  **Must NOT do**: Do not auto-select reject/promote. Do not overwrite draft content with a final truth statement.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: narrow source/type/test update after hint exists.
  - Skills: [] - Existing test/source references are clear.
  - Omitted: [`oracle`] - Oracle already reviewed architecture risk.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6 | Blocked By: 2, 3

  **References**:
  - Type: `src/features/memory/types.ts:164-210` - Assist kind/result shapes.
  - Source: `src/features/memory/memory-service.ts:605-647` - Assist suggestions.
  - Test: `tests/memory-service.test.ts:522-542` - Existing assist expectations.

  **Acceptance Criteria**:
  - [ ] `get_review_assist` returns a reviewer-facing suggestion for `possible_supersession`.
  - [ ] `get_review_assist` still returns duplicate and contradiction suggestions for existing cases.
  - [ ] Supersession suggestion uses `collect_evidence` by default.
  - [ ] Command exits 0: `rtk bun run test -- tests/memory-service.test.ts`.

  **QA Scenarios**:
  ```
  Scenario: Review assist explains supersession without deciding truth
    Tool: Bash
    Steps: Run `rtk bun run test -- tests/memory-service.test.ts` and inspect the `getReviewAssist` supersession expectation.
    Expected: Suggestion is reviewer-facing, references related memory id, and uses `collect_evidence`.
    Evidence: .sisyphus/evidence/task-4-supersession-assist.txt

  Scenario: Existing contradiction assist remains available
    Tool: Bash
    Steps: Run existing contradiction assist test.
    Expected: `resolve_contradiction` still appears for `possible_contradiction`.
    Evidence: .sisyphus/evidence/task-4-contradiction-preserved.txt
  ```

  **Commit**: NO | Message: `feat(memory): improve review assist for supersession hints` | Files: [`src/features/memory/types.ts`, `src/features/memory/memory-service.ts`, `tests/memory-service.test.ts`]

- [x] 5. Document actor-attributed memory convention

  **What to do**: Add a concise section to `ARCHITECTURE.md` or `MCP_USAGE.md` (choose `ARCHITECTURE.md` unless executor finds runtime usage docs need it) titled `Actor-attributed memory convention` / `ข้อตกลง actor-attributed memory`. Define convention using existing APIs only:
  - `source.title`: `agent:<stable-name>` or `actor:<stable-name>`
  - `tags`: include `actor:<stable-name>` and optional `diary`
  - `kind`: use existing `conversation`, `decision`, `fact`, or `task`; do not add `diary` kind
  - `summary`: concise reason/pattern
  - `content`: durable note in normal language, not AAAK
  State that this is metadata convention, not registry, routing, ownership, or specialist-agent infrastructure.

  **Must NOT do**: Do not add tools, schemas, source types, memory kinds, or routing behavior for agents.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: docs-only convention.
  - Skills: [`mahiro-docs-rules-init`, `mahiro-style`] - Keep convention repo-reality-first.
  - Omitted: [`deep`] - No code behavior expected.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 6 | Blocked By: 1

  **References**:
  - Type: `src/features/memory/types.ts:23-47` - Existing memory record fields.
  - Tool docs: `src/features/memory/lib/tool-definitions.ts:80-103` - `remember` and `upsert_document` descriptions.
  - Boundary: `AGENT_NEXT_STEPS.md:31-35` - Prevent workflow-control creep.
  - Architecture: `ARCHITECTURE.md` - Current Thai architecture doc.

  **Acceptance Criteria**:
  - [ ] Documentation defines actor-attributed memory using only existing fields.
  - [ ] Documentation explicitly says this is not an agent registry/routing system.
  - [ ] No source schema/type changes are made for actor diaries.
  - [ ] Evidence records grep showing no new `diary` memory kind or agent registry terms in `src/`.

  **QA Scenarios**:
  ```
  Scenario: Actor convention uses existing memory fields only
    Tool: Bash
    Steps: Grep docs for `source.title`, `tags`, `kind`, `summary`, and `content`; grep source diff for absence of new memory kind/source type.
    Expected: Docs define the convention; source types remain unchanged.
    Evidence: .sisyphus/evidence/task-5-actor-convention.txt

  Scenario: No agent infrastructure is introduced
    Tool: Bash
    Steps: Search changed files for `agent registry`, `worker routing`, `executor`, and new agent tool names.
    Expected: Any matches appear only as explicit non-goals; no new tools or runtime paths are added.
    Evidence: .sisyphus/evidence/task-5-no-agent-infra.txt
  ```

  **Commit**: NO | Message: `docs: define actor-attributed memory convention` | Files: [`ARCHITECTURE.md` or `MCP_USAGE.md`]

- [x] 6. Full verification and boundary review

  **What to do**: Run full verification and record evidence:
  - `rtk bun run typecheck`
  - `rtk bun run test`
  - `rtk bun run build`
  - `git diff -- ARCHITECTURE.md MCP_USAGE.md src/features/memory/types.ts src/features/memory/memory-service.ts tests/memory-service.test.ts`
  - Search changed files for forbidden scope additions.
  - Confirm untracked/modified files are expected; `ARCHITECTURE.md` is already a new untracked file from this session.

  **Must NOT do**: Do not commit unless user explicitly requests it. Do not run `bun run reindex` unless retrieval indexing/embedding behavior changed beyond review hint metadata.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: verification and boundary review across docs/source/tests.
  - Skills: [] - Standard repo commands and grep/diff evidence.
  - Omitted: [`playwright`] - No UI/browser work.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: final completion | Blocked By: 1, 2, 3, 4, 5

  **References**:
  - Commands: `package.json:34-43` - Repo scripts.
  - Boundary: `ARCHITECTURE_BOUNDARIES.md:60-73` - Ownership and drift checks.
  - Tests: `tests/memory-service.test.ts` - Main behavior coverage.

  **Acceptance Criteria**:
  - [ ] `rtk bun run typecheck` exits 0.
  - [ ] `rtk bun run test` exits 0.
  - [ ] `rtk bun run build` exits 0.
  - [ ] Diff contains no KG/AAAK/agent registry/runtime ownership implementation.
  - [ ] Evidence files exist for full verification and scope review.

  **QA Scenarios**:
  ```
  Scenario: Full verification passes
    Tool: Bash
    Steps: Run `rtk bun run typecheck && rtk bun run test && rtk bun run build`.
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-6-full-verification.txt

  Scenario: Boundary review rejects scope creep
    Tool: Bash
    Steps: Search changed files for KG implementation, AAAK implementation, agent registry/routing, workflow control, hook dispatch, executor ownership, and truth-engine behavior.
    Expected: No implementation of forbidden concepts; docs only mention them as deferred/rejected/non-goals.
    Evidence: .sisyphus/evidence/task-6-boundary-review.txt
  ```

  **Commit**: NO | Message: `feat(memory): add advisory supersession review hints` | Files: [`ARCHITECTURE.md`, `src/features/memory/types.ts`, `src/features/memory/memory-service.ts`, `tests/memory-service.test.ts`, optional `MCP_USAGE.md`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Do not commit automatically.
- If user requests a commit, use one focused commit after all verification passes.
- Suggested commit message: `feat(memory): add advisory supersession review hints`
- Include only intentional files: `ARCHITECTURE.md`, source/test files touched for review hints, and optional docs updates.

## Success Criteria
- The repo gains a memory-native adaptation of MemPalace concepts without becoming a MemPalace clone.
- `possible_supersession` helps reviewers identify newer evidence while never deciding truth automatically.
- Actor-attributed memory is documented as metadata convention only.
- Verification passes and final review wave approves before completion.
