# Learning Note: plugin-native tmux subagent orchestration

## Summary
Behavior-level fidelity matters more than architectural similarity when rebuilding orchestration. The plugin-native path had to own task start, task tracking, and reminder return to the main session; MCP-first worker invocation could not honestly model the intended oh-my-openagent loop.

## Key Points
- Use plugin-native session context for reminder return.
- Treat Gemini tmux automation as its own runtime with trust/input/completion quirks.
- Validate completion from pane behavior, not only from worker summaries or optimistic assumptions.

## Tags
- orchestration
- tmux
- gemini
- plugin-native
- reminders
