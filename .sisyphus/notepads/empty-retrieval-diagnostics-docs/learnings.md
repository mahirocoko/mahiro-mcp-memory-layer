
- `inspectMemoryRetrieval` is trace-backed: it returns `status: "empty"` only when no trace exists, and a found trace surfaces `hit`, `returnedCount`, and `degraded` from the trace itself.
- `SearchMemoriesResult.degraded` is independent from result count; degraded searches can still return keyword matches, while `contextSize: 0` is trace metadata meaning no rendered context was assembled.
- The troubleshooting note now separates empty success from degraded retrieval: `returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false` means a clean retrieval with no scoped context, while `degraded: true` is the fail-open or degraded path and must be treated separately.
- For docs, keep empty-vs-degraded guidance in `MCP_USAGE.md` concise and separate storage checks from `memory_context` cache checks, so agents don't treat `returnedMemoryIds: []` with `degraded: false` as a retrieval failure.
- `contextSize` must not be used as a hit/non-hit indicator; the normal-hit signal should be the returned IDs (with `degraded: false`), while `contextSize: 0` remains trace metadata for no rendered context.
- Added a regression test that reads `CONTINUITY_DEBUGGING.md` and `MCP_USAGE.md` from the repo root and checks only the core empty-vs-degraded strings, which keeps the docs contract stable without snapshot brittleness.
- When closing a docs-only review fix, keep the evidence note explicit about implementation files versus `.sisyphus` orchestration state so diff checks stay scoped to real behavior changes.
