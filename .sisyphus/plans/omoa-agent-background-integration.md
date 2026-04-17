# OhMyOpenAgent Agent/Background-Task Integration Plan

## TL;DR
> **Summary**: Add an OhMyOpenAgent-style control-plane façade on top of the repo’s existing MCP orchestration primitives, without replacing the current workflow engine or blurring the plugin-native memory-first vs MCP-backed orchestration runtime split.
> **Deliverables**:
> - A non-core integration layer that presents intent-based agent/category invocation over existing worker/workflow tools
> - A normalized background-task envelope shared across `orchestrate_workflow`, direct async worker tools, and supervision/polling surfaces
> - Session-aware reminder/notification semantics aligned with task IDs and parent sessions
> - A config-first routing layer for categories, concurrency, hooks, and MCP gating
> - A fit-check matrix that distinguishes what maps directly, what needs hooks, and what should not be copied blindly
> **Effort**: Medium
> **Parallel**: NO - architecture sequencing matters more than throughput here
> **Critical Path**: 1 → 2 → 3 → 4 → 5

## Context
### Original Request
- User wants the repo to borrow the strongest parts of OhMyOpenAgent’s agent invocation and background-task system.
- User is specifically interested in agent calling and background task behavior.
- User is open to config-level integration or partial adoption because this repo already operates inside the OhMyOpenCode / OhMyOpenAgent ecosystem.

### Observed Local Reality
- The repo already has the core async engine shape: `orchestrate_workflow`, `get_orchestration_result`, `supervise_orchestration_result`, `get_orchestration_supervision_result`, `wait_for_orchestration_result`, and direct async worker tools.
- The repo already has an orchestrator-first posture: central judgment stays local, workers do execution, and plugin-native memory-first mode remains distinct from optional MCP orchestration mode.
- The current gap is not “missing orchestration engine,” but “missing product/control-plane façade” for intent-based agent routing, task identity, and session-aware async UX.

### External Research Summary
- OhMyOpenAgent’s strongest transferable patterns are intent/category-first invocation, durable task identity, parent-session-aware notifications, and config-first background-task controls.
- OhMyOpenAgent appears to expose broad local integration surfaces (JSONC config, hooks, MCP controls, tmux integration, concurrency controls), but not a generic remote orchestration API that should replace this repo’s existing runtime surfaces.
- Oracle fit review: adopt the façade, not a second orchestrator. The highest-risk mismatch is importing an always-on autonomous agent model that competes with this repo’s deliberate control-plane / execution-plane split.

## Work Objectives
### Core Objective
Adopt the **UX and control-plane advantages** of OhMyOpenAgent’s agent/background-task model while preserving this repo’s existing orchestration engine, runtime mode split, and orchestrator-first judgment policy.

### Deliverables
- A repo-local architecture note that defines the target façade and explicitly preserves current core primitives.
- A normalized “background task envelope” contract for all async orchestration and direct async worker paths.
- A category/agent routing model that maps task intent to current worker/runtime/model choices without changing the underlying execution engine.
- A fit-check matrix that classifies OMOA patterns into: map directly, hook/config integration, or do not adopt.
- A staged implementation order that starts with non-core/control-plane improvements before any engine changes are considered.

### Definition of Done
- The plan clearly separates façade adoption from engine replacement.
- The plan preserves the documented runtime split: plugin-native memory-first remains available even when MCP orchestration is absent.
- The fit-check matrix identifies direct mappings, hook/config dependencies, and high-risk mismatches.
- The plan includes explicit guardrails against creating a second orchestrator, a second persistence lifecycle, or a fake always-available orchestration surface.

### Must Have
- Intent/category-based invocation mapped onto existing worker/runtime/model decisions.
- Durable task identity with shared async envelope fields across workflow and direct async worker surfaces.
- Session-aware reminders/notifications tied to parent sessions and task IDs.
- Config-first adoption path for categories, concurrency, hooks, and MCP gating.
- Explicit preservation of the current request/result/supervision flow.

### Must NOT Have
- No engine rewrite before the façade proves insufficient.
- No second task queue, scheduler, persistence store, or supervision system.
- No always-on autonomous multi-agent loop as the default public surface.
- No blurring of plugin-native memory mode and MCP orchestration mode.
- No claim that orchestration surfaces are guaranteed when runtime capabilities do not expose them.

## Recommended Adoption Strategy

### Phase 1 — Non-Core Integration Layer
1. **Agent/category façade over current routing**
   - Add a control-plane mapping from intent/category → worker family/runtime/model.
   - Keep the execution engine unchanged: the façade compiles down to today’s workflow/direct-worker tools.

2. **Normalized background-task envelope**
   - Standardize async response fields across workflow and direct worker tools.
   - Minimum shape: `task_id` or `requestId`, `status`, `executionMode`, `resultTool`, `nextArgs`, `recommendedFollowUp`, `warning`, and parent-session linkage where available.

3. **Session-aware reminder/notification contract**
   - Define a new repo-local reminder contract that can sit on top of the current stored-result/supervision model.
   - The first implementation step is contract design and capability gating, not assuming an existing in-core reminder bridge already exists.
   - Preserve the current stored-result/supervision model; do not introduce ad hoc polling loops.

4. **Config-first routing + gating layer**
   - Add JSONC/env-driven knobs for category routing, concurrency ceilings, hook enablement, and MCP exposure/gating.
   - Do not require host/runtime assumptions that exceed the current `runtime_capabilities` contract.

5. **Runtime split remains explicit**
   - Plugin-native memory remains the default assumption.
   - MCP-backed orchestration remains opt-in / capability-gated.

### Phase 2 — Fit-Check Before Deeper Adoption
- Only consider deeper OMOA-style adoption if users genuinely need long-lived agent identity, resumable multi-step background sessions, or richer human-in-the-loop resumes than the current workflow/request model can express.
- If that need appears, evaluate a thin orchestration façade expansion first, not a control-plane replacement.

## Fit-Check Matrix

| OMOA Pattern | Current Repo Surface | Fit | What to Do | Watch-Out |
|---|---|---|---|---|
| Intent/category-first invocation | `ORCHESTRATION.md` routing policy + worker/runtime/model selection | High | Add a façade that maps categories to current worker choices | Do not hardcode models into public task intent |
| Durable background task identity | `workflow_*`, `supervisor_*`, async worker `requestId` flow | High | Normalize naming/envelope and expose one consistent product model | Avoid creating a second task identity namespace without need |
| Parent-session notifications | Stored result + supervision path, but no proven shared reminder bridge yet | Medium | Define a repo-local reminder contract first, then wire it through the host/plugin layer that actually owns session-visible reminders | Do not pretend an existing reminder bridge already exists in core orchestration code |
| Config-first integration | Existing env/runtime-capability posture | High | Add JSONC/env knobs for categories, concurrency, MCP gating, hook behavior | Do not claim orchestration exists when runtime mode does not expose it |
| Background concurrency controls | Existing workflow concurrency + runtime choices | Medium | Expose a higher-level config view that compiles to current knobs | Avoid separate concurrency policy engines |
| Hook-driven lifecycle integration | Plugin/runtime hooks and supervision path | Medium | Use hooks to enrich UX, not to reimplement orchestration | Keep plugin-native memory-first mode authoritative where required |
| Long-lived autonomous agents | Current repo intentionally uses orchestrator-first control plane | Low | Do not adopt by default | Risk of second orchestrator / competing judgment layer |
| Agent registry as primary public API | Current repo exposes MCP tools + optional orchestration surfaces | Low | Defer unless product need becomes explicit | Would blur runtime mode split and complicate guarantees |

## Implementation Order (when work starts)
1. Tighten the async contract so workflow and direct async workers already look like one product surface.
2. Add category/intent routing config that maps to current worker selection.
3. Add or normalize parent-session reminder behavior.
4. Add config/hook documentation and capability gating.
5. Reassess whether anything deeper than the façade is still needed.

## Task-Level QA Scenarios

### Task 1 — Async envelope normalization
```
Scenario: Workflow and direct async worker surfaces expose the same minimum product fields
  Tool: Bash
  Steps: Run `bun run test -- tests/register-tools.test.ts tests/gemini-worker-mcp-tools.test.ts tests/cursor-worker-mcp-tools.test.ts` after implementing envelope changes.
  Expected: All async surfaces agree on request identity, running-state guidance, and follow-up fields without regressing terminal-state behavior.

Scenario: Envelope changes preserve repo-wide type integrity
  Tool: Bash
  Steps: Run `bun run typecheck`.
  Expected: The unified async envelope does not create schema/type drift across orchestration and worker tool codepaths.
```

### Task 2 — Category/intent routing façade
```
Scenario: Category routing compiles to existing worker/runtime/model choices
  Tool: Bash
  Steps: Run targeted tests added for the routing façade, then inspect representative fixtures that map category input to current runtime selections.
  Expected: Category-level intent maps onto current worker/runtime/model choices without changing the underlying execution engine.

Scenario: Existing explicit worker/runtime overrides still win
  Tool: Bash
  Steps: Run targeted routing tests plus current orchestration tests.
  Expected: New category defaults do not override explicit worker/runtime/model choices already passed into current MCP/orchestration surfaces.
```

### Task 3 — Session-aware reminder/notification contract
```
Scenario: Reminder contract is capability-gated and does not assume a core reminder bridge
  Tool: Bash
  Steps: Run targeted tests for the reminder contract and runtime gating behavior after implementation.
  Expected: The contract only activates on host/plugin paths that actually own session-visible reminder injection, and no core orchestration tests need a fake built-in reminder bridge.

Scenario: Duplicate terminal signals do not create duplicate reminders
  Tool: Bash
  Steps: Run targeted reminder tests with repeated completion/failure events for the same request/task id.
  Expected: Session-visible reminder output is deduplicated and tied to stable task/request identity.
```

### Task 4 — Config/hook documentation and capability gating
```
Scenario: Config-driven gating matches runtime capability exposure
  Tool: Bash
  Steps: Run targeted config/runtime-capability tests, then `bun run test` for the relevant orchestration/plugin contract files.
  Expected: The façade never advertises orchestration-only features on plugin-native paths that do not expose them.

Scenario: Repo docs remain internally consistent after config/hook additions
  Tool: Bash
  Steps: Run `bun run test` for doc-adjacent contract tests if added, plus `bun run build`.
  Expected: Capability-gating documentation and code behavior stay aligned.
```

### Task 5 — Reassessment gate
```
Scenario: Façade-first adoption is sufficient
  Tool: Read + Bash
  Steps: Review the implemented façade features against the original goals, then run `bun run typecheck && bun run test && bun run build`.
  Expected: If goals are met, deeper engine changes are deferred. If not, the missing capability is named explicitly before any engine rewrite is proposed.
```

## Highest-Risk Mismatches
- **Second orchestrator risk**: importing OMOA semantics too literally could make background agents compete with the repo’s central orchestrator role.
- **Runtime-mode confusion**: a façade must not imply that background orchestration is always available on the plugin-native path.
- **State duplication risk**: re-creating task lifecycle or persistence outside the current request/result/supervision flow would increase drift and debugging cost.

## Verification Strategy
- Architecture verification first: ensure every proposed façade element maps onto an existing primitive or a bounded config/hook addition.
- Runtime verification later: once implemented, require targeted tests for async envelope parity, session reminder behavior, and capability-gated exposure.
- Standard repo verification remains unchanged: `bun run typecheck`, `bun run test`, `bun run build`.

## Recommendation
Adopt **OhMyOpenAgent’s product model**, not its autonomy assumptions.

The best near-term win is to make this repo feel more like an intent-driven background-agent system **without** replacing the current workflow engine. That means: façade first, config first, reminders first, and only then revisit whether there is still any unmet need that justifies deeper integration.
