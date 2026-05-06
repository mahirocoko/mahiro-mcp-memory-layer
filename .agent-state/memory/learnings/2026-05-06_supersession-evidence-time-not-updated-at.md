# Supersession hints must use evidence-origin time, not `updatedAt`

Tags: memory-review, supersession, evidence, final-wave, advisory-hints

When implementing advisory `possible_supersession` hints, do not use generic `updatedAt` as a freshness signal. Review workflows can update records for reasons such as defer/reject/follow-up notes, and those mutations do not represent newer evidence. Use evidence-origin time such as `verifiedAt` for verified records and `createdAt` for proposed hypothesis records unless a future schema adds an explicit evidence timestamp for proposals.

This came up during the `mempalace-review-hints-adaptation` final wave. The initial implementation used `verifiedAt ?? updatedAt ?? createdAt`, which allowed an old pending memory to look newer after a review action changed `updatedAt`. The fix changed freshness to `verifiedAt ?? createdAt` and added a regression test: `does not treat review workflow updatedAt as supersession evidence freshness`.

Remember: advisory hints are reviewer assistance, not truth decisions. If freshness can be caused by workflow bookkeeping, it is not evidence freshness.
