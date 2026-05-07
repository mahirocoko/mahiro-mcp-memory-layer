# Diagnostic fields need real signal

Tags: memory-diagnostics, retrieval-trace, scoped-miss, context-size, evidence-freshness

When maintaining `mahiro-mcp-memory-layer`, do not let diagnostic fields remain placeholders after docs start teaching users to interpret them. This session found `RetrievalTraceEntry.contextSize` was always `0`, while continuity docs used `contextSize: 0` as part of empty-success diagnosis. The fix made `contextSize` reflect returned retrieval item payload size and added regression coverage.

The same principle applies to scoped trace lookup: an empty latest lookup is ambiguous unless it reports the attempted scope. Returning `latestScopeFilter` on scoped empty results lets users distinguish “no trace in this project/container” from “no trace exists anywhere.”

For review hints, keep timestamp semantics explicit: evidence freshness is `verifiedAt ?? createdAt`; `updatedAt` is workflow bookkeeping and must not make a memory look like newer evidence.
