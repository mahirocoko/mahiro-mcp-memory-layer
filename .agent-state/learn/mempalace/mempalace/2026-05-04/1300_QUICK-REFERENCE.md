# MemPalace Quick Reference

Deep-learning quick reference for `mempalace/mempalace`, read from:

`/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

Written for `/learn --deep` hub linking. This guide distinguishes **Verified** facts from **Inferred** notes and cites repository paths for commands/configuration.

## What MemPalace does

**Verified:** MemPalace is a Python package and MCP server for local-first AI memory. It stores conversation/project content as verbatim text, retrieves it with semantic search, and organizes retrieval scope with a palace vocabulary: **wings** for people/projects/topics, **rooms** for topics or folder-derived areas, and **drawers** for original text chunks. It explicitly does not summarize, extract, or paraphrase user data in the core storage path. Sources: `README.md`, `AGENTS.md`, `website/concepts/the-palace.md`.

**Verified:** The default storage/retrieval backend is ChromaDB, exposed behind a pluggable backend interface. The package registers `chroma = "mempalace.backends.chroma:ChromaBackend"` under `mempalace.backends`, and backend resolution defaults to `chroma` after explicit/config/env/autodetect options. Sources: `pyproject.toml`, `mempalace/backends/registry.py`.

**Verified:** The package provides:

- CLI commands via `mempalace = "mempalace.cli:main"`.
- MCP server via `mempalace-mcp = "mempalace.mcp_server:main"`.
- Project-file mining, conversation mining, semantic search, wake-up context, AAAK compression, temporal knowledge graph, graph navigation/tunnels, auto-save hooks, Claude Code/Codex/Gemini integration docs, and Python APIs. Sources: `pyproject.toml`, `README.md`, `website/reference/cli.md`, `website/reference/mcp-tools.md`, `mempalace/README.md`.

**Verified:** Official sources warning: repository docs say only these are official: `https://github.com/MemPalace/mempalace`, PyPI package `mempalace`, and `https://mempalaceofficial.com`. The README warns that `mempalace.tech` is an impostor domain. Source: `README.md`.

## Requirements and package metadata

**Verified from `pyproject.toml`:**

- Package name: `mempalace`
- Version in source: `3.3.3`
- Python: `>=3.9`
- License: MIT
- Runtime dependencies:
  - `chromadb>=1.5.4,<2`
  - `pyyaml>=6.0,<7`
  - `tomli>=2.0.0` only for Python `<3.11`
- Optional extras:
  - `dev`: `pytest`, `pytest-cov`, `ruff`, `psutil`
  - `spellcheck`: `autocorrect>=2.0`
  - `gpu`: `onnxruntime-gpu>=1.16`
  - `dml`: `onnxruntime-directml>=1.16`
  - `coreml`: `onnxruntime>=1.16`

**Verified from `README.md`:** default embedding model disk expectation is about `~300 MB`; no API key is required for the core local benchmark path.

**Note:** `website/guide/getting-started.md` says `chromadb>=0.5.0` is installed automatically, while `pyproject.toml` currently requires `chromadb>=1.5.4,<2`. Prefer `pyproject.toml` when installing from this source tree.

## Installation and setup methods found

### 1. PyPI install

**Verified from `README.md` and `website/guide/getting-started.md`:**

```bash
pip install mempalace
mempalace init ~/projects/myapp
```

Minimal local workflow:

```bash
mempalace mine ~/projects/myapp
mempalace mine ~/.claude/projects/ --mode convos
mempalace search "why did we switch to GraphQL"
mempalace wake-up
```

### 2. Source/development install

**Verified from `README.md`, `CONTRIBUTING.md`, `benchmarks/README.md`, and `website/guide/getting-started.md`:**

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
pip install -e ".[dev]"
```

For a non-dev editable install, the Codex/Gemini docs show:

```bash
pip install -e .
```

### 3. Hardware-accelerated embeddings extras

**Verified from `pyproject.toml`:** install exactly one hardware extra, then set the device env var.

```bash
pip install mempalace[gpu]       # NVIDIA CUDA
pip install mempalace[dml]       # DirectML on Windows AMD/Intel/NVIDIA
pip install mempalace[coreml]    # macOS Neural Engine

export MEMPALACE_EMBEDDING_DEVICE=cuda   # or dml, coreml, auto, cpu
```

### 4. Claude Code marketplace plugin

**Verified from `website/guide/claude-code.md` and `.claude-plugin/README.md`:**

```bash
claude plugin marketplace add MemPalace/mempalace
claude plugin install --scope user mempalace
```

Then restart Claude Code and verify `/skills` includes `mempalace`. The plugin README also says to run:

```text
/mempalace:init
```

Available Claude plugin slash commands listed in `.claude-plugin/README.md`:

- `/mempalace:help`
- `/mempalace:init`
- `/mempalace:search`
- `/mempalace:mine`
- `/mempalace:status`

Local clone plugin install:

```bash
claude plugin add /path/to/mempalace
```

### 5. Manual Claude MCP setup

**Verified from `website/guide/mcp-integration.md` and `website/guide/claude-code.md`:**

```bash
claude mcp add mempalace -- python -m mempalace.mcp_server
```

With a custom palace path:

```bash
claude mcp add mempalace -- python -m mempalace.mcp_server --palace /path/to/palace
```

The CLI helper prints setup syntax for the installed console script:

```bash
mempalace mcp
mempalace mcp --palace ~/.custom-palace
```

Implementation output from `mempalace/cli.py` uses:

```bash
claude mcp add mempalace -- mempalace-mcp
mempalace-mcp
```

### 6. Gemini CLI setup

**Verified from `website/guide/gemini-cli.md`:**

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/python3 -m mempalace init .
```

Register MCP server with Gemini CLI:

```bash
gemini mcp add --scope user mempalace \
  -- /absolute/path/to/mempalace/.venv/bin/python -m mempalace.mcp_server
```

Gemini docs warn to use the absolute Python path and the `--` separator.

Enable Gemini auto-save by adding a `PreCompress` hook to `~/.gemini/settings.json`:

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

Make hooks executable:

```bash
chmod +x hooks/*.sh
```

Verify in Gemini CLI:

```text
/mcp list
/hooks panel
```

### 7. Codex CLI plugin

**Verified from `.codex-plugin/README.md`:** prerequisites are Python 3.9+, Codex CLI, and `pip install mempalace`.

Local project plugin copy:

```bash
cp -r .codex-plugin /path/to/your/project/.codex-plugin
codex --plugins
codex /init
```

Git/source install path:

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
pip install -e .
codex /init
```

Available Codex plugin skills listed:

- `/help`
- `/init`
- `/search`
- `/mine`
- `/status`

### 8. Auto-save hooks without plugin marketplace

**Verified from `website/guide/hooks.md`:** Claude Code settings example at `.claude/settings.local.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "/absolute/path/to/hooks/mempal_save_hook.sh",
        "timeout": 30
      }]
    }],
    "PreCompact": [{
      "hooks": [{
        "type": "command",
        "command": "/absolute/path/to/hooks/mempal_precompact_hook.sh",
        "timeout": 30
      }]
    }]
  }
}
```

Codex hook config at `.codex/hooks.json`:

```json
{
  "Stop": [{
    "type": "command",
    "command": "/absolute/path/to/hooks/mempal_save_hook.sh",
    "timeout": 30
  }],
  "PreCompact": [{
    "type": "command",
    "command": "/absolute/path/to/hooks/mempal_precompact_hook.sh",
    "timeout": 30
  }]
}
```

Make scripts executable:

```bash
chmod +x hooks/mempal_save_hook.sh hooks/mempal_precompact_hook.sh
```

### 9. Dev container

**Verified from `.devcontainer/devcontainer.json`:** the repo includes a Python 3.11 devcontainer with GitHub CLI and VS Code Python/debugpy/Ruff extensions. Post-create command: `bash .devcontainer/post-create.sh`.

## Common CLI commands

Global options from `mempalace/cli.py`:

```bash
mempalace --version
mempalace --palace /path/to/palace <command>
```

All commands use `--palace` to override the default palace location.

### Initialize

```bash
mempalace init <dir>
mempalace init <dir> --yes
mempalace init <dir> --yes --auto-mine
mempalace init . --lang en,pt-br
mempalace init . --no-llm
mempalace init . --llm-provider ollama --llm-model gemma4:e4b
mempalace init . --llm-provider openai-compat --llm-endpoint http://localhost:1234/v1 --llm-api-key <key>
mempalace init . --llm-provider anthropic --llm-api-key <key> --accept-external-llm
```

**Verified behavior:** `init` scans a required project directory, detects people/projects/topics, writes per-project `entities.json`, detects rooms and writes `mempalace.yaml`, ensures global `~/.mempalace/`, adds `mempalace.yaml` and `entities.json` to `.gitignore` when initializing a git repo, and prompts to mine unless `--auto-mine` is supplied. LLM-assisted entity refinement is on by default; `--no-llm` opts out. Source: `mempalace/cli.py`.

### Mine

```bash
mempalace mine <dir>
mempalace mine <dir> --mode projects
mempalace mine <dir> --mode convos
mempalace mine <dir> --mode convos --extract general
mempalace mine <dir> --wing myapp
mempalace mine <dir> --agent reviewer
mempalace mine <dir> --limit 100
mempalace mine <dir> --dry-run
mempalace mine <dir> --no-gitignore
mempalace mine <dir> --include-ignored dist,build
mempalace mine <dir> --redetect-origin
```

**Verified behavior:** default `projects` mode scans code/docs/notes and respects `.gitignore`; `convos` mode supports conversation exports and chunks by exchange pair; `--extract general` classifies conversation memories as decisions, preferences, milestones, problems, and emotional context. Sources: `website/guide/mining.md`, `mempalace/cli.py`.

### Sweep transcripts at message granularity

```bash
mempalace sweep <transcript.jsonl>
mempalace sweep <transcript-dir>
```

**Verified behavior:** `sweep` is a tandem miner for `.jsonl` transcript files or directories, message-level, timestamp-coordinated, idempotent. Source: `mempalace/cli.py`; README recommends `mempalace sweep <transcript-dir>` for per-message recall.

### Search

```bash
mempalace search "query"
mempalace search "query" --wing myapp
mempalace search "query" --wing myapp --room auth
mempalace search "query" --results 10
```

### Wake-up context

```bash
mempalace wake-up
mempalace wake-up --wing driftwood
mempalace wake-up > context.txt
mempalace wake-up --wing driftwood > context.txt
```

**Verified behavior:** prints L0 + L1 wake-up context, typically documented as about `~600-900 tokens` in the current implementation. Sources: `website/reference/cli.md`, `website/concepts/memory-stack.md`, `website/guide/local-models.md`.

### Split mega transcript files

```bash
mempalace split <dir>
mempalace split <dir> --dry-run
mempalace split <dir> --min-sessions 3
mempalace split <dir> --output-dir ~/split-output/
```

Docs recommend running `mempalace split` before mining conversation files; it is a no-op if files do not need splitting. Source: `website/guide/mining.md`.

### Compress with AAAK

```bash
mempalace compress --wing myapp
mempalace compress --wing myapp --dry-run
mempalace compress --config entities.json
```

### Status, repair, migration, MCP, hooks, instructions

```bash
mempalace status
mempalace repair
mempalace repair --yes
mempalace repair --mode max-seq-id --dry-run
mempalace repair-status
mempalace migrate --dry-run
mempalace migrate --yes
mempalace mcp
mempalace mcp --palace ~/.custom-palace
mempalace hook run --hook stop --harness claude-code
mempalace hook run --hook precompact --harness claude-code
mempalace hook run --hook session-start --harness codex
mempalace instructions init
mempalace instructions search
mempalace instructions mine
mempalace instructions help
mempalace instructions status
```

**Verified repair behavior:** legacy `repair` rebuilds the palace vector index and creates a backup at `<palace_path>.backup` before rebuilding. Source: `website/reference/cli.md`, `mempalace/cli.py`.

## Configuration reference

### Global config

**Verified from `website/guide/configuration.md` and `mempalace/config.py`:** default config directory is `~/.mempalace`. Main config file is `~/.mempalace/config.json`.

Example documented config:

```json
{
  "palace_path": "/custom/path/to/palace",
  "collection_name": "mempalace_drawers",
  "people_map": {"Kai": "KAI", "Priya": "PRI"}
}
```

Defaults from `mempalace/config.py`:

```json
{
  "palace_path": "~/.mempalace/palace",
  "collection_name": "mempalace_drawers",
  "topic_wings": ["emotions", "consciousness", "memory", "technical", "identity", "family", "creative"],
  "hall_keywords": {"...": "keyword lists"}
}
```

Config file permissions are restricted to owner read/write where supported; `~/.mempalace` is restricted to owner-only permissions where supported. Source: `mempalace/config.py`.

### Project config files

Generated by `mempalace init` in the target project directory:

- `<project>/mempalace.yaml`
- `<project>/entities.json`

Documented `mempalace.yaml` example:

```yaml
wing: myproject
rooms:
  - backend
  - frontend
  - decisions
palace_path: ~/.mempalace/palace
```

Documented `entities.json` example:

```json
{
  "Kai": "KAI",
  "Priya": "PRI"
}
```

**Verified implementation note:** in git repos, `mempalace init` ensures `mempalace.yaml` and `entities.json` are added to `.gitignore` to avoid accidental commits. Source: `mempalace/cli.py`.

### Identity file

**Verified:** `~/.mempalace/identity.txt` is a plain text identity file loaded as Layer 0 wake-up context. Source: `website/guide/configuration.md`, `website/concepts/memory-stack.md`.

Example:

```text
I am Atlas, a personal AI assistant for Alice.
Traits: warm, direct, remembers everything.
People: Alice (creator), Bob (Alice's partner).
Project: A journaling app that helps people process emotions.
```

### Environment variables

**Verified from docs and code:**

| Variable | Meaning |
|---|---|
| `MEMPALACE_PALACE_PATH` | Override palace path; same purpose as `--palace`. |
| `MEMPAL_PALACE_PATH` | Back-compat palace path env var accepted by code. |
| `MEMPALACE_ENTITY_LANGUAGES` | Comma-separated entity detection language list. |
| `MEMPAL_ENTITY_LANGUAGES` | Back-compat entity language env var accepted by code. |
| `MEMPALACE_EMBEDDING_DEVICE` | Embedding hardware device: `auto`, `cpu`, `cuda`, `coreml`, or `dml`. |
| `MEMPALACE_TOPIC_TUNNEL_MIN_COUNT` | Minimum overlapping confirmed topics needed to create a cross-wing tunnel. |
| `MEMPALACE_BACKEND` | Backend selection after explicit/config values and before autodetect/default. |
| `MEMPAL_DIR` | Directory for hooks to auto-mine during save triggers. |
| `MEMPALACE_PYTHON` | Hook helper Python executable override. |
| `MEMPALACE_SOURCE_DIR` | Default source directory for split/transcript tooling. |
| `ANTHROPIC_API_KEY` | Default API key source for `--llm-provider anthropic`. |
| `OPENAI_API_KEY` | Default API key source for `--llm-provider openai-compat`. |

### Hook settings

**Verified from `website/reference/mcp-tools.md` and `mempalace/config.py`:** hook behavior can be read/updated through MCP tool `mempalace_hook_settings` and stored under `hooks` in config. Code defaults:

```json
{
  "hooks": {
    "silent_save": true,
    "desktop_toast": false
  }
}
```

Shell hook script settings from `website/guide/hooks.md`:

- `SAVE_INTERVAL=15` — messages between saves.
- `STATE_DIR` — hook state directory, default `~/.mempalace/hook_state/`.
- `MEMPAL_DIR` — optional directory for auto-mining on save trigger.

Debug hook logs:

```bash
cat ~/.mempalace/hook_state/hook.log
```

## Key features with examples

### Verbatim local memory

**Verified:** MemPalace stores exact user/project/conversation text and returns original words. Nothing leaves the machine unless explicitly configured. Core workflow requires no API key. Sources: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`.

### Palace scoping

**Verified:** Wings and rooms are metadata filters over the underlying vector store, useful for predictable scoping across many projects/people. Source: `website/concepts/the-palace.md`.

```bash
mempalace search "database decision" --wing orion
mempalace search "auth migration" --wing driftwood --room auth
```

### Mining projects and conversations

**Verified:** Projects mode scans code/docs/notes; conversations mode supports Claude JSON exports, ChatGPT exports, Slack exports, Markdown conversations, and plain text transcripts. Source: `website/guide/mining.md`.

```bash
mempalace mine ~/projects/myapp
mempalace mine ~/chats/ --mode convos
mempalace mine ~/chats/ --mode convos --extract general
```

### Wake-up memory stack

**Verified:** Memory stack uses L0 identity, L1 essential story, L2 on-demand room recall, and L3 deep semantic search. Source: `website/concepts/memory-stack.md`.

```python
from mempalace.layers import MemoryStack

stack = MemoryStack()
print(stack.wake_up())
print(stack.recall(wing="myapp"))
print(stack.search("pricing change"))
print(stack.status())
```

### MCP tool surface

**Verified from `website/reference/mcp-tools.md`:** docs list detailed schemas for 29 MCP tools across read/write palace operations, drawers, knowledge graph, navigation/tunnels, agent diary, and system tools.

Read/search examples:

```text
mempalace_status
mempalace_list_wings
mempalace_list_rooms
mempalace_get_taxonomy
mempalace_search({"query": "auth decisions", "wing": "myapp", "limit": 5})
mempalace_get_drawer({"drawer_id": "..."})
```

Write examples:

```text
mempalace_add_drawer({"wing": "myapp", "room": "auth", "content": "verbatim text"})
mempalace_update_drawer({"drawer_id": "...", "room": "decisions"})
mempalace_delete_drawer({"drawer_id": "..."})
```

Knowledge graph examples:

```text
mempalace_kg_add({"subject": "Kai", "predicate": "works_on", "object": "Orion"})
mempalace_kg_query({"entity": "Kai", "as_of": "2026-01-15"})
mempalace_kg_invalidate({"subject": "Kai", "predicate": "works_on", "object": "Orion", "ended": "2026-03-01"})
mempalace_kg_timeline({"entity": "Orion"})
```

Navigation/tunnels examples:

```text
mempalace_traverse({"start_room": "auth-migration", "max_hops": 2})
mempalace_find_tunnels({"wing_a": "wing_code", "wing_b": "wing_team"})
mempalace_create_tunnel({"source_wing": "api", "source_room": "auth", "target_wing": "db", "target_room": "schema"})
```

Agent diary examples:

```text
mempalace_diary_write({"agent_name": "reviewer", "entry": "PR#42|auth.bypass.found", "topic": "security"})
mempalace_diary_read({"agent_name": "reviewer", "last_n": 10})
```

**Docs discrepancy:** `.claude-plugin/README.md` and `.codex-plugin/README.md` still say 19 MCP tools, while `README.md`, `website/guide/mcp-integration.md`, and `website/reference/mcp-tools.md` say 29 tools. Treat 29 as the current website/reference count and 19 as stale plugin README wording unless implementation verification says otherwise.

### Python API

**Verified from `website/reference/python-api.md`:**

```python
from mempalace.searcher import search_memories

results = search_memories(
    query="why did we switch to GraphQL",
    wing="myapp",
    room="architecture",
    n_results=5,
)
```

```python
from mempalace.knowledge_graph import KnowledgeGraph

kg = KnowledgeGraph()
kg.add_entity("Kai", entity_type="person")
kg.add_triple("Kai", "works_on", "Orion", valid_from="2025-06-01")
kg.invalidate("Kai", "works_on", "Orion", ended="2026-03-01")
facts = kg.query_entity("Kai", as_of="2026-01-15", direction="both")
timeline = kg.timeline("Orion")
```

```python
from mempalace.config import MempalaceConfig

config = MempalaceConfig()
print(config.palace_path)
print(config.collection_name)
```

### Local/offline model workflow

**Verified from `website/guide/local-models.md`:** local models can use CLI-generated context/search files.

```bash
mempalace wake-up > context.txt
mempalace search "auth decisions" > results.txt
```

Then paste or inject those files into the model prompt. The offline stack is documented as ChromaDB + local model + optional AAAK; optional reranking/external integrations may introduce cloud calls depending on configuration.

### Benchmarks and reproduction

**Verified from `README.md` and `benchmarks/README.md`:** headline public result is raw LongMemEval R@5 `96.6%` with no LLM/API key; hybrid held-out figure in README is `98.4%`; other README benchmark figures include LoCoMo top-10 `60.3%` raw/session and `88.9%` hybrid, ConvoMem average recall `92.9%`, MemBench R@5 `80.3%`.

Reproduce LongMemEval raw:

```bash
git clone https://github.com/MemPalace/mempalace.git
cd mempalace
pip install -e ".[dev]"
mkdir -p /tmp/longmemeval-data
curl -fsSL -o /tmp/longmemeval-data/longmemeval_s_cleaned.json \
  https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
python benchmarks/longmemeval_bench.py /tmp/longmemeval-data/longmemeval_s_cleaned.json
python benchmarks/longmemeval_bench.py /tmp/longmemeval-data/longmemeval_s_cleaned.json --limit 20
```

Other documented benchmark commands:

```bash
git clone https://github.com/snap-research/locomo.git /tmp/locomo
python benchmarks/locomo_bench.py /tmp/locomo/data/locomo10.json --granularity session
python benchmarks/locomo_bench.py /tmp/locomo/data/locomo10.json --top-k 50
python benchmarks/convomem_bench.py --category all --limit 50
python benchmarks/convomem_bench.py --category user_evidence --limit 10
```

## Development and contribution commands

**Verified from `AGENTS.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `.pre-commit-config.yaml`, and `pyproject.toml`:**

Install dev dependencies:

```bash
pip install -e ".[dev]"
```

Run tests:

```bash
pytest tests/ -v
python -m pytest tests/ -v --ignore=tests/benchmarks
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing
```

CI test shape:

```bash
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing --cov-fail-under=80 --durations=10
```

Lint/format:

```bash
ruff check .
ruff format .
ruff format --check .
```

Pre-commit uses Ruff hook rev `v0.4.10` with `ruff --fix` and `ruff-format`.

Ruff config from `pyproject.toml`:

- line length `100`
- target Python `py39`
- lint select `E`, `F`, `W`, `C901`
- ignore `E501`
- max complexity `25`
- format quote style `double`

Test config from `pyproject.toml`:

- testpaths: `tests`
- pythonpath: `.`
- default addopts exclude `benchmark`, `slow`, and `stress`
- coverage fail-under in `pyproject.toml`: `85`; CI explicitly uses `--cov-fail-under=80`.

Contribution workflow from `CONTRIBUTING.md`:

```bash
git clone https://github.com/<your-username>/mempalace.git
cd mempalace
git remote add upstream https://github.com/MemPalace/mempalace.git
pip install -e ".[dev]"
pytest tests/ -v
git checkout -b feat/my-thing
```

Commit style examples in docs:

- `feat: add Notion export format`
- `fix: handle empty transcript files`
- `docs: update MCP tool descriptions`
- `bench: add LoCoMo turn-level metrics`

## Module map for onboarding

**Verified from `mempalace/README.md` and `AGENTS.md`:**

| Path | Purpose |
|---|---|
| `mempalace/cli.py` | CLI entry point and dispatcher. |
| `mempalace/mcp_server.py` | MCP server and tool handlers. |
| `mempalace/config.py` | Config loading, env vars, defaults, validation. |
| `mempalace/miner.py` | Project file mining. |
| `mempalace/convo_miner.py` | Conversation transcript mining. |
| `mempalace/searcher.py` | Semantic search and filters. |
| `mempalace/layers.py` | L0-L3 memory stack and wake-up. |
| `mempalace/dialect.py` | AAAK compression dialect. |
| `mempalace/knowledge_graph.py` | Temporal entity relationship graph backed by SQLite. |
| `mempalace/palace_graph.py` | Room traversal and cross-wing tunnels. |
| `mempalace/backends/base.py` | Storage backend interface. |
| `mempalace/backends/chroma.py` | ChromaDB backend. |
| `mempalace/normalize.py` | Transcript format detection/normalization. |
| `mempalace/entity_detector.py` | Person/project/entity detection. |
| `mempalace/entity_registry.py` | Entity storage/disambiguation. |
| `mempalace/onboarding.py` | Guided first-run setup. |
| `mempalace/repair.py` | Palace repair and consistency checks. |
| `mempalace/dedup.py` | Deduplication utilities. |
| `mempalace/migrate.py` | ChromaDB version migration. |
| `mempalace/spellcheck.py` | Optional name-aware spellcheck. |
| `mempalace/exporter.py` | Palace export. |
| `mempalace/hooks_cli.py` | Hook runtime CLI logic. |
| `mempalace/query_sanitizer.py` | Prompt contamination prevention. |
| `mempalace/split_mega_files.py` | Split concatenated transcript files. |
| `hooks/mempal_save_hook.sh` | Stop hook save trigger. |
| `hooks/mempal_precompact_hook.sh` | PreCompact/PreCompress save trigger. |

Common task routing from `AGENTS.md`:

- Add an MCP tool: edit `mempalace/mcp_server.py` and the tools registry.
- Change search: inspect `mempalace/searcher.py`.
- Modify mining: inspect `mempalace/miner.py` or `mempalace/convo_miner.py`.
- Add a storage backend: subclass `mempalace/backends/base.py`, register in `mempalace/backends/__init__.py` / entry points.
- Input validation: inspect `mempalace/config.py` sanitizers.
- Tests: mirror source structure as `tests/test_<module>.py`.

## Practical onboarding notes

1. Start with the safe user path: `pip install mempalace`, then `mempalace init <project>`, then `mempalace mine <project>`, then `mempalace search "..."`.
2. For conversations, run `mempalace split <dir> --dry-run` before `mempalace mine <dir> --mode convos`.
3. Use `--wing` aggressively for multi-project corpora; docs emphasize wing/room filters as the predictable way to avoid unrelated memories.
4. For MCP clients, run `mempalace mcp` first because it prints the environment-specific setup command.
5. For Claude Code, the marketplace plugin is documented as the recommended path because it handles MCP server lifecycle automatically.
6. For local models without MCP, redirect `mempalace wake-up` and `mempalace search` output to text files and inject manually.
7. Do not claim the palace hierarchy is a novel retrieval algorithm; docs explicitly say it is metadata filtering/scoping over the vector store.
8. Treat external LLM configuration as opt-in and potentially privacy-sensitive. `init` defaults to local Ollama refinement if available, falls back gracefully, and warns/consents when configured external endpoints/API keys may send folder content out.
9. The core design constraint is verbatim/local-first storage. Contribution docs say not to add cloud sync, telemetry, API-key-required core memory, or summarization of user content.
10. Check `docs/HISTORY.md` before publishing links because the README contains scam-domain/corrections context.

## Evidence coverage

Files read or searched for this guide included:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `pyproject.toml`
- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml`
- `.devcontainer/devcontainer.json`
- `.claude-plugin/README.md`
- `.codex-plugin/README.md`
- `mempalace/README.md`
- `mempalace/cli.py`
- `mempalace/config.py`
- `mempalace/backends/registry.py`
- `website/guide/getting-started.md`
- `website/guide/configuration.md`
- `website/guide/mining.md`
- `website/guide/mcp-integration.md`
- `website/guide/claude-code.md`
- `website/guide/gemini-cli.md`
- `website/guide/hooks.md`
- `website/guide/local-models.md`
- `website/reference/cli.md`
- `website/reference/mcp-tools.md`
- `website/reference/python-api.md`
- `website/reference/contributing.md`
- `website/concepts/the-palace.md`
- `website/concepts/memory-stack.md`
- `benchmarks/README.md`
- `benchmarks/BENCHMARKS.md`

No source files under `origin/` were modified for this output.
