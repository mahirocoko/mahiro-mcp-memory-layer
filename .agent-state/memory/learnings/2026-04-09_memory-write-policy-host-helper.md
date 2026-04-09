# Learning Note

## Title
Build memory as a decision system, then expose one-call host helpers

## Tags
- memory
- write-policy
- host-integration
- profile-semantics
- retrospective

## Lesson
The biggest unlock in this session was realizing that a usable memory product does not emerge just by improving retrieval. Search quality, profile shaping, and idempotent document storage all matter, but they are still only supporting pieces until the system can answer a practical operational question: should this turn be remembered, and if so, should it be saved now or only surfaced for review? Once I treated the memory layer as a decision system, the work sequenced itself. First came `suggest_memory_candidates` to estimate durable value. Then came conservative policy application so the system could distinguish strong candidates from review-only ones. Finally, the most important step was adding a one-call host helper so a real integration can consume context, suggestions, and policy results in one place. The durable lesson is that memory systems need a thin action loop, not just storage and retrieval. When the primitives are good enough, the next highest-value move is almost always to reduce the number of calls and decisions a host must orchestrate by hand.

## Rediscovery Cues
- If the memory layer feels powerful but awkward to use, ask whether the missing piece is decision flow rather than retrieval quality.
- If a host needs multiple calls to build context, inspect save hints, and apply write policy, add a one-call helper before adding more semantics.
