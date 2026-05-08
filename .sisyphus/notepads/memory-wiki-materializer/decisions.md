
## 2026-05-08 - Hash boundary and slug boundary

- Canonical wiki record hashes will be derived from the projected materializer fields only, with stable recursive key ordering, so trace/debug metadata cannot perturb output identity.
- Source page slugs will use readable normalized text plus a deterministic hash suffix tied to source identity and record id, with a stable memory-id fallback when title/URI are missing.

## 2026-05-08 - Atomic writer boundary

- Wiki materialization writes should stage in a sibling temp directory, validate the generated tree before promotion, and replace the final scope directory as a whole so stale files disappear by replacement rather than selective deletion.

## 2026-05-08 - CLI scope and output contract

- The materializer CLI will surface only explicit scope IDs, an optional output override, and a boolean hypotheses flag; it will not infer host scope or add any memory lifecycle behavior.
- CLI success output will report the generated scope directory, manifest path, included/excluded counts, and verification hints so operators can confirm the projection without reading the files manually.

## 2026-05-08 - Task 7 stale boundary

- Fresh/stale status is based on saved manifest scope/schema plus deterministic included-record set and `hashWikiMaterializerRecord()` outputs from current canonical scoped records; validation does not inspect LanceDB rows, retrieval traces, or `memory_context`.
