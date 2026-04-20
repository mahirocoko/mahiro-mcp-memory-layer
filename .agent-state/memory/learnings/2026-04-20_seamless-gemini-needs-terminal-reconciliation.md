# Learning: seamless Gemini delegation needs terminal reconciliation, not just execution

## Summary

Successful Gemini execution and correct worker routing are necessary but not sufficient for a seamless orchestration experience. A parent orchestrator only feels seamless when delegated Gemini terminality is reconciled back into the parent session cleanly and promptly.

## Evidence

- A live `tmux + opencode` handshake in `muteluna` created `.gemini-handshake.txt` with exact requested content.
- The Gemini subagent pane showed explicit completion.
- The parent session still lagged at the delegation step instead of transitioning smoothly into verification.

## What changed in response

- Added approval-gated worker result handling (`approval_required`).
- Persisted approval metadata into orchestration result records.
- Reconciled plugin operator state so approval-gated implementation work becomes `needs_attention`.
- Added explicit executor precedence so user-pinned Gemini/Cursor requests override category defaults.

## Durable takeaway

“Worker did the work” and “orchestrator consumed the result” must be modeled separately. If they are conflated, the system can look correct from the worktree while still feeling broken to the user.

## Tags

- orchestration
- gemini
- tmux
- terminality
- reconciliation
- executor-precedence
