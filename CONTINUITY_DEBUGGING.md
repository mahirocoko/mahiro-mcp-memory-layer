# Continuity Debugging

Use this guidance when the user asks to continue prior work, recall previous decisions, compare with earlier sessions, or debug why memory retrieval did or did not help.

## Default posture

For this repo, continuity debugging should start with the plugin-native memory diagnostics before broader recap or search flows.

Use this order first:

1. `memory_context`
2. `inspect_memory_retrieval`
3. only then broader session/recap/search flows if the memory diagnostics are insufficient

## Why

This repo now exposes startup brief, cached wake-up state, turn preflight state, and retrieval provenance directly through the memory tool surface.

If you jump straight to broader recap or search-mode behavior, you can hide the actual plugin-memory path that needs debugging.

## What to inspect first

### `memory_context`

Use it to answer:

- what runtime mode is active right now?
- what was the latest event type?
- which cached sections are populated (`wakeUp`, `prepareTurn`, `prepareHostTurn`)?
- is the startup brief present?

### `inspect_memory_retrieval`

Use it to answer:

- did the latest retrieval hit or miss?
- was it degraded?
- what exact query string was used?
- which provenance labels were attached?
  - `surface`
  - `trigger`
  - `phase`
  - `searchScope`

## Routing rule

When the user asks things like:

- "continue from the previous session"
- "remember what we decided"
- "why did memory miss?"
- "why didn’t continuity work?"

prefer the direct memory diagnostics first.

Do **not** immediately switch to `recap`, session listing, or background exploration unless:

- `memory_context` is missing the expected cached state, or
- `inspect_memory_retrieval` shows that the latest trace is insufficient to explain the issue

## Interactive testing note

In live `tmux` + interactive `opencode` sessions, broader recap/search tooling can easily take over the flow before the memory-preflight path becomes observable.

If the goal is to debug the memory path itself, keep the interaction focused on:

- `memory_context`
- `inspect_memory_retrieval`

before escalating to recap or background agents.
