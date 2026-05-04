# Memory-Facing Lifecycle Contract

## TL;DR
> **Summary**: Harden `mahiro-mcp-memory-layer` around host lifecycle signals as a memory-only engine: clearer protocol/diagnostics first, then PreCompact checkpointing, then idle/session persistence hardening. Do not implement Claude hooks compatibility, hook dispatch, workflow control, or MemPalace feature parity.
> **Deliverables**:
> - Additive memory lifecycle diagnostics in `memory_context` and `runtime_capabilities`
> - A documented memory protocol for search/save/invalidate/checkpoint behavior
> - PreCompact checkpoint continuity that uses existing memory helper contracts without executing hooks
> - Idle/session persistence reason codes and idempotency tests
> - Explicit deferred design notes for raw + derived/verbatim-first memory
> **Effort**: Large
> **Parallel**: LIMITED - sequential contract spine with parallelizable doc/test satellites + final verification wave
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 6 → Final Verification Wave

## Context

### Original Request
The user asked to analyze how to apply MemPalace concepts and principles to this repo, then added that `docs/oh-my-openagent/claude-hooks-compatibility.md` is important context from studying `oh-my-openagent`, and finally said: “เริ่มวางแผนได้เลย” (“start planning”).

### Interview Summary
- User wants an architecture plan, not immediate implementation.
- MemPalace concepts to consider: checkpoint hooks, layered memory stack, memory protocol, verbatim-first storage, local-first retrieval.
- The user confirmed a learned MemPalace project is available locally; executors may use that learned project as an additional reference source for implementation patterns, but it remains reference-only and not a dependency.
- oh-my-openagent lesson: Claude hooks compatibility belongs in an adapter over OpenCode plugin primitives, not inside this memory package.
- This repo must remain `mahiro-mcp-memory-layer`: local-first agent memory, retrieval, context assembly, and memory diagnostics.

### Metis Review (gaps addressed)
- Added hard non-goals forbidding hook dispatch, command/http hooks, workflow control, task lifecycle state, worker routing, and executor ownership.
- Treated MemPalace as inspiration only; public vocabulary remains this repo’s memory vocabulary.
- Deferred raw/verbatim storage until privacy and review-policy gates are decision-complete.
- Required idempotency and degraded-mode tests for duplicate/missing lifecycle signals.
- Required additive/backwards-compatible contract updates for `memory_context` and `runtime_capabilities`.

## Work Objectives

### Core Objective
Create a boundary-preserving memory lifecycle contract that lets this package consume host lifecycle events for memory continuity while staying out of hook execution and workflow-control responsibilities.

### Deliverables
- Memory protocol text exposed through startup/runtime memory surfaces.
- Additive lifecycle diagnostics in `memory_context`.
- Additive lifecycle capability fields in `runtime_capabilities` only if they remain memory-scoped.
- PreCompact checkpoint behavior using existing memory helper paths.
- Idle/session persistence reason codes and idempotency behavior.
- Documentation updates in memory-facing docs only.
- Regression tests for lifecycle events, idempotency, degraded scope, and boundary guardrails.

### Definition of Done (verifiable conditions with commands)
- `rtk bun run typecheck` exits `0`.
- `rtk bun run test` exits `0` and includes lifecycle diagnostics/regression tests.
- `rtk bun run build` exits `0`.
- Targeted lifecycle tests exit `0`: `rtk bunx vitest run tests/product-memory-plugin.test.ts tests/opencode-plugin-package.test.ts tests/opencode-plugin-scope-resolution.test.ts` plus any new lifecycle test files added by this plan.
- `memory_context` remains memory-facing and exposes lifecycle diagnostics without hook runtime state.
- `runtime_capabilities.mode === "plugin-native"` and new capability fields, if any, are scoped under memory lifecycle/preparation, not generic hooks.
- No source export or docs claim Claude hooks compatibility or command/http hook execution.

### Must Have
- Preserve existing memory tool names and backwards compatibility.
- Preserve plugin-native `wake_up_memory`, `prepare_turn_memory`, `prepare_host_turn_memory`, `memory_context`, and `runtime_capabilities`.
- Treat `experimental.session.compacting` as a memory checkpoint signal only.
- Include explicit skip/reason diagnostics for lifecycle operations.
- Duplicate lifecycle events must not create duplicate durable memories.
- Missing/unknown scope must produce degraded diagnostics, not crashes.

### Must NOT Have
- Do not implement Claude Code hooks compatibility.
- Do not read or execute `.claude/settings.json`, `.codex/hooks.json`, or hook DSL config.
- Do not dispatch command/http hooks.
- Do not block/mutate tools or implement permission enforcement.
- Do not add workflow-control state, worker routing, task lifecycle state, supervision, or executor ownership logic.
- Do not introduce “palace/drawer/L0-L3” as public product vocabulary; map concepts to existing memory terms.
- Do not auto-save raw/verbatim session content without review/save-policy gates.
- Do not edit user memory data files under `data/` as part of implementation.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after with Vitest; add focused regression tests near current plugin/memory tests.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 only (contract baseline; establishes shared vocabulary and boundaries)
Wave 2: Tasks 2-3 (protocol contract and diagnostics shape; can run in parallel after Task 1)
Wave 3: Tasks 4-7 (runtime wiring; Task 4 first, then Tasks 5-7 can proceed with Task 6 and 7 coordinated on idempotency)
Wave 4: Tasks 8-10 (docs, boundary guards, deferred raw/derived design note; can run in parallel after runtime contracts are stable)
Wave 5: Task 11 (full integration/verification consolidation)

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.
- Task 2 blocks Tasks 4, 8, 11.
- Task 3 blocks Tasks 4, 5, 7, 11.
- Task 4 blocks Tasks 6, 7, 11.
- Task 5 blocks Tasks 8, 9, 11.
- Task 6 blocks Tasks 8, 11 and must coordinate with Task 7 on a shared persistence idempotency key.
- Task 7 blocks Tasks 8, 11 and must coordinate with Task 6 on a shared persistence idempotency key.
- Tasks 8-10 block Task 11.
- Task 11 blocks Final Verification Wave.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 1 task → unspecified-high
- Wave 2 → 2 tasks → writing, deep
- Wave 3 → 4 tasks → unspecified-high, deep, quick
- Wave 4 → 3 tasks → writing, unspecified-high
- Wave 5 → 1 task → unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Establish Lifecycle Contract Baseline

  **What to do**: Inspect current lifecycle/runtime contract and create a small internal mapping in code/tests/docs that names only memory-facing lifecycle stages: `session-start-wake-up`, `turn-preflight`, `idle-persistence`, `compaction-continuity`. Use existing constants or a small type if needed; keep it internal to the plugin runtime unless already exposed via memory diagnostics. Verify existing handlers in `runtime-shell.ts` still route `session.created`, `message.updated`, `message.part.updated`, `session.idle`, and `experimental.session.compacting` exactly as memory signals.
  **Must NOT do**: Do not add Claude hook names as runtime API. Do not add `PreToolUse`, `PostToolUse`, `Stop`, or `PreCompact` as public package concepts except in docs that explicitly say they are external adapter concepts.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: boundary-sensitive TypeScript changes across runtime files and tests.
  - Skills: [] - No specialized skill required beyond repo-local patterns.
  - Omitted: [`playwright`] - No browser/UI behavior.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Boundary: `ARCHITECTURE_BOUNDARIES.md:7-19` - Defines package-owned memory scope and excludes workflow control.
  - Direction: `AGENT_NEXT_STEPS.md:11-25` - Requires memory-only posture and preserving plugin-native lifecycle helpers.
  - Usage contract: `MCP_USAGE.md:36-40` - Documents wake-up, turn preflight, and idle persistence as plugin-native memory behaviors.
  - Research note: `docs/oh-my-openagent/claude-hooks-compatibility.md:124-143` - Explicitly forbids this repo from owning hook execution/runtime compatibility.
  - Runtime: `src/features/opencode-plugin/runtime-shell.ts` - Current lifecycle routing implementation.
  - Runtime assembly: `src/features/opencode-plugin/index.ts` - Plugin hook registration surface.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rtk bunx vitest run tests/product-memory-plugin.test.ts` exits `0`.
  - [ ] A test asserts lifecycle routing remains memory-facing and does not expose Claude hook names as runtime capabilities.
  - [ ] No source export includes command/http hook dispatch or Claude hook DSL parsing.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Lifecycle names remain memory-facing
    Tool: Bash
    Steps: Run `rtk bunx vitest run tests/product-memory-plugin.test.ts`.
    Expected: Exit code 0; assertions refer to session wake-up, turn preflight, idle persistence, and compaction continuity, not Claude hook runtime execution.
    Evidence: .sisyphus/evidence/task-1-lifecycle-contract.txt

  Scenario: Hook runtime surface is absent
    Tool: Bash
    Steps: Run a non-mutating search command or test assertion that source exports do not introduce `dispatchHook`, `PreToolUse`, `PostToolUse`, `command hook`, or `http hook` runtime APIs in this package.
    Expected: No exported runtime/API surface for hook dispatch exists.
    Evidence: .sisyphus/evidence/task-1-no-hook-runtime.txt
  ```

  **Commit**: NO | Message: `fix(memory): establish lifecycle contract baseline` | Files: [runtime/tests touched by executor]

- [x] 2. Add Memory Protocol Text to Startup/Context Surfaces

  **What to do**: Add a concise memory protocol contract for agents and expose it through existing memory-facing startup/context surfaces. Prefer a stable additive `memoryProtocol` field with `version` and `guidelines` (or an equivalently tested helper-generated field) over prose-only startup text; startup brief may include the same text as a human-readable rendering. Protocol must say: search before answering about prior work; inspect retrieval trace when recall is empty; save/propose durable decisions/preferences/tasks through existing tools; use review/invalidation flow for contradictions; preserve current decisions/tasks before compaction.
  **Must NOT do**: Do not instruct agents to execute hooks, read Claude settings, or control workflow. Do not add user-interactive requirements.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: contract/protocol wording must be precise and boundary-safe.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 4, 8, 11 | Blocked By: 1

  **References**:
  - Startup brief: `src/features/opencode-plugin/runtime-capabilities.ts` - Builds runtime startup/capability brief.
  - Context cache: `src/features/opencode-plugin/runtime-state.ts` - Shapes `memory_context` output.
  - Usage docs: `MCP_USAGE.md:59-80` - Explains `memory_context` purpose.
  - MemPalace concept source: official pages crawled by webclaw; use only principles, not product vocabulary.
  - Optional learned project reference: learned MemPalace project, if available in local project tracking - use for cross-checking concepts only; do not import code or add dependency.

  **Acceptance Criteria**:
  - [ ] `memory_context` includes a stable additive memory protocol contract, e.g. `memoryProtocol.version` plus guidelines, or an equivalent helper-tested field.
  - [ ] Startup brief may render the protocol but tests must assert the stable contract field/helper, not only fragile prose.
  - [ ] Existing `memory_context` consumers remain backwards compatible; existing tests still pass.
  - [ ] Protocol contains no instruction to execute command/http hooks or mutate tools.

  **QA Scenarios**:
  ```
  Scenario: Protocol appears in memory context/startup data
    Tool: Bash
    Steps: Run targeted plugin tests that call `memory_context` after `session.created`.
    Expected: Output includes a stable `memoryProtocol`-style contract or helper-tested field with search/trace/save/review/checkpoint guidance.
    Evidence: .sisyphus/evidence/task-2-memory-protocol.txt

  Scenario: Protocol does not claim hook runtime ownership
    Tool: Bash
    Steps: Run targeted assertion against protocol string.
    Expected: Protocol has no `execute hooks`, `.claude/settings.json`, command hook dispatch, HTTP hook dispatch, or permission enforcement claims.
    Evidence: .sisyphus/evidence/task-2-protocol-boundary.txt
  ```

  **Commit**: NO | Message: `docs(memory): expose memory protocol` | Files: [`src/features/opencode-plugin/runtime-capabilities.ts`, `src/features/opencode-plugin/runtime-state.ts`, tests]

- [x] 3. Define Additive Lifecycle Diagnostics Shape

  **What to do**: Extend `memory_context` with additive lifecycle diagnostics for each memory-facing lifecycle stage: last attempted at, status (`not_run`, `skipped`, `succeeded`, `failed_open`), reason code, scope used, and summary counts where available (`retrieved`, `candidates`, `autoSaved`, `reviewOnly`, `skipped`). Define types in `runtime-state.ts` or a nearby runtime file. Keep existing `continuityCache` fields intact. For events without a resolvable session, do not invent session-scoped diagnostics; instead expose latest global/plugin-level memory diagnostic only if a safe plugin-level cache already exists or is added as memory introspection, otherwise document that sessionless events are diagnosable only through lifecycle logs/retrieval traces.
  **Must NOT do**: Do not expose workflow-control state, task executor state, worker routing, or hook handler configuration.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: contract/type shape affects runtime context and tests.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 4, 5, 7, 11 | Blocked By: 1

  **References**:
  - `src/features/opencode-plugin/runtime-state.ts:14-68` - Current cached session/result types.
  - `MCP_USAGE.md:59-80` - Current documented memory_context fields.
  - `CONTINUITY_DEBUGGING.md:1-24` - Debugging flow starts from `memory_context`.

  **Acceptance Criteria**:
  - [ ] `memory_context` output still has `status`, `latestSessionId`, `session`, `scopeResolution`, `coordination`, and `continuityCache` as before.
  - [ ] New diagnostics are additive and typed.
  - [ ] Tests cover skipped, succeeded, and failed-open lifecycle states without throwing.
  - [ ] Plan/implementation specifies behavior for events with missing session/scope: either safe plugin-level diagnostic or documented absence with no crash.

  **QA Scenarios**:
  ```
  Scenario: Succeeded lifecycle diagnostics are visible
    Tool: Bash
    Steps: Simulate `session.created`, `message.updated`, and `session.idle` in plugin tests, then call `memory_context`.
    Expected: Diagnostics show succeeded states and correct scope for wake-up/turn/idle stages.
    Evidence: .sisyphus/evidence/task-3-diagnostics-success.txt

  Scenario: Skipped lifecycle diagnostics explain why nothing ran
    Tool: Bash
    Steps: Simulate small-talk/empty message and session idle, then call `memory_context`.
    Expected: Diagnostics include a skip reason such as `small_talk`, `empty_recent_conversation`, or equivalent.
    Evidence: .sisyphus/evidence/task-3-diagnostics-skipped.txt

  Scenario: Sessionless event does not fabricate session diagnostics
    Tool: Bash
    Steps: Simulate a lifecycle event without `sessionID`/`info.id`, then call `memory_context` without a session ID.
    Expected: No crash; output is `status: "empty"` or includes only explicitly designed plugin-level memory diagnostics, never fake session state.
    Evidence: .sisyphus/evidence/task-3-sessionless-diagnostics.txt
  ```

  **Commit**: NO | Message: `feat(memory): add lifecycle diagnostics shape` | Files: [`src/features/opencode-plugin/runtime-state.ts`, tests]

- [x] 4. Wire Lifecycle Diagnostics into Runtime Shell

  **What to do**: Update `runtime-shell.ts` to populate diagnostics from actual lifecycle paths: session wake-up start/success/fail-open, turn preflight skipped/success/fail-open, idle persistence skipped/deduped/success/fail-open. Record reason codes at each early return path. Include scope and message/turn key where memory-facing. Preserve current fail-open behavior.
  **Must NOT do**: Do not make lifecycle failures fatal. Do not block user operations. Do not add hook dispatch.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: careful runtime changes and async paths.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 6, 7, 11 | Blocked By: 2, 3

  **References**:
  - `src/features/opencode-plugin/runtime-shell.ts:134-255` - Wake-up path.
  - `src/features/opencode-plugin/runtime-shell.ts:266-356` - Turn preflight path.
  - `src/features/opencode-plugin/runtime-shell.ts:366-452` - Idle persistence path.
  - `src/features/opencode-plugin/runtime-shell.ts:575-610` - Memory preflight routing/skips.

  **Acceptance Criteria**:
  - [ ] Every early return in turn preflight and idle persistence records a deterministic reason code.
  - [ ] Wake-up backend failures record `failed_open` diagnostics while preserving session startup behavior.
  - [ ] Fail-open catches record failure diagnostics while preserving current behavior.
  - [ ] Duplicate idle events record `deduped` or equivalent instead of silently disappearing.

  **QA Scenarios**:
  ```
  Scenario: Duplicate idle event is diagnosed, not duplicated
    Tool: Bash
    Steps: Simulate one durable message then two `session.idle` events for the same message ID.
    Expected: Backend persistence is called once; diagnostics report duplicate/deduped for the second event.
    Evidence: .sisyphus/evidence/task-4-idle-dedupe.txt

  Scenario: Missing conversation is diagnosed
    Tool: Bash
    Steps: Simulate `session.idle` without prior message text and call `memory_context`.
    Expected: No crash; diagnostics show skipped with reason `no_recent_conversation` or equivalent.
    Evidence: .sisyphus/evidence/task-4-missing-conversation.txt

  Scenario: Wake-up backend failure is diagnosed and fails open
    Tool: Bash
    Steps: Mock `wakeUpMemory` rejection during `session.created`, then call `memory_context` for the session.
    Expected: Handler does not throw; diagnostics show wake-up `failed_open` with error summary.
    Evidence: .sisyphus/evidence/task-4-wakeup-fail-open.txt
  ```

  **Commit**: NO | Message: `feat(memory): record lifecycle diagnostics` | Files: [`src/features/opencode-plugin/runtime-shell.ts`, tests]

- [x] 5. Keep Runtime Capabilities Memory-Only and Additive

  **What to do**: If capability additions are needed, add only memory-scoped fields such as `memory.lifecycleDiagnosticsAvailable`, `memory.compactionContinuityAvailable`, or `memory.memoryProtocolAvailable`. Update tests and docs. Do not add generic `hooksAvailable` or Claude compatibility fields.
  **Must NOT do**: Do not expose adapter/hook dispatch capability flags in this package.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small contract/test update once diagnostics shape exists.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8, 11 | Blocked By: 3

  **References**:
  - `src/features/opencode-plugin/runtime-capabilities.ts` - Capability contract source.
  - `tests/product-memory-plugin.test.ts` - Runtime capability assertions.
  - `MCP_USAGE.md:46-58` - Runtime capabilities documentation.

  **Acceptance Criteria**:
  - [ ] `runtime_capabilities` stays `mode: "plugin-native"`.
  - [ ] All new fields are under `memory` and are memory lifecycle/protocol capabilities only.
  - [ ] Tests fail if a generic hook runtime capability is exposed.

  **QA Scenarios**:
  ```
  Scenario: Capabilities remain memory scoped
    Tool: Bash
    Steps: Run product plugin tests that execute `runtime_capabilities`.
    Expected: Output includes memory tool names and memory lifecycle flags only.
    Evidence: .sisyphus/evidence/task-5-capabilities-memory-only.txt

  Scenario: No Claude compatibility claim
    Tool: Bash
    Steps: Assert capabilities do not contain `claudeHooks`, `hookDispatch`, `commandHooks`, or `httpHooks`.
    Expected: Assertion passes.
    Evidence: .sisyphus/evidence/task-5-no-compat-claim.txt
  ```

  **Commit**: NO | Message: `feat(memory): advertise memory lifecycle capabilities` | Files: [`src/features/opencode-plugin/runtime-capabilities.ts`, tests, docs]

- [x] 6. Implement PreCompact as Memory Checkpoint Continuity

  **What to do**: Upgrade `experimental.session.compacting` handling so compaction becomes an explicit memory checkpoint. Before appending cached continuity, attempt memory-facing checkpoint preparation using existing helper paths where safe. The preferred first implementation: use cached `prepareTurn`/`prepareHostTurn` if present; if recent conversation exists and scope is complete, run `prepareHostTurnMemory` with provenance phase `compaction-checkpoint` and record diagnostics. Because `prepareHostTurnMemory` can apply conservative persistence, share an idempotency key with idle persistence (for example message ID / turn key + phase-safe write guard) so `message.updated` + `session.idle` + compaction cannot duplicate durable writes for the same turn. Append only memory continuity text to compaction output through existing `runtime-compaction.ts` behavior. Keep this fail-open.
  **Must NOT do**: Do not execute hooks. Do not dispatch commands/http. Do not block compaction on memory failure. Do not store raw verbatim content automatically.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: async lifecycle + compaction behavior is boundary-sensitive.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 8, 11 | Blocked By: 4

  **References**:
  - `src/features/opencode-plugin/runtime-shell.ts:491-495` - Current compaction handler.
  - `src/features/opencode-plugin/runtime-compaction.ts` - Current compaction continuity append behavior.
  - `src/features/memory/memory-facade.ts:79-123` - `prepareHostTurnMemory` composition.
  - `src/features/memory/types.ts` - Prepare result types.
  - `docs/oh-my-openagent/claude-hooks-compatibility.md:17` - PreCompact maps to `experimental.session.compacting`, but adapter runtime is out of scope.

  **Acceptance Criteria**:
  - [ ] `experimental.session.compacting` records a memory checkpoint diagnostic.
  - [ ] Compaction output remains append-only and does not overwrite an existing prompt.
  - [ ] If backend checkpoint fails, compaction still proceeds and diagnostics show `failed_open`.
  - [ ] `message.updated` + `session.idle` + `experimental.session.compacting` for the same turn does not duplicate durable writes.
  - [ ] Missing/incomplete scope during compaction records degraded/skipped diagnostics, not a crash.
  - [ ] No hook execution or external command dispatch is introduced.

  **QA Scenarios**:
  ```
  Scenario: PreCompact appends memory checkpoint continuity
    Tool: Bash
    Steps: Simulate message update then `experimental.session.compacting`; inspect output append content and `memory_context` diagnostics.
    Expected: Continuity text is appended; diagnostics show compaction checkpoint succeeded.
    Evidence: .sisyphus/evidence/task-6-precompact-success.txt

  Scenario: PreCompact backend failure fails open
    Tool: Bash
    Steps: Mock backend `prepareHostTurnMemory` rejection during compaction.
    Expected: Compaction handler resolves without throwing; diagnostics show failed_open; no command/http hook execution occurs.
    Evidence: .sisyphus/evidence/task-6-precompact-fail-open.txt

  Scenario: Idle plus compaction does not duplicate persistence
    Tool: Bash
    Steps: Simulate durable message text, run `session.idle`, then run `experimental.session.compacting` for the same message/turn key with a backend that would auto-save strong candidates.
    Expected: Durable write/remember path is called at most once for the turn; compaction diagnostics show reused/deduped checkpoint or no duplicate write.
    Evidence: .sisyphus/evidence/task-6-precompact-idempotency.txt

  Scenario: PreCompact missing scope degrades safely
    Tool: Bash
    Steps: Simulate compaction event without complete project/container/session scope.
    Expected: No crash; diagnostics show skipped/degraded due to incomplete scope; no durable write attempted.
    Evidence: .sisyphus/evidence/task-6-precompact-missing-scope.txt
  ```

  **Commit**: NO | Message: `feat(memory): add compaction checkpoint continuity` | Files: [`src/features/opencode-plugin/runtime-shell.ts`, `src/features/opencode-plugin/runtime-compaction.ts`, tests]

- [x] 7. Harden Idle and Session Persistence Reason Codes

  **What to do**: Make idle/session persistence explain all no-write outcomes: `likely_skip`, `no_candidates`, `review_only`, `auto_saved`, `auto_save_skipped_incomplete_scope`, `deduped_turn`, `small_talk`, `empty_recent_conversation`, `missing_turn_key`, `incomplete_scope`, `backend_failed_open`. Store summaries in lifecycle diagnostics; preserve detailed policy output in `continuityCache.prepareHostTurn` where already available. Coordinate idempotency keys with Task 6 so idle persistence and compaction checkpoint cannot both persist the same turn.
  **Must NOT do**: Do not weaken conservative policy. Do not save every idle turn. Do not enqueue review records for `likely_skip` unless a separate explicit policy task is added later.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: logic touches multiple skip/write branches.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8, 11 | Blocked By: 4

  **References**:
  - `src/features/memory/core/suggest-memory-candidates.ts` - Recommendations: `likely_skip`, `consider_saving`, `strong_candidate`.
  - `src/features/memory/core/apply-conservative-memory-policy.ts` - Auto-save/review-only/skipped behavior.
  - `tests/apply-conservative-memory-policy.test.ts` - Current policy tests.
  - `src/features/opencode-plugin/runtime-shell.ts:366-452` - Idle persistence handler.

  **Acceptance Criteria**:
  - [ ] Existing conservative policy tests still pass unchanged unless only assertions are expanded.
  - [ ] Idle no-write outcomes are visible in `memory_context` diagnostics.
  - [ ] Strong candidates with complete scope still auto-save exactly as before.

  **QA Scenarios**:
  ```
  Scenario: likely_skip is visible and non-writing
    Tool: Bash
    Steps: Simulate a message that routes but produces `likely_skip`, then idle.
    Expected: No memory write; diagnostics reason includes `likely_skip` or `no_candidates`.
    Evidence: .sisyphus/evidence/task-7-likely-skip.txt

  Scenario: strong_candidate preserves auto-save behavior
    Tool: Bash
    Steps: Simulate durable decision text with complete project/container scope and idle.
    Expected: Backend policy auto-save path is invoked once; diagnostics include `auto_saved` count.
    Evidence: .sisyphus/evidence/task-7-auto-saved.txt
  ```

  **Commit**: NO | Message: `feat(memory): explain idle persistence outcomes` | Files: [`src/features/opencode-plugin/runtime-shell.ts`, tests]

- [x] 8. Update Memory-Facing Documentation

  **What to do**: Update `README.md`, `MCP_USAGE.md`, `CONTINUITY_DEBUGGING.md`, `ARCHITECTURE_BOUNDARIES.md`, and/or `AGENT_NEXT_STEPS.md` only as needed to document the memory lifecycle contract. State that this package consumes host lifecycle events for memory continuity and does not execute hooks. Document protocol, diagnostics, lifecycle stages, and troubleshooting flow.
  **Must NOT do**: Do not document unimplemented behavior. Do not promise Claude Code hooks compatibility. Do not present OpenCode runtime behavior as universal beyond plugin-native path.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: docs must be precise and boundary-safe.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 11 | Blocked By: 2, 5, 6, 7

  **References**:
  - `README.md` - Human-facing package reference.
  - `MCP_USAGE.md` - AI-facing runtime/tool contract.
  - `CONTINUITY_DEBUGGING.md` - Continuity troubleshooting flow.
  - `ARCHITECTURE_BOUNDARIES.md` - Boundary source of truth.
  - `docs/oh-my-openagent/claude-hooks-compatibility.md` - Research note and non-ownership guardrails.

  **Acceptance Criteria**:
  - [ ] Docs describe lifecycle consumption as memory-only.
  - [ ] Docs include no command/http hook dispatch instructions for this package.
  - [ ] Docs distinguish plugin-native path from standalone MCP path.

  **QA Scenarios**:
  ```
  Scenario: Docs mention memory lifecycle contract accurately
    Tool: Bash
    Steps: Search updated docs for `lifecycle`, `memory_context`, `compaction`, and `hook` terms.
    Expected: Mentions are memory-facing and boundary-safe.
    Evidence: .sisyphus/evidence/task-8-docs-lifecycle.txt

  Scenario: Docs do not claim hook runtime compatibility
    Tool: Bash
    Steps: Search docs for `Claude hooks compatibility`, `command hook`, `.claude/settings.json`, and `http hook`.
    Expected: Any mentions are in research/non-goal context only, not package feature docs.
    Evidence: .sisyphus/evidence/task-8-docs-no-runtime-claim.txt
  ```

  **Commit**: NO | Message: `docs(memory): document lifecycle contract` | Files: [docs/README files updated by executor]

- [x] 9. Add Boundary Guard Tests

  **What to do**: Add tests that protect the memory-only boundary. Tests should assert plugin tool names remain memory tools plus `memory_context`/`runtime_capabilities`, runtime capabilities do not expose hook-runtime features, and exported source/runtime capability surfaces do not add command/http dispatch APIs. Prefer tests in existing plugin package/product test files or a focused boundary test file.
  **Must NOT do**: Do not run broad source/doc keyword tests that fail on legitimate research notes or comments. Limit boundary tests to exported tool names, runtime capability outputs, public package exports, and narrowly scoped runtime API objects.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: needs robust non-brittle guardrails.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 11 | Blocked By: 1, 5

  **References**:
  - `tests/product-memory-plugin.test.ts` - Tool/runtime capability tests.
  - `tests/opencode-plugin-package.test.ts` - Plugin package tests.
  - `src/features/memory/lib/tool-definitions.ts` - Memory tool surface.
  - `src/features/opencode-plugin/tool-adapter.ts` - Plugin tool exposure.

  **Acceptance Criteria**:
  - [ ] Default `rtk bun run test` includes boundary guard tests.
  - [ ] Tests fail if a non-memory hook runtime capability/tool/exported API is added.
  - [ ] Existing memory tools are unchanged.

  **QA Scenarios**:
  ```
  Scenario: Tool surface remains memory-only
    Tool: Bash
    Steps: Run default test suite.
    Expected: Tests assert tool names equal memory tools plus plugin-native memory helpers.
    Evidence: .sisyphus/evidence/task-9-tool-surface.txt

  Scenario: Runtime capabilities reject hook runtime creep
    Tool: Bash
    Steps: Run product plugin tests for `runtime_capabilities`.
    Expected: No `hooks`, `dispatch`, `permission`, `workflow`, or Claude compatibility capability is present.
    Evidence: .sisyphus/evidence/task-9-capability-boundary.txt
  ```

  **Commit**: NO | Message: `test(memory): guard lifecycle boundary` | Files: [tests updated by executor]

- [x] 10. Add Deferred Raw + Derived Memory Design Note

  **What to do**: Create or update a memory-facing docs section that records the future raw + derived/verbatim-first direction without implementing it. The note must say raw/verbatim capture is deferred until privacy, review policy, redaction, source pointer, and scope semantics are defined. Map MemPalace “drawers” to a possible future raw source memory concept but do not expose that vocabulary as current API.
  **Must NOT do**: Do not implement raw transcript storage. Do not add migrations. Do not edit data files.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: future design boundary documentation.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No UI.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 11 | Blocked By: 1

  **References**:
  - `ARCHITECTURE_BOUNDARIES.md` - Keep memory contract clearer, not broader.
  - `AGENT_NEXT_STEPS.md` - Future agent direction.
  - `src/features/memory/types.ts` - Current memory record/source shape.
  - `src/features/memory/core/upsert-document.ts` - Document-shaped memory path for future inspiration.

  **Acceptance Criteria**:
  - [ ] Documentation explicitly marks raw + derived memory as deferred/future.
  - [ ] No source schema or storage implementation changes are made for raw/verbatim memory in this task.
  - [ ] Note includes privacy/review-policy gates.

  **QA Scenarios**:
  ```
  Scenario: Deferred design note is explicit
    Tool: Bash
    Steps: Search docs for raw/verbatim future section.
    Expected: Section says deferred and gated by privacy/review policy.
    Evidence: .sisyphus/evidence/task-10-deferred-raw-design.txt

  Scenario: No raw storage implementation slipped in
    Tool: Bash
    Steps: Inspect git diff for source schema/storage changes related to raw transcript capture.
    Expected: No implementation/migration/data-file changes for raw memory.
    Evidence: .sisyphus/evidence/task-10-no-raw-implementation.txt
  ```

  **Commit**: NO | Message: `docs(memory): record raw memory direction` | Files: [docs updated by executor]

- [x] 11. Consolidate Integration Verification

  **What to do**: Ensure all new tests are included in `package.json` `test` script or otherwise covered by default `rtk bun run test`. Run full verification in repo order. Collect evidence files under `.sisyphus/evidence/`. Confirm no unrelated files under `data/` changed.
  **Must NOT do**: Do not commit. Do not reset unrelated user changes. Do not modify memory data.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: integration verification and evidence gathering.
  - Skills: [] - No special skill required.
  - Omitted: [`playwright`] - No browser UI.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification Wave | Blocked By: 8, 9, 10

  **References**:
  - `package.json:32-40` - Test/build scripts.
  - `AGENTS.md` - Default verification order.
  - `AGENT_NEXT_STEPS.md:34-42` - Done means verification order.

  **Acceptance Criteria**:
  - [ ] `rtk bun run typecheck` exits `0`.
  - [ ] `rtk bun run test` exits `0` and runs all new tests.
  - [ ] `rtk bun run build` exits `0`.
  - [ ] `git status --short` shows no modified files under `data/` caused by this implementation.
  - [ ] Evidence files exist for each task’s QA scenarios.

  **QA Scenarios**:
  ```
  Scenario: Full verification passes
    Tool: Bash
    Steps: Run `rtk bun run typecheck && rtk bun run test && rtk bun run build` from repo root.
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-11-full-verification.txt

  Scenario: Memory data remains untouched
    Tool: Bash
    Steps: Run `git status --short` and inspect entries under `data/`.
    Expected: No implementation-caused modifications under `data/`.
    Evidence: .sisyphus/evidence/task-11-no-data-change.txt
  ```

  **Commit**: NO | Message: `test(memory): verify lifecycle contract` | Files: [`package.json` if test script updated, evidence only]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Do not commit unless the user explicitly asks.
- Recommended commit grouping if requested after successful verification:
  1. `feat(memory): add lifecycle protocol diagnostics`
  2. `feat(memory): add compaction checkpoint continuity`
  3. `docs(memory): document lifecycle contract`
  4. `test(memory): guard lifecycle boundary`
- If user wants a single commit: `feat(memory): harden lifecycle continuity contract`.

## Success Criteria
- The repo remains describable as: local-first agent memory, retrieval, context assembly, and memory diagnostics.
- Lifecycle signals improve memory continuity without becoming hook compatibility/runtime control.
- Agents can diagnose why memory did or did not run for each lifecycle stage.
- PreCompact becomes a memory checkpoint signal while remaining fail-open and append-only.
- All behavior is covered by agent-executable tests and review agents before completion.
