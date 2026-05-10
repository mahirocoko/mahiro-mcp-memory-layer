# Lesson: Preserve Memory Boundaries Through Tests

**Date**: 2026-05-10
**Tags**: memory-layer, retrieval, quarantine, bun-tests, verification

When changing `mahiro-mcp-memory-layer`, preserve product boundaries as executable contracts, not just prose. Normal retrieval/context should exclude rejected memory records, while review, debug, quarantine, and purge surfaces may still inspect them explicitly. Context rendering should include authority/provenance labels so downstream agents can see scope, verification status, review status, and source without guessing.

For runner compatibility, avoid test designs that depend on unavailable module-cache mocking helpers. In this Bun/Vitest environment, small dependency-injection seams are more reliable than `vi.resetModules` or `vi.doMock`, and they often make the production code easier to verify without changing the public API.

Durable takeaway: when a failing test conflicts with a new contract, first identify which surface owns the behavior. Then update the test or implementation to encode that boundary clearly instead of adding compatibility shims or hidden fallbacks.
