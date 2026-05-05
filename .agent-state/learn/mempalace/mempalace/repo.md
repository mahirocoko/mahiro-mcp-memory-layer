# mempalace Learning Index

## Source

- **Origin**: ./origin/
- **GitHub**: https://github.com/mempalace/mempalace

## Explorations

### 2026-05-05 1137 (deep)

- [[2026-05-05/1137_ARCHITECTURE|Architecture]]
- [[2026-05-05/1137_CODE-SNIPPETS|Code Snippets]]
- [[2026-05-05/1137_QUICK-REFERENCE|Quick Reference]]
- [[2026-05-05/1137_TESTING|Testing]]
- [[2026-05-05/1137_API-SURFACE|API Surface]]

**Key insights**:

- MemPalace is a Python local-first memory system whose operational surface spans CLI workflows, a stdio JSON-RPC MCP server, host hooks/plugins, and direct Python submodule APIs.
- Storage architecture separates verbatim drawer records from compact closet pointers, then layers SQLite graph facts, hybrid search, and wake-up context assembly on top.
- Extension points are explicit package entry-point groups for storage backends and source adapters; host integrations live in Claude/Codex plugin bundles rather than a generic middleware pipeline.
- The repo has a strong pytest/Ruff quality model with temp HOME/palace fixtures, benchmark suites, coverage config, and multi-OS CI.
- Documentation has some drift around MCP tool counts, so future integrations should treat `mempalace/mcp_server.py`'s `TOOLS` registry as source of truth.

### 2026-05-04 1300 (deep)

- [[2026-05-04/1300_ARCHITECTURE|Architecture]]
- [[2026-05-04/1300_CODE-SNIPPETS|Code Snippets]]
- [[2026-05-04/1300_QUICK-REFERENCE|Quick Reference]]
- [[2026-05-04/1300_TESTING|Testing]]
- [[2026-05-04/1300_API-SURFACE|API Surface]]

**Key insights**:

- MemPalace is a local-first Python memory system with two main entry scripts: `mempalace` for CLI workflows and `mempalace-mcp` for a stdio JSON-RPC MCP server.
- Storage centers on ChromaDB-backed verbatim drawers and compact closet pointers, with SQLite-based graph facts and layered wake-up/search retrieval on top.
- The public surface is broader than the Python package root: CLI commands, MCP tools, documented Python modules, backend/source-adapter contracts, and Claude/Codex plugin manifests all matter.
- The repo is transitional in places: backend plugins are implemented, source-adapter plugins are scaffolded/RFC-backed, and docs contain drift such as 19 vs 29 MCP tool references.
- Tests use pytest with temp HOME/palace fixtures and opt-in benchmark suites; quality config lives in `pyproject.toml`, pre-commit, and GitHub workflows.
