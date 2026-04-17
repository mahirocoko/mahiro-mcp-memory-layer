# Adaptive Orch Mode Spec

## TL;DR
> **Summary**: Update orch-mode from static preset routing to a runtime-first operator policy that chooses models by task shape, uncertainty, verification need, and cost sensitivity rather than by older fixed examples.
> **Primary model set**:
> - Cursor default doer: `composer-2`
> - Cursor hard escalation: `claude-opus-4-7-high`
> - Cursor deep reasoning lane: `claude-opus-4-7-thinking-high`
> - Cursor fallback-only: `claude-4.6-sonnet-medium`, `claude-4.6-opus-*`
> - Gemini fast lane: `gemini-3-flash`
> - Gemini strong lane: `gemini-3.1-pro`
> **Rule**: Runtime truth first (`agent models`, CLI help, `runtime_capabilities`), docs second for positioning and caveats.

## Goals

### What adaptive orch-mode should optimize for
- Pick the lightest reliable worker/model for the current task.
- Escalate based on evidence (uncertainty, failed attempts, verification risk), not vibes.
- Keep orchestration decisions grounded in **runtime-exposed models**, not stale docs or cached assumptions.
- Keep operator logic in the control plane; do not rewrite the workflow engine.

### Non-goals
- No second orchestration engine.
- No autonomous loop that bypasses orchestrator judgment.
- No static documentation that silently drifts away from runtime reality.

## Source-of-truth order

1. **Local runtime**
   - `agent --help`
   - `agent models`
   - `runtime_capabilities`
2. **Repo-local doctrine**
   - `ORCHESTRATION.md`
   - `MCP_USAGE.md`
3. **External docs**
   - Cursor docs for model positioning and mode semantics
   - Gemini docs for headless semantics and pinned model guidance

If runtime and docs disagree, orch-mode should route based on runtime and treat docs as descriptive only.

## Final model set

### Cursor lanes

#### `composer-2`
Use for:
- standard implementation
- standard review/refactor
- most coding work with clear scope
- low-to-medium uncertainty doer work

Do not use as the last validator for the hardest tasks when confidence is low.

#### `claude-opus-4-7-high`
Use for:
- hardest planning
- architecture judgment
- high-uncertainty work
- final validation when the cost of being wrong is high

#### `claude-opus-4-7-thinking-high`
Use for:
- deep reasoning
- debugging with layered ambiguity
- cases where deliberate chain-of-thought-like structure matters more than speed

#### Fallback-only Cursor lane
- `claude-4.6-sonnet-medium`
- `claude-4.6-opus-*`

Use only when:
- explicitly requested
- the current runtime/environment does not expose the preferred 4.7 Opus lane
- compatibility is required

These should not appear as primary lanes in the operator-facing matrix.

### Gemini lanes

#### `gemini-3-flash`
Use for:
- fast exploration
- extraction
- summarization
- quick parallel research
- lightweight visual passes

#### `gemini-3.1-pro`
Use for:
- stronger visual / frontend / artistry work
- harder Gemini reasoning
- design-led tasks where quality matters more than speed

## Modes that orch-mode should care about

### Cursor CLI
- `agent` (interactive default)
- `--mode=plan`
- `--mode=ask`
- `-p` / headless print mode
- `-c` / cloud handoff

### Gemini CLI/operator path
- headless prompt mode
- explicit `--model`
- explicit output mode
- explicit approval mode where relevant

### Operator rule
Adaptive orch-mode should treat **headless mode** as the default execution primitive for automation and orchestration, not as an afterthought.

## Routing policy

### 1. Task-shape routing

| Task shape | Worker | Model |
|---|---|---|
| routine code implementation/review/refactor | Cursor | `composer-2` |
| hardest planning / architecture / final high-risk validation | Cursor | `claude-opus-4-7-high` |
| deep reasoning / ambiguous debugging | Cursor | `claude-opus-4-7-thinking-high` |
| fast exploration / extraction / summarization | Gemini | `gemini-3-flash` |
| strong visual / design-led / artistry work | Gemini | `gemini-3.1-pro` |

### 2. Escalation policy

Escalate from `composer-2` when:
- scope is high-uncertainty
- architecture tradeoffs dominate implementation mechanics
- prior output is weak or incomplete
- verification failures imply deeper reasoning is needed

Escalate from `claude-opus-4-7-high` to `claude-opus-4-7-thinking-high` when:
- the hard part is reasoning quality, not just difficulty
- the problem is ambiguous and layered rather than broad and operational

Escalate from `gemini-3-flash` to `gemini-3.1-pro` when:
- the work is visual/design-led and quality matters
- comparative reasoning or stronger synthesis is needed

### 3. Fallback policy

Fallback-only lanes should stay hidden from primary routing.

Use them only when:
- explicitly requested by the user
- runtime does not expose the preferred lane
- a compatibility or availability constraint is real and observed

## Operator safeguards

- Always pin a model explicitly in headless runs.
- Always pin execution mode explicitly when relevant (`plan`, `ask`, or default agent).
- Never treat `running` as failure.
- Prefer async façade/supervision flows before sync fallbacks.
- Re-check runtime model availability before changing the matrix.

## Update rules

Whenever the runtime-backed model set changes materially:
- update `ORCHESTRATION.md`
- update `README.md`
- update `MCP_USAGE.md` if examples or façade guidance mention models
- update this spec

Tests and examples should reflect the active recommended matrix unless they are explicitly compatibility fixtures.

## Recommendation

Implement adaptive orch-mode as **operator policy first**:
- runtime-aware
- evidence-based escalation
- explicit fallback-only lanes

Do not add more engine complexity until this policy layer proves insufficient.

## Implementation tasks

### Task 1 — Runtime-backed inventory first
- Create or document the exact runtime-discovery step that adaptive orch-mode will trust first.
- The discovery path must name the current sources explicitly:
  - `agent --help`
  - `agent models`
  - `runtime_capabilities`
- Code touchpoints to anchor the later implementation:
  - `src/features/orchestration/runtime-model-inventory.ts` (new adapter)
  - `src/features/orchestration/agent-category-routing.ts`
  - `src/features/orchestration/mcp/start-agent-task-tool.ts`
  - `src/features/opencode-plugin/runtime-capabilities.ts`
- Required behavior:
  - parse the runtime-backed model inventory from `agent models`
  - parse CLI mode/support expectations from `agent --help`
  - cache the last successful inventory snapshot for the current process
  - fall back to the cached snapshot or static safe defaults when discovery fails
- TDD order:
  1. add failing tests for inventory parsing and fallback behavior
  2. implement the adapter
  3. thread it into routing reads without changing routing defaults yet

QA:
```bash
agent --help
agent models
bun run typecheck
```

Expected result:
- the repo has a documented runtime-first discovery order
- adaptive routing never depends on stale doc-only model names
- inventory failure has a defined fallback path

### Task 2 — Primary routing matrix update
- Update the primary lanes to:
  - Cursor default: `composer-2`
  - Cursor hard escalation: `claude-opus-4-7-high`
  - Cursor deep reasoning: `claude-opus-4-7-thinking-high`
  - Gemini fast lane: `gemini-3-flash`
  - Gemini strong lane: `gemini-3.1-pro`
- Keep Sonnet and older Opus lanes fallback-only.

Primary touchpoints:
- `src/features/orchestration/agent-category-routing.ts`
- `tests/agent-category-routing.test.ts`
- `ORCHESTRATION.md`
- `README.md`
- `MCP_USAGE.md`
- TDD order:
  1. update routing tests to fail against the old matrix
  2. update the route presets and examples
  3. rerun route/config docs checks

QA:
```bash
bun run test tests/agent-category-routing.test.ts tests/opencode-plugin-config.test.ts
bun run build
```

Expected result:
- all operator-facing routing defaults reflect the runtime-backed model set

### Task 3 — Adaptive escalation policy
- Encode escalation rules for:
  - `composer-2` → `claude-opus-4-7-high`
  - `claude-opus-4-7-high` → `claude-opus-4-7-thinking-high`
  - `gemini-3-flash` → `gemini-3.1-pro`
- Escalation must depend on observed uncertainty, failure, or verification risk.

Primary touchpoints:
- `ORCHESTRATION.md`
- `src/features/orchestration/runtime-model-inventory.ts`
- any future operator-policy implementation layer in `src/`
- TDD order:
  1. add failing tests for escalation decisions if the policy becomes code
  2. otherwise update docs/spec first and leave code unchanged

QA:
```bash
bun run test
```

Expected result:
- the operator story clearly distinguishes default lanes from escalation lanes and fallback-only lanes

### Task 4 — Docs/examples stay runtime-accurate
- Replace stale examples that still show preview Gemini names or 4.6 Opus as the primary Opus lane.
- Keep fallback-only mentions only where compatibility is the point.

Primary touchpoints:
- `README.md`
- `MCP_USAGE.md`
- `ORCHESTRATION.md`
- this plan file

QA:
```bash
rg 'claude-4\.6-opus-high|gemini-3\.1-pro-preview|gemini-3-flash-preview' README.md MCP_USAGE.md ORCHESTRATION.md .sisyphus/plans/adaptive-orch-mode.md
```

Expected result:
- no remaining primary-lane references to the older matrix in these docs

### Atomic commit boundaries
- Commit 1: runtime model inventory adapter + tests
- Commit 2: routing matrix updates in code/tests
- Commit 3: docs/spec refresh

### Task 5 — Final repo verification
QA:
```bash
bun run typecheck
bun run test
bun run build
```

Expected result:
- docs, routing defaults, and examples are consistent with the new operator matrix
