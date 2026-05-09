# Agent Next Steps

This file is for future agents and maintainers working in `mahiro-mcp-memory-layer`.

## North star

Keep the repo easy to describe in one sentence:

> local-first agent memory, retrieval, context assembly, and memory diagnostics

## Current direction

The package is now memory-only.

Directionally:

- memory stays here
- continuity-cache helpers may stay if they remain memory-facing
- `memory-console` stays local-only and memory-management focused
- host-specific workflow control should stay outside this package
- lifecycle docs should keep the memory vocabulary only: `session-start-wake-up`, `turn-preflight`, `idle-persistence`, and `compaction-continuity`

## Deferred raw plus derived memory direction

This is future-facing only, not current API or storage behavior.

- Possible future shape, if the product ever needs it: a raw source memory concept that keeps a source pointer, then derived or summarized records that reference it.
- Required gates before any adoption: privacy review, redaction policy, explicit review flow, source pointer semantics, and scope rules that keep raw and derived records clearly separated.
- MemPalace drawer language stays inspiration only. Do not expose drawer or level vocabulary as public memory API terms.
- Until those gates are earned, keep the current vocabulary: local-first memory records, document-shaped sources, retrieval, context assembly, review, diagnostics, and lifecycle continuity.

## Immediate work queue

1. Keep docs and tests centered on the memory-only surface.
2. Preserve plugin-native wake-up, turn preflight, idle persistence, `memory_context`, and `runtime_capabilities` as memory helpers.
3. Prevent workflow-control concepts from creeping back in under memory-facing names.
4. Keep console graph output derived and read-only, and keep rejected purge guarded and non-default.

## Guardrails

- Verify before declaring done.
- Prefer boundary clarity over convenience.
- Do not present host-specific runtime behavior as universal package behavior.
- Keep docs precise about the current memory-only runtime surface.

## Done means

1. The memory-layer story is clear.
2. The docs still tell the truth about the current runtime.
3. No workflow-control responsibility was added accidentally under a memory-facing name.
4. Verification still passes in the normal order:
   - `bun run typecheck`
   - `bun run test`
   - `bun run build`
