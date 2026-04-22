# Agent Next Steps

This file is for future agents and maintainers working in `mahiro-mcp-memory-layer`.

Read this after `AGENTS.md` when the task touches package direction, documentation, memory scope, continuity semantics, or orchestration boundaries.

## North star

Move the repo toward a truer memory-layer identity.

The package should become easier to describe in one sentence:

> local-first agent memory, retrieval, context assembly, and memory diagnostics

If a feature is primarily about workflow control, worker routing, or task lifecycle, it is probably not part of the long-term core.

## Current direction

The current repo still documents memory as the stable foundation while shipping a thin orchestration façade on the plugin path.

That mixed state is acceptable as a transition, but it should not be mistaken for the final boundary.

Directionally:

- memory stays here
- broader orchestration moves out
- continuity behavior should eventually compose memory facts with orchestration facts instead of collapsing both into one package identity

## Immediate work queue

Work in this order unless the human asks otherwise.

### 1. Tighten the docs story

Make sure repo docs consistently communicate that memory is the product identity and orchestration is secondary, transitional, or external.

Likely follow-up tasks:

- revise `README.md` wording
- narrow `MCP_USAGE.md` framing around what is stable vs transitional
- mark orchestration-specific helpers clearly as outside the long-term memory core

### 2. Clarify runtime surfaces

Separate these concepts explicitly in docs and code-facing language:

- stable memory APIs
- memory-adjacent runtime introspection
- orchestration helpers
- standalone orchestration surface

The goal is that a reader can answer “what is guaranteed here?” without reading multiple files defensively.

### 3. Reduce boundary leakage through `memory_context`

Today `memory_context` exposes operator/task facts that are useful for continuity debugging.

Do not remove useful diagnostics recklessly, but move toward a design where:

- memory diagnostics remain in `memory_context`
- orchestration truth is owned elsewhere
- the host or orchestration layer composes both when needed

### 4. Keep continuity debugging honest

`CONTINUITY_DEBUGGING.md` currently relies on task `intent` and `status` to explain suppressed local fallback.

That behavior is real today. Do not rewrite docs as if the split has already happened.

Instead:

- describe current behavior truthfully
- describe future direction separately
- avoid promising a boundary that the runtime does not yet implement

### 5. Avoid adding new orchestration weight

Unless the human explicitly wants the opposite direction, do not add new control-plane features here such as:

- richer worker routing policy
- supervision workflows
- workflow tracing systems
- executor lifecycle expansion
- orchestration-only state machines

That would push the package further away from the intended identity.

## Guardrails

- Verify before declaring done.
- Prefer boundary clarity over convenience.
- Do not present host-specific runtime behavior as universal package behavior.
- Check `runtime_capabilities` before claiming a runtime surface exists.
- Keep docs precise about current state versus target state.
- Do not let the package become the accidental source of truth for orchestration.

## When to read which doc

- `README.md` for human-facing package framing
- `ARCHITECTURE_BOUNDARIES.md` for the intended package cut
- `MCP_USAGE.md` for current runtime surface and guarantees
- `ORCHESTRATION.md` only when the task truly involves the existing orchestration posture
- `CONTINUITY_DEBUGGING.md` when debugging recall, resume, or continuity behavior

## Done means

A direction-sensitive task is complete only when:

1. The change makes the memory-layer story clearer, not muddier.
2. The docs still tell the truth about the current runtime.
3. New language distinguishes stable memory features from orchestration features.
4. No new orchestration responsibility was added accidentally under a memory-facing name.
5. Verification still passes in the normal order:
   - `bun run typecheck`
   - `bun run test`
   - `bun run build`

## Short reminder

This repo is allowed to be in transition.

It is not allowed to be vague about the transition.
