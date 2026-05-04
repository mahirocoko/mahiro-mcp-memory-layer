# Lesson: Ship memory visibility before memory management

Tags: memory-ui, read-only-boundary, local-introspection, verification

When adding a UI to a memory-focused package, start with visibility rather than control. A read-only viewer can safely expose what the system remembers through existing `list` and `search` surfaces without expanding the product boundary into editing, review management, reset, or proposal workflows. If the package has no frontend stack, avoid dependency churn: a localhost-only TypeScript server that renders escaped HTML is often enough for the first introspection surface.

Specific guardrails that worked:
- Bind to `127.0.0.1` and avoid public-hosted promises.
- Use a narrow read-only interface instead of importing write-capable service methods into viewer code.
- Assert that forbidden mutation labels/actions are absent in tests.
- Keep server-side API claims honest: if status filters are not supported by existing read APIs, filter only over fetched results and document the limitation.
- Verify with targeted diagnostics when broad tooling is confused by repo-local agent-state loops.
