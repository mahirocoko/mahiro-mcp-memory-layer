# oh-my-openagent — Quick Reference

## What this project does

An OpenCode plugin and CLI for multi-agent orchestration. It routes work across specialized agents, supports category-based delegation, and manages background subagent execution with runtime hooks and tool composition.

## Main entrypoints to read

1. `origin/README.md`
2. `origin/docs/guide/overview.md`
3. `origin/docs/guide/orchestration.md`
4. `origin/package.json`
5. `origin/src/index.ts`
6. `origin/src/plugin/tool-registry.ts`
7. `origin/src/tools/delegate-task/tools.ts`
8. `origin/src/features/background-agent/manager.ts`

## Core concepts

- **plugin-first runtime**
- **category-based delegation**
- **named subagents** like `explore`, `librarian`, `oracle`
- **background child-session execution**
- **hook-enforced continuation/recovery/safety behavior**
- **Claude/OpenCode compatibility loading**

## Best mental model

- config/model policy
- control plane (`task`, categories, agent routing)
- execution plane (`BackgroundManager` and child sessions)
- policy plane (hooks)

## One-sentence summary

This repo is a multi-agent OpenCode runtime whose real center of gravity is the interaction between delegation, background execution, and hook-enforced behavior policy.
