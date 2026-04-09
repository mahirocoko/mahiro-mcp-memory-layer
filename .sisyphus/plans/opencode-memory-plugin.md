# OpenCode-First Memory Plugin Pivot

## TL;DR
> **Summary**: Repackage the current memory layer as an OpenCode-first plugin by adding a transport-free memory facade plus a native OpenCode plugin adapter that drives session wake-up, turn-time precompute, and conservative post-turn persistence.
> **Deliverables**:
> - OpenCode plugin adapter over the existing memory core
> - Transport-free facade shared by the plugin and MCP adapters
> - Native hook wiring for `session.created`, debounced `message.updated`, `session.idle`, and best-effort compaction support
> - One narrow native plugin tool, `memory_context`, backed by cached wake-up/precompute state for documented model-facing access
> - Plugin-first install path with no required manual MCP config or long custom instructions
> - Tests/docs proving plugin behavior and preserving current MCP behavior
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 → 2 → 4 → 5/6/7 → 8 → 9

## Context
### Original Request
- User wants this repo to become an OpenCode-first plugin rather than a generic MCP/memory package.
- User wants OpenCode to be the primary integration target.
- User wants plugin installation to ideally require only a plugin entry in `opencode.json`, without separate manual MCP config or long instruction blocks.

### Interview Summary
- Use native OpenCode plugin hooks/events rather than Claude-first compatibility.
- Reuse the existing memory core and current MCP tool contract as backend infrastructure.
- Keep the current product wrappers (`wake_up_memory`, `prepare_turn_memory`, `prepare_host_turn_memory`) as the semantic backbone for plugin behavior.
- Do not broaden v1 into orchestration exposure, Claude compatibility, or a multi-host abstraction layer.
- Keep the published/plugin load name aligned with the current package name `mahiro-mcp-memory-layer` in v1 to minimize migration risk.

### Metis Review (gaps addressed)
- Fixed the main hidden architecture risk by choosing a transport-free facade first, then an OpenCode adapter; plugin runtime must not spawn the repo’s own stdio MCP server.
- Resolved event ownership: `session.created` for wake-up, debounced read-only `message.updated` for precompute, `session.idle` for conservative post-turn save, and `experimental.session.compacting` as best-effort continuity only.
- Added guardrails for idempotency, debounce/cancellation, duplicate-event protection, fail-open behavior, and parity tests between plugin and MCP paths.
- Constrained v1 scope to memory-only integration and plugin-first install; no Claude compatibility, storage redesign, orchestration plugining, or generic SDK work.

## Work Objectives
### Core Objective
Turn `mahiro-mcp-memory-layer` into an OpenCode-first plugin experience while preserving the existing MCP backend contract and making plugin installation the primary user path.

### Deliverables
- A transport-free memory facade extracted from the current memory service behavior.
- A native OpenCode plugin module that uses documented OpenCode hooks.
- A single native OpenCode plugin tool named `memory_context` that exposes the current cached memory context for the active session.
- No required plugin-specific config in `opencode.json` beyond the plugin entry; advanced overrides use environment variables only in v1.
- Deterministic scope resolution for `userId`, `projectId`, `containerId`, and `sessionId` from OpenCode context.
- Session-start wake-up behavior via `wake_up_memory` semantics.
- Turn-time read-only precompute via `prepare_turn_memory` semantics.
- Post-turn conservative persistence via `prepare_host_turn_memory` semantics.
- Best-effort compaction continuity integration.
- Publishable/plugin-loadable package shape and plugin-first documentation.

### Definition of Done (verifiable conditions with commands)
- `bun run typecheck` exits `0`.
- `bun run test` exits `0`.
- `bun run build` exits `0`.
- Plugin contract tests prove session-start wake-up fires once per session, turn precompute is debounced and read-only, idle-time persistence is conservative and idempotent, and plugin failures degrade safely.
- MCP contract tests still pass with unchanged tool names and equivalent backend behavior.
- Repo docs show a plugin-only happy path that does not require manual MCP config for standard usage.

### Must Have
- OpenCode-native plugin module and hook handlers.
- Exactly one narrow model-facing plugin tool in v1: `memory_context`.
- Plugin runtime uses in-process facade/backend, not self-spawned stdio MCP.
- Existing MCP backend remains functional and unchanged in its public tool naming.
- Fail-open plugin behavior when memory integration errors.
- Explicit duplicate-event protection and bounded async behavior.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No Claude Code compatibility layer in v1.
- No plugin exposure of orchestration/worker tools in v1.
- No broad re-export of low-level memory MCP tools as native OpenCode plugin tools in v1.
- No second persistence format, daemon, or remote service.
- No manual “also add this MCP server” requirement for the standard plugin install path.
- No undocumented prompt-hacking or fragile injection assumptions when a documented hook boundary exists.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD for facade/hook contract work; tests-after allowed only for doc-only packaging cleanup.
- Framework: existing `vitest` + repo verification commands.
- QA policy: Every task includes executable scenarios with duplicate-event, degraded-backend, and idempotency coverage where applicable.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: foundation extraction and contracts
- Task 1: add failing contract tests for plugin/facade behavior
- Task 2: extract transport-free memory facade
- Task 3: define plugin config + scope resolution contract
- Task 4: build OpenCode plugin entrypoint/runtime shell

Wave 2: hook behaviors
- Task 5: implement `session.created` wake-up flow
- Task 6: implement debounced read-only `message.updated` precompute
- Task 7: implement `session.idle` conservative persistence
- Task 8: implement best-effort compaction continuity + observability/fail-open paths

Wave 3: packaging and migration surface
- Task 9: package the plugin-first install path, preserve MCP parity, and update docs/examples

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|---|---|---|
| 1 | none | 2, 4, 5, 6, 7, 8, 9 |
| 2 | 1 | 4, 5, 6, 7, 8, 9 |
| 3 | 1 | 4, 5, 6, 7, 8, 9 |
| 4 | 2, 3 | 5, 6, 7, 8, 9 |
| 5 | 4 | 8, 9 |
| 6 | 4 | 7, 8, 9 |
| 7 | 4, 6 | 8, 9 |
| 8 | 5, 6, 7 | 9 |
| 9 | 5, 6, 7, 8 | F1-F4 |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Task Count | Categories |
|---|---:|---|
| 1 | 4 | ultrabrain, unspecified-high |
| 2 | 4 | unspecified-high, deep |
| 3 | 1 | unspecified-high, writing |
| Final | 4 | oracle, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add failing OpenCode plugin contract tests

  **What to do**: Add a dedicated test file that defines the v1 plugin contract before runtime changes land. Cover: plugin initialization without stdio self-spawn, one-time wake-up on `session.created`, debounced read-only precompute on repeated `message.updated`, conservative idle-time persistence on `session.idle`, fail-open behavior on backend errors, and parity assertions for wrapper semantics. Keep the tests red until the corresponding runtime behavior is implemented.
  **Must NOT do**: Do not refactor runtime code in this task. Do not loosen existing MCP tests. Do not use snapshot-only assertions for hook behavior.

  **Recommended Agent Profile**:
  - Category: `ultrabrain` - Reason: contract-first test design drives the whole migration and locks the semantics before architecture changes.
  - Skills: [`mahiro-style`] - ensure test naming and structure stay aligned with repo conventions.
  - Omitted: [`playwright`] - no browser surface exists here.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 4, 5, 6, 7, 8, 9 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `tests/product-memory-wrappers.test.ts:1-96` - existing wrapper-focused test style for `wake_up_memory` and `prepare_turn_memory`.
  - Pattern: `tests/prepare-host-turn-memory.test.ts:1-65` - current service-level verification for host-turn behavior.
  - Pattern: `tests/mcp-stdio-worker-e2e.test.ts` - stdio MCP connectivity proof; use as contrast for the “plugin must not self-spawn stdio” contract.
  - API/Type: `src/features/memory/types.ts:183-214` - current wrapper result shapes that plugin parity must preserve.
  - API/Type: `src/features/memory/schemas.ts:151-172` - current input schemas for host-turn and wake-up wrappers.
  - External: `https://opencode.ai/docs/plugins/` - official plugin and hook model to mirror in test doubles.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A new failing test file exists for plugin contract behavior and fails for the right reasons before implementation code is added.
  - [ ] The tests explicitly assert no stdio self-spawn from the plugin path.
  - [ ] The tests distinguish read-only precompute from idle-time persistence.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Contract tests fail for missing plugin runtime
    Tool: Bash
    Steps: Run `bun run test -- tests/product-memory-plugin.test.ts` immediately after writing the new tests and before implementing runtime code.
    Expected: The new test file fails with missing/unimplemented plugin behavior while existing tests remain untouched.
    Evidence: .sisyphus/evidence/task-1-plugin-contract-tests.txt

  Scenario: Existing wrapper tests still pass
    Tool: Bash
    Steps: Run `bun run test -- tests/product-memory-wrappers.test.ts tests/prepare-host-turn-memory.test.ts`.
    Expected: Existing wrapper tests pass even though the new plugin contract tests are red.
    Evidence: .sisyphus/evidence/task-1-plugin-contract-regression.txt
  ```

  **Commit**: YES | Message: `test(memory): add failing opencode plugin contract coverage` | Files: `tests/product-memory-plugin.test.ts`

- [x] 2. Extract a transport-free memory facade

  **What to do**: Introduce a transport-free facade module over the memory core that exposes the exact behaviors needed by both adapters: wake-up, turn precompute, idle-time conservative persistence, and any shared observability helpers. `MemoryService` should depend on or delegate to this facade so MCP and plugin paths share one behavior source. Preserve current MCP tool names and return shapes.
  **Must NOT do**: Do not change public MCP tool names. Do not move business rules into the plugin layer. Do not spawn/loop back through `src/index.ts`.

  **Recommended Agent Profile**:
  - Category: `ultrabrain` - Reason: this is the architectural seam that prevents duplicated logic and transport leakage.
  - Skills: [`mahiro-style`] - keep module boundaries restrained and explicit.
  - Omitted: [`git-master`] - no history operation is needed.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/memory-service.ts:68-207` - current backend behavior location; extract shared behavior from here.
  - Pattern: `src/features/memory/mcp/register-tools.ts:15-83` - adapter shape that should remain thin after extraction.
  - Pattern: `src/features/memory/mcp/server.ts:10-44` - current transport adapter that should consume shared behavior, not own it.
  - API/Type: `src/features/memory/types.ts:183-214` - preserve `PrepareHostTurnMemoryResult`, `PrepareTurnMemoryResult`, and `WakeUpMemoryResult` semantics.
  - API/Type: `src/features/memory/schemas.ts:151-172` - preserve wrapper input validation boundaries.
  - Pattern: `src/index.ts:6-19` - stdio server entrypoint that must remain an external adapter, not a plugin dependency.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A new transport-free facade module exists and is the single behavior source for plugin and MCP wrappers.
  - [ ] MCP-facing tool registration still returns the same wrapper result shapes.
  - [ ] Existing wrapper tests pass unchanged after extraction.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Facade extraction preserves MCP wrapper semantics
    Tool: Bash
    Steps: Run `bun run test -- tests/product-memory-wrappers.test.ts tests/prepare-host-turn-memory.test.ts tests/memory-service.test.ts`.
    Expected: All wrapper and service tests pass with no renamed tools or changed result shapes.
    Evidence: .sisyphus/evidence/task-2-facade-parity.txt

  Scenario: Type-level parity survives extraction
    Tool: Bash
    Steps: Run `bun run typecheck`.
    Expected: Typecheck passes without `any`/schema drift caused by the facade extraction.
    Evidence: .sisyphus/evidence/task-2-facade-typecheck.txt
  ```

  **Commit**: YES | Message: `refactor(memory): extract transport-free memory facade` | Files: `src/features/memory/**`

- [x] 3. Define OpenCode plugin config and scope-resolution contract

  **What to do**: Add an OpenCode integration config module that defines the v1 defaults and advanced override surface. V1 must require no plugin-specific config for standard use. Advanced overrides must use environment variables only in v1. Explicitly define deterministic derivation of `userId`, `projectId`, `containerId`, and `sessionId` from OpenCode hook context, plus the skip behavior when IDs are incomplete. Add contract tests for scope derivation and fail-open defaults.
  **Must NOT do**: Do not rely on undocumented arbitrary config fields if official OpenCode docs do not support them. Do not require manual MCP config in the default path. Do not persist partial scope IDs as if they were complete.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: strong implementation discipline is needed, but the shape is now constrained by Oracle/Metis decisions.
  - Skills: [`mahiro-style`] - keep config surface narrow and predictable.
  - Omitted: [`playwright`] - no browser interaction.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/config/env.ts:13-23` - current env shape is static and minimal; extend carefully rather than scattering config logic.
  - Pattern: `src/config/paths.ts:4-22` - current repo-local data path assumption that plugin work must make explicit and overrideable only if needed.
  - API/Type: `src/features/memory/types.ts:148-214` - scope-dependent write policy and wrapper contracts.
  - API/Type: `src/features/memory/core/apply-conservative-memory-policy.ts:11-49` - complete scope IDs are required for auto-save; plugin scope resolution must respect this.
  - External: `https://opencode.ai/docs/plugins/` - documented plugin context fields and hook model.

  **Acceptance Criteria** (agent-executable only):
  - [ ] There is a single OpenCode integration config module with documented defaults and environment-variable-based advanced overrides.
  - [ ] Scope-resolution tests cover complete IDs, missing IDs, and deterministic derivation.
  - [ ] Default configuration path does not require manual MCP config.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Complete scope IDs resolve deterministically
    Tool: Bash
    Steps: Run the targeted scope/config tests added in this task, e.g. `bun run test -- tests/opencode-plugin-config.test.ts`.
    Expected: Tests prove stable derivation of `userId`, `projectId`, `containerId`, and `sessionId` from representative hook payloads.
    Evidence: .sisyphus/evidence/task-3-scope-contract.txt

  Scenario: Incomplete scope IDs skip persistence safely
    Tool: Bash
    Steps: Run the same targeted tests with missing-project or missing-session fixtures.
    Expected: Tests show read-only behavior can proceed while persistence is skipped or marked degraded rather than writing invalid scope data.
    Evidence: .sisyphus/evidence/task-3-scope-skip.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add opencode config and scope resolution` | Files: `src/features/opencode-plugin/**`, `tests/opencode-plugin-config.test.ts`

- [x] 4. Build the OpenCode plugin runtime shell

  **What to do**: Create the OpenCode plugin module that exposes documented hook handlers plus one native plugin tool named `memory_context`. The runtime shell must own a singleton in-process backend/facade instance, keep per-session state/cache needed for idempotency and debounce, and make `memory_context` read from that cached state. The runtime shell should be behavior-light: initialize dependencies, normalize context, and dispatch to the facade.
  **Must NOT do**: Do not make the plugin shell own retrieval or persistence rules. Do not spawn `tsx src/index.ts` or connect to the local stdio server from inside plugin runtime. Do not expose orchestration/worker tools or the full low-level memory MCP surface in v1.

  **Recommended Agent Profile**:
  - Category: `ultrabrain` - Reason: plugin runtime boundary decisions are architectural and affect every later hook.
  - Skills: [`mahiro-style`] - maintain clear separation between core and adapter.
  - Omitted: [`git-master`] - no git workflow work here.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 5, 6, 7, 8, 9 | Blocked By: 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/mcp/register-tools.ts:63-83` - wrapper-oriented adapter style to mirror for plugin dispatch.
  - Pattern: `src/features/memory/mcp/server.ts:10-23` - current MCP adapter composition; plugin runtime should be analogous in thinness but not share transport.
  - Pattern: `src/index.ts:6-19` - current stdio launch path to explicitly avoid inside plugin runtime.
  - External: `https://opencode.ai/docs/plugins/` - plugin module export and hook registration model.
  - External: `https://github.com/code-yeongyu/oh-my-openagent` - borrow separation-of-concerns, not compatibility breadth.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A native OpenCode plugin module exists, exports documented hook handlers, and registers exactly one native tool named `memory_context`.
  - [ ] Plugin initialization uses in-process backend/facade wiring, not stdio self-spawn.
  - [ ] Per-session cache/state exists for idempotency and debounce coordination.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Plugin initialization avoids stdio self-spawn
    Tool: Bash
    Steps: Run `bun run test -- tests/product-memory-plugin.test.ts` after implementing the runtime shell.
    Expected: The plugin contract test proves no stdio process launch is attempted in the plugin path.
    Evidence: .sisyphus/evidence/task-4-plugin-shell.txt

  Scenario: Build remains valid with new plugin entrypoint
    Tool: Bash
    Steps: Run `bun run build`.
    Expected: The new plugin module compiles cleanly alongside the existing MCP server entrypoints.
    Evidence: .sisyphus/evidence/task-4-plugin-build.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add opencode plugin runtime shell` | Files: `src/features/opencode-plugin/**`, `package.json` (if entry/export needed)

- [x] 5. Implement `session.created` wake-up flow

  **What to do**: Wire `session.created` to session-start wake-up using the facade behavior equivalent to `wake_up_memory`. Cache the result per session, make the hook idempotent, and populate the state read by the native `memory_context` plugin tool. Do not depend on undocumented prompt injection.
  **Must NOT do**: Do not persist memory in this hook. Do not run wake-up multiple times for the same session state. Do not block session startup if the backend is slow/failing.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: this is a contained runtime behavior once the plugin shell exists.
  - Skills: [`mahiro-style`] - keep state handling explicit and small.
  - Omitted: [`playwright`] - no UI/browser needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8, 9 | Blocked By: 4

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/memory-service.ts:125-164` - current `wakeUpMemory` behavior and expected output shape.
  - API/Type: `src/features/memory/types.ts:194-214` - `WakeUpMemoryInput` and `WakeUpMemoryResult` contract.
  - API/Type: `src/features/memory/schemas.ts:162-172` - `wake_up_memory` input schema.
  - External: `https://opencode.ai/docs/plugins/` - `session.created` hook/event surface.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `session.created` triggers one wake-up call per new session with deterministic scope IDs.
  - [ ] Repeated or duplicate `session.created` handling for the same session is idempotent.
  - [ ] Wake-up backend errors fail open and are observable.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: One-time wake-up on new session
    Tool: Bash
    Steps: Run `bun run test -- tests/product-memory-plugin.test.ts -t "session.created"` or the exact targeted suite added in Task 1.
    Expected: The plugin calls the wake-up path exactly once and caches the resulting context for that session.
    Evidence: .sisyphus/evidence/task-5-session-created.txt

  Scenario: Duplicate session event does not duplicate wake-up
    Tool: Bash
    Steps: Run the duplicate-event fixture from the same targeted suite.
    Expected: No second wake-up run occurs; cached state is reused and no write path is touched.
    Evidence: .sisyphus/evidence/task-5-session-created-idempotent.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add session wake-up hook` | Files: `src/features/opencode-plugin/**`, tests for session-created flow

- [x] 6. Implement debounced read-only `message.updated` precompute

  **What to do**: Wire `message.updated` to a debounced, cancelable, read-only precompute path using the facade behavior equivalent to `prepare_turn_memory`. Restrict it to the chosen turn/input conditions from Task 3 so assistant streaming noise and duplicate message updates do not thrash the backend. Store only transient per-session cached retrieval context here, and make that refreshed context available through the native `memory_context` tool.
  **Must NOT do**: Do not persist memory in this hook. Do not allow unbounded concurrent precompute tasks. Do not let stale completions overwrite newer cached state.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: debounce, cancellation, and stale-result suppression are concurrency-sensitive.
  - Skills: [`mahiro-style`] - favor explicit state machines over implicit timers spread across files.
  - Omitted: [`playwright`] - not relevant.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7, 8, 9 | Blocked By: 4

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/memory-service.ts:125-170` - wake-up + prepare-turn wrapper semantics that precompute must reuse.
  - Pattern: `src/features/memory/mcp/register-tools.ts:63-83` - wrapper naming/semantic split between wake-up and turn-prep.
  - External: `https://opencode.ai/docs/plugins/` - `message.updated` hook/event surface.
  - Metis guardrail: treat `message.updated` as read-only precompute only; persistence belongs elsewhere.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Rapid repeated `message.updated` events collapse into one final precompute within the debounce window.
  - [ ] Precompute path never writes memory records.
  - [ ] Stale completions are ignored and cannot replace newer cached context.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Burst updates debounce into one precompute
    Tool: Bash
    Steps: Run the targeted `message.updated` contract tests added in Task 1.
    Expected: Multiple rapid updates produce one final precompute invocation and one final cache state.
    Evidence: .sisyphus/evidence/task-6-message-updated-debounce.txt

  Scenario: Read-only precompute never persists
    Tool: Bash
    Steps: Run the negative-path fixture that inspects persistence spies/counters during `message.updated` handling.
    Expected: No save path is invoked; only retrieval/precompute behavior occurs.
    Evidence: .sisyphus/evidence/task-6-message-updated-readonly.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add debounced turn precompute hook` | Files: `src/features/opencode-plugin/**`, tests for message-updated flow

- [x] 7. Implement `session.idle` conservative persistence

  **What to do**: Wire `session.idle` to the conservative save path using facade behavior equivalent to `prepare_host_turn_memory` or its post-turn persistence subset, depending on the final adapter split from Task 2. Enforce duplicate-turn protection so the same conversation state cannot be saved twice. Respect incomplete-scope skip behavior and fail-open error handling.
  **Must NOT do**: Do not save on partial turns. Do not treat every idle event as unique. Do not block the session if persistence fails.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: event correlation, duplicate suppression, and conservative policy boundaries matter more than raw code volume.
  - Skills: [`mahiro-style`] - keep idle-save state and ids explicit.
  - Omitted: [`git-master`] - not needed.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8, 9 | Blocked By: 4, 6

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/features/memory/memory-service.ts:166-207` - current host one-call shape and conservative policy linkage.
  - Pattern: `src/features/memory/core/apply-conservative-memory-policy.ts:51-111` - exact auto-save vs review-only behavior that idle persistence must preserve.
  - API/Type: `src/features/memory/types.ts:148-187` - policy and host-turn result contracts.
  - External: `https://opencode.ai/docs/plugins/` - `session.idle` hook/event surface.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `session.idle` triggers conservative persistence only when the same turn has not already been handled.
  - [ ] Incomplete scope IDs result in safe skipped persistence, not malformed writes.
  - [ ] Persistence failures are observable and fail open.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Idle event triggers one conservative save for a completed turn
    Tool: Bash
    Steps: Run the targeted `session.idle` plugin tests added in Task 1.
    Expected: One conservative save path runs, returns expected recommendation data, and records no duplicate write for the same turn state.
    Evidence: .sisyphus/evidence/task-7-session-idle-save.txt

  Scenario: Duplicate idle events do not duplicate persistence
    Tool: Bash
    Steps: Run the duplicate-idle fixture from the same targeted suite.
    Expected: The second idle event is ignored or recognized as already handled; no second write occurs.
    Evidence: .sisyphus/evidence/task-7-session-idle-idempotent.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add idle-time conservative persistence` | Files: `src/features/opencode-plugin/**`, tests for session-idle flow

- [x] 8. Add compaction continuity and fail-open observability

  **What to do**: Add best-effort continuity behavior for `experimental.session.compacting` using the cached wake-up/precompute state, plus structured logging/counters/debug surfaces for invoked, skipped, debounced, errored, and degraded hook outcomes. Keep compaction support optional and non-blocking.
  **Must NOT do**: Do not make compaction support a hard dependency for plugin usefulness. Do not introduce a second persistence path or custom compaction storage.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: this is an integration-hardening task with clear boundaries.
  - Skills: [`mahiro-style`] - keep observability narrow and typed.
  - Omitted: [`playwright`] - not relevant.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 5, 6, 7

  **References** (executor has NO interview context - be exhaustive):
  - External: `https://opencode.ai/docs/plugins/` - documented `experimental.session.compacting` hook and general plugin event model.
  - Pattern: `src/features/memory/observability/retrieval-trace.ts` - current observability style for memory retrieval paths.
  - Pattern: `src/features/memory/memory-service.ts:115-207` - current degraded/policy behavior that plugin observability should surface rather than reinterpret.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Compaction hook uses cached plugin state on a best-effort basis and does not become required for core memory functionality.
  - [ ] Observable outcomes exist for invoked, skipped, debounced, errored, and degraded plugin hook paths.
  - [ ] Plugin still fails open when compaction/observability paths encounter errors.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Compaction continuity is best-effort and non-blocking
    Tool: Bash
    Steps: Run the targeted compaction hook tests added in this task.
    Expected: Cached context is used when available, and failures do not block plugin operation.
    Evidence: .sisyphus/evidence/task-8-compaction.txt

  Scenario: Hook observability records degraded/error outcomes
    Tool: Bash
    Steps: Run the same targeted suite with forced backend failures or empty-result fixtures.
    Expected: The plugin records observable degraded/error signals while leaving chat behavior fail-open.
    Evidence: .sisyphus/evidence/task-8-observability.txt
  ```

  **Commit**: YES | Message: `feat(plugin): add compaction continuity and fail-open observability` | Files: `src/features/opencode-plugin/**`, observability tests/docs

- [x] 9. Package the plugin-first install path and update docs

  **What to do**: Make the repo/plugin loadable in the intended OpenCode path while preserving current MCP usage. Keep the plugin load/publish name as `mahiro-mcp-memory-layer` in v1. Update package metadata/exports as needed, document the standard plugin-only install path, document the environment-variable-based advanced override path, and keep the existing MCP server contract documented for non-plugin consumers. Add parity tests showing plugin and MCP adapters call the same facade behavior.
  **Must NOT do**: Do not require a second manual MCP config step in the standard docs. Do not rename existing MCP tools. Do not bury plugin caveats in vague prose.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: packaging plus crisp migration/docs work is the core of this task.
  - Skills: [`mahiro-style`] - maintain restrained, concrete documentation.
  - Omitted: [`playwright`] - no browser work required.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: F1-F4 | Blocked By: 5, 6, 7, 8

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `package.json:2-20` - current package is private and MCP-centric; packaging changes must be explicit and minimal.
  - Pattern: `README.md:24-37` - current documented memory loops and wrapper semantics; update without contradicting MCP behavior.
  - Pattern: `AGENTS.md:17-25` - current public contract; preserve MCP names while documenting the plugin-first path.
  - External: `https://opencode.ai/docs/plugins/` - plugin install/load expectations via `opencode.json` and plugin directories.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Repo/package metadata supports the intended plugin load path.
  - [ ] README documents a standard plugin-only install path and clearly labels any advanced override path.
  - [ ] Parity tests prove plugin and MCP adapters share the same backend behavior for fixed inputs.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Full project verification after packaging/docs updates
    Tool: Bash
    Steps: Run `bun run typecheck && bun run test && bun run build`.
    Expected: All project verification commands pass after plugin packaging/doc changes.
    Evidence: .sisyphus/evidence/task-9-full-verification.txt

  Scenario: Plugin-only install path is documented and MCP path remains valid
    Tool: Bash
    Steps: Run targeted parity/docs tests plus any doc example validation added in this task.
    Expected: Tests show plugin and MCP adapters both work against the same facade, and docs no longer require manual MCP config for standard plugin usage.
    Evidence: .sisyphus/evidence/task-9-parity-docs.txt
  ```

  **Commit**: YES | Message: `docs(plugin): document plugin-first install path` | Files: `package.json`, `README.md`, `AGENTS.md`, packaging/parity tests

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Preserve the existing MCP tool contract while adding the OpenCode plugin surface in atomic commits.
- Use one commit per task where the task changes runtime behavior or public contract.
- Keep extraction commits behavior-preserving and hook commits behavior-scoped.
- Recommended sequence:
  1. `test(memory): add failing opencode plugin contract coverage`
  2. `refactor(memory): extract transport-free memory facade`
  3. `feat(plugin): add opencode config and scope resolution`
  4. `feat(plugin): add opencode plugin runtime shell`
  5. `feat(plugin): add session wake-up hook`
  6. `feat(plugin): add debounced turn precompute hook`
  7. `feat(plugin): add idle-time conservative persistence`
  8. `feat(plugin): add compaction continuity and fail-open observability`
  9. `docs(plugin): document plugin-first install path`

## Success Criteria
- OpenCode users can enable the plugin through a plugin entry and get working memory behavior without manual MCP config in the standard path.
- A new session reliably prewarms memory exactly once.
- Turn-time retrieval is debounced, read-only, and does not create duplicate writes.
- Idle-time persistence uses the conservative policy and safely skips when scope IDs are incomplete.
- The plugin exposes only one documented native model-facing tool, `memory_context`, backed by cached wake-up/precompute state.
- Existing MCP consumers still have the same documented memory tool names and equivalent semantics.
- Backend slowdown or failure does not block chat; plugin behavior fails open with observable diagnostics.
