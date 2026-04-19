# atlas deep map

This note focuses on `oh-my-openagent/origin/src/hooks/atlas/` from source.

## What Atlas is

Atlas is the continuation/control-policy layer.

It does not own background execution or tmux panes directly.
Instead, it decides:

- when a session should keep going
- when delegated work should come back with a verification reminder
- when direct edits by the orchestrator should be discouraged
- how subagent sessions should be tracked inside Boulder state

## Main files

### `atlas-hook.ts`

This is the entry point.

It creates three handlers:

- event handler
- `tool.execute.before`
- `tool.execute.after`

It also stores:

- per-session state
- pending file paths
- pending task refs

This file is the assembly point for Atlas behavior, not the deep logic owner.

### `event-handler.ts`

This file routes runtime events into Atlas decisions.

Observed responsibilities:

- on `session.error`, record whether the last event was an abort-like failure
- on `session.idle`, call `handleAtlasSessionIdle(...)`
- on `message.updated` and `message.part.updated`, clear abort-related state and reset approval flags
- on tool lifecycle events, clear abort markers
- on `session.deleted` and `session.compacted`, clean up session state and pending timers

This file is the main event-side dispatcher.

### `idle-event.ts`

This file is the real continuation gate.

Its job is to decide, on idle:

- whether the session belongs to the right orchestration context
- whether it is safe to continue
- whether background work is still running
- whether cooldown and retry rules allow another injected continuation

This is where “should we continue?” is actually decided.

### `boulder-continuation-injector.ts`

This file builds and injects continuation prompts back into the active session.

It is the actual continuation action layer once the idle-event logic decides continuation is needed.

### `tool-execute-before.ts`

This file is a policy guard before tool execution.

Observed responsibilities:

- detect direct write/edit behavior by the orchestrator
- track task call ids to Boulder task refs
- inject single-task guidance before delegated work

This file protects the orchestrator from drifting into uncontrolled direct work.

### `tool-execute-after.ts`

This file is one of the most important Atlas files.

Observed responsibilities:

- ignore irrelevant tool results
- detect whether the caller is the orchestrator
- append direct-work reminders for write/edit tools
- detect background launch events
- sync launched session ids into Boulder state via `background-launch-session-tracking.ts`
- resolve task context and session lineage
- validate subagent session ids from metadata/output
- rewrite tool output with completion gates and verification reminders
- add standalone verification reminders when Boulder state is absent

This is the file that turns raw tool completion into orchestrator-friendly continuation output.

### `background-launch-session-tracking.ts`

This file attaches launched background sessions to Boulder/task state.

It is the bridge between delegated launches and reusable orchestration context.

### `verification-reminders.ts`

This file builds the text injected into task output for:

- completion gates
- final-wave approval pauses
- orchestrator reminders
- standalone verification reminders

### `task-context.ts`

This file resolves the current task context and preferred session id.

It helps Atlas connect a tool call back to the correct Boulder task.

### `subagent-session-id.ts`

This file extracts and validates subagent session ids from metadata or text output.

It is one of the files that lets Atlas stitch delegated results back into the orchestration graph.

### `session-last-agent.ts`

This file resolves which agent most recently owned the session.

It is part of deciding whether Atlas should continue or stop.

### `recent-model-resolver.ts`

This file finds the recent model context used in a session.

It helps continuation prompts inherit sane model/runtime context.

### `final-wave-approval-gate.ts`

This file decides whether Atlas should pause for a final approval wave instead of continuing immediately.

## Internal flow

### Event-side continuation path

1. runtime event enters `event-handler.ts`
2. on `session.idle`, Atlas calls `handleAtlasSessionIdle(...)`
3. idle handler checks orchestration state, cooldowns, and background activity
4. if continuation is needed, `boulder-continuation-injector.ts` injects a prompt into the same session

### Tool-side verification path

1. tool finishes
2. `tool-execute-after.ts` checks whether the caller is the orchestrator
3. if the tool launched background work, session/task tracking is updated
4. if the tool completed work, output may be rewritten with:
   - file-change summaries
   - completion gates
   - verification reminders
   - final-wave approval reminders

### Direct-work guard path

1. orchestrator executes write/edit tool directly
2. `tool-execute-before.ts` and `tool-execute-after.ts` detect this
3. direct-work reminder is appended

## Why this subsystem matters

Atlas shows how `oh-my-openagent` separates:

- **execution** from `BackgroundManager`
- **runtime ownership** from `TmuxSessionManager`
- **continuation and verification policy** into a dedicated control-plane hook set

If you want to reproduce the orchestration pattern, Atlas is the clearest source for the “policy brain” part of the system.
