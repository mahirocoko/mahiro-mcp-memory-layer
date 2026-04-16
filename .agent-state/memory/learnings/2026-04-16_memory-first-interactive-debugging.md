# Memory-first interactive debugging

## Tags

- memory
- continuity
- opencode-plugin
- interactive-testing
- tmux
- provenance

## Lesson

When debugging continuity or memory misses in this repo, interactive `tmux` + `opencode` validation is not interchangeable with headless execution. The reliable sequence is: inspect `memory_context`, inspect `inspect_memory_retrieval`, and only escalate to recap/search flows if those two are insufficient. The biggest hidden variable in live sessions is not only retrieval quality but host routing and skill takeover. Adding provenance to retrieval traces plus continuity-specific instructions creates enough observability and steering to tell whether the live path is actually using the memory-first route.

## Why it matters

Without provenance and memory-first guidance, a continuity prompt can look like a memory failure when the real cause is that the host drifted into a different skill or search mode first. With provenance labels and continuity-debug instructions in place, we can distinguish backend retrieval problems from host routing behavior.

## Reuse rule

For future continuity debugging in this repo:

1. Use a fresh tmux session every rerun.
2. Check `memory_context` first.
3. Check `inspect_memory_retrieval` second.
4. Treat broad recap/search flows as escalation, not default.
