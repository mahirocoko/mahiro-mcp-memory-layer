# Lesson Learned: MemPalace wake-up is trigger-driven, not autonomous

Tags: `memory`, `wake-up`, `hooks`, `mempalace`, `continuity`, `plugin-boundary`

MemPalace is useful as a reference for memory lifecycle design, but its wake-up behavior should be understood as trigger-driven. The core user-visible path is manual (`mempalace wake-up`), while automation comes from host/plugin hooks such as session-start or other lifecycle events. Hooks do not store memory themselves; they invoke the storage/retrieval/mining layer at the right moment.

For `mahiro-mcp-memory-layer`, the better mapping is not to copy MemPalace’s CLI-first model. Our package should keep wake-up and turn preparation plugin-native through tools and lifecycle helpers such as `wake_up_memory`, `prepare_turn_memory`, `prepare_host_turn_memory`, `memory_context`, and `inspect_memory_retrieval`. The key product lesson is to make retrieval triggers explicit and debuggable: session start prepares broad context, turn preflight prepares query-specific context, explicit search answers direct recall requests, and inspection tools explain hit/miss/degraded retrieval behavior.

Avoid scope creep: do not import MemPalace-style mining, palace terminology, or executor workflows unless a future boundary decision explicitly expands the package. The actionable reference is staged recall, exact provenance, raw-content versus compact-pointer separation, and keeping runtime capability docs synchronized with actual exposed tools.
