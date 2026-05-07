# Lesson Learned: Scope evidence indexes to the active plan

Tags: `sisyphus`, `verification`, `evidence`, `memory-diagnostics`, `atlas`

During the `trusted-memory-diagnostics` session, Task 6 initially produced a summary that listed unrelated evidence files from prior plans because it effectively treated all `.sisyphus/evidence/task-*` files as relevant. The fix was to curate the evidence index against the current plan’s explicit Task 1-6 requirements instead of trusting filename similarity.

The durable lesson: evidence packaging is itself a verification surface. A passing full test suite does not prove the evidence index is scoped correctly. For future Sisyphus work, read the generated summary and reject any stale entries such as lifecycle, precompact, protocol, or unrelated retrospective artifacts when the active plan did not create them. Prefer a hand-scoped list derived from the plan acceptance criteria.

Practical trigger: whenever `.sisyphus/evidence/` already contains files before a plan starts, treat automated evidence indexes as suspicious until manually reviewed.
