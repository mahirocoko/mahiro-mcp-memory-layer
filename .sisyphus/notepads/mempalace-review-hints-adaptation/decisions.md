## 2026-05-06T09:30:00Z Task: initialization

## 2026-05-06T09:36:00Z Task: wave-1-context
- Use memory-native phrasing in docs; do not make MemPalace terminology the repo's public taxonomy.
- Prefer `ARCHITECTURE.md` over `MCP_USAGE.md` for the adaptation matrix unless runtime-contract tests force otherwise.
- Treat `possible_supersession` as advisory-only review metadata; never mutate verified memory during overview or assist generation.

## 2026-05-06T09:42:00Z Task: architecture-adaptation-matrix
- Classified the five MemPalace concepts in `ARCHITECTURE.md` with only memory-bound meanings, so the docs stay aligned with the current memory-only package boundary.
- Kept Knowledge Graph and AAAK Dialect in deferred territory, and avoided any wording that would imply shipped graph storage, registry routing, or truth-engine behavior.
- Left host lifecycle events explicitly memory-facing only, which preserves the repo's current runtime story and avoids a drift toward workflow control.

## 2026-05-06T16:49:00+07:00 Task: document-actor-attributed-memory-convention
- Chose `ARCHITECTURE.md` over `MCP_USAGE.md` because this rule belongs with boundary language and memory taxonomy, not with the runtime tool catalog.
- Defined the convention as metadata only, with `source.title`, `tags`, `kind`, `summary`, and `content` as the full surface.
- Kept `diary` out of the schema and allowed it only as an optional tag, so the repo does not grow a new memory kind.
- Stated explicitly that the convention does not create registry, routing, ownership, or specialist-agent runtime behavior.
