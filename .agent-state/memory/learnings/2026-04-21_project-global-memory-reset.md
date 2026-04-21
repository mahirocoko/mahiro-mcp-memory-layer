# Learning Note — project-global-memory-reset

Tags: memory, scope-model, simplification, reset, plugin-runtime

## Lesson
When a local-first memory system is effectively single-user, supporting a separate `user` scope can create more confusion than value. In this repo, the practical effect was fragmented identity (`mahiro`, `default`, `local:mahiro`) and operator uncertainty about what should persist across sessions versus what merely appeared in cached context. The durable fix was not better normalization logic layered on top of that model. The durable fix was to simplify the contract itself so memory scopes are only `project` and `global`, then remove the old semantics from schemas, retrieval, policy, plugin integration, and tests.

## Why It Matters
This reduces cognitive load for both the operator and the code. It also makes persistence behavior easier to reason about: repo-specific knowledge belongs to `project`, cross-repo defaults belong to `global`, and session continuity is handled by runtime cache and retrieval flow rather than a separate memory scope pretending to be durable.

## Reuse Signal
If future systems claim to be “single-user for now” but keep exposing user identity in core memory contracts, treat that as a design smell early. Removing the abstraction may be cleaner than trying to reconcile multiple aliases forever.
