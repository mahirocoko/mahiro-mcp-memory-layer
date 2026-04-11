# Learning: agents-orchestration-split

## Tags
- agents
- orchestration
- docs-boundaries
- opencode-plugin
- verification

## Context
`AGENTS.md` had accumulated both high-level agent rules and detailed orchestration posture. The repo needed a leaner `AGENTS.md`, a new `ORCHESTRATION.md`, and plugin wiring that would load both instruction files automatically.

## Lesson
When splitting instruction files, the meaningful boundary is not just editorial. The loader, package surface, tests, and README references all encode assumptions about instruction ownership. If `ORCHESTRATION.md` conceptually extends `AGENTS.md`, the runtime should preserve that dependency and avoid loading orchestration guidance on its own. The safe pattern is: make the base instruction file load first, append the extension file second, and verify that cross-references and packaging reflect the same dependency graph.

## Why it matters
This keeps the agent contract coherent. A cleaner file layout is only an improvement if it also reduces ambiguity at runtime and in published package installs. Otherwise the split just moves drift into a different layer.

## Durable note
For future instruction refactors, treat docs boundaries as runtime boundaries: update the loader, package manifest, tests, and reference docs together, and use a final review pass to catch semantic mismatches that green tests can miss.
