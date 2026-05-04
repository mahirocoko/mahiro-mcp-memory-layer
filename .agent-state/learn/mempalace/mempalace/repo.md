# mempalace Learning Index

## Source

- **Origin**: ./origin/
- **GitHub**: https://github.com/mempalace/mempalace

## Explorations

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
