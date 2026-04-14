# Learning Note

## Title
Detached polling needs a detached state model.

## Tags
- orchestration
- supervisor
- background-jobs
- api-design
- mcp

## Context
The repo already had `workflow_*` results and helper tools around waiting and supervision. But the user’s actual requirement was stronger: they wanted real background sleep/check behavior that would not keep one MCP request open for the full supervision loop.

## What happened
The correct solution was not to keep enhancing blocking helpers. It was to add a new `supervisor_*` identity and a separate supervision store so the repo could model “the watcher” as its own detached entity. Then `supervise_orchestration_result` could become an async start tool and `get_orchestration_supervision_result` could become the real polling surface.

## Lesson
If the system has two different things — a job and a watcher of that job — they usually deserve two different persisted identities. Reusing one request namespace for both may feel simpler at first, but it blurs the mental model and makes both docs and API behavior harder to reason about.

## Durable rule
When converting a blocking helper into a real background path, check for all three:
1. separate identity for the detached unit of work,
2. separate stored record shape if the detached unit has different lifecycle semantics,
3. a start/get contract that matches how consumers will actually poll it.

If any of those are missing, the feature is probably still just a nicer blocking helper.
