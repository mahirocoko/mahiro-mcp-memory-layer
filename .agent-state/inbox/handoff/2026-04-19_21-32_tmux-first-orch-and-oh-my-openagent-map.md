# Handoff: tmux-first orch and oh-my-openagent map

**Date**: 2026-04-19 21:32
**Context**: 78%

## What We Did
- Proved an in-process callback/reminder POC using the plugin-side async task tracker, temp result store, and synthetic `promptAsync` capture.
- Ran a live host-integrated reminder proof and found that background task start worked, but reminder injection back into the waiting main session was not yet proven in the real host runtime.
- Learned `anomalyco/opencode` and refreshed the local learn hub/docs under `.agent-state/learn/anomalyco/opencode/`.
- Re-learned `oh-my-openagent` from the existing local learn root and refreshed its hub note.
- Read `oh-my-openagent/origin/src` from source, not generated summaries, and mapped the real orchestration layers.
- Wrote source-grounded docs under `docs/oh-my-openagent/`, including overview docs plus deep maps for `background-agent`, `tmux-subagent`, and `atlas`.
- Confirmed that `oh-my-openagent` cleanly separates composition root, runtime managers, tool surface, continuation hooks, and host adapter.

## Pending
- [ ] Decide whether to commit the callback/reminder POC files in this repo:
  - `src/features/opencode-plugin/callback-reminder-poc.ts`
  - `tests/callback-reminder-poc.test.ts`
  - `src/features/opencode-plugin/async-task-reminder-bridge.ts`
- [ ] Decide whether to commit the new docs under `docs/oh-my-openagent/`.
- [ ] Re-run a live reminder proof with a task shape that reaches a clean terminal success, then check whether a reminder comes back into the main session.
- [ ] Keep the rule that learned summaries are hints only; source in `origin/` remains the only source of truth for architecture claims.

## Next Session
- [ ] Compare our current orchestration design against `oh-my-openagent` using the new docs: identify execution engine, runtime substrate owner, continuation policy, and host adapter in our repo.
- [ ] Draft a tmux-first orchestration redesign spec that preserves the current public async contract but replaces headless execution.
- [ ] If reminder callbacks are still a priority, build a stricter host-integrated proof around a successful background task instead of a failing one.
- [ ] Decide whether to keep or delete the current callback/reminder POC code after the architectural comparison.

## Key Files
- `docs/oh-my-openagent/README.md`
- `docs/oh-my-openagent/src-overview.md`
- `docs/oh-my-openagent/root-composition.md`
- `docs/oh-my-openagent/plugin-hooks-and-tools.md`
- `docs/oh-my-openagent/orchestration-flow.md`
- `docs/oh-my-openagent/background-agent-deep-map.md`
- `docs/oh-my-openagent/tmux-subagent-deep-map.md`
- `docs/oh-my-openagent/atlas-deep-map.md`
- `src/features/opencode-plugin/callback-reminder-poc.ts`
- `src/features/opencode-plugin/async-task-reminder-bridge.ts`
- `tests/callback-reminder-poc.test.ts`
- `.agent-state/memory/retrospectives/2026-04/19/21.29_oh-my-openagent-src-mapping-and-reminder-poc.md`
