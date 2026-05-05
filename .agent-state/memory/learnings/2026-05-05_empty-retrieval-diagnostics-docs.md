# Lesson Learned: Empty Retrieval Diagnostics Need State + Next Action

**Date**: 2026-05-05
**Tags**: memory, retrieval-diagnostics, continuity-debugging, documentation, verification

When documenting retrieval diagnostics, describe both the observed state and the next diagnostic action. `returnedMemoryIds: []`, `contextSize: 0`, and `degraded: false` means retrieval completed cleanly but returned no scoped context; it is not a degraded retrieval and not proof that storage or the continuity cache is empty. `degraded: true` is a separate fail-open/degraded path and should trigger trace/provenance inspection plus verification/eval when unexpected.

The durable lesson is to avoid overloading trace metadata. `contextSize` is not a hit/non-hit signal in this repo; returned IDs and the `degraded` flag carry the operator-facing distinction. For docs-only plans, evidence should also separate implementation-scope changes from orchestration state like `.sisyphus/boulder.json` and plan checkbox tracking, otherwise a correct docs patch can look like scope creep during review.
