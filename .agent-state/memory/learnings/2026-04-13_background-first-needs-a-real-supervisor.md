# Learning Note

## Title
Background-first orchestration is only real when the repo owns a supervisor path.

## Tags
- orchestration
- mcp
- supervisor
- polling
- api-design

## Context
The repo had already been shifted toward a background-first orchestration contract. Docs and tool messaging told callers to prefer async execution and polling, but the implementation still left the practical polling loop mostly up to the caller or a generic host-side poller.

## What happened
That gap became obvious once the contract was reviewed skeptically: the repo was recommending a production pattern without providing a concrete repo-owned helper that represented that pattern. The fix was to add `supervise_orchestration_result` as a concise terminal-summary tool layered on the existing result store and waiter logic, then prove it live through OpenCode smoke tests.

## Lesson
If a system claims a default operational path, that path should exist as a first-class mechanism. Otherwise the docs describe an aspiration, not a product surface. A good smell test is simple: can a caller follow the recommended path without inventing glue code that the repo itself could reasonably own?

## Durable rule
When moving from “helper” to “recommended default,” verify five layers together:
1. tool registration,
2. schema/input boundary,
3. docs/examples,
4. tests,
5. at least one live host-level proof.

If one of those layers is still missing, the default path is not finished yet.
