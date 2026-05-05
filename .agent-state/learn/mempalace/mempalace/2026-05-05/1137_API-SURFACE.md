# MemPalace API & Integration Surface

Source inspected: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

## Public package and executable surface

- The Python distribution is `mempalace` version `3.3.3`, requires Python `>=3.9`, and declares ChromaDB plus PyYAML as runtime dependencies. Source: `origin/pyproject.toml`.
- Console entry points are `mempalace = mempalace.cli:main` and `mempalace-mcp = mempalace.mcp_server:main`. These are the stable executable integration points for shell users and MCP hosts. Source: `origin/pyproject.toml`.
- `python -m mempalace` is supported by delegating to `mempalace.cli.main()`. Source: `origin/mempalace/__main__.py`.
- The top-level import surface is intentionally tiny: `mempalace.__all__` exports only `__version__`; documented runtime APIs live in submodules such as `mempalace.searcher`, `mempalace.layers`, and `mempalace.knowledge_graph`, not top-level re-exports. Source: `origin/mempalace/__init__.py`.

## CLI surface

The CLI is implemented with `argparse` in `mempalace.cli.main()` and every command accepts the global `--palace` override for the palace path. Sources: `origin/mempalace/cli.py`, `origin/website/reference/cli.md`.

Registered CLI commands in `origin/mempalace/cli.py`:

- `mempalace init <dir>`: scans a project directory, detects entities/rooms, writes setup artifacts, supports `--yes`, `--auto-mine`, language selection, and LLM refinement flags. Source: `origin/mempalace/cli.py`.
- `mempalace mine <dir>`: mines project files or conversations with `--mode projects|convos`, optional `--wing`, `--agent`, `--limit`, `--dry-run`, gitignore controls, and conversation extraction modes. Source: `origin/mempalace/cli.py`.
- `mempalace sweep <target>`: message-level transcript miner intended to catch misses from the primary miner. Source: `origin/mempalace/cli.py`.
- `mempalace search <query>`: semantic search with optional `--wing`, `--room`, and `--results`. Source: `origin/mempalace/cli.py`.
- `mempalace compress`: AAAK compression over drawers, with `--wing`, `--dry-run`, and `--config`. Source: `origin/mempalace/cli.py`.
- `mempalace wake-up`: renders L0 + L1 context, optionally scoped by `--wing`. Source: `origin/mempalace/cli.py` and `origin/mempalace/layers.py`.
- `mempalace split <dir>`: splits concatenated transcript mega-files, with dry-run and output-dir controls. Source: `origin/mempalace/cli.py`.
- `mempalace hook run`: executes hook logic for `session-start`, `stop`, or `precompact` under `claude-code` or `codex` harnesses. Source: `origin/mempalace/cli.py`.
- `mempalace instructions <init|search|mine|help|status>`: prints bundled skill instructions. Source: `origin/mempalace/cli.py` and `origin/mempalace/instructions/*.md`.
- `mempalace repair`, `mempalace repair-status`, and `mempalace migrate`: maintenance paths for ChromaDB/vector-index repair and migrations. Source: `origin/mempalace/cli.py`.
- `mempalace mcp`: prints MCP setup syntax, while `mempalace-mcp` starts the actual server. Sources: `origin/mempalace/cli.py`, `origin/pyproject.toml`, `origin/examples/mcp_setup.md`.
- `mempalace status`: reports filed palace state. Source: `origin/mempalace/cli.py`.

## MCP server surface

The MCP server is a JSON-RPC-over-stdio server in `mempalace.mcp_server`. It negotiates supported protocol versions, exposes tools through `tools/list`, invokes them through `tools/call`, and returns tool results as JSON text content. It restores stdout for protocol output after redirecting dependency noise to stderr. Source: `origin/mempalace/mcp_server.py`.

The actual MCP tool registry is the `TOOLS` dictionary in `origin/mempalace/mcp_server.py`. The registry currently contains these public tool names:

- Palace read/status: `mempalace_status`, `mempalace_list_wings`, `mempalace_list_rooms`, `mempalace_get_taxonomy`, `mempalace_get_aaak_spec`. Source: `origin/mempalace/mcp_server.py`.
- Search and duplicate detection: `mempalace_search`, `mempalace_check_duplicate`. `mempalace_search` declares keyword-only `query`, optional `limit`, `wing`, `room`, `max_distance`, and `context` schema fields. Source: `origin/mempalace/mcp_server.py`.
- Drawer CRUD: `mempalace_add_drawer`, `mempalace_delete_drawer`, `mempalace_get_drawer`, `mempalace_list_drawers`, `mempalace_update_drawer`. Source: `origin/mempalace/mcp_server.py`.
- Temporal knowledge graph: `mempalace_kg_query`, `mempalace_kg_add`, `mempalace_kg_invalidate`, `mempalace_kg_timeline`, `mempalace_kg_stats`. Source: `origin/mempalace/mcp_server.py`.
- Palace navigation/tunnels: `mempalace_traverse`, `mempalace_find_tunnels`, `mempalace_graph_stats`, `mempalace_create_tunnel`, `mempalace_list_tunnels`, `mempalace_delete_tunnel`, `mempalace_follow_tunnels`. Source: `origin/mempalace/mcp_server.py`.
- Agent diary and hook state: `mempalace_diary_write`, `mempalace_diary_read`, `mempalace_hook_settings`, `mempalace_memories_filed_away`, `mempalace_reconnect`. Source: `origin/mempalace/mcp_server.py`.

Integration examples configure MCP hosts to run either `mempalace-mcp` or `python -m mempalace.mcp_server`. Sources: `origin/examples/mcp_setup.md`, `origin/integrations/openclaw/SKILL.md`, `origin/.claude-plugin/plugin.json`, `origin/.codex-plugin/plugin.json`.

## Public Python APIs

These are documented as public Python APIs in `origin/website/reference/api-reference.md` and are backed by source modules:

- `mempalace.searcher.search(query, palace_path, wing=None, room=None, n_results=5)` is CLI-oriented and prints results; `mempalace.searcher.search_memories(...) -> dict` is the programmatic search API used by the MCP server. Source: `origin/website/reference/api-reference.md`, implementation in `origin/mempalace/searcher.py`.
- `mempalace.layers.Layer0`, `Layer1`, `Layer2`, `Layer3`, and `MemoryStack` implement the four-layer memory interface. Important methods include `Layer0.render()`, `Layer1.generate()`, `Layer2.retrieve()`, `Layer3.search()`, `Layer3.search_raw()`, and `MemoryStack.wake_up()`, `recall()`, `search()`, `status()`. Sources: `origin/website/reference/api-reference.md`, `origin/mempalace/layers.py`.
- `mempalace.knowledge_graph.KnowledgeGraph` is the SQLite-backed temporal graph API. Public methods include `add_entity()`, `add_triple()`, `invalidate()`, `query_entity()`, `query_relationship()`, `timeline()`, `stats()`, and `seed_from_entity_facts()`. Sources: `origin/website/reference/api-reference.md`, `origin/mempalace/knowledge_graph.py`.
- `mempalace.palace_graph` exposes graph/navigation helpers: `build_graph()`, `traverse()`, `find_tunnels()`, and `graph_stats()` in the docs; the MCP server also imports tunnel mutation/follow helpers from this module. Sources: `origin/website/reference/api-reference.md`, `origin/mempalace/mcp_server.py`, `origin/mempalace/palace_graph.py`.
- `mempalace.dialect.Dialect` is the documented AAAK compression API with config loading, entity/emotion encoding, file compression, and token/stat helpers. Source: `origin/website/reference/api-reference.md`, implementation in `origin/mempalace/dialect.py`.
- `mempalace.config.MempalaceConfig` exposes configuration properties such as `palace_path`, `collection_name`, `people_map`, `topic_wings`, `hall_keywords`, `entity_languages`, and `embedding_device`; module-level sanitizers include `normalize_wing_name()`, `sanitize_name()`, `sanitize_kg_value()`, and `sanitize_content()`. Sources: `origin/website/reference/api-reference.md`, `origin/mempalace/config.py`.

## Extension points and plugin contracts

### Storage backends

- Storage backend plugins register through the Python entry-point group `mempalace.backends`; the built-in `chroma` backend is declared in packaging and registered in code. Sources: `origin/pyproject.toml`, `origin/mempalace/backends/registry.py`.
- The backend contract is `BaseBackend` plus `BaseCollection`, with typed result classes `QueryResult` and `GetResult`, value object `PalaceRef`, health/error types, and optional hooks such as `estimated_count()`, `close()`, `health()`, and `update()`. Source: `origin/mempalace/backends/base.py`.
- Backend discovery loads entry points once per process; explicit `register(name, backend_cls)` wins on conflict; `available_backends()`, `get_backend_class()`, `get_backend()`, `reset_backends()`, and `resolve_backend_for_palace()` are the registry helpers. Sources: `origin/mempalace/backends/registry.py`, `origin/mempalace/backends/__init__.py`.
- Backend selection priority is explicit argument, per-palace config, `MEMPALACE_BACKEND`, backend `detect(path)`, then default `chroma`. Source: `origin/mempalace/backends/registry.py`.

### Source adapters

- Source adapter plugins register through the Python entry-point group `mempalace.sources`; `pyproject.toml` declares the group but no first-party adapters under it yet. Sources: `origin/pyproject.toml`, `origin/mempalace/sources/registry.py`.
- The adapter contract is `BaseSourceAdapter.ingest(source=SourceRef, palace=PalaceContext)` plus `describe_schema()`, with optional `is_current()`, `source_summary()`, and `close()`. Typed records include `SourceRef`, `SourceItemMetadata`, `DrawerRecord`, `RouteHint`, `SourceSummary`, `AdapterSchema`, and `FieldSpec`. Source: `origin/mempalace/sources/base.py`.
- `PalaceContext` is the adapter-facing facade for writing drawers, accessing the knowledge graph, receiving config, and emitting progress events. Adapters are told not to import `mempalace.palace` directly. Source: `origin/mempalace/sources/context.py`.
- Adapter discovery is explicit: `resolve_adapter_for_source()` considers explicit/config values and otherwise defaults to `filesystem`; it intentionally does not auto-detect source types. Source: `origin/mempalace/sources/registry.py`.
- The source-adapter package exports its public contract via `mempalace.sources.__all__`. Source: `origin/mempalace/sources/__init__.py`.

## Host/plugin and hook integrations

- The Claude Code plugin manifest points MCP host configuration at `mempalace-mcp`; its hook manifest wires `Stop` to `hooks/mempal-stop-hook.sh` and `PreCompact` to `hooks/mempal-precompact-hook.sh`. Sources: `origin/.claude-plugin/plugin.json`, `origin/.claude-plugin/hooks/hooks.json`.
- The Codex plugin manifest points MCP host configuration at `mempalace-mcp`, exposes skills from `./skills/`, and registers hooks from `./hooks.json`. Codex hooks cover `SessionStart`, `Stop`, and `PreCompact` through `.codex-plugin/hooks/mempal-hook.sh`. Sources: `origin/.codex-plugin/plugin.json`, `origin/.codex-plugin/hooks.json`.
- Standalone shell hook scripts under `origin/hooks/` are documented as auto-save integrations for terminal AI tools. The save hook runs every 15 human messages and auto-mines transcripts; the precompact hook auto-mines before context compaction. Source: `origin/hooks/README.md`.
- The CLI also exposes `mempalace hook run --hook session-start|stop|precompact --harness claude-code|codex`, making hook execution part of the command surface rather than only shell scripts. Source: `origin/mempalace/cli.py`.

## Integration patterns

- CLI-first local memory: install the package, run `mempalace init <dir>`, mine files/conversations with `mempalace mine`, search with `mempalace search`, and inject context with `mempalace wake-up`. Sources: `origin/README.md`, `origin/website/reference/cli.md`.
- MCP-host integration: configure an MCP host to launch `mempalace-mcp` or `python -m mempalace.mcp_server`; clients then discover the `TOOLS` registry over `tools/list` and call tools over `tools/call`. Sources: `origin/pyproject.toml`, `origin/mempalace/mcp_server.py`, `origin/examples/mcp_setup.md`, `origin/integrations/openclaw/SKILL.md`.
- Python embedding: import submodule APIs directly (`MemoryStack`, `KnowledgeGraph`, `search_memories`, backend/source contracts) rather than importing from `mempalace` top-level, because top-level `__all__` only promises `__version__`. Sources: `origin/mempalace/__init__.py`, `origin/website/reference/api-reference.md`.
- Backend extension: ship a package that subclasses `BaseBackend`, implements `get_collection()`, and registers under `[project.entry-points."mempalace.backends"]`. Sources: `origin/mempalace/backends/base.py`, `origin/mempalace/backends/registry.py`, `origin/pyproject.toml`.
- Source extension: ship a package that subclasses `BaseSourceAdapter`, yields `SourceItemMetadata`/`DrawerRecord`, declares schema, and registers under `[project.entry-points."mempalace.sources"]`. The code comments state first-party miners have not yet migrated onto this contract, so treat it as a published adapter contract, not proof that `mempalace mine` already dispatches all ingest through adapters. Sources: `origin/mempalace/sources/base.py`, `origin/mempalace/sources/context.py`, `origin/mempalace/sources/registry.py`, `origin/pyproject.toml`.

## Plugin/middleware architecture notes

- MemPalace has plugin architecture at two layers: Python package entry points for storage backends/source adapters, and host-specific plugin bundles for Claude Code/Codex. Sources: `origin/pyproject.toml`, `origin/mempalace/backends/registry.py`, `origin/mempalace/sources/registry.py`, `origin/.claude-plugin/plugin.json`, `origin/.codex-plugin/plugin.json`.
- There is no general web-framework-style middleware pipeline in the inspected public surface. Cross-cutting behavior is implemented through CLI commands, MCP tool dispatch, backend/source registries, and host hooks. Sources: `origin/mempalace/cli.py`, `origin/mempalace/mcp_server.py`, `origin/mempalace/backends/registry.py`, `origin/mempalace/sources/registry.py`, `origin/hooks/README.md`.
- MCP write operations are protected by input sanitizers and a write-ahead log that redacts sensitive fields; tool dispatch also whitelists arguments to schema properties unless a handler accepts `**kwargs`. Sources: `origin/mempalace/config.py`, `origin/mempalace/mcp_server.py`.

## Cautions for integrators

- Do not rely on the top-level `mempalace` package to re-export APIs beyond `__version__`; import concrete submodules. Source: `origin/mempalace/__init__.py`.
- The README says the MCP server has 29 tools, while plugin descriptions mention 19 tools. The implementation source of truth is the `TOOLS` dictionary in `origin/mempalace/mcp_server.py`. Sources: `origin/README.md`, `origin/.claude-plugin/plugin.json`, `origin/.codex-plugin/plugin.json`, `origin/mempalace/mcp_server.py`.
- Source adapter APIs are published, but comments explicitly say in-tree miners are not yet migrated onto `BaseSourceAdapter`; third-party adapters should target the contract while verifying current CLI dispatch before depending on it. Sources: `origin/mempalace/sources/base.py`, `origin/mempalace/sources/context.py`, `origin/pyproject.toml`.
