# Learning: typed Gemini CLI controls beat raw pass-through

## Tags
- gemini
- cli
- orchestration
- reliability
- contract-design

## Context
While addressing Gemini async worker failures and noisy CLI behavior, the tempting solution was to add a raw `extraArgs` escape hatch and let callers pass arbitrary Gemini CLI flags. That would have been fast, but it would also have made the worker contract less verifiable, less documentable, and harder to preserve through MCP/runtime forwarding.

## Lesson
For worker runtimes that already have a typed input schema, the safer pattern is to add a narrow, named surface for the real use case rather than a generic passthrough. In this session that meant adding `approvalMode` and `allowedMcpServerNames` as explicit Gemini input fields, then validating and documenting them all the way through the stack. Once the shell boundary was examined closely, that also exposed a hidden correctness rule: if the shell runtime serializes an allowlist by joining names with commas, the accepted schema must reject comma-containing names and reserve the local `none` sentinel so the wire format stays lossless.

## Why it matters
This preserves three good properties at once: predictable CLI generation, accurate README/API documentation, and targeted tests that can prove the public contract. It also keeps the repo honest about what it supports rather than hiding behavior in an undocumented passthrough field.

## Reuse
When a future worker/runtime needs a “safe mode” or CLI workaround, start by asking: can this be modeled as one or two typed fields or a profile enum? Only reach for raw argument passthrough if the typed route is clearly impossible.
