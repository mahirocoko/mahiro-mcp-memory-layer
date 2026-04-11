# Learning: live-opencode-wakeup-fallback

## Tags
- opencode-plugin
- lifecycle
- wake-up
- debugging
- runtime-verification

## Context
The OpenCode plugin's memory wake-up flow was originally anchored to `session.created`. Targeted tests proved that contract in the harness, but a real `opencode run` session showed `memory_context` with complete scope and empty cached wake-up state.

## Lesson
For the OpenCode plugin, session-start behavior cannot rely on dedicated `session.created` delivery alone. Live runs can surface generic session-scoped message events before a usable dedicated session-start hook reaches the plugin runtime that later serves `memory_context`. The safe fix is to allow the first generic session event to bootstrap wake-up when the session has not started wake-up yet.

## Why it matters
This keeps `memory_context.cached.wakeUp` available in fresh live sessions without weakening the existing dedicated-hook path. It also shows that runtime verification through `tmux` + `opencode run` catches integration mismatches that unit and package harnesses can miss.

## Durable note
Keep the generic-event fallback as the behavior fix, and keep stderr lifecycle mirroring behind `MAHIRO_OPENCODE_PLUGIN_DEBUG_STDERR=1` for future live-hook debugging.
