# MemPalace Testing & Quality Patterns

Source inspected: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

## Executive summary

MemPalace has a substantial Python `pytest` suite: 64 top-level `tests/test_*.py` modules plus 9 benchmark modules under `tests/benchmarks/`. The default test profile deliberately excludes benchmark, slow, and stress tests through `pyproject.toml`, while CI runs the non-benchmark suite on Linux, Windows, and macOS with coverage and a separate Ruff lint/format job. The quality posture is strongest around regression tests, filesystem isolation, ChromaDB/SQLite integration behavior, CLI/MCP dispatch, docs-vs-code consistency, and version consistency. Benchmark/scale tests are present and documented, but they are opt-in and not wired into the checked `.github/workflows/ci.yml` despite `tests/benchmarks/README.md` describing a PR benchmark job.

## Test structure and conventions

### Main pytest suite

- Main test root: `tests/`
- Pytest discovery is configured in `pyproject.toml`:
  - `testpaths = ["tests"]`
  - `pythonpath = ["."]`
  - `addopts = "-m 'not benchmark and not slow and not stress'"`
- File convention: `tests/test_*.py` mirrors package modules and product surfaces.
- Observed count: 64 top-level `tests/test_*.py` files, excluding benchmark modules.

Representative modules:

- `tests/test_mcp_server.py` — direct tests for MCP protocol handling, tool listing, tool dispatch, and tool handlers. It mixes unit-level calls such as `handle_request(...)` with integration-like ChromaDB collection setup.
- `tests/test_cli.py` — command dispatcher tests for `cmd_status`, `cmd_search`, `cmd_init`, `cmd_mine`, hook commands, and failure/exit behavior.
- `tests/test_llm_client.py` — provider factory and HTTP wrapper tests where all network calls are mocked.
- `tests/test_readme_claims.py` — executable documentation-contract tests that parse `README.md`, website docs, and source code to make sure public claims match shipped tools/features.
- `tests/test_version_consistency.py` — verifies package `__version__`, `pyproject.toml`, and MCP initialize output stay aligned.
- `tests/test_claude_plugin_hook_wrappers.py` and `tests/test_mcp_stdio_protection.py` — subprocess-level smoke/regression tests for shell wrappers and stdio behavior.

Style conventions visible in tests:

- Plain pytest functions and occasional `class Test...` groupings.
- Regression-focused docstrings/comments frequently cite issue numbers, e.g. `test_mcp_server.py` has “Regression for #394”-style coverage around protocol behavior.
- Assertions are direct `assert` statements, plus `pytest.raises(...)` for error paths.
- Tests favor small helpers in the test module when a fixture would be too broad, e.g. `_patch_mcp_server(...)` and `_get_collection(...)` in `tests/test_mcp_server.py`.

### Benchmark pytest suite

- Benchmark root: `tests/benchmarks/`
- Benchmark modules observed: 9 `test_*.py` files:
  - `tests/benchmarks/test_chromadb_stress.py`
  - `tests/benchmarks/test_ingest_bench.py`
  - `tests/benchmarks/test_knowledge_graph_bench.py`
  - `tests/benchmarks/test_layers_bench.py`
  - `tests/benchmarks/test_mcp_bench.py`
  - `tests/benchmarks/test_memory_profile.py`
  - `tests/benchmarks/test_palace_boost.py`
  - `tests/benchmarks/test_recall_threshold.py`
  - `tests/benchmarks/test_search_bench.py`
- `tests/benchmarks/README.md` says this suite contains 106 scale/performance tests.
- Markers in `pyproject.toml`:
  - `benchmark: scale/performance benchmark tests`
  - `slow: tests that take more than 30 seconds`
  - `stress: destructive scale tests (100K+ drawers)`
- Read-only count pass found 37 textual `@pytest.mark.benchmark` uses, 1 `@pytest.mark.slow` use, and no textual `@pytest.mark.stress` decorators in Python files. `stress` is still configured as a valid marker and documented for local stress runs.

Benchmark docs divide modules into:

- Critical path: `test_mcp_bench.py`, `test_chromadb_stress.py`, `test_memory_profile.py`
- Performance baselines: `test_ingest_bench.py`, `test_search_bench.py`
- Architectural validation: `test_palace_boost.py`, `test_recall_threshold.py`, `test_knowledge_graph_bench.py`, `test_layers_bench.py`

## Shared fixtures, helpers, and isolation

### Global test isolation

`tests/conftest.py` is the central safety fixture. It redirects user-profile environment variables before importing MemPalace modules:

```python
_session_tmp = tempfile.mkdtemp(prefix="mempalace_session_")
os.environ["HOME"] = _session_tmp
os.environ["USERPROFILE"] = _session_tmp
os.environ["HOMEDRIVE"] = os.path.splitdrive(_session_tmp)[0] or "C:"
os.environ["HOMEPATH"] = os.path.splitdrive(_session_tmp)[1] or _session_tmp
```

This is important because modules such as `mempalace.mcp_server` can initialize global storage objects at import time. The fixture docstring explicitly says tests should never touch the real user profile.

Important shared fixtures:

- `_reset_mcp_cache` autouse fixture resets `mempalace.mcp_server._client_cache`, `_collection_cache`, and `ChromaBackend._quarantined_paths` before and after tests.
- `_isolate_home` session autouse fixture restores original profile env vars and deletes the session temp dir at teardown.
- `tmp_dir` creates a `tempfile.mkdtemp(prefix="mempalace_test_")` directory and removes it after the test.
- `palace_path` creates an empty palace directory under `tmp_dir`.
- `config` writes a temporary `config.json` and returns `MempalaceConfig(config_dir=...)`.
- `collection` creates a ChromaDB `PersistentClient(path=palace_path)` collection named `mempalace_drawers` with `metadata={"hnsw:space": "cosine"}` and deletes it afterward.
- `seeded_collection` inserts four representative drawers across project/notes wings and backend/frontend/planning rooms.
- `kg` creates an isolated SQLite-backed `KnowledgeGraph` at `tmp_dir/test_kg.sqlite3` and closes it after use.
- `seeded_kg` inserts sample people, activities, and temporal relationships.

### Benchmark helpers

`tests/benchmarks/conftest.py` adds benchmark-specific pytest CLI options:

- `--bench-scale` with choices `small`, `medium`, `large`, `stress`.
- `--bench-report` for JSON output.

It also defines fixtures for isolated benchmark paths (`palace_dir`, `kg_db`, `config_dir`, `project_dir`) and a `pytest_terminal_summary` hook that writes a JSON report containing timestamp, git SHA, Python version, ChromaDB version, OS/CPU metadata, scale, and collected results.

`tests/benchmarks/data_generator.py` is the main deterministic data factory:

- `PalaceDataGenerator(seed=42, scale="small")` uses seeded RNG.
- Scale levels are explicit: small = 1,000 drawers, medium = 10,000, large = 50,000, stress = 100,000.
- It generates project trees, direct ChromaDB population data, KG triples, search queries, and planted “needle” documents for recall measurement without an LLM judge.

`tests/benchmarks/report.py` provides:

- `record_metric(category, metric, value)` — appends JSON metrics to `tempfile.gettempdir()/mempalace_bench_results.json`.
- `check_regression(current_report, baseline_report, threshold=0.2)` — classifies metric direction by name and flags >20% regressions for latency/memory/error metrics or drops in recall/throughput/speedup metrics.

## Mocking patterns

Mocking is extensive but mostly local and explicit.

### `unittest.mock.patch` and `MagicMock`

The suite uses `unittest.mock` heavily. A read-only count pass across `tests/**/*.py` found 522 textual `patch(` uses and 156 `MagicMock` mentions.

Examples:

- `tests/test_cli.py` patches `mempalace.cli.MempalaceConfig`, `mempalace.searcher.search`, `mempalace.entity_detector.*`, `mempalace.room_detector_local.detect_rooms_local`, `mempalace.miner.mine`, `builtins.input`, and other command dependencies. This lets CLI tests assert dispatch arguments without running full mining/search pipelines.
- `tests/test_llm_client.py` patches `mempalace.llm_client.urlopen` and returns fake response objects with `read`, `__enter__`, and `__exit__`. The module header states: “HTTP is mocked throughout — these tests do not require a running Ollama or network access.”
- `tests/test_palace_graph.py` uses `MagicMock` collections and `patch.dict("sys.modules", {"chromadb": MagicMock()})` for import/storage behavior.
- `tests/test_readme_claims.py` intentionally avoids importing `mcp_server` for tool-list validation because import can touch ChromaDB; it parses source text instead.

### `monkeypatch` and environment control

The suite uses pytest `monkeypatch` frequently; the count pass found 376 textual mentions. Common uses include:

- Patching module globals such as `_config` and `_kg` in `mempalace.mcp_server` (`tests/test_mcp_server.py`).
- Setting and deleting `MEMPALACE_PALACE_PATH` / `MEMPAL_PALACE_PATH` in CLI tests to ensure `--palace` handling does not leak between tests.
- Simulating unavailable interpreters, PATH entries, and environment variables in hook wrapper tests.

### Subprocess tests

Most tests stay in-process, but selected tests use real subprocesses where process boundaries matter:

- `tests/test_claude_plugin_hook_wrappers.py` creates temporary executable stubs under `tmp_path`, manipulates PATH, and runs hook wrapper scripts through `subprocess.run(...)`.
- `tests/test_mcp_stdio_protection.py` uses subprocess execution to verify MCP stdio behavior and protect against stdout contamination.

## Coverage approach

Coverage is configured in `pyproject.toml`:

```toml
[tool.coverage.run]
source = ["mempalace"]

[tool.coverage.report]
fail_under = 85
show_missing = true
exclude_lines = [
    "if __name__",
    "pragma: no cover",
]
```

Local docs (`CLAUDE.md`) recommend:

```bash
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing
```

CI currently enforces a lower explicit threshold:

```bash
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing --cov-fail-under=80 --durations=10
```

So there is a small mismatch: `pyproject.toml` says `fail_under = 85`, but `.github/workflows/ci.yml` passes `--cov-fail-under=80`. The in-repo `AGENTS.md`/`CLAUDE.md` note explains this as “85% threshold (80% on Windows due to ChromaDB file lock cleanup).” In practice the same 80% override is used on Linux, Windows, and macOS in the inspected CI workflow.

Coverage culture is visible in changelog/history rather than just config: `CHANGELOG.md` records prior expansion “from 30% to 85%,” added coverage for mine locks, closets, entity metadata, BM25, diary, and cross-wing tunnel operations. `CONTRIBUTING.md` specifically calls out increasing coverage for `knowledge_graph.py` and `palace_graph.py` as good first issues.

Limitations/gaps noted from file evidence:

- `docs/rfcs/002-source-adapter-plugin-spec.md` states no existing `tests/` coverage currently asserts byte-preservation or declared-transformation correctness for source adapters; that RFC proposes a future conformance suite.
- Benchmarks are present but excluded from default pytest and CI unit-test commands.
- Website docs have a build workflow, but no website test suite was found in `website/package.json`; only `docs:dev`, `docs:build`, and `docs:preview` scripts are defined.

## CI and quality tooling

### Python CI

`.github/workflows/ci.yml` defines the main test/lint workflow:

- Triggers on push and pull request to `main` and `develop`.
- Linux matrix tests Python `3.9`, `3.11`, and `3.13`.
- Windows tests Python `3.13`.
- macOS tests Python `3.13`.
- Each test job runs `pip install -e ".[dev]"` and then pytest with coverage, benchmark exclusion, and `--durations=10`.
- Separate `lint` job installs `ruff>=0.4.0,<0.5`, then runs:
  - `ruff check .`
  - `ruff format --check .`

### Version guard

`.github/workflows/version-guard.yml` runs on version-related PR paths and stable tag pushes. It extracts versions from:

- `mempalace/version.py`
- `pyproject.toml`
- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`

It fails if manifests disagree, and on stable tag pushes it also verifies `vX.Y.Z` matches the manifest version. The test suite has a smaller local counterpart in `tests/test_version_consistency.py`.

### Pre-commit

`.pre-commit-config.yaml` uses `astral-sh/ruff-pre-commit` at `v0.4.10` with:

- `ruff --fix`
- `ruff-format`

The file explicitly says this should stay in lock-step with the CI Ruff pin (`>=0.4.0,<0.5`) because newer formatter output can break `ruff format --check` in CI.

### Ruff configuration

`pyproject.toml` configures:

- `line-length = 100`
- `target-version = "py39"`
- `extend-exclude = ["benchmarks"]`
- lint select: `E`, `F`, `W`, `C901`
- ignore: `E501`
- McCabe `max-complexity = 25`
- formatter `quote-style = "double"`

### Docs workflow

`.github/workflows/deploy-docs.yml` builds the VitePress website on pushes to `develop` that affect `website/**` or the docs workflow. It uses Bun `1.1.38`, runs `bun install --frozen-lockfile` in `website`, then `bun run docs:build`, uploads the Pages artifact, and deploys to GitHub Pages. This is a build/deploy quality gate for docs, not a test runner.

### Dependabot

`.github/dependabot.yml` schedules weekly updates for:

- `pip` at repository root.
- GitHub Actions at repository root.

## Commands for verification

Installed dev dependencies are declared in both `[project.optional-dependencies].dev` and `[dependency-groups].dev`:

```toml
dev = ["pytest>=7.0", "pytest-cov>=4.0", "ruff>=0.4.0", "psutil>=5.9"]
```

Common commands verified from repo files:

```bash
# install dev dependencies
pip install -e ".[dev]"

# default non-benchmark suite; pyproject filters out benchmark/slow/stress
pytest tests/ -v

# CI-equivalent non-benchmark suite with coverage
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing --cov-fail-under=80 --durations=10

# stricter local coverage command from CLAUDE.md, using pyproject's 85% report threshold unless overridden
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing

# lint and format check
ruff check .
ruff format --check .

# apply formatting locally
ruff format .
```

Benchmark commands from `tests/benchmarks/README.md`:

```bash
# fast scale smoke test
uv run pytest tests/benchmarks/ -v --bench-scale=small -m "benchmark and not slow"

# full small-scale benchmark suite
uv run pytest tests/benchmarks/ -v --bench-scale=small

# medium scale with JSON report
uv run pytest tests/benchmarks/ -v --bench-scale=medium --bench-report=results.json

# stress test, local only and very slow
uv run pytest tests/benchmarks/ -v --bench-scale=stress -m stress
```

Docs build command from `website/package.json` and `.github/workflows/deploy-docs.yml`:

```bash
cd website
bun install --frozen-lockfile
bun run docs:build
```

## Notable quality signals

- Tests are strongly isolated from real user data via temp HOME/USERPROFILE setup before package imports.
- Storage behavior is tested against real temporary ChromaDB and SQLite resources rather than only mocks.
- External network/LLM provider behavior is mocked by default; `CONTRIBUTING.md` says tests should run without API keys or network access.
- Documentation claims are treated as testable contracts in `tests/test_readme_claims.py`.
- Version consistency is guarded both by pytest and GitHub Actions.
- Performance and scale behavior have a dedicated pytest benchmark suite with deterministic data generation and JSON regression helpers.

## Notable limitations / mismatches

- Benchmarks are opt-in and excluded from default pytest and main CI test jobs.
- `tests/benchmarks/README.md` says GitHub Actions runs benchmarks on PRs, but the inspected `.github/workflows/ci.yml` has no benchmark job; only unit tests and lint are present.
- `pyproject.toml` coverage threshold is 85%, while inspected CI commands explicitly use `--cov-fail-under=80` on all OS jobs.
- Source-adapter byte-preservation / declared-transformation tests are documented as not yet present in `docs/rfcs/002-source-adapter-plugin-spec.md`.
- Website quality tooling appears limited to build/deploy; `website/package.json` has no test, lint, or typecheck scripts.
