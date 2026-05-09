# Lesson Learned: Memory Viewer Filter Simplification

Tags: memory-viewer, server-rendered-ui, read-only, filters, progressive-enhancement

When simplifying a server-rendered read-only viewer, reduce visible controls without removing deterministic submission. The best pattern for this session was:

- visible row: `Search input + Search button`
- native `<details>` for advanced filters
- hidden project context outside advanced filters so scoped search remains correct
- no debounced native `form.submit()` for text search, because it pollutes browser history during full-page GET reloads
- keep no-JS fallback and accessibility intact

The deeper lesson: debounce/throttle is technically possible, but not automatically appropriate. If the app remains server-rendered and full-page GET based, debounced text search creates history and focus problems. To avoid those, the implementation would need `fetch`, DOM replacement, and `history.replaceState`, which moves the design toward a micro-SPA. That may be fine later, but it is a different architectural decision than UI simplification.

Also remember that read-only surfaces can still accidentally write through observability. In this session, viewer search used the normal search path and appended retrieval traces until `traceStore` became optional and the viewer stopped passing it.
