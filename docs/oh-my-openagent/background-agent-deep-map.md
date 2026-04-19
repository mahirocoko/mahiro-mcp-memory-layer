# background-agent deep map

This note focuses on `oh-my-openagent/origin/src/features/background-agent/` from source.

## What this subsystem is

`features/background-agent/` is the async execution engine for delegated and background work.

Its job is to:

- launch child sessions
- queue and throttle work
- track task lifecycle
- detect completion or failure
- notify the parent session
- expose task inspection and cancellation through tools

## Main files

### `manager.ts`

This is the core runtime owner.

From source, `BackgroundManager` owns:

- `tasks` map
- `notifications` and pending notification state
- `pendingByParent`
- `queuesByKey`
- `processingKeys`
- `completionTimers`
- `completedTaskSummaries`
- `idleDeferralTimers`
- `notificationQueueByParent`
- task history
- spawn-limit tracking for descendant sessions

Key responsibilities visible in the class:

- `launch(...)` creates a pending background task immediately
- reserves descendant spawn budget before task start
- computes concurrency key
- enqueues work per model/provider key
- starts task execution and updates task state to `running`
- tracks parent session, parent message, parent model, parent agent, and category
- coordinates notification batching back to the parent
- handles event ingestion from the background-notification hook
- enforces stale-task interruption and terminal cleanup

In short, this file is the orchestration engine, not just a task list wrapper.

### `spawner.ts`

This file contains lower-level session creation and prompt injection helpers.

Important responsibilities:

- `createTask(...)` creates the initial task structure
- `startTask(...)` creates the child OpenCode session
- optionally triggers the tmux callback when tmux is enabled and the process is already inside tmux
- applies session prompt params and prompt body restrictions
- injects the task prompt into the created child session
- retries with a fallback agent if the requested agent is not found
- `resumeTask(...)` restarts an existing background task session

This file is execution plumbing. `manager.ts` decides *when* to run; `spawner.ts` helps perform the actual launch/resume step.

### `concurrency.ts`

`ConcurrencyManager` is the throttle layer.

Responsibilities:

- derive per-model or per-provider concurrency limits from config
- default to `5` concurrent tasks when nothing is configured
- queue waiters FIFO by concurrency key
- release slots on completion/cancel/error
- cancel waiters during cleanup

This is one of the reasons background work stays bounded instead of exploding into untracked parallelism.

### `task-poller.ts`

This file handles stale-task pruning and interruption.

Responsibilities:

- prune terminal tasks after a TTL
- prune or fail long-stuck queued/running tasks
- detect missing sessions via status polling
- abort stale sessions
- notify parent sessions when a task is interrupted by timeout

This file is not the only completion detector, but it is the “garbage collector + stale task killer” for the subsystem.

### `session-idle-event-handler.ts`

This file is part of the completion path.

Its job is to decide whether an idle event is enough to move a running task toward completion, while protecting against premature completion during brief idle windows.

### `session-status-classifier.ts`

This file classifies raw session statuses into active vs terminal buckets.

It is a small but important normalization layer because other files rely on a consistent interpretation of runtime status.

### `session-existence.ts`

This file double-checks whether a session still exists when it vanishes from the status registry.

That protects the manager from cancelling tasks too aggressively on temporary visibility glitches.

### `fallback-retry-handler.ts`

This file handles model/provider retry behavior for failing tasks.

It keeps retry policy out of the core manager body.

### `loop-detector.ts`

This file detects repetitive tool-use patterns and resolves circuit-breaker settings.

It is a safeguard against runaway subagent loops.

### `subagent-spawn-limits.ts`

This file enforces depth and descendant-budget limits.

It is the hard boundary that stops recursive delegation from becoming unbounded.

### `task-history.ts`

This file stores a lightweight history of spawned tasks per parent session.

It supports task visibility and resumability.

### `process-cleanup.ts`

This file handles shutdown cleanup registration and teardown behavior for managers.

## Internal flow

### Launch path

1. `BackgroundManager.launch(...)` in `manager.ts`
2. reserve spawn budget
3. create pending task record
4. derive concurrency key
5. enqueue task
6. processing loop starts actual task through the spawn/resume helpers
7. `spawner.ts` creates the session and injects the prompt
8. task moves to `running`

### Runtime monitoring path

1. runtime events are forwarded into the manager by the background-notification hook
2. manager updates in-memory task progress and notification state
3. idle/status polling checks task health
4. stale-task detection may interrupt the session

### Completion / notification path

1. task reaches terminal state or is determined stable enough to finish
2. manager formats notification payloads
3. notification is queued for the parent session
4. `background_output` can read task state or result explicitly

## Why this subsystem matters

If you want to port or reproduce the orchestration pattern, this directory is the most important execution-layer reference.

It shows how `oh-my-openagent` turns “spawn a subagent” into:

- a tracked task
- a bounded concurrency unit
- a monitored runtime session
- a parent-visible notification/result
