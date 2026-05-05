# MemPalace Testing and Quality Notes

Source reviewed: `./origin/` (`/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`).  This document describes evidence present in the repository as of this learning pass and calls out gaps where the evidence is missing or inconsistent.

## Test structure

MemPalace is primarily a Python package with tests under `tests/` and benchmark/performance tests under `tests/benchmarks/`.

- `pyproject.toml` configures pytest with `testpaths = ["tests"]`, `pythonpath = ["."]`, and default marker exclusion: `-m 'not benchmark and not slow and not stress'`.
- The main suite contains many module-oriented `tests/test_*.py` files that mirror the package surface: CLI, MCP server, search, mining, config, backends, knowledge graph, palace graph, hooks, i18n, normalization, repair, source adapters, and more.
- The initial file scan found 73 `test_*.py` files under `tests/`; 9 of those are in `tests/benchmarks/`.
- Shared fixtures live in `tests/conftest.py`; benchmark-only fixtures and pytest options live in `tests/benchmarks/conftest.py`.
- No JavaScript/TypeScript `*.test.*` or `*.spec.*` files were found. The `website/` package only exposes VitePress docs scripts (`docs:dev`, `docs:build`, `docs:preview`).

## Conventions and patterns

Tests follow pytest conventions:

- File naming is `tests/test_<module>.py`; `CLAUDE.md` explicitly documents this convention and points contributors to `tests/conftest.py` for fixtures.
- Assertions are direct `assert` statements, often grouped in test classes such as `TestHandleRequest`, `TestReadTools`, and `TestBuildGraph`.
- Regression tests are common. Several tests include comments naming bug numbers or production failure contexts, for example MCP null-argument behavior, ChromaDB metadata edge cases, palace path handling, and hook wrapper fallbacks.
- Parametrization is used for matrix-like behavior, especially shell/hook wrapper tests.
- Conditional execution is present where platform/runtime dependencies matter; for example Claude plugin hook wrapper tests are skipped if `bash` is unavailable.

Default pytest markers are defined in `pyproject.toml`:

- `benchmark`: scale/performance benchmark tests.
- `slow`: tests taking more than 30 seconds.
- `stress`: destructive scale tests for 100K+ drawers.

Because these markers are excluded by default, a normal `pytest` run intentionally avoids the benchmark, slow, and stress suites unless explicitly selected.

## Fixtures and helpers

`tests/conftest.py` is the core safety layer for the test suite:

- It redirects `HOME`, `USERPROFILE`, `HOMEDRIVE`, and `HOMEPATH` to a session-scoped temp directory before importing MemPalace modules. This prevents tests and module-level initialization from touching a real user profile.
- An autouse `_reset_mcp_cache` fixture clears MCP server ChromaDB client/collection caches and `ChromaBackend._quarantined_paths` before and after tests.
- Common fixtures include `tmp_dir`, `palace_path`, `config`, `collection`, `seeded_collection`, `kg`, and `seeded_kg`.
- The `collection` and `seeded_collection` fixtures create isolated ChromaDB collections with representative drawer metadata.
- The `kg` and `seeded_kg` fixtures create isolated SQLite knowledge graph files and seed temporal entity triples.

Benchmark helpers are separated under `tests/benchmarks/`:

- `tests/benchmarks/conftest.py` defines `--bench-scale` and `--bench-report` pytest options.
- The benchmark scale values are `small`, `medium`, `large`, and `stress`.
- `tests/benchmarks/data_generator.py` is documented as a deterministic data factory with seeded RNG and planted search needles.
- `tests/benchmarks/report.py` supports JSON reporting and regression checks.

## Mocking and isolation patterns

The suite strongly prefers local, isolated, deterministic tests:

- `unittest.mock.patch` and `MagicMock` are used heavily for CLI dispatch, external modules, ChromaDB access, and HTTP calls.
- `tests/test_palace_graph.py` explicitly mocks all ChromaDB access and patches `chromadb` at import time so graph traversal can be tested without a real database.
- `tests/test_llm_client.py` mocks `urlopen` throughout; its module docstring says these tests do not require a running Ollama instance or network access, and that live-provider smoke tests live outside the unit-test suite.
- MCP server tests patch module globals (`_config`, `_kg`) to use isolated fixtures rather than real config or real user data.
- Hook wrapper tests use temporary fake executables on `PATH` and `subprocess.run` to validate shell behavior without invoking a real installed CLI.
- Several tests use `tmp_path`, temporary SQLite files, and temporary ChromaDB directories to reproduce storage edge cases safely.

This matches the contributor guide’s claim that tests should run without API keys or network access.

## Quality gates

The main quality gates are pytest, pytest-cov, Ruff linting, Ruff formatting, and version consistency checks.

### Local contributor commands

Documented commands include:

```bash
pip install -e ".[dev]"
python -m pytest tests/ -v --ignore=tests/benchmarks
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing
ruff check .
ruff format --check .
```

`CONTRIBUTING.md` also shows `pytest tests/ -v`; however, because `pyproject.toml` already excludes benchmark/slow/stress markers by default, the more CI-aligned command is the explicit `python -m pytest tests/ -v --ignore=tests/benchmarks` from `CLAUDE.md` and CI.

### CI

`.github/workflows/ci.yml` runs:

- Linux tests on Python 3.9, 3.11, and 3.13.
- Windows tests on Python 3.13.
- macOS tests on Python 3.13.
- Each test job installs `pip install -e ".[dev]"` and runs `python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing --cov-fail-under=80 --durations=10`.
- The lint job installs `ruff>=0.4.0,<0.5`, then runs `ruff check .` and `ruff format --check .`.

`.github/workflows/version-guard.yml` validates version consistency across:

- `mempalace/version.py`
- `pyproject.toml`
- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`

It also validates stable tag names against the manifest version.

`.pre-commit-config.yaml` contains Ruff hooks:

- `ruff` with `--fix`
- `ruff-format`

The pre-commit config pins `ruff-pre-commit` to `v0.4.10` and comments that it should stay in lock-step with CI’s `ruff>=0.4.0,<0.5` range.

`.github/dependabot.yml` keeps pip and GitHub Actions dependencies on a weekly update schedule.

The docs site has a separate `deploy-docs.yml` workflow that installs Bun in `website/` and runs `bun run docs:build`; this is a docs build/deploy gate, not a Python package test gate.

## Coverage approach

Coverage is configured in `pyproject.toml`:

- `[tool.coverage.run] source = ["mempalace"]`
- `[tool.coverage.report] fail_under = 85`
- `show_missing = true`
- excluded lines include `if __name__` and `pragma: no cover`.

There is a small mismatch between local config/docs and CI:

- `pyproject.toml` sets coverage `fail_under = 85`.
- `CLAUDE.md` documents an 85% threshold, with a note that Windows is 80% due to ChromaDB file lock cleanup.
- CI explicitly uses `--cov-fail-under=80` on Linux, Windows, and macOS.

So the evidence supports: target 85% locally/configurationally, but current CI enforces 80%.

## Benchmark and performance coverage

Benchmark coverage is intentionally isolated from normal test runs.

`tests/benchmarks/README.md` describes a 106-test scale benchmark suite with these areas:

- MCP tool response times and metadata fetch behavior.
- ChromaDB stress, query degradation, and insert behavior.
- Memory/RSS growth and leak detection.
- Mining throughput and re-ingest skip cost.
- Search latency, recall@k, concurrent queries, and `n_results` scaling.
- Palace boost, recall threshold, knowledge graph performance, and memory stack wake-up cost.

Representative commands from the benchmark README:

```bash
uv run pytest tests/benchmarks/ -v --bench-scale=small -m "benchmark and not slow"
uv run pytest tests/benchmarks/ -v --bench-scale=small
uv run pytest tests/benchmarks/ -v --bench-scale=medium --bench-report=results.json
uv run pytest tests/benchmarks/ -v --bench-scale=stress -m stress
```

The benchmark README claims CI integration for a PR benchmark job, but `.github/workflows/ci.yml` in this checkout does not contain a benchmark job. Treat the benchmark CI claim as stale or unimplemented unless another workflow is added.

## Missing or unknown evidence

- No `tox.ini`, `setup.cfg`, `pytest.ini`, `mypy.ini`, or standalone `ruff.toml` was found; the active Python tooling config is in `pyproject.toml`.
- No mypy or pyright type-check gate was found in config or CI.
- No JavaScript/TypeScript test runner was found for `website/`; only a VitePress docs build script is present.
- No CI benchmark job was present despite the benchmark README describing one.
- No live-provider/network smoke test files were identified in the normal `tests/` scan; `test_llm_client.py` explicitly states live-provider smoke tests live outside the unit-test suite, but this pass did not find a separate live-test harness.

## How future contributors should verify changes

For most Python changes:

```bash
pip install -e ".[dev]"
python -m pytest tests/ -v --ignore=tests/benchmarks
python -m pytest tests/ -v --ignore=tests/benchmarks --cov=mempalace --cov-report=term-missing
ruff check .
ruff format --check .
```

For changes touching version manifests or plugin packaging, also check that `mempalace/version.py`, `pyproject.toml`, `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` agree.

For performance-sensitive changes, run the benchmark suite explicitly, starting with the quick small-scale benchmark before attempting medium/large/stress runs:

```bash
uv run pytest tests/benchmarks/ -v --bench-scale=small -m "benchmark and not slow"
```

For docs-site changes under `website/`, verify the separate docs build:

```bash
cd website
bun install --frozen-lockfile
bun run docs:build
```
