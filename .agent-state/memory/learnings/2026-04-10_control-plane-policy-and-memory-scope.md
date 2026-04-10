# Learning Note

**Date**: 2026-04-10
**Tags**: agents, orchestration, memory, opencode-plugin, policy

## Lesson
Operational doctrine and memory plumbing have to reinforce each other. It is not enough to say the main agent should act as the control plane if the memory layer cannot reliably recover project decisions across sessions. In this repo, writing down the control-plane versus execution-plane model in `AGENTS.md` helped clarify how work should be routed, but the bigger enabling step was fixing plugin scope resolution so normal local sessions resolve a stable `userId` and can actually reuse durable memory. The practical pattern is: define the orchestration posture clearly, make async worker UX self-describing, and ensure scope-complete memory retrieval exists so the next session can inherit those decisions without extra re-explanation.

## Why It Matters
Without explicit doctrine, teams drift into inconsistent delegation. Without complete scope IDs, memory becomes decorative instead of operational. Together, those two gaps force the main agent to reread and re-decide too much, which burns tokens and reduces continuity.

## Reuse Rule
When a system depends on multi-agent routing, first make the control-plane policy explicit, then verify the memory scope is complete enough to retrieve durable project decisions in new sessions.
