# MemPalace API and Integration Surface

Source inspected: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

This document maps the consumer-facing contracts in `mempalace/mempalace` and separates them from internal implementation details. Evidence comes from package metadata, documented references, manifest files, and explicit `__all__`/registry surfaces in the source tree.

## Executive summary

MemPalace is distributed as a Python package named `mempalace` (`pyproject.toml`) with two console scripts, a documented CLI, a stdio MCP JSON-RPC server, documented Python integration classes/functions, Claude/Codex plugin manifests, and two plugin-extension contracts:

- **Stable public surface:** `mempalace` and `mempalace-mcp` console scripts; documented CLI subcommands; the 29 MCP tools exposed by `mempalace/mcp_server.py`; Python APIs documented under `website/reference/python-api.md` and `website/reference/api-reference.md`; the storage backend API exported by `mempalace/backends/__init__.py`; the source adapter scaffold exported by `mempalace/sources/__init__.py`; plugin/hook configuration manifests.
- **Internal or transitional surface:** most package modules under `mempalace/*.py`, direct tool handler functions such as `tool_search`, miner implementations, Chroma-specific repair code, and search reranking helpers. These are important implementation points but should not be presented as public API unless also documented or exported through an explicit contract.
- **Package root:** `mempalace/__init__.py` only exports `__version__` via `__all__ = ["__version__"]`; public Python APIs are module-level imports, not root-package reexports.

## Distribution and entry points

### Python package metadata

File: `pyproject.toml`

- Package name: `mempalace`
- Version: `3.3.3`
- Requires Python: `>=3.9`
- Runtime dependencies: `chromadb>=1.5.4,<2`, `pyyaml>=6.0,<7`, `tomli>=2.0.0` for Python `<3.11`
- Optional accelerators: `gpu`, `dml`, `coreml` extras for ONNX runtime variants.

### Console scripts

File: `pyproject.toml`, `[project.scripts]`

| Script | Target | Contract |
|---|---|---|
| `mempalace` | `mempalace.cli:main` | Human-facing CLI dispatcher. |
| `mempalace-mcp` | `mempalace.mcp_server:main` | Stdio MCP JSON-RPC server used by Claude/Codex/Gemini/OpenClaw-style hosts. |

### Plugin entry-point groups

File: `pyproject.toml`

| Entry-point group | Current registration | Purpose |
|---|---|---|
| `mempalace.backends` | `chroma = "mempalace.backends.chroma:ChromaBackend"` | Storage backend plugin discovery. |
| `mempalace.sources` | Group exists but no first-party adapters registered in metadata yet. | Future/third-party source adapter discovery. |

## Stable public CLI surface

Primary evidence: `website/reference/cli.md`, `mempalace/cli.py`, `README.md`.

All CLI commands accept global `--palace <path>` per docs and parser. The parser also supports global `--version`.

| Command | Main contract | Important options / notes |
|---|---|---|
| `mempalace init <dir>` | Scan a project directory, detect entities/rooms, initialize palace config, write project metadata. | `--yes`, `--auto-mine`, `--lang`, `--no-llm`, `--llm-provider {ollama,openai-compat,anthropic}`, `--llm-model`, `--llm-endpoint`, `--llm-api-key`, `--accept-external-llm`. `--llm` exists but is deprecated. |
| `mempalace mine <dir>` | Ingest project files or conversations into the palace. | `--mode {projects,convos}`, `--wing`, `--agent`, `--limit`, `--dry-run`, `--extract {exchange,general}`, `--no-gitignore`, `--include-ignored`, `--redetect-origin`. |
| `mempalace sweep <target>` | Message-level/tandem miner for JSONL transcript file or directory. | Implemented by `mempalace/sweeper.py`; docs call it idempotent and resume-safe. |
| `mempalace search "query"` | Human-facing semantic/hybrid search with verbatim result display. | `--wing`, `--room`, `--results`. Uses `mempalace.searcher.search`. |
| `mempalace compress` | Compress drawers into the `mempalace_closets` collection using AAAK dialect. | `--wing`, `--dry-run`, `--config`. |
| `mempalace wake-up` | Print L0 + L1 wake-up context. | `--wing`. Backed by `MemoryStack.wake_up`. |
| `mempalace split <dir>` | Split concatenated transcript mega-files into per-session files. | `--output-dir`, `--dry-run`, `--min-sessions`. |
| `mempalace hook run` | Run hook logic for terminal AI integrations. | `--hook {session-start,stop,precompact}`, `--harness {claude-code,codex}`. Reads JSON from stdin and writes JSON to stdout. |
| `mempalace instructions <name>` | Print skill instructions. | Names: `init`, `search`, `mine`, `help`, `status`. |
| `mempalace repair` | Rebuild/repair palace vector index or max-seq-id corruption. | `--mode {legacy,max-seq-id}`, `--yes`, `--dry-run`, `--backup/--no-backup`, `--segment`, `--from-sidecar`, `--confirm-truncation-ok`. |
| `mempalace repair-status` | Read-only HNSW capacity health check. | No options. |
| `mempalace migrate` | ChromaDB-version palace migration. | `--dry-run`, `--yes`. |
| `mempalace mcp` | Print setup command/config for MCP clients. | Uses installed script path. |
| `mempalace status` | Print drawer count and wing/room breakdown. | No command-specific options. |

Internal note: command functions (`cmd_init`, `cmd_mine`, etc.) are not themselves documented as Python APIs; they are implementation behind the CLI parser.

## MCP server surface

Primary evidence: `mempalace/mcp_server.py`, `website/reference/mcp-tools.md`, `examples/mcp_setup.md`, integration manifests.

### Transport and protocol

File: `mempalace/mcp_server.py`

- Entrypoint: `mempalace-mcp` → `mempalace.mcp_server:main`.
- Transport: line-delimited JSON-RPC over stdin/stdout.
- Supported methods:
  - `initialize` negotiates protocol version and returns `capabilities: {"tools": {}}` plus `serverInfo: {"name": "mempalace", "version": __version__}`.
  - `ping` returns an empty result.
  - `tools/list` returns all entries from `TOOLS` with `name`, `description`, and `inputSchema`.
  - `tools/call` dispatches to the corresponding handler.
- Supported protocol versions listed in source: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`.
- Tool-call safety behavior:
  - Unknown tools return JSON-RPC error `-32601`.
  - Undeclared arguments are filtered unless the handler accepts `**kwargs`.
  - Integer and number parameters are coerced from JSON/string-like inputs using the declared schema.
  - `wait_for_previous` is ignored for compatibility with some MCP clients.
  - Tool results are returned as MCP content: `{"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}`.

### MCP tools by category

File: `mempalace/mcp_server.py` `TOOLS` dict exposes 29 tools. File `website/reference/mcp-tools.md` documents parameter and return contracts.

#### Palace read tools

| Tool | Required params | Optional params | Return contract / behavior |
|---|---:|---|---|
| `mempalace_status` | none | none | `{ total_drawers, wings, rooms, protocol, aaak_dialect }` in docs; source description says palace overview. |
| `mempalace_list_wings` | none | none | `{ wings: {wing_name: count} }`. |
| `mempalace_list_rooms` | none | `wing` | `{ wing, rooms: {room_name: count} }`. |
| `mempalace_get_taxonomy` | none | none | `{ taxonomy: {wing: {room: count}} }`. |
| `mempalace_get_aaak_spec` | none | none | AAAK dialect specification. |
| `mempalace_search` | `query` | `limit`, `wing`, `room`, `max_distance`, `context` | Semantic/hybrid search; query max length 250 in schema; returns verbatim drawer content plus metadata/scores. `context` is documented as background only, not embedding input. |
| `mempalace_check_duplicate` | `content` | `threshold` | Duplicate check; returns duplicate status and matches. Source default threshold is `0.9`; docs mention `0.85-0.87`, so prefer source for current behavior. |

#### Palace write / drawer management tools

| Tool | Required params | Optional params | Return contract / behavior |
|---|---:|---|---|
| `mempalace_add_drawer` | `wing`, `room`, `content` | `source_file`, `added_by` | Stores verbatim content; duplicate checking/deterministic IDs are implementation details. Returns success and `drawer_id` in docs. |
| `mempalace_delete_drawer` | `drawer_id` | none | Irreversible delete. |
| `mempalace_get_drawer` | `drawer_id` | none | Full drawer content and metadata; docs note `metadata.source_file` is reduced to basename before returning to MCP clients. |
| `mempalace_list_drawers` | none | `wing`, `room`, `limit`, `offset` | Paginated IDs/wings/rooms/previews; `limit` max 100 in schema. |
| `mempalace_update_drawer` | `drawer_id` | `content`, `wing`, `room` | Updates content and/or metadata; fetches existing drawer first and errors if missing. |

#### Knowledge graph tools

| Tool | Required params | Optional params | Return contract / behavior |
|---|---:|---|---|
| `mempalace_kg_query` | `entity` | `as_of`, `direction` | Time-filtered facts; direction is `outgoing`, `incoming`, or `both` (default `both` in MCP handler schema). |
| `mempalace_kg_add` | `subject`, `predicate`, `object` | `valid_from`, `valid_to`, `source_closet`, `source_file`, `source_drawer_id` | Adds temporal triple. Source includes RFC 002 provenance field `source_drawer_id`; docs lag and omit some optional fields. |
| `mempalace_kg_invalidate` | `subject`, `predicate`, `object` | `ended` | Sets end date for current matching fact. |
| `mempalace_kg_timeline` | none | `entity` | Chronological facts for an entity or full graph. |
| `mempalace_kg_stats` | none | none | Entity/triple/current/expired/predicate stats. |

#### Navigation / palace graph tools

| Tool | Required params | Optional params | Return contract / behavior |
|---|---:|---|---|
| `mempalace_traverse` | `start_room` | `max_hops` | BFS-style traversal through room/wing graph; returns rooms, wings, halls, counts, hop metadata. |
| `mempalace_find_tunnels` | none | `wing_a`, `wing_b` | Finds rooms bridging wings. |
| `mempalace_graph_stats` | none | none | `{ total_rooms, tunnel_rooms, total_edges, rooms_per_wing, top_tunnels }`. |
| `mempalace_create_tunnel` | `source_wing`, `source_room`, `target_wing`, `target_room` | `label`, `source_drawer_id`, `target_drawer_id` | Creates explicit cross-wing tunnel. |
| `mempalace_list_tunnels` | none | `wing` | Lists explicit tunnels, optionally filtered. |
| `mempalace_delete_tunnel` | `tunnel_id` | none | Deletes explicit tunnel. |
| `mempalace_follow_tunnels` | `wing`, `room` | none | Returns connected rooms with drawer previews. |

#### Agent diary and system tools

| Tool | Required params | Optional params | Return contract / behavior |
|---|---:|---|---|
| `mempalace_diary_write` | `agent_name`, `entry` | `topic`, `wing` | Writes agent diary entry, AAAK recommended. Optional `wing` can place diary in project wing instead of default agent wing. |
| `mempalace_diary_read` | `agent_name` | `last_n`, `wing` | Reads recent diary entries. Optional `wing` filters/overrides default. |
| `mempalace_hook_settings` | none | `silent_save`, `desktop_toast` | Gets or sets hook behavior. |
| `mempalace_memories_filed_away` | none | none | Checks recent palace checkpoint. |
| `mempalace_reconnect` | none | none | Reconnects MCP server to palace DB after external CLI/script writes; returns success/message/drawer/vector state or error. |

### Stable vs internal MCP boundary

- Stable: tool names, declared input schemas, descriptions, JSON-RPC behavior, documented return shapes.
- Internal: handler functions (`tool_status`, `tool_search`, etc.), module-level caches, WAL logging helpers, Chroma connection helpers, and ranking/repair internals.
- Caution: docs and plugin manifests still say “19 MCP tools” in some places (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, plugin READMEs), while `README.md`, `website/reference/mcp-tools.md`, and `mempalace/mcp_server.py` show 29 tools. Treat source `TOOLS` and current reference docs as the authoritative current surface.

## Public Python APIs

Primary evidence: `website/reference/python-api.md`, `website/reference/api-reference.md`, module docs, explicit package exports.

### Package root

File: `mempalace/__init__.py`

- Exports only `__version__` via `__all__`.
- Does not re-export `MemoryStack`, `KnowledgeGraph`, `search_memories`, or backend/source classes.

### Search API

Files: `mempalace/searcher.py`, `website/reference/api-reference.md`

Documented public functions:

```python
from mempalace.searcher import search, search_memories
```

- `search(query, palace_path, wing=None, room=None, n_results=5)`
  - CLI-oriented function that prints results to stdout.
  - Raises `SearchError` for missing palace/query failures per docs.
- `search_memories(query, palace_path, wing=None, room=None, n_results=5, ...) -> dict`
  - Programmatic API used by MCP server.
  - Documented return shape: `{query, filters, results: [{text, wing, room, source_file, similarity}]}` or `{"error": str, "hint": str}`.
  - Source includes newer optional behavior not fully reflected in high-level docs: `max_distance`, `context`, `expand_context`, and `candidate_strategy` support. `candidate_strategy="union"` can widen hybrid rerank candidates with BM25-only SQLite candidates unless a strict `max_distance > 0` is set.

Internal search helpers: `_bm25_scores`, `_hybrid_rank`, `_bm25_only_via_sqlite`, `_merge_bm25_union_candidates`, and related underscore-prefixed functions are implementation details.

### Memory stack API

Files: `mempalace/layers.py`, `website/reference/python-api.md`, `website/reference/api-reference.md`

```python
from mempalace.layers import Layer0, Layer1, Layer2, Layer3, MemoryStack
```

Documented classes/methods:

- `Layer0(identity_path=None)`
  - `render() -> str`
  - `token_estimate() -> int`
  - Reads `~/.mempalace/identity.txt` by default.
- `Layer1(palace_path=None, wing=None)`
  - `generate() -> str`
  - Constants: `MAX_DRAWERS = 15`, `MAX_CHARS = 3200`, source also has `MAX_SCAN = 2000`.
- `Layer2(palace_path=None)`
  - `retrieve(wing=None, room=None, n_results=10) -> str`
- `Layer3(palace_path=None)`
  - `search(query, wing=None, room=None, n_results=5) -> str`
  - `search_raw(query, wing=None, room=None, n_results=5) -> list[dict]`
- `MemoryStack(palace_path=None, identity_path=None)`
  - `wake_up(wing=None) -> str`
  - `recall(wing=None, room=None, n_results=10) -> str`
  - `search(query, wing=None, room=None, n_results=5) -> str`
  - `status() -> dict`

Consumer contract: high-level context assembly for agent wake-up/recall/deep search. Internal implementation reads ChromaDB through `mempalace.palace.get_collection` and uses simple formatting/truncation.

### Knowledge graph API

Files: `mempalace/knowledge_graph.py`, `website/reference/python-api.md`, `website/reference/api-reference.md`

```python
from mempalace.knowledge_graph import KnowledgeGraph
```

- Default DB path: `~/.mempalace/knowledge_graph.sqlite3` (`DEFAULT_KG_PATH`).
- Storage: local SQLite with `entities` and `triples` tables, WAL mode.
- Write methods:
  - `add_entity(name, entity_type="unknown", properties=None) -> str`
  - `add_triple(subject, predicate, obj, valid_from=None, valid_to=None, confidence=1.0, source_closet=None, source_file=None, source_drawer_id=None, adapter_name=None) -> str`
  - `invalidate(subject, predicate, obj, ended=None) -> None`
- Query methods:
  - `query_entity(name, as_of=None, direction="outgoing") -> list[dict]`
  - `query_relationship(predicate, as_of=None) -> list[dict]`
  - `timeline(entity_name=None) -> list[dict]`
  - `stats() -> dict`
  - `seed_from_entity_facts(entity_facts) -> None`
- Close method: `close()`.

Source has additional provenance columns `source_drawer_id` and `adapter_name` for RFC 002 adapters; older docs may not list them.

### Palace graph API

Files: `mempalace/palace_graph.py`, `website/reference/python-api.md`, `website/reference/api-reference.md`

```python
from mempalace.palace_graph import build_graph, traverse, find_tunnels, graph_stats
```

Documented functions:

- `build_graph(col=None, config=None) -> (nodes, edges)`
  - Nodes: `{room: {wings: list, halls: list, count: int, dates: list}}`
  - Edges: `{room, wing_a, wing_b, hall, count}`
- `traverse(start_room, col=None, config=None, max_hops=2) -> list | {error, suggestions}`
- `find_tunnels(wing_a=None, wing_b=None, col=None, config=None) -> list`
- `graph_stats(col=None, config=None) -> dict`

Source also exposes write/cache helpers such as `invalidate_graph_cache`, explicit tunnel CRUD helpers, and lock/cache internals. Only the documented navigation functions should be treated as stable consumer APIs unless a caller is integrating with MCP tunnel tools.

### AAAK dialect API

Files: `mempalace/dialect.py`, `website/reference/python-api.md`, `website/reference/api-reference.md`

```python
from mempalace.dialect import Dialect
```

Documented surface:

- Constructor: `Dialect(entities=None, skip_names=None)`
- Class method: `Dialect.from_config(config_path)`
- Instance methods: `compress(text, metadata=None)`, `encode_entity(name)`, `encode_emotions(emotions)`, `compress_file(path, output=None)`, `compress_all(dir, output=None)`, `save_config(path)`, `compression_stats(original, compressed)`
- Static method: `count_tokens(text)`

Note: `website/reference/python-api.md` calls AAAK “lossy compression for token density at scale”; repository mission docs emphasize verbatim drawer storage. The stable consumer guarantee is that drawers remain verbatim; AAAK is an index/diary/closet representation, not a replacement for original drawer content.

### Configuration API

Files: `mempalace/config.py`, `website/reference/api-reference.md`

```python
from mempalace.config import MempalaceConfig
```

Public contract:

- Reads env vars first, then `~/.mempalace/config.json`, then defaults.
- Key documented properties:
  - `palace_path` default `~/.mempalace/palace`; env overrides `MEMPALACE_PALACE_PATH` or legacy `MEMPAL_PALACE_PATH`.
  - `collection_name` default `mempalace_drawers`.
- Source also exposes `entity_languages`, `embedding_device`, `topic_wings`, `hall_keywords`, and sanitizers:
  - `sanitize_name(value, field_name="name")`
  - `sanitize_kg_value(value, field_name="value")`
  - `sanitize_content(value, max_length=100_000)`
  - `normalize_wing_name(name)`

These sanitizers are a cross-cutting validation contract for CLI/MCP tool inputs, but docs emphasize `MempalaceConfig` more than standalone sanitizer imports.

### Exporter and other module functions

File: `mempalace/exporter.py`

- `export_palace(palace_path: str, output_dir: str, format: str = "markdown") -> dict` exists as a callable module function.
- It is not listed in the current CLI parser or MCP `TOOLS` dict in inspected source, so treat it as programmatic-but-less-promoted unless docs elsewhere explicitly reference it.

## Storage backend extension point

Primary evidence: `README.md`, `mempalace/backends/base.py`, `mempalace/backends/__init__.py`, `mempalace/backends/registry.py`, `pyproject.toml`, `CHANGELOG.md`.

### Public exports

File: `mempalace/backends/__init__.py` explicitly documents and exports:

- Contracts: `BaseCollection`, `BaseBackend`, `PalaceRef`, `QueryResult`, `GetResult`, `HealthStatus`
- Errors: `BackendError`, `PalaceNotFoundError`, `BackendClosedError`, `UnsupportedFilterError`, `DimensionMismatchError`, `EmbedderIdentityMismatchError`
- Registry functions: `available_backends`, `get_backend`, `get_backend_class`, `register`, `reset_backends`, `resolve_backend_for_palace`, `unregister`
- Built-in default implementation: `ChromaBackend`, `ChromaCollection`

### Backend contract details

File: `mempalace/backends/base.py`

`BaseCollection` required methods are kwargs-only:

- `add(documents, ids, metadatas=None, embeddings=None) -> None`
- `upsert(documents, ids, metadatas=None, embeddings=None) -> None`
- `query(query_texts=None, query_embeddings=None, n_results=10, where=None, where_document=None, include=None) -> QueryResult`
- `get(ids=None, where=None, where_document=None, limit=None, offset=None, include=None) -> GetResult`
- `delete(ids=None, where=None) -> None`
- `count() -> int`

Optional/default methods:

- `estimated_count() -> int`
- `close() -> None`
- `health() -> HealthStatus`
- `update(ids, documents=None, metadatas=None, embeddings=None) -> None` with default get/merge/upsert behavior; backends advertising `supports_update` should override atomically.

`BaseBackend` required method:

- `get_collection(palace: PalaceRef, collection_name: str, create=False, options=None) -> BaseCollection`

Optional/default methods:

- `close_palace(palace)`, `close()`, `health(palace=None)`, classmethod `detect(path)`.
- Class attributes: `name`, `spec_version = "1.0"`, `capabilities = frozenset()`.

Typed results:

- `QueryResult(ids, documents, metadatas, distances, embeddings=None)` with outer dimension per query.
- `GetResult(ids, documents, metadatas, embeddings=None)`.
- Both retain dict-style compatibility (`result["ids"]`, `result.get("ids")`) as a migration shim, but docstring says new code **must** use attribute access.

### Backend discovery and selection

File: `mempalace/backends/registry.py`

- Third-party backend packages register entry points under `mempalace.backends`, e.g. `postgres = "mempalace_postgres:PostgresBackend"`.
- Entry points are loaded once per process with `importlib.metadata.entry_points()`.
- Manual `register(name, backend_cls)` wins over entry-point discovery conflicts.
- `get_backend(name)` returns a cached long-lived backend instance.
- `resolve_backend_for_palace` priority:
  1. Explicit kwarg/CLI flag
  2. Per-palace config
  3. `MEMPALACE_BACKEND` env var
  4. Auto-detect from on-disk artifacts for existing palaces only
  5. Default `chroma`

Stability note: `README.md` explicitly names `mempalace/backends/base.py` as the pluggable backend interface. `CHANGELOG.md` says this was an internal refactor with no user-facing API change, but the README and exported `__all__` make it a supported integration point for backend authors.

## Source adapter extension point

Primary evidence: `mempalace/sources/base.py`, `mempalace/sources/__init__.py`, `mempalace/sources/registry.py`, `mempalace/sources/context.py`, `docs/rfcs/002-source-adapter-plugin-spec.md`, `pyproject.toml`, `CHANGELOG.md`.

### Status and stability caveat

The source adapter API is explicitly published as scaffolding for RFC 002. Source `mempalace/sources/base.py` says first-party miners (`miner.py`, `convo_miner.py`) are migrated onto this contract in a follow-up PR. `CHANGELOG.md` labels it an “internal refactor; no user-facing API change yet.” Therefore:

- Treat it as a **published extension contract for adapter authors**, because it is exported through `mempalace/sources/__init__.py` and has a formal RFC.
- Do **not** claim current `mempalace mine` fully routes through this registry; source and RFC say that is future/follow-up work.

### Public exports

File: `mempalace/sources/__init__.py` exports:

- Contract: `BaseSourceAdapter`
- Typed records: `SourceRef`, `SourceItemMetadata`, `DrawerRecord`, `RouteHint`, `SourceSummary`, `AdapterSchema`, `FieldSpec`
- Types: `IngestMode`, `IngestResult`, `ProgressHook`, `PalaceContext`
- Errors: `SourceAdapterError`, `SourceNotFoundError`, `AuthRequiredError`, `AdapterClosedError`, `TransformationViolationError`, `SchemaConformanceError`
- Registry: `available_adapters`, `get_adapter`, `get_adapter_class`, `register`, `reset_adapters`, `resolve_adapter_for_source`, `unregister`

### Adapter contract details

File: `mempalace/sources/base.py`

Important value objects:

- `SourceRef(local_path=None, uri=None, options={})`
  - Secrets must not be placed in `options`.
- `RouteHint(wing=None, room=None, hall=None)`
- `SourceItemMetadata(source_file, version, size_hint=None, route_hint=None)`
- `DrawerRecord(content, source_file, chunk_index=0, metadata={}, route_hint=None)`
  - Metadata must be flat scalars (`str`, `int`, `float`, `bool`) because of Chroma/backend constraints.
- `FieldSpec(type, required, description, indexed=False, delimiter=";", json_schema=None)`
  - Types include `string`, `int`, `float`, `bool`, `delimiter_joined_string`, `json_string`.
- `AdapterSchema(fields, version)`

`BaseSourceAdapter` class attributes:

- `name`
- `spec_version = "1.0"`
- `adapter_version = "0.0.0"`
- `capabilities = frozenset()`
- `supported_modes = frozenset({"chunked_content"})`
- `declared_transformations = frozenset()`
- `default_privacy_class = "pii_potential"`

Required methods:

- `ingest(source: SourceRef, palace: PalaceContext) -> Iterator[IngestResult]`
  - Yields `SourceItemMetadata` and `DrawerRecord` values.
- `describe_schema() -> AdapterSchema`
  - Must be stable for a given `adapter_version`.

Optional methods:

- `is_current(item, existing_metadata) -> bool`
  - Default false; adapters with `supports_incremental` override.
- `source_summary(source) -> SourceSummary`
- `close() -> None`

### PalaceContext adapter facade

File: `mempalace/sources/context.py`

`PalaceContext` fields:

- `drawer_collection`
- `knowledge_graph`
- `palace_path`
- `closet_collection=None`
- `config=None`
- `adapter_name=""`
- `adapter_version=""`
- `progress_hooks=[]`

Adapter-facing methods:

- `upsert_drawer(record: DrawerRecord) -> None`
  - Stamps `source_file`, `chunk_index`, `adapter_name`, and `adapter_version` metadata before upsert.
  - Deterministic drawer ID: first 24 hex chars of SHA-256 of `source_file`, plus `_chunk_index`.
- `skip_current_item() -> None`
- `emit(event, **details) -> None`

Contract boundary: adapters receive `PalaceContext` and should not import `mempalace.palace` directly.

### Source adapter discovery

File: `mempalace/sources/registry.py`

- Third-party source adapters register under `mempalace.sources`, e.g. `cursor = "mempalace_source_cursor:CursorAdapter"`.
- Entry points are discovered once per process.
- Explicit `register(name, adapter_cls)` wins over entry-point discovery conflicts.
- `resolve_adapter_for_source` priority:
  1. Explicit `--source` flag / kwarg
  2. Per-source config
  3. Default `filesystem`
- Unlike backends, source adapters are intentionally **not auto-detected**.

## Plugin, hook, and agent integration surfaces

### Claude Code plugin

Files: `.claude-plugin/plugin.json`, `.claude-plugin/.mcp.json`, `.claude-plugin/hooks/hooks.json`, `.claude-plugin/commands/*.md`, `.claude-plugin/skills/mempalace/SKILL.md`

Public manifest contracts:

- Plugin name/version: `mempalace` / `3.3.3`.
- MCP server registration: `mempalace` command `mempalace-mcp`.
- Hooks:
  - `Stop` runs `bash "${CLAUDE_PLUGIN_ROOT}/hooks/mempal-stop-hook.sh"`.
  - `PreCompact` runs `bash "${CLAUDE_PLUGIN_ROOT}/hooks/mempal-precompact-hook.sh"`.
- Slash command docs exist for `help`, `init`, `mine`, `search`, `status` under `.claude-plugin/commands/`.

### Codex plugin

Files: `.codex-plugin/plugin.json`, `.codex-plugin/hooks.json`, `.codex-plugin/skills/*/SKILL.md`

Public manifest contracts:

- Plugin name/version: `mempalace` / `3.3.3`.
- Skills directory: `./skills/`.
- Hooks file: `./hooks.json`.
- MCP server registration: `mempalace` command `mempalace-mcp`.
- Hooks:
  - `SessionStart` → `${CODEX_PLUGIN_ROOT}/hooks/mempal-hook.sh session-start`
  - `Stop` → `${CODEX_PLUGIN_ROOT}/hooks/mempal-hook.sh stop`
  - `PreCompact` → `${CODEX_PLUGIN_ROOT}/hooks/mempal-hook.sh precompact`
- Interface capabilities: `Interactive`, `Read`, `Write`.

### Generic hook scripts

Files: `hooks/README.md`, `hooks/mempal_save_hook.sh`, `hooks/mempal_precompact_hook.sh`, `mempalace/hooks_cli.py`

Documented external behavior:

- Save hook fires every 15 human messages by default.
- PreCompact hook fires before context compaction.
- Hooks auto-mine JSONL transcripts directly into the palace and may return a blocking JSON decision/reason for legacy save flows.
- User configuration/environment:
  - `SAVE_INTERVAL` in hook script.
  - `STATE_DIR`, default `~/.mempalace/hook_state/`.
  - `MEMPAL_DIR` optional project directory to also mine; transcript mining is always active and `MEMPAL_DIR` is additive.
  - `MEMPALACE_PYTHON` or `MEMPAL_PYTHON` interpreter override (docs mention both variants in different places; hook implementation should be checked before relying on one spelling).
- CLI hook runner contract: `mempalace hook run --hook {session-start,stop,precompact} --harness {claude-code,codex}`.

### MCP host integration examples

Files: `examples/mcp_setup.md`, `examples/gemini_cli_setup.md`, `integrations/openclaw/SKILL.md`, `website/guide/mcp-integration.md`.

Patterns:

- Register `mempalace-mcp` as an MCP stdio server.
- Hosts should call `mempalace_status` and `mempalace_get_aaak_spec` on wake-up/status flows.
- Agents should use `mempalace_search` / `mempalace_kg_query` before answering about past people/projects/events.
- Agents should write session summaries through `mempalace_diary_write` and update changing facts via `mempalace_kg_invalidate` + `mempalace_kg_add`.

## Data and storage contracts consumers see

### Palace structure

Evidence: `README.md`, `CLAUDE.md`, `mempalace/README.md`.

- Logical model: **wing → room → drawer**.
- Drawers store verbatim content; closets/AAAK are compact index/diary/summary representations that point back to drawers.
- Default drawer collection: `mempalace_drawers` (`mempalace/config.py`).
- Closets collection: `mempalace_closets` (`mempalace/palace.py`, `docs/CLOSETS.md`).
- Knowledge graph storage: SQLite at `~/.mempalace/knowledge_graph.sqlite3` by default.
- Config storage: `~/.mempalace/config.json` plus env overrides.

### Drawer metadata fields

Common metadata observed across docs/source contracts:

- `wing`
- `room`
- `hall`
- `source_file`
- `chunk_index`
- `filed_at` / date-like fields depending on miner path
- `added_by` / `agent`
- `normalize_version`
- RFC 002/source-adapter metadata such as `adapter_name`, `adapter_version`, `source_drawer_id`, `privacy_class` are planned or scaffolded.

Public consumers should avoid depending on Chroma’s internal SQLite schema. Use MCP tools, Python APIs, or backend interfaces.

## Internal implementation areas not to overstate as public API

The following are important source files but are not stable external contracts by themselves:

- `mempalace/miner.py`, `mempalace/convo_miner.py`, `mempalace/normalize.py`: current first-party ingest implementations; RFC 002 says they will migrate behind source adapters.
- `mempalace/palace.py`: shared collection helpers, closet builders, locks, and constants; useful internally but not documented as public Python API except indirectly through backend/source contracts.
- `mempalace/mcp_server.py` handler functions (`tool_*`): public via MCP tool names/schemas, not direct Python function calls.
- `mempalace/backends/chroma.py`: default backend implementation; consumers should target `BaseBackend`/`BaseCollection` unless intentionally using Chroma-specific maintenance utilities.
- `mempalace/searcher.py` underscore-prefixed BM25/vector helpers: implementation detail behind `search` and `search_memories`.
- `mempalace/hooks_cli.py`: CLI hook runner implementation; public contract is `mempalace hook run` and plugin hook manifests.
- `benchmarks/*`, `tests/*`, `website/*`, `landing/*`: documentation, benchmarks, or site implementation, not runtime API.

## Documentation drift / caveats

- `README.md` and `website/reference/mcp-tools.md` say 29 MCP tools; `.claude-plugin` and `.codex-plugin` descriptions still say 19. The `TOOLS` dict in `mempalace/mcp_server.py` contains 29 entries and should be treated as source of truth.
- `mempalace/README.md` also says `mcp_server.py` has 19 tools; it appears stale against current source.
- Source adapter API is exported and specified, but current CLI parser does not expose `--source`; RFC 002 says `--mode` will become a deprecated alias in a future cleanup. Do not claim `--source` works today.
- API docs may lag source optional parameters (for example `search_memories` and `kg_add` provenance fields). Prefer source signatures/schemas for exact current contract and docs for intended public positioning.
- Package root does not expose most APIs. Consumers should import documented modules directly.
