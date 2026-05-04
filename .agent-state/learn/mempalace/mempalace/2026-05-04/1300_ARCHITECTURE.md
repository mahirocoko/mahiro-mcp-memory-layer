# MemPalace Architecture Deep Dive

Source read from: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

## Executive summary

MemPalace is a local-first Python memory system. Its product promise is explicit in `AGENTS.md` and `README.md`: store user/project/conversation content as verbatim text, never summarize or silently send data away, and retrieve exact words through a structured “palace” model. The core runtime is the `mempalace/` package. The primary data path is:

```text
CLI / hooks / MCP server
  -> config and validation
  -> project miner, conversation miner, or sweeper
  -> ChromaDB-backed storage backend
       - mempalace_drawers: verbatim content chunks
       - mempalace_closets: compact pointer/index lines
  -> search, wake-up layers, graph traversal, drawer management
  -> SQLite knowledge graph for structured temporal facts
```

The repository also ships docs, examples, benchmark scripts/results, plugin wrappers for Claude Code and Codex, shell hooks, and RFC scaffolding for future source-adapter plugins. The architecture is already partly transitional: storage has an RFC-backed backend abstraction, while source adapters are specified but the first-party miners have not yet been migrated onto that contract.

## Directory structure and organization philosophy

### Top-level layout

- `mempalace/` — core Python package: CLI, MCP server, ingestion, retrieval, backend abstraction, graph, hooks, i18n, and utilities.
- `tests/` — broad pytest suite mirroring source modules (`test_miner.py`, `test_mcp_server.py`, `test_searcher.py`, `test_knowledge_graph.py`, `test_sources.py`, etc.) plus benchmark/stress tests under `tests/benchmarks/`.
- `benchmarks/` — reproducible benchmark scripts and committed result files for LongMemEval, LoCoMo, ConvoMem, MemBench, and ingest/search profiling.
- `docs/` — architecture/history/schema documents and RFCs, especially `docs/rfcs/002-source-adapter-plugin-spec.md`.
- `website/` — static documentation source: concepts, guides, and reference pages.
- `examples/` — setup/tutorial material and example scripts for MCP, hooks, Gemini CLI, and mining.
- `hooks/` — shell wrappers (`mempal_save_hook.sh`, `mempal_precompact_hook.sh`) for hook integration.
- `.claude-plugin/` — Claude Code plugin packaging: plugin manifest, commands, hooks, skill, MCP config.
- `.codex-plugin/` — Codex CLI plugin packaging: plugin manifest, skills, hooks.
- `.agents/` — plugin marketplace metadata.
- `landing/`, `assets/` — website/brand assets.
- `.github/`, `.devcontainer/`, `.pre-commit-config.yaml` — CI, automation, and contributor tooling.
- `pyproject.toml` / `uv.lock` — Python package metadata, dependency lock, scripts, and entry-point groups.

### Package organization

`mempalace/README.md` describes the package as “all modules, all logic.” The directory is organized by runtime concern rather than framework layers:

- Entry surfaces: `cli.py`, `__main__.py`, `mcp_server.py`, `hooks_cli.py`, `instructions_cli.py`.
- Configuration and safety: `config.py`, `query_sanitizer.py`, `spellcheck.py`, `version.py`.
- Ingestion: `miner.py`, `convo_miner.py`, `sweeper.py`, `normalize.py`, `split_mega_files.py`, `diary_ingest.py`.
- Routing/enrichment: `project_scanner.py`, `room_detector_local.py`, `entity_detector.py`, `entity_registry.py`, `corpus_origin.py`, `general_extractor.py`, `llm_refine.py`, `llm_client.py`, `fact_checker.py`.
- Storage: `palace.py`, `backends/base.py`, `backends/chroma.py`, `backends/registry.py`.
- Retrieval/context: `searcher.py`, `layers.py`, `dialect.py`, `closet_llm.py`, `palace_graph.py`.
- Structured facts: `knowledge_graph.py`.
- Maintenance/export: `repair.py`, `migrate.py`, `dedup.py`, `exporter.py`.
- Future plugin read-side: `sources/base.py`, `sources/context.py`, `sources/registry.py`, `sources/transforms.py`.
- Internationalization: `i18n/*.json` and `i18n/__init__.py` for localized entity-detection patterns.

The design philosophy is “local memory first”: `AGENTS.md` makes verbatim storage, append/incremental ingest, entity-first organization, no external API by default, fast hooks, privacy-by-architecture, and background work explicit constraints. The implementation reflects that with local ChromaDB, local SQLite, plain files under `~/.mempalace`, optional local-first LLM provider defaults, and many defensive guards around unsafe inputs and corrupted vector state.

## Packaging and declared dependencies

`pyproject.toml` defines package `mempalace` version `3.3.3`, Python `>=3.9`, and core dependencies:

- `chromadb>=1.5.4,<2` — default vector/database backend.
- `pyyaml>=6.0,<7` — project config (`mempalace.yaml`) loading.
- `tomli>=2.0.0` on Python `<3.11`.

Optional extras expose ONNX Runtime hardware acceleration paths:

- `gpu = ["onnxruntime-gpu>=1.16"]`
- `dml = ["onnxruntime-directml>=1.16"]`
- `coreml = ["onnxruntime>=1.16"]`

Development dependencies include `pytest`, `pytest-cov`, `ruff`, and `psutil`. `pyproject.toml` also registers:

- Console scripts: `mempalace = mempalace.cli:main`, `mempalace-mcp = mempalace.mcp_server:main`.
- Storage backend entry-point group: `mempalace.backends`, with in-tree `chroma = mempalace.backends.chroma:ChromaBackend`.
- Source adapter entry-point group: `mempalace.sources`, currently empty in core; RFC 002 says third-party packages can register here.

## All entry points

### Python/package entry points

- `mempalace.cli:main` — primary console command registered as `mempalace` in `pyproject.toml`.
- `mempalace.mcp_server:main` — stdio JSON-RPC MCP server registered as `mempalace-mcp`.
- `mempalace/__main__.py` — imports `cli.main()` so `python -m mempalace` behaves like the CLI.
- Several modules also have ad-hoc `if __name__ == "__main__"` developer entry points: `convo_miner.py`, `entity_detector.py`, `diary_ingest.py`, `dedup.py`, `layers.py`, `normalize.py`, `split_mega_files.py`, `closet_llm.py`, `general_extractor.py`, `onboarding.py`, `fact_checker.py`, `dialect.py`, `spellcheck.py`, `repair.py`, and `project_scanner.py`.

### CLI command surface (`mempalace/cli.py`)

`cli.py` uses `argparse` and dispatches subcommands through `main()`:

- `init` — pass-zero corpus-origin detection, entity discovery/refinement, room detection, config initialization, gitignore protection, optional immediate mining.
- `mine` — project or conversation ingestion (`--mode projects|convos`), optional wing, ignore controls, agent metadata, limit, dry-run, and conversation extraction strategy.
- `sweep` — message-granular Claude JSONL ingestion through `sweeper.py`.
- `search` — CLI search through `searcher.search()`.
- `compress` — AAAK/dialect compression path.
- `wake-up` — L0/L1 context rendering through `layers.MemoryStack`.
- `split` — split concatenated transcript mega-files through `split_mega_files.py`.
- `hook run --hook session-start|stop|precompact --harness claude-code|codex` — reads hook JSON from stdin and dispatches to `hooks_cli.py`.
- `instructions` — emits packaged instruction markdown from `mempalace/instructions/`.
- `repair`, `repair-status`, `migrate`, `status`, `mcp` — maintenance/status/setup commands.

The `init` path is architectural glue: it may acquire an LLM provider via `llm_client.get_provider()`, runs `_run_pass_zero()`, calls `project_scanner.discover_entities()`, confirms entities through `entity_detector.confirm_entities()`, writes `entities.json`, merges into `~/.mempalace/known_entities.json` via `miner.add_to_known_entities()`, runs `room_detector_local.detect_rooms_local()`, and then may run `mine()`.

### MCP server entry point (`mempalace/mcp_server.py`)

`mcp_server.py` is a hand-rolled stdio JSON-RPC server. Before importing heavy dependencies it redirects stdout to stderr to protect MCP protocol output from noisy dependency banners, then restores stdout in `main()`. It supports protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`.

The `TOOLS` registry exposes these tool families:

- Palace inspection: `mempalace_status`, `mempalace_list_wings`, `mempalace_list_rooms`, `mempalace_get_taxonomy`.
- AAAK: `mempalace_get_aaak_spec`.
- Knowledge graph: `mempalace_kg_query`, `mempalace_kg_add`, `mempalace_kg_invalidate`, `mempalace_kg_timeline`, `mempalace_kg_stats`.
- Graph/tunnels: `mempalace_traverse`, `mempalace_find_tunnels`, `mempalace_graph_stats`, `mempalace_create_tunnel`, `mempalace_list_tunnels`, `mempalace_delete_tunnel`, `mempalace_follow_tunnels`.
- Retrieval: `mempalace_search`, `mempalace_check_duplicate`.
- Drawer CRUD: `mempalace_add_drawer`, `mempalace_delete_drawer`, `mempalace_get_drawer`, `mempalace_list_drawers`, `mempalace_update_drawer`.
- Agent diary: `mempalace_diary_write`, `mempalace_diary_read`.
- Hooks/status maintenance: `mempalace_hook_settings`, `mempalace_memories_filed_away`, `mempalace_reconnect`.

`handle_request()` implements `initialize`, `ping`, `tools/list`, and `tools/call`. Tool calls whitelist incoming arguments against each input schema unless the handler accepts `**kwargs`, coerce integer/number strings/floats, and return JSON as MCP text content. Vector search can be disabled if an HNSW capacity probe detects dangerous ChromaDB divergence; then search-shaped tools route to SQLite BM25 fallback rather than opening a corrupt vector segment.

### Hook entry points

- `mempalace/hooks_cli.py` is the Python hook implementation. It supports `session-start`, `stop`, and `precompact` for `claude-code` and `codex` harnesses.
- `hooks/` contains shell wrappers intended for user-level hook integration.
- `.claude-plugin/hooks/` and `.codex-plugin/hooks/` contain plugin-packaged hook wrappers and hook manifests.

`hook_stop()` counts human messages in the transcript, tracks per-session save intervals in `~/.mempalace/hook_state`, and every 15 messages either silently writes a diary/checkpoint directly or returns a blocking prompt instructing the agent to save via MCP tools. `hook_precompact()` synchronously ingests the transcript and mines configured project targets before compaction. `hook_session_start()` initializes tracking but does not block.

### Plugin and docs entry points

- `.claude-plugin/plugin.json` registers an MCP server named `mempalace` with command `mempalace-mcp` and packages Claude commands/skills/hooks. Its README documents slash commands `/mempalace:help`, `/mempalace:init`, `/mempalace:search`, `/mempalace:mine`, `/mempalace:status`.
- `.codex-plugin/plugin.json` registers skills, hooks, and the same `mempalace-mcp` server for Codex CLI.
- `website/` is the docs-site source, with guides and reference pages for CLI, MCP tools, Python API, benchmarks, hooks, local models, and concepts.
- `benchmarks/*.py` scripts are standalone benchmark entry points for LongMemEval, LoCoMo, ConvoMem, MemBench, and mining performance.

## Core data model

The product vocabulary is not decorative; it maps to stored metadata:

- **Wing** — broad domain/person/project. Stored in drawer metadata as `wing`.
- **Room** — topic/aspect/session bucket within a wing. Stored as `room`.
- **Drawer** — verbatim content chunk stored as a Chroma document in `mempalace_drawers`.
- **Hall** — broad category inferred from content keywords and stored as `hall`.
- **Closet** — compact index/pointer text stored in `mempalace_closets`, containing lines like `topic|entities|→drawer_id_a,drawer_id_b`.
- **Tunnel** — relationship between rooms/wings, either inferred from shared rooms or explicitly stored in `~/.mempalace/tunnels.json`.

Metadata commonly includes `source_file`, `chunk_index`, `added_by`, `filed_at`, `ingest_mode`, and `normalize_version`. Conversation-specific drawers add extraction metadata. Sweeper drawers add `session_id`, `timestamp`, `message_uuid`, and `role`.

## Storage architecture

### Backend abstraction

`mempalace/backends/base.py` defines the storage contract:

- `PalaceRef` identifies a palace by `id`, optional `local_path`, and optional `namespace`.
- `BaseCollection` defines `add`, `upsert`, `query`, `get`, `delete`, and `count`, plus optional `update`, `estimated_count`, `close`, and `health`.
- `BaseBackend` is the per-palace factory, with `get_collection()`, `close_palace()`, `close()`, `health()`, and optional `detect()`.
- Typed result dataclasses `QueryResult` and `GetResult` replace raw Chroma dicts, but `_DictCompatMixin` keeps legacy `result.get("ids")` usage working during migration.

`mempalace/backends/registry.py` discovers `mempalace.backends` entry points once per process, supports explicit registration for tests/dev, caches backend instances, and resolves backend priority as explicit -> config -> env -> on-disk detect -> default `chroma`.

### ChromaDB implementation

`mempalace/backends/chroma.py` is the in-tree default. `ChromaCollection` adapts ChromaDB collection methods to the typed `BaseCollection` surface and validates `where` filters. `ChromaBackend` caches `PersistentClient` handles by palace path, tracks `chroma.sqlite3` inode/mtime to detect rebuilds, and creates collections with cosine HNSW metadata and one HNSW thread.

Important safety/compatibility choices in `ChromaBackend`:

- `get_collection(create=True)` creates the palace path with restricted permissions where possible.
- `_resolve_embedding_function()` always passes the embedding function to Chroma collection open/create because ChromaDB 1.x does not persist it reliably with the collection.
- `_prepare_palace_for_open()` runs `_fix_blob_seq_ids()` and `quarantine_stale_hnsw()` before opening a client, protecting against migration/HNSW corruption states.
- `hnsw_capacity_status()` is used by the MCP server to avoid segfault-prone vector loads when SQLite and HNSW segment counts diverge.
- Legacy positional and new kwargs-only calling conventions are both supported by `_normalize_get_collection_args()`.

### Shared palace operations

`mempalace/palace.py` provides shared helpers used by miners and server code:

- `get_collection()` and `get_closets_collection()` use the default `ChromaBackend`.
- `build_closet_lines()` extracts topics/entities/quotes and emits compact pointer lines.
- `upsert_closet_lines()` packs closet lines into ~1500-character closet documents without splitting lines.
- `purge_file_closets()` removes stale closet records for a source file before re-writing.
- `mine_lock()` serializes per-source delete/upsert cycles.
- `mine_palace_lock()` is a per-palace non-blocking lock to prevent concurrent full mines from corrupting ChromaDB/HNSW state.
- `file_already_mined()` enforces incremental/stale-version logic using `normalize_version` and, for project files, source mtime.

The `NORMALIZE_VERSION = 2` constant is the schema gate for normalization changes; stale drawers are treated as not mined so the next mine rebuilds them.

## Ingestion architecture

### Project file mining (`mempalace/miner.py`)

`miner.py` mines readable project files into drawers. It:

1. Loads `mempalace.yaml` / `mempal.yaml`, or falls back to a normalized directory-name wing with a `general` room.
2. Scans readable extensions while skipping cache/build directories and respecting `.gitignore` unless overridden.
3. Routes files to rooms by folder path, filename, then keyword scoring.
4. Chunks text into ~800-character drawers with overlap and paragraph/line boundary preference.
5. Writes deterministic drawer IDs with metadata and updates closet pointer collection.
6. Uses `file_already_mined(check_mtime=True)` and locks to avoid duplicate/stale/concurrent writes.

It also maintains `~/.mempalace/known_entities.json` through `add_to_known_entities()`, including `topics_by_wing` used later for tunnel computation.

### Conversation mining (`mempalace/convo_miner.py`)

`convo_miner.py` mines chat exports and transcripts. It uses `normalize.normalize()` to convert supported formats to a common transcript text shape, then either:

- chunks by exchange pair (`> user turn` plus following AI response), or
- uses `general_extractor.extract_memories()` to classify chunks into memory types.

It routes conversations by topic keyword (`technical`, `architecture`, `planning`, `decisions`, `problems`) unless general extraction supplies the room. It writes registry sentinels for files that normalize to nothing, so those files are not repeatedly reprocessed. It uses source-file locks and purges stale source drawers when normalization schema changes.

### Message sweeper (`mempalace/sweeper.py`)

`sweeper.py` is a separate message-granular ingestion path for Claude Code JSONL. It parses user/assistant records, flattens text/tool blocks, and upserts one drawer per `(session_id, message_uuid)`. Its cursor is the max timestamp already stored for that session, so re-runs are idempotent and resume-safe. The module is explicit that coordination with primary miners is limited: it may ingest content that was also chunked by file-level miners because metadata does not yet unify both paths.

### Normalization (`mempalace/normalize.py`)

`normalize.py` supports plain text, Claude.ai JSON, ChatGPT JSON, Claude Code JSONL, OpenAI Codex CLI JSONL, Gemini CLI JSONL, Slack JSON export, and marker-based transcripts. It is intentionally local and API-free. Claude Code normalization strips known system/hook/UI noise through line-anchored patterns while preserving user prose when uncertain. This is a tradeoff against the “verbatim always” principle: tool/system chrome can pollute retrieval, so removals are narrowly scoped and version-gated through `NORMALIZE_VERSION`.

### Entity/room/corpus discovery

- `project_scanner.py` discovers entities from manifests, git authors, and prose.
- `entity_detector.py` extracts/categorizes people/projects/topics with i18n-aware patterns.
- `llm_refine.py` can refine entity classifications with a provider from `llm_client.py`.
- `corpus_origin.py` detects whether a corpus is AI-dialogue, affecting persona-name handling.
- `room_detector_local.py` maps folder structures to room names using local patterns.
- `i18n/__init__.py` and `i18n/*.json` provide multilingual entity regex patterns.

### Source adapter future

`mempalace/sources/base.py` and `docs/rfcs/002-source-adapter-plugin-spec.md` define a formal source adapter interface (`BaseSourceAdapter`, `SourceRef`, `SourceItemMetadata`, `DrawerRecord`, `RouteHint`, `AdapterSchema`). `sources/registry.py` discovers `mempalace.sources` entry points, caches adapter instances, and defaults to a future `filesystem` adapter. However, comments in `pyproject.toml` and `sources/base.py` state that `miner.py` and `convo_miner.py` have not yet migrated onto this contract. The current architecture is therefore hybrid: storage is abstracted now; read-side ingestion is specified but still mostly first-party procedural code.

## Retrieval and context architecture

### Search (`mempalace/searcher.py`)

`searcher.py` is the main retrieval layer. The primary drawer query always runs; closet hits are a ranking signal rather than a gate. This protects recall: weak closet extraction can boost results but cannot hide direct drawer matches.

Key pieces:

- `build_where_filter()` scopes by wing/room.
- `_bm25_scores()` implements Okapi-BM25 over candidate documents.
- `_hybrid_rank()` blends absolute cosine similarity (`max(0, 1 - distance)`) and normalized BM25.
- `_extract_drawer_ids_from_closet()` parses closet pointer lines.
- `_expand_with_neighbors()` fetches adjacent chunks from the same source file to reduce boundary clipping.
- `_warn_if_legacy_metric()` warns if a palace was created without cosine HNSW metadata.
- `_bm25_only_via_sqlite()` provides a no-Chroma-client fallback using ChromaDB's SQLite/FTS tables when vector search is unsafe or unavailable.

The CLI `search()` prints verbatim drawer text. The MCP path uses `search_memories()` (same module) to return structured tool results and can use candidate-union/fallback logic.

### Layered wake-up (`mempalace/layers.py`)

`layers.py` defines a four-layer memory stack:

- `Layer0` reads identity text from `~/.mempalace/identity.txt`.
- `Layer1` scans top palace drawers and renders an “essential story.”
- `Layer2` performs wing/room filtered retrieval.
- `Layer3` performs semantic search against drawers.
- `MemoryStack` combines these with `wake_up()`, `recall()`, `search()`, and `status()`.

This provides a low-token startup context path (`wake-up`) while preserving unlimited deeper search through L3.

### AAAK and closets

`dialect.py` implements the AAAK compression dialect referenced by docs and MCP. `palace.py` builds closet pointer lines from source content. `closet_llm.py` can regenerate closets with LLM assistance when configured. Architecturally, closets are a compact index layer; drawers remain the source of truth.

## Graph architecture

### Temporal knowledge graph (`mempalace/knowledge_graph.py`)

`KnowledgeGraph` stores structured facts in local SQLite (`~/.mempalace/knowledge_graph.sqlite3` by default, or inside a `--palace` path for MCP when explicit). The schema has:

- `entities(id, name, type, properties, created_at)`.
- `triples(id, subject, predicate, object, valid_from, valid_to, confidence, source_closet, source_file, source_drawer_id, adapter_name, extracted_at)`.

The graph supports adding/updating entities, adding triples, invalidating facts with `valid_to`, querying outgoing/incoming/both relationships with optional `as_of`, relationship queries, timelines, stats, and schema migration for newer provenance columns. Thread safety is provided by a module-level connection and a `threading.Lock` around writes/queries.

### Palace graph and tunnels (`mempalace/palace_graph.py`)

`palace_graph.py` builds a navigable graph from drawer metadata rather than a separate graph DB:

- Nodes are rooms.
- Wings attached to a room form connections.
- Shared room names across wings create inferred tunnel edges.
- Explicit tunnels are stored as JSON in `~/.mempalace/tunnels.json` with atomic replace and restricted permissions.

`build_graph()` scans drawer metadata in batches and caches non-empty graph results for 60 seconds. `invalidate_graph_cache()` is called by write paths. `traverse()` performs BFS from a room. `find_tunnels()`, `graph_stats()`, `create_tunnel()`, `list_tunnels()`, `delete_tunnel()`, and `follow_tunnels()` back the MCP tunnel tools.

## LLM and embedding dependency patterns

### Embeddings

`mempalace/embedding.py` wraps ChromaDB's ONNX MiniLM embedding function with hardware-provider selection. It preserves the same `all-MiniLM-L6-v2` 384-dimensional model so switching execution providers does not invalidate existing palaces. `MEMPALACE_EMBEDDING_DEVICE` or config can select `auto`, `cpu`, `cuda`, `coreml`, or `dml`; unavailable accelerators warn and fall back to CPU. The embedding function is cached per provider list.

### LLMs

`mempalace/llm_client.py` is a minimal stdlib-only provider abstraction for entity refinement:

- `ollama` defaults to `http://localhost:11434` and is the local-first default.
- `openai-compat` supports any `/v1/chat/completions` endpoint.
- `anthropic` supports Anthropic Messages API.

Providers implement `classify()` and `check_available()`. `LLMProvider.is_external_service` uses URL heuristics to warn when content would leave the user's machine or private network. `cli.py` gates environment-derived external API keys with explicit confirmation unless `--accept-external-llm` is passed.

This is a notable dependency pattern: core benchmark/search/mining paths do not require an LLM, but init can opportunistically refine entities when a local provider is reachable. External providers are opt-in and guarded.

## Configuration and local state

`mempalace/config.py` centralizes configuration and sanitization:

- Load order: environment variables -> `~/.mempalace/config.json` -> defaults.
- Default palace path: `~/.mempalace/palace`.
- Default collection: `mempalace_drawers`.
- Env aliases include `MEMPALACE_PALACE_PATH` / `MEMPAL_PALACE_PATH` and `MEMPALACE_ENTITY_LANGUAGES` / `MEMPAL_ENTITY_LANGUAGES`.
- Sanitizers protect names, knowledge-graph values, and drawer content against traversal, null bytes, overlong values, and unsafe characters.
- Config setters write files with restrictive permissions where supported.

Important local files/directories:

- `~/.mempalace/config.json` — runtime config.
- `~/.mempalace/palace/` — default ChromaDB palace.
- `~/.mempalace/knowledge_graph.sqlite3` — default KG.
- `~/.mempalace/identity.txt` — L0 identity.
- `~/.mempalace/known_entities.json` — known people/projects/topics and `topics_by_wing`.
- `~/.mempalace/tunnels.json` — explicit cross-wing tunnels.
- `~/.mempalace/hook_state/` — hook logs, pid/state files, save markers.
- `~/.mempalace/locks/` — per-file and per-palace mine locks.

## Maintenance architecture

- `repair.py` handles legacy palace rebuilds and max-seq-id repair modes; CLI exposes `repair` and read-only `repair-status`.
- `migrate.py` extracts drawers from old ChromaDB SQLite layouts and migrates between ChromaDB versions with dry-run/confirmation guardrails.
- `dedup.py` groups source-file drawers and removes near-duplicates with dry-run default behavior.
- `exporter.py` exports palace data.
- `query_sanitizer.py` defends MCP search against prompt contamination by requiring the query field to be search-only.
- `fact_checker.py` checks text against known entities and KG contradictions.

The codebase contains substantial operational defensive code around ChromaDB/HNSW edge cases, stdout pollution in MCP, Windows/POSIX locking differences, file permissions, and large transcript/file handling.

## Test and quality architecture

`pyproject.toml` configures pytest to run `tests/` while excluding `benchmark`, `slow`, and `stress` markers by default. Coverage source is `mempalace` with an 85% target. Ruff selects `E`, `F`, `W`, and `C901`, ignores line-length errors, and uses double quotes.

The tests mirror the package structure and document important seams:

- Storage/backends: `test_backends.py`, `test_collection_metric_invariant.py`, `test_empty_chromadb_results.py`, `test_hnsw_capacity.py`.
- Ingestion: `test_miner.py`, `test_convo_miner.py`, `test_sweeper.py`, `test_normalize.py`, `test_project_scanner.py`, `test_sources.py`.
- Retrieval/graph: `test_searcher.py`, `test_hybrid_search.py`, `test_hybrid_candidate_union.py`, `test_layers.py`, `test_palace_graph.py`, `test_palace_graph_tunnels.py`.
- MCP/hooks: `test_mcp_server.py`, `test_mcp_stdio_protection.py`, `test_hooks_cli.py`, `test_hooks_shell.py`, `test_claude_plugin_hook_wrappers.py`.
- Entity/i18n/LLM: `test_entity_detector.py`, `test_entity_registry.py`, `test_i18n.py`, `test_llm_client.py`, `test_llm_refine.py`.
- Maintenance: `test_repair.py`, `test_migrate.py`, `test_dedup.py`, `test_exporter.py`.

## Notable architectural tradeoffs

1. **Verbatim promise vs normalization noise stripping.** The product says never summarize or paraphrase. `normalize.py` nevertheless strips Claude Code system/hook/UI chrome. The tradeoff is explicit: user content should remain verbatim, but generated tool chrome can waste drawer space and poison retrieval. The implementation narrows stripping to line-anchored known patterns and gates stale drawers through `NORMALIZE_VERSION`.

2. **ChromaDB convenience vs heavy defensive code.** ChromaDB gives local vector storage and embeddings quickly, but the repo carries significant safety logic for metric metadata, HNSW corruption/divergence, stale segments, blob seq IDs, stdout noise, client cache invalidation, and thread pinning. This is the cost of a local embedded vector DB with native components.

3. **Recall-first ranking.** Search always queries drawers directly and treats closets as boost-only. This avoids lossy index gating and aligns with the “100% recall” goal, but it means search does more work and ranking must blend vector, BM25, closet, neighbor expansion, and fallback paths.

4. **Procedural first-party ingesters vs future adapter contract.** Storage backend abstraction is implemented; source adapters are specified but not fully wired into `mine`. Current miners are simpler and battle-tested, but new source types still risk accumulating branches until the RFC 002 migration lands.

5. **Local-first defaults with optional external LLMs.** The core path needs no API key; entity refinement can use Ollama by default or external APIs by explicit configuration. This preserves privacy posture but creates UX complexity around provider checks, warnings, consent gates, and graceful fallback.

6. **Multiple persistence planes.** ChromaDB holds drawers/closets, SQLite holds KG facts, JSON/plaintext files hold config/entities/tunnels/identity/hook state. This keeps each subsystem simple and local, but consistency across planes is application-managed rather than transactional.

7. **Hook background saves vs deterministic control.** Hooks keep memory capture out of the chat window and before compaction, but they need session counters, lock/pid files, direct-save modes, transcript validation, and loop-prevention logic to avoid annoying or corrupting user sessions.

8. **Backwards compatibility during active refactor.** Typed backend result objects still support dict-like access; Chroma backend accepts legacy positional calls; config supports old env var aliases; source adapter spec exists beside old miners. This reduces breakage but increases internal complexity.

## What to read first when onboarding

1. `AGENTS.md` — mission and non-negotiable design principles. This explains why the code optimizes for verbatim, local-first, incremental memory rather than generic RAG convenience.
2. `README.md` — user-facing product scope, commands, benchmark claims, MCP/hooks overview.
3. `pyproject.toml` — installed commands, dependency surface, backend/source entry-point groups, test/lint settings.
4. `mempalace/README.md` — concise module map and architecture sketch.
5. `mempalace/cli.py` — primary runtime orchestration and subcommand dispatch.
6. `mempalace/mcp_server.py` — MCP tool surface, JSON-RPC loop, stdio protection, cache/reconnect/vector-safety behavior.
7. `mempalace/palace.py` + `mempalace/backends/base.py` + `mempalace/backends/chroma.py` — storage abstractions and ChromaDB operational safety.
8. `mempalace/miner.py`, `mempalace/convo_miner.py`, `mempalace/sweeper.py`, `mempalace/normalize.py` — the three ingest paths and normalization boundary.
9. `mempalace/searcher.py` + `mempalace/layers.py` — retrieval, ranking, fallback, and wake-up context.
10. `mempalace/knowledge_graph.py` + `mempalace/palace_graph.py` — structured temporal facts and cross-wing navigation.
11. `mempalace/hooks_cli.py` + `.claude-plugin/` + `.codex-plugin/` — how integrations invoke memory capture and expose tools/skills.
12. `docs/rfcs/002-source-adapter-plugin-spec.md` + `mempalace/sources/` — where the architecture is heading for source adapters.
13. `tests/test_*.py` matching the module you plan to change — test names are detailed and often explain historical bug boundaries.

## High-level relationship map

```text
User / AI client
  |-- CLI: mempalace.cli:main
  |     |-- init -> corpus_origin, project_scanner, entity_detector, room_detector_local, config
  |     |-- mine --mode projects -> miner -> palace/backends/chroma
  |     |-- mine --mode convos -> convo_miner -> normalize/general_extractor -> palace/backends/chroma
  |     |-- sweep -> sweeper -> palace/backends/chroma
  |     |-- search -> searcher
  |     |-- wake-up -> layers.MemoryStack
  |
  |-- MCP: mempalace.mcp_server:main
  |     |-- tool registry -> drawers, search, KG, graph, tunnels, diary, settings
  |     |-- ChromaDB cache/freshness/HNSW safety
  |
  |-- Hooks/plugins
        |-- hooks_cli.run_hook -> session-start / stop / precompact
        |-- .claude-plugin and .codex-plugin -> mempalace-mcp + commands/skills/hooks

Storage and indexes
  |-- ChromaDB palace directory
  |     |-- mempalace_drawers: exact text chunks + metadata
  |     |-- mempalace_closets: compact topic/entity -> drawer pointers
  |-- SQLite KG: entities + temporal triples
  |-- ~/.mempalace JSON/text state: config, identity, entities, tunnels, hook state, locks
```
