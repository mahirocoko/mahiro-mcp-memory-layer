# MemPalace Quick Reference

## What it does

MemPalace is a local-first AI memory system for storing conversation and project history as verbatim text, then retrieving it with semantic and hybrid search. It organizes memory as a palace: people/projects/topics become **wings**, topics or time groupings become **rooms**, and original chunks become **drawers**. The README explicitly says it does not summarize, extract, or paraphrase stored conversation history, and the core package routes project files, conversation exports, search, wake-up context, MCP tools, hooks, and a local SQLite knowledge graph through the same palace model.

Core defaults and constraints evidenced in the repo:

- Python package name: `mempalace` (`pyproject.toml`).
- Python requirement: `>=3.9`.
- Default vector backend: ChromaDB (`chromadb>=1.5.4,<2`), registered as the built-in `chroma` backend.
- Default storage path: `~/.mempalace/palace`.
- Default Chroma collection: `mempalace_drawers`.
- Knowledge graph storage: local SQLite at `~/.mempalace/knowledge_graph.sqlite3`.
- Core path requires no API key; optional LLM-assisted init/refinement can use local or explicitly configured providers.

Official sources warning from the README: the official project sources are the GitHub repository, the PyPI package, and `mempalaceofficial.com`; other domains such as `mempalace.tech` are called impostors.

## Installation methods

### From PyPI

```bash
pip install mempalace
mempalace init ~/projects/myapp
```

### Editable source checkout / development install

The repo documents editable installs for development and benchmark reproduction:

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
pip install -e ".[dev]"
```

The Gemini CLI example also shows a virtualenv-based editable install:

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
python3 -m venv .venv
.venv/bin/pip install -e .
```

### Optional extras

`pyproject.toml` defines these extras:

```bash
pip install mempalace[spellcheck]
pip install mempalace[gpu]      # NVIDIA CUDA
pip install mempalace[dml]      # DirectML on Windows
pip install mempalace[coreml]   # macOS Neural Engine path
```

After installing an acceleration extra, configure the embedding device with `MEMPALACE_EMBEDDING_DEVICE=cuda|dml|coreml` or set it to `auto`.

## Main commands

### Initialize a project palace

```bash
mempalace init ~/projects/myapp
```

Useful evidenced flags:

```bash
mempalace init ~/projects/myapp --yes --auto-mine
mempalace init ~/projects/myapp --lang en,pt-br
mempalace init ~/projects/myapp --no-llm
mempalace init ~/projects/myapp --llm-provider ollama --llm-model gemma4:e4b
mempalace --palace /path/to/palace init ~/projects/myapp
```

Notes:

- `--llm` is deprecated because LLM-assisted entity refinement is on by default.
- `--no-llm` runs heuristics-only.
- Provider choices in the CLI are `ollama`, `openai-compat`, and `anthropic`.
- Default Ollama endpoint is `http://localhost:11434`; `openai-compat` requires an endpoint.
- External LLM endpoints trigger privacy warning/consent logic in the CLI path.

### Mine project files

```bash
mempalace mine ~/projects/myapp
```

Project mining scans readable project files, respects `.gitignore` by default, chunks text into verbatim drawers, and builds closet index pointers for project-mined files.

Useful flags:

```bash
mempalace mine ~/projects/myapp --wing my_app
mempalace mine ~/projects/myapp --limit 100
mempalace mine ~/projects/myapp --dry-run
mempalace mine ~/projects/myapp --no-gitignore
mempalace mine ~/projects/myapp --include-ignored path/to/file
mempalace mine ~/projects/myapp --redetect-origin
```

### Mine conversation exports

```bash
mempalace mine ~/.claude/projects/ --mode convos --wing my_project
mempalace mine ~/chatgpt-exports/ --mode convos
mempalace mine ~/chats/ --mode convos --extract general
```

The package README and module docs identify support for Claude Code JSONL, Claude.ai JSON, ChatGPT JSON, Slack JSON, and plain text normalization. `--extract` accepts `exchange` by default or `general` for the general extractor's memory types.

### Search memories

```bash
mempalace search "why did we switch to GraphQL"
mempalace search "pricing discussion" --wing my_app --room costs
mempalace search "auth decision" --results 10
```

Search uses semantic retrieval with BM25 keyword reranking in `searcher.py`. The direct drawer query always runs; closet hits add rank boosting when available and search falls back to drawer search if closet hits do not apply.

### Wake-up context

```bash
mempalace wake-up
mempalace wake-up --wing my_app
```

`mempalace/README.md` describes `layers.py` as a four-layer stack: L0 identity, L1 critical facts, L2 room recall, and L3 deep search. The CLI help describes `wake-up` as showing L0 + L1 context.

### Sweep transcripts for per-message recall

```bash
mempalace sweep <transcript-dir>
```

The README says `sweep` stores one verbatim drawer per user/assistant message, and is idempotent and resume-safe. It is intended as a periodic supplement for per-message recall on top of file-level chunks produced by hooks.

### Split transcript mega-files

```bash
mempalace split <dir>
mempalace split <dir> --output-dir <out-dir>
mempalace split <dir> --dry-run --min-sessions 2
```

The CLI describes this as a pre-mine helper for splitting concatenated transcript files into per-session files.

### Compression, repair, migration, and status

```bash
mempalace compress --wing my_app --dry-run
mempalace repair --mode legacy --yes
mempalace repair --mode max-seq-id --dry-run
mempalace repair-status
mempalace migrate --dry-run
mempalace status
mempalace --version
```

`compress` uses the AAAK dialect path. `repair` and `migrate` exist for palace/vector-index maintenance and ChromaDB migration paths. `repair-status` is read-only.

## MCP integration

The package exposes two console scripts:

```bash
mempalace
mempalace-mcp
```

Run the MCP server directly:

```bash
mempalace-mcp
```

Add it to Claude Code:

```bash
claude mcp add mempalace -- mempalace-mcp
```

The example docs list common MCP tools:

- `mempalace_status` — palace stats.
- `mempalace_search` — semantic search.
- `mempalace_list_wings` — list projects/wings.

The source `mcp_server.py` also defines tools for rooms/taxonomy, AAAK spec, knowledge graph query/add/invalidate/timeline/stats, palace graph traversal/tunnels, drawer CRUD/listing, agent diary read/write, hook settings, reconnect, and memory-filed-away confirmation.

### Gemini CLI MCP setup

The Gemini example uses a virtualenv Python path and registers the module form:

```bash
gemini mcp add mempalace /absolute/path/to/mempalace/.venv/bin/python3 -m mempalace.mcp_server --scope user
```

Verification commands from the same example:

```text
/mcp list
/hooks panel
```

## Auto-save hooks

The hooks tutorial documents two hook scripts:

- `mempal_save_hook.sh` — save hook, described as saving new facts and decisions every 15 messages.
- `mempal_precompact_hook.sh` — precompact hook, described as saving context before the AI memory window fills.

Claude Code setup example:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "/absolute/path/to/hooks/mempal_save_hook.sh",
          "timeout": 30
        }]
      }
    ],
    "PreCompact": [
      {
        "hooks": [{
          "type": "command",
          "command": "/absolute/path/to/hooks/mempal_precompact_hook.sh",
          "timeout": 30
        }]
      }
    ]
  }
}
```

Make hooks executable:

```bash
chmod +x /absolute/path/to/hooks/mempal_save_hook.sh
chmod +x /absolute/path/to/hooks/mempal_precompact_hook.sh
```

Gemini CLI pre-compress hook example:

```json
{
  "hooks": {
    "PreCompress": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/mempalace/hooks/mempal_precompact_hook.sh"
          }
        ]
      }
    ]
  }
}
```

Hook-related configuration documented in the tutorial/source:

- `SAVE_INTERVAL=15` — human-message interval between saves.
- `MEMPALACE_PYTHON` — Python interpreter override for hooks.
- `MEMPAL_DIR` — optional project directory for auto-ingest via `mempalace mine`.
- Config JSON `hooks.silent_save` defaults to `true`.
- Config JSON `hooks.desktop_toast` defaults to `false`.

## Configuration

`mempalace/config.py` states the configuration priority:

1. Environment variables.
2. Config file: `~/.mempalace/config.json`.
3. Defaults.

Default config written by `MempalaceConfig.init()`:

```json
{
  "palace_path": "~/.mempalace/palace",
  "collection_name": "mempalace_drawers",
  "topic_wings": [
    "emotions",
    "consciousness",
    "memory",
    "technical",
    "identity",
    "family",
    "creative"
  ],
  "hall_keywords": {
    "emotions": ["scared", "afraid", "worried", "happy", "sad", "love", "hate", "feel", "cry", "tears"],
    "consciousness": ["consciousness", "conscious", "aware", "real", "genuine", "soul", "exist", "alive"],
    "memory": ["memory", "remember", "forget", "recall", "archive", "palace", "store"],
    "technical": ["code", "python", "script", "bug", "error", "function", "api", "database", "server"],
    "identity": ["identity", "name", "who am i", "persona", "self"],
    "family": ["family", "kids", "children", "daughter", "son", "parent", "mother", "father"],
    "creative": ["game", "gameplay", "player", "app", "design", "art", "music", "story"]
  }
}
```

Environment variables evidenced in source:

| Variable | Purpose |
|---|---|
| `MEMPALACE_PALACE_PATH` | Override palace data directory. |
| `MEMPAL_PALACE_PATH` | Backward-compatible palace path override. |
| `MEMPALACE_ENTITY_LANGUAGES` | Comma-separated entity-detection languages. |
| `MEMPAL_ENTITY_LANGUAGES` | Backward-compatible entity-language override. |
| `MEMPALACE_EMBEDDING_DEVICE` | `auto`, `cpu`, `cuda`, `coreml`, or `dml`. |
| `MEMPALACE_TOPIC_TUNNEL_MIN_COUNT` | Minimum overlapping confirmed topics needed to create a cross-wing tunnel. |
| `MEMPALACE_BACKEND` | Backend selection in the registry resolution order. |
| `MEMPALACE_PYTHON` | Hook Python interpreter override. |
| `MEMPAL_DIR` | Optional hook auto-ingest directory. |
| `MEMPALACE_SOURCE_DIR` | Default source directory for `split_mega_files.py`. |

The global CLI flag `--palace` also routes commands to a specific palace path:

```bash
mempalace --palace /path/to/palace search "query"
```

## Extension points

### Storage backends

`pyproject.toml` registers the built-in backend entry point:

```toml
[project.entry-points."mempalace.backends"]
chroma = "mempalace.backends.chroma:ChromaBackend"
```

The backend registry documents third-party registration like:

```toml
[project.entry-points."mempalace.backends"]
postgres = "mempalace_postgres:PostgresBackend"
```

Backend selection order in `resolve_backend_for_palace()` is explicit kwarg/CLI flag, per-palace config value, `MEMPALACE_BACKEND`, on-disk artifact auto-detect, then default `chroma`.

### Source adapters

RFC 002 defines a source-adapter entry point group:

```toml
[project.entry-points."mempalace.sources"]
```

The RFC says third-party packages can ship as `mempalace-source-<name>` packages. The source adapter contract uses `BaseSourceAdapter.ingest(source=..., palace=...)`, `describe_schema()`, typed `SourceRef`, `SourceItemMetadata`, `DrawerRecord`, route hints, declared transformations, and privacy classes. The source code notes this is scaffolding and that first-party `miner.py` / `convo_miner.py` migration is follow-up work.

## Python API examples evidenced in source

Knowledge graph:

```python
from mempalace.knowledge_graph import KnowledgeGraph

kg = KnowledgeGraph()
kg.add_triple("Max", "child_of", "Alice", valid_from="2015-04-01")
kg.add_triple("Max", "does", "swimming", valid_from="2025-01-01")
kg.query_entity("Max")
kg.query_entity("Max", as_of="2026-01-15")
kg.invalidate("Max", "has_issue", "sports_injury", ended="2026-02-15")
```

LLM providers for init/refinement are implemented without external SDK dependencies and use stdlib `urllib`. Provider coverage in `llm_client.py`:

- `ollama` — default local provider at `http://localhost:11434`.
- `openai-compat` — OpenAI-compatible `/v1/chat/completions` endpoint.
- `anthropic` — official Messages API, opt-in.

## Quick-start recipes

### New project memory

```bash
pip install mempalace
mempalace init ~/projects/myapp --yes --auto-mine
mempalace search "why did we choose this approach" --wing myapp
mempalace wake-up --wing myapp
```

### Backfill Claude Code sessions

```bash
mempalace mine ~/.claude/projects/ --mode convos
mempalace sweep ~/.claude/projects/
```

### Claude Code MCP + hooks

```bash
claude mcp add mempalace -- mempalace-mcp
chmod +x /absolute/path/to/hooks/mempal_save_hook.sh
chmod +x /absolute/path/to/hooks/mempal_precompact_hook.sh
```

Then add the `Stop` and `PreCompact` hook JSON shown above to Claude Code settings.

### Local development check commands

The repo's `AGENTS.md` documents:

```bash
python -m pytest tests/ -v --ignore=tests/benchmarks
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing
ruff check .
ruff format .
ruff format --check .
```

## Source files used for this reference

- `README.md`
- `pyproject.toml`
- `mempalace/README.md`
- `mempalace/config.py`
- `mempalace/cli.py`
- `mempalace/searcher.py`
- `mempalace/miner.py`
- `mempalace/knowledge_graph.py`
- `mempalace/llm_client.py`
- `mempalace/backends/base.py`
- `mempalace/backends/registry.py`
- `mempalace/sources/base.py`
- `mempalace/mcp_server.py`
- `examples/basic_mining.py`
- `examples/convo_import.py`
- `examples/mcp_setup.md`
- `examples/gemini_cli_setup.md`
- `examples/HOOKS_TUTORIAL.md`
- `docs/CLOSETS.md`
- `docs/rfcs/002-source-adapter-plugin-spec.md`
