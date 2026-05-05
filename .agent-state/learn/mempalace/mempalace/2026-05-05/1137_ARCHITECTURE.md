# MemPalace Architecture Deep Dive

Source read from: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

## Executive summary

MemPalace is a Python package and MCP server for local-first AI memory. The central product model is a "palace": verbatim text is filed as drawers, scoped by wings and rooms, stored in a ChromaDB-backed vector collection, supplemented by compact closet pointer documents and a local SQLite temporal knowledge graph. The repo also includes CLI workflows, MCP tools, hook scripts for terminal AI clients, plugin packaging for Claude Code and Codex CLI, benchmark harnesses, tests, static landing assets, and a VitePress documentation site.

The architecture is intentionally local-first. `README.md` says MemPalace stores conversation history as verbatim text, retrieves it with semantic search, avoids summarization/paraphrase, defaults to ChromaDB through `mempalace/backends/base.py`, and sends nothing off-machine unless the user opts in. The same principle is enforced in code paths such as `mempalace/config.py` (local config/env precedence and sanitizers), `mempalace/llm_client.py` (Ollama local default plus explicit external-service detection), and `mempalace/embedding.py` (local ONNX embedding function with optional local hardware acceleration).

## Directory structure

```text
origin/
├── mempalace/                 # Python package: CLI, MCP server, storage, mining, search, KG, hooks logic
│   ├── backends/              # RFC 001 storage backend contract, registry, Chroma implementation
│   ├── sources/               # RFC 002 source-adapter contract and registry scaffolding
│   ├── i18n/                  # Locale/entity-pattern support
│   ├── cli.py                 # Main console CLI implementation
│   ├── mcp_server.py          # JSON-RPC MCP stdio server and tool handlers
│   ├── miner.py               # Project/file mining path
│   ├── convo_miner.py         # Conversation export mining path
│   ├── normalize.py           # Chat/export normalization
│   ├── palace.py              # Shared Chroma collection, closet, and locking helpers
│   ├── searcher.py            # Hybrid BM25/vector/closet search
│   ├── knowledge_graph.py     # SQLite temporal entity graph
│   └── layers.py              # L0-L3 wake-up/recall/search stack
├── tests/                     # Pytest suite mirroring package areas, plus benchmark tests
├── benchmarks/                # Dataset benchmark runners and committed result files
├── docs/                      # SQL schema, history, closets docs, RFCs
├── examples/                  # Setup and usage examples
├── hooks/                     # Shell hook wrappers for Claude Code / Codex-style lifecycle events
├── integrations/openclaw/     # Integration skill material
├── .claude-plugin/            # Claude Code plugin metadata, skill, MCP config
├── .codex-plugin/             # Codex CLI plugin metadata, skills, hook wrapper
├── website/                   # VitePress documentation site package
├── landing/                   # Static landing page/logo assets
├── assets/                    # Shared assets such as logo
├── pyproject.toml             # Python packaging, dependencies, console scripts, entry points, test/lint config
└── README.md, AGENTS.md, MISSION.md, CHANGELOG.md, ROADMAP.md, SECURITY.md, CONTRIBUTING.md
```

Notable evidence:

- `pyproject.toml` defines the package as `mempalace` version `3.3.3`, Python `>=3.9`, dependencies on `chromadb>=1.5.4,<2`, `pyyaml>=6.0,<7`, and `tomli` for older Python, and builds only the `mempalace` package.
- `mempalace/README.md` describes the core package as "All modules, all logic" and gives the high-level flow `User → CLI → miner/convo_miner → ChromaDB`, plus `User → MCP Server → searcher/kg_query/diary`.
- `.github/workflows/ci.yml` tests on Linux Python 3.9/3.11/3.13, Windows Python 3.13, and macOS Python 3.13, with `pytest --ignore=tests/benchmarks --cov=mempalace --cov-fail-under=80`, plus `ruff check` and `ruff format --check`.
- `website/package.json` is separate from the Python package and contains only documentation-site scripts (`docs:dev`, `docs:build`, `docs:preview`) and VitePress/Vue dependencies.

## Organization philosophy

### Palace metaphor is the domain boundary

The repo organizes memory around a stable domain vocabulary:

- **Wings**: high-level people/projects/topics. `README.md` says people and projects become wings.
- **Rooms**: scoped topics/areas. `README.md` says topics become rooms.
- **Drawers**: verbatim chunks. `README.md` and `mempalace/miner.py` both emphasize exact storage, with `miner.py` stating "Stores verbatim chunks as drawers. No summaries. Ever."
- **Closets**: compact searchable pointer index. `mempalace/palace.py` creates `mempalace_closets`, builds pointer lines shaped like `topic|entities|→drawer_ids`, and packs them into ~1500-char closet documents.
- **Tunnels / graph**: cross-wing room connectivity. `mempalace/palace_graph.py` builds nodes from room metadata and edges from shared rooms across multiple wings, plus explicit tunnel operations.

This vocabulary appears consistently in CLI commands, MCP tools, metadata fields, and docs. The result is a layered memory system rather than a generic vector-database wrapper.

### Verbatim-first with local-only defaults

The code favors preserving source text while isolating any necessary transformations:

- `mempalace/normalize.py` supports Claude Code JSONL, Codex JSONL, Gemini CLI JSONL, Claude.ai JSON, ChatGPT JSON, Slack JSON, and plain text. Its noise stripping is line/tag anchored and comments explicitly say "Verbatim is sacred" and "When in doubt, leave text alone."
- `mempalace/convo_miner.py` chunks by exchange pairs when it sees `>` markers and otherwise falls back to paragraph/line grouping. Oversized exchange content is split into continuation drawers rather than dropped.
- `mempalace/miner.py` chunks readable project files with `CHUNK_SIZE = 800`, `CHUNK_OVERLAP = 100`, skips generated/cache directories, respects `.gitignore`, and records source metadata.
- `mempalace/llm_client.py` keeps LLM-assisted entity refinement behind provider abstraction. It defaults to local Ollama, uses stdlib `urllib` instead of external SDKs, and exposes `is_external_service` so `mempalace init` can warn or gate external sends.

### Migration toward pluggable read and write sides

Two extension layers are explicit:

- Storage backends are implemented now. `mempalace/backends/base.py` defines `BaseCollection`, `BaseBackend`, typed `QueryResult`/`GetResult`, backend errors, `PalaceRef`, and `HealthStatus`. `mempalace/backends/registry.py` discovers `mempalace.backends` entry points, registers built-in `chroma`, and resolves backend names with priority: explicit, per-palace config, `MEMPALACE_BACKEND`, auto-detect, default `chroma`.
- Source adapters are scaffolding/spec today. `pyproject.toml` declares an empty `mempalace.sources` entry-point group, while comments say `miner.py` and `convo_miner.py` migrate onto `BaseSourceAdapter` in a follow-up PR. `mempalace/sources/base.py` and `docs/rfcs/002-source-adapter-plugin-spec.md` define the future read-side contract.

## Entry points

### Python package entry points

- `mempalace/__init__.py` exports `__version__` and suppresses noisy ChromaDB telemetry logging.
- `mempalace/version.py` is the package version source: `__version__ = "3.3.3"`.
- `mempalace/__main__.py` imports `main` from `.cli` and calls it, so `python -m mempalace` uses the same CLI dispatcher as the console script.

### Console scripts from `pyproject.toml`

`pyproject.toml` defines two installed commands:

- `mempalace = "mempalace.cli:main"`
- `mempalace-mcp = "mempalace.mcp_server:main"`

### CLI commands in `mempalace/cli.py`

`mempalace/cli.py` builds an `argparse` command tree in `main()` and dispatches with a `dispatch` dict. Implemented top-level commands include:

- `init`: detect projects/entities/rooms, write config artifacts, optionally auto-mine. It invokes project scanning, entity detection, local/optional LLM origin refinement, and gitignore protection for `mempalace.yaml` / `entities.json`.
- `mine`: ingest project files or conversations. `--mode projects` routes to `miner.py`; `--mode convos` routes to `convo_miner.py`; options include `--wing`, `.gitignore` handling, `--agent`, `--limit`, origin re-detection, dry-run, and conversation extraction mode.
- `sweep`: message-level tandem miner for Claude JSONL transcript files/directories, backed by `mempalace/sweeper.py`.
- `search`: semantic search with optional wing/room filters and result count.
- `compress`: AAAK Dialect compression into `mempalace_closets`.
- `wake-up`: renders the L0/L1 memory stack, optionally scoped by wing.
- `split`: delegates to transcript mega-file splitting.
- `hook run`: runs hook logic for `session-start`, `stop`, and `precompact` with `claude-code` or `codex` harness input.
- `instructions`: prints skill/instruction text for `init`, `search`, `mine`, `help`, and `status`.
- `repair`, `repair-status`, `migrate`, `mcp`, and `status`: maintenance, health, setup output, and overview commands.

### MCP server entry point

`mempalace/mcp_server.py` is a JSON-RPC over stdio MCP server:

- It redirects stdout to stderr before heavy imports so dependencies cannot corrupt MCP JSON-RPC stdout, then restores stdout in `main()`.
- It parses `--palace` and stores it in `MEMPALACE_PALACE_PATH` so `MempalaceConfig` routes downstream calls to that palace path.
- It maintains cached Chroma client/collection handles and uses inode/mtime checks plus HNSW capacity probes to invalidate stale caches or disable vector-shaped tools when the index is unsafe.
- It writes a redacted write-ahead log under `~/.mempalace/wal/write_log.jsonl` for write operations.
- `handle_request()` supports `initialize`, `ping`, `tools/list`, `tools/call`, notification suppression, argument whitelisting to declared schema properties, primitive type coercion, and JSON-formatted tool results.

The `TOOLS` dict in `mempalace/mcp_server.py` exposes 29 MCP tools in the current code, grouped broadly as:

- Palace status/navigation: `mempalace_status`, `mempalace_list_wings`, `mempalace_list_rooms`, `mempalace_get_taxonomy`.
- AAAK/graph/tunnels: `mempalace_get_aaak_spec`, `mempalace_traverse`, `mempalace_find_tunnels`, `mempalace_graph_stats`, `mempalace_create_tunnel`, `mempalace_list_tunnels`, `mempalace_delete_tunnel`, `mempalace_follow_tunnels`.
- Search and drawer CRUD: `mempalace_search`, `mempalace_check_duplicate`, `mempalace_add_drawer`, `mempalace_delete_drawer`, `mempalace_get_drawer`, `mempalace_list_drawers`, `mempalace_update_drawer`.
- Knowledge graph: `mempalace_kg_query`, `mempalace_kg_add`, `mempalace_kg_invalidate`, `mempalace_kg_timeline`, `mempalace_kg_stats`.
- Agent diaries and hooks: `mempalace_diary_write`, `mempalace_diary_read`, `mempalace_hook_settings`, `mempalace_memories_filed_away`.
- Connection maintenance: `mempalace_reconnect`.

There is a documentation/version mismatch worth noting: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `mempalace/README.md` still describe "19 MCP tools", while `README.md` says "29 MCP tools" and the current `mempalace/mcp_server.py` `TOOLS` dict contains 29 entries.

### Hook and plugin entry points

- `hooks/README.md` documents two shell hooks: `hooks/mempal_save_hook.sh` for Stop events and `hooks/mempal_precompact_hook.sh` for PreCompact events. They auto-mine JSONL transcripts and can block the AI with a save reminder.
- `mempalace/hooks_cli.py` implements Python-side hook behavior for `stop`, `session-start`, and `precompact`. It parses Claude Code/Codex harness JSON, counts human messages, validates transcript paths, mines transcripts, writes diaries, updates settings, and can emit desktop notifications.
- `.claude-plugin/plugin.json` registers an MCP server named `mempalace` with command `mempalace-mcp`.
- `.codex-plugin/plugin.json` registers skills, `hooks.json`, and the same `mempalace-mcp` server command.

### Documentation and benchmark entry points

- `benchmarks/*.py` scripts run external benchmark datasets, with result artifacts committed under `benchmarks/results_*`.
- `website/package.json` provides VitePress docs commands but is separate from the Python runtime.
- `landing/index.html` is a static landing asset, not part of the package execution path.

## Core abstractions and relationships

### `MempalaceConfig`: local configuration and safety gate

`mempalace/config.py` is used throughout CLI, MCP, graph, layers, and embedding code. It resolves configuration with priority `env vars > config file (~/.mempalace/config.json) > defaults`, with `MEMPALACE_PALACE_PATH` / legacy `MEMPAL_PALACE_PATH` controlling the palace directory. It also centralizes:

- Safe wing/room/entity names via `sanitize_name()` and `sanitize_kg_value()`.
- Drawer/diary content length/null-byte validation via `sanitize_content()`.
- Default hall keywords and topic wings used by miners and routing.
- Entity-detection language configuration.
- Embedding device selection (`auto`, `cpu`, `cuda`, `coreml`, `dml`).
- Hook settings such as `silent_save` and `desktop_toast`.

Relationship: most higher-level modules avoid direct global path constants and instantiate `MempalaceConfig` to locate the palace and feature flags.

### Storage backend contract and Chroma implementation

`mempalace/backends/base.py` defines the storage abstraction:

- `BaseCollection`: `add`, `upsert`, `query`, `get`, `delete`, `count`, plus optional `update`, `estimated_count`, `close`, and `health`.
- `BaseBackend`: per-palace factory and lifecycle surface (defined after the value objects in the same file).
- Typed return objects `QueryResult` and `GetResult`, with dict-compat shims during migration.
- Backend errors for unsupported filters, missing palaces, dimension/embedder mismatches, and closed backends.

`mempalace/backends/chroma.py` is the built-in backend. Evidence from the file shows it:

- Imports `chromadb`, wraps Chroma collections, and validates where-clause operators instead of silently dropping unknown ones.
- Sets `_HNSW_BLOAT_GUARD` with large `hnsw:batch_size` and `hnsw:sync_threshold` to reduce HNSW index bloat on large mines.
- Contains HNSW safety helpers such as `quarantine_stale_hnsw()` and `hnsw_capacity_status()` used by repair/MCP startup paths.
- Provides `ChromaBackend(BaseBackend)` and collection wrappers used by `palace.py`, `mcp_server.py`, and repair code.

Relationship: runtime code still often goes through `mempalace/palace.py`, whose `_DEFAULT_BACKEND = ChromaBackend()` gives legacy callers simple `get_collection()` helpers while the registry makes backends pluggable.

### Palace collections, closets, and locks

`mempalace/palace.py` centralizes shared palace operations:

- `get_collection()` returns the `mempalace_drawers` collection through the backend layer.
- `get_closets_collection()` returns the `mempalace_closets` collection.
- `build_closet_lines()` extracts compact topic/entity pointer lines from source content and references drawer IDs with the `→drawer_ids` marker.
- `upsert_closet_lines()` packs pointer lines into deterministic closet IDs.
- `purge_file_closets()` removes stale closets for a source before re-mining.
- `mine_lock()` and `mine_palace_lock()` guard file-level and palace-level mining operations.
- `file_already_mined()` checks whether a source was already processed, with `NORMALIZE_VERSION = 2` used to force re-processing when normalization changes.

Relationship: `miner.py`, `convo_miner.py`, `diary_ingest.py`, `searcher.py`, `layers.py`, and `palace_graph.py` all depend on this shared collection/lock layer rather than hand-creating Chroma clients.

### Mining pipelines

There are two implemented first-party mining paths today:

1. **Project files** in `mempalace/miner.py`:
   - Reads `mempalace.yaml` / legacy `mempal.yaml` when present; otherwise derives a normalized wing from the directory name.
   - Scans readable extensions such as `.py`, `.md`, `.json`, `.yaml`, `.sql`, `.toml`, `.ts`, and `.tsx`.
   - Skips generated/cache directories and filenames, respects `.gitignore`, and supports explicit include overrides.
   - Chunks by character windows and stores verbatim drawers with metadata, then builds closets.

2. **Conversations** in `mempalace/convo_miner.py`:
   - Uses `mempalace/normalize.py` to normalize chat exports.
   - Chunks by exchange pair when transcript markers are available, otherwise paragraph/line grouping.
   - Detects rooms by topic keywords and halls by cached config keywords.
   - Registers zero-chunk files with sentinel drawers so repeated runs do not reprocess unproductive files forever.

Supplementary ingest paths include:

- `mempalace/sweeper.py`: message-level Claude JSONL sweep, idempotent by transcript/session cursor.
- `mempalace/diary_ingest.py`: diary file ingest using the same drawer/closet mechanics.
- `mempalace/split_mega_files.py`: pre-processing for concatenated transcript mega-files.

### Search and recall

`mempalace/searcher.py` is the main retrieval engine. Its opening docstring states the intended ranking model: direct drawer query always runs; closet hits add rank-based boosts when they agree; closets are a signal, never a gate.

Core search pieces:

- `_bm25_scores()` implements Okapi-BM25 over candidate documents.
- `_hybrid_rank()` combines vector similarity and BM25, defaulting to `vector_weight = 0.6` and `bm25_weight = 0.4`.
- `build_where_filter()` creates Chroma metadata filters for wing/room scoping.
- `_extract_drawer_ids_from_closet()` parses closet pointer lines.
- `_expand_with_neighbors()` fetches adjacent chunks from the same source file so clipped matches have surrounding context.
- `search()` and `search_memories()` provide CLI/MCP-facing retrieval paths, including BM25-only fallback logic through SQLite for vector-disabled cases later in the file.

`mempalace/layers.py` wraps retrieval into a wake-up stack:

- `Layer0`: identity text from `~/.mempalace/identity.txt`.
- `Layer1`: essential story from top-scored/recent drawers, capped around a compact prompt size.
- `Layer2`: wing/room filtered retrieval.
- `Layer3`: semantic search over the full palace.
- `MemoryStack`: unified `wake_up()`, `recall()`, `search()`, and `status()` interface.

Relationship: CLI `wake-up`, MCP search tools, and user-facing memory workflows all converge on the same collections and search primitives.

### Knowledge graph

`mempalace/knowledge_graph.py` implements the structured graph side using SQLite at `~/.mempalace/knowledge_graph.sqlite3` by default. It creates:

- `entities(id, name, type, properties, created_at)`
- `triples(id, subject, predicate, object, valid_from, valid_to, confidence, source_closet, source_file, source_drawer_id, adapter_name, extracted_at)`
- indexes on subject, object, predicate, and validity windows

It exposes methods for `add_entity()`, `add_triple()`, `invalidate()`, `query_entity()`, relationship queries, timeline, and stats. The code uses a thread lock plus SQLite WAL mode and auto-creates referenced entities when adding triples.

Relationship: `mempalace/mcp_server.py` instantiates `KnowledgeGraph` at import time, routes KG MCP tools to it, and uses a palace-local KG path when `--palace` is explicitly supplied. The KG stores structured temporal facts while drawers/closets preserve verbatim evidence.

### Palace graph and tunnels

`mempalace/palace_graph.py` builds an inferred navigation graph from drawer metadata:

- Nodes are rooms with sets of wings/halls/counts/dates.
- Edges exist where the same room appears in multiple wings.
- `traverse()` performs BFS over connected rooms.
- `find_tunnels()` finds bridge rooms between wings.
- Explicit tunnel helpers create/list/delete/follow cross-wing links.
- A module-level cache with TTL (`_GRAPH_CACHE_TTL = 60.0`) is invalidated on writes.

Relationship: MCP tools under `mempalace_traverse`, `mempalace_find_tunnels`, and related tunnel operations expose this graph model to agents without requiring an external graph database.

### Entity detection, registry, and local extraction

Entity support is split across several modules:

- `mempalace/project_scanner.py` uses manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`) and git history as high-signal project/person evidence during `mempalace init`.
- `mempalace/entity_detector.py` provides regex/i18n-assisted fallback detection from prose.
- `mempalace/entity_registry.py` stores entity code mappings and disambiguation.
- `mempalace/i18n/__init__.py` loads language-specific entity patterns.
- `mempalace/general_extractor.py` classifies text into memory types such as decisions, preferences, milestones, problems, and emotional memories.
- `mempalace/fact_checker.py` checks generated text against known entities and KG contradictions.

Relationship: init/onboarding uses scanners and detectors to bootstrap the palace; miners/search/closets use extracted entities as metadata/index signals; KG stores structured facts when tools or adapters add them.

### Source adapter contract

`mempalace/sources/base.py` defines the future read-side plugin model:

- `SourceRef`: local path or URI plus adapter options.
- `RouteHint`: adapter-supplied wing/room/hall hints.
- `SourceItemMetadata`: source identity/version/size hint for incremental ingest.
- `DrawerRecord`: drawer content plus flat metadata.
- `AdapterSchema` / `FieldSpec`: metadata schema declaration.
- `BaseSourceAdapter`: required `ingest()` and `describe_schema()`, optional `is_current()`, `source_summary()`, and `close()`.

`mempalace/sources/context.py` defines `PalaceContext`, the facade adapters should use for drawer collection, closet collection, KG, config, and progress hooks. `mempalace/sources/registry.py` discovers the `mempalace.sources` entry-point group and intentionally does not auto-detect adapters; users choose an adapter explicitly, with `filesystem` as the default placeholder.

Important evidence-based caveat: the source adapter layer is not yet the active miner path. Both `pyproject.toml` comments and `mempalace/sources/base.py` say `miner.py` and `convo_miner.py` migrate onto the contract in a follow-up PR.

## Data flow maps

### Project mining

```text
mempalace cli mine <dir> --mode projects
  -> mempalace/cli.py cmd_mine
  -> mempalace/miner.py
  -> mempalace/palace.py get_collection("mempalace_drawers")
  -> mempalace/backends/chroma.py Chroma collection wrapper
  -> drawer documents + metadata in ChromaDB
  -> mempalace/palace.py build/upsert closet lines into "mempalace_closets"
  -> optional palace_graph tunnel metadata built from drawer metadata
```

### Conversation mining

```text
mempalace cli mine <dir> --mode convos
  -> mempalace/convo_miner.py
  -> mempalace/normalize.py format-specific normalizers
  -> exchange/paragraph chunks
  -> Chroma drawer collection via mempalace/palace.py
  -> closet pointers via mempalace/palace.py
```

### Search

```text
CLI search or MCP mempalace_search
  -> mempalace/searcher.py
  -> direct drawer vector query + BM25 ranking
  -> optional closet query/pointer expansion
  -> optional neighbor chunk expansion
  -> verbatim result text + metadata/scores
```

### MCP write path

```text
MCP tools/call
  -> mempalace/mcp_server.py handle_request
  -> schema argument whitelist/type coercion
  -> tool handler such as tool_add_drawer/tool_update_drawer/tool_kg_add
  -> redacted WAL entry where applicable
  -> Chroma drawer/closet update and graph cache invalidation, or SQLite KG update
```

### Hook auto-save path

```text
Claude Code / Codex lifecycle event
  -> hooks/*.sh or plugin hook wrapper
  -> mempalace hook run --hook stop|precompact|session-start --harness ...
  -> mempalace/hooks_cli.py
  -> transcript path validation + message counting/extraction
  -> transcript mining through CLI/package modules
  -> optional diary/direct-save behavior based on config
```

## Dependency patterns

### Runtime dependencies

Declared runtime dependencies in `pyproject.toml` are intentionally narrow:

- `chromadb>=1.5.4,<2`: default vector store and embedding-function integration.
- `pyyaml>=6.0,<7`: project config and room detection YAML handling.
- `tomli>=2.0.0; python_version < '3.11'`: TOML parsing backport for Python 3.9/3.10; `project_scanner.py` uses `tomllib` when available and falls back to `tomli`.

The package otherwise leans heavily on the Python standard library: `argparse`, `json`, `sqlite3`, `pathlib`, `hashlib`, `datetime`, `threading`, `urllib`, `subprocess`, `logging`, and `re` appear throughout core modules.

### Optional/development dependencies

- Dev/test extras: `pytest`, `pytest-cov`, `ruff`, `psutil` in `pyproject.toml`.
- Spellcheck extra: `autocorrect`.
- Hardware acceleration extras: `onnxruntime-gpu`, `onnxruntime-directml`, and `onnxruntime` under `[gpu]`, `[dml]`, and `[coreml]`.
- Website dependencies live separately in `website/package.json`: VitePress, Vue, Mermaid, Lucide Vue.

### Internal dependency shape

The internal graph is mostly layered downward:

- CLI (`mempalace/cli.py`) imports workflow modules lazily inside command functions where possible, reducing startup cost and optional provider failures.
- MCP server (`mempalace/mcp_server.py`) imports config, Chroma backend helpers, query sanitizer, searcher, palace graph, and knowledge graph because it needs a long-lived tool server.
- Mining modules (`miner.py`, `convo_miner.py`, `diary_ingest.py`) depend on `palace.py` for collections/locks and on normalization/routing/extraction helpers.
- Search/layers depend on `palace.py` and `searcher.py`, not directly on raw Chroma clients except through backend-wrapped collections.
- Backend and source plugin registries use `importlib.metadata.entry_points()` and cache long-lived instances behind locks.

### Safety and compatibility patterns

- Python 3.9 compatibility appears in annotations and comments: e.g. `mempalace/mcp_server.py` avoids `dict | None` at module eval time; `palace_graph.py` uses `from __future__ import annotations`; `pyproject.toml` targets Python 3.9+.
- Chroma/HNSW failure modes are explicitly guarded: `mcp_server.py` probes HNSW capacity and can route vector-shaped tools to BM25-only SQLite fallback; `backends/chroma.py` contains quarantine and capacity-status code; `repair.py` handles rebuild/max-seq-id repair.
- MCP stdio safety is treated as an architecture concern: `mcp_server.py` redirects stdout before importing Chroma/ONNX-related dependencies to preserve JSON-RPC protocol correctness.
- Input validation is centralized in `config.py` and reused by MCP tools for names/content/KG values.
- Write auditing is present in `mcp_server.py` via a redacted WAL with sensitive keys such as `content`, `query`, and `text` redacted.

## Testing and quality architecture

The test suite is broad and mirrors the runtime boundaries:

- Storage/search/mining: `tests/test_backends.py`, `tests/test_searcher.py`, `tests/test_miner.py`, `tests/test_convo_miner.py`, `tests/test_hybrid_search.py`, `tests/test_hnsw_capacity.py`, `tests/test_repair.py`.
- MCP/server/tooling: `tests/test_mcp_server.py`, `tests/test_mcp_stdio_protection.py`, `tests/test_hooks_cli.py`, `tests/test_hooks_shell.py`.
- Memory semantics: `tests/test_layers.py`, `tests/test_knowledge_graph.py`, `tests/test_palace_graph.py`, `tests/test_palace_graph_tunnels.py`, `tests/test_dialect.py`, `tests/test_entity_registry.py`, `tests/test_entity_detector.py`.
- Adapter/scaffolding and integration behavior: `tests/test_sources.py`, `tests/test_corpus_origin.py`, `tests/test_corpus_origin_integration.py`, `tests/test_project_scanner.py`.
- Benchmarks/stress tests live under `tests/benchmarks/` and are excluded from default pytest config via `pyproject.toml` markers/addopts and CI `--ignore=tests/benchmarks`.

Quality policy is encoded in `pyproject.toml` and CI:

- Ruff line length 100, target Python 3.9, E/F/W/C901 lint families, max complexity 25, double-quote formatting.
- Coverage source is `mempalace`; `pyproject.toml` says `fail_under = 85`, while CI currently passes `--cov-fail-under=80`.

## Current architectural seams and caveats

- **Tool-count docs drift:** current `mcp_server.py` exposes 29 tools, but some plugin docs still say 19. The root README agrees with 29.
- **Source adapters are not yet active miners:** the RFC 002 modules and entry-point group exist, but core `mine` still routes to `miner.py` / `convo_miner.py` directly.
- **Storage backend abstraction is newer than some legacy helper paths:** `backends/base.py` and `backends/registry.py` are formal, but `palace.py` still instantiates `ChromaBackend()` as `_DEFAULT_BACKEND`, so much runtime code is Chroma-default even while the contract supports alternatives.
- **Docs schema vs live KG schema differ:** `docs/schema.sql` lacks newer `source_drawer_id`, `adapter_name`, and `created_at` / `extracted_at` fields that `mempalace/knowledge_graph.py` creates and migrates.
- **External LLM support is opt-in but present:** local-first is the default posture, yet `llm_client.py` supports Anthropic and OpenAI-compatible endpoints when explicitly configured.

## Mental model for contributors

If you are changing MemPalace, trace the path by concern:

- CLI UX or command behavior: start at `mempalace/cli.py`, then the specific module it dispatches to.
- MCP tools: update `mempalace/mcp_server.py` handler + `TOOLS` schema, and check config sanitizers/WAL implications.
- Storage behavior: start at `mempalace/backends/base.py`, `mempalace/backends/chroma.py`, and `mempalace/palace.py`.
- Mining behavior: start at `mempalace/miner.py`, `mempalace/convo_miner.py`, `mempalace/normalize.py`, and closet helpers in `mempalace/palace.py`.
- Search behavior: start at `mempalace/searcher.py`, then `mempalace/layers.py` for wake-up/recall presentation.
- Structured facts: start at `mempalace/knowledge_graph.py` and the KG MCP tools in `mempalace/mcp_server.py`.
- Hook behavior: start at `mempalace/hooks_cli.py`, `hooks/*.sh`, `.claude-plugin/`, and `.codex-plugin/`.
- Plugin future work: distinguish storage backend plugins (`mempalace/backends/*`, active) from source adapter plugins (`mempalace/sources/*`, scaffolded/future miner migration).
