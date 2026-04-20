# Learning: plugin orchestration needs explicit intent and ownership

## Summary

For the plugin-native orchestration façade, routing by category alone is not enough. Delegated tasks need explicit intent, and the operator loop must preserve delegated ownership while an implementation task is still running.

## What changed the outcome

- added explicit delegated `intent` (`proposal` or `implementation`)
- threaded that intent through workflow metadata and plugin session operator state
- mapped terminal workflow failures to `needs_attention`
- suppressed continuity-style preflight while a delegated implementation task is still `running`

## Why this matters

Without explicit intent, proposal-style delegated work can be mistaken for implementation progress. Without ownership enforcement, reminders and continuity pressure can push the orchestrator into invalid local fallback while delegated work is still healthy.

## Rediscovery tags

- orchestration
- plugin-native
- control-plane
- task-intent
- delegated-ownership
