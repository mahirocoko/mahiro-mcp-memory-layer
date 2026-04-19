# oh-my-openagent-layered-orchestration-pattern

## Tags

- orchestration
- callbacks
- reminders
- oh-my-openagent
- source-of-truth
- architecture

## Lesson

When reading `oh-my-openagent`, the reliable architecture pattern is not “a plugin with many hooks” but a layered system with clear ownership boundaries. From real source in `origin/src`: `src/index.ts` is the composition root; `create-managers.ts` creates stateful runtime owners such as `BackgroundManager` and `TmuxSessionManager`; `create-tools.ts` exposes execution surfaces; `create-hooks.ts` composes policy and continuation behavior; `plugin-interface.ts` is the host adapter. The orchestration center is distributed but readable: `features/background-agent/*` is the async execution engine, `features/tmux-subagent/*` is the tmux runtime owner, and `hooks/atlas/*` plus `hooks/background-notification/*` form the continuation and reminder policy layer.

## Why it matters

This is the clearest model yet for what we should adapt in our own orchestration redesign. We should stop thinking of orchestration as one monolithic manager or one giant hook bundle. The more useful split is: execution engine, runtime substrate owner, continuation policy, and host adapter. That separation also explains why an in-process reminder proof can pass while a host-integrated reminder proof still fails: the policy path may exist without the host adapter actually delivering continuations back into the visible session.

## Reuse rule

When analyzing an orchestration system we want to adapt, treat generated docs as hints only and derive the real ownership model from source entry files first. Identify, at minimum:

1. composition root
2. runtime state owners
3. execution surfaces
4. continuation/reminder policy layer
5. host adapter boundary
