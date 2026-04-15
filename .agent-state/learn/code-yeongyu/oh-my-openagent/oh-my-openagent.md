# oh-my-openagent Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/code-yeongyu/oh-my-openagent

## Explorations

### 2026-04-16 0006 (deep)
- [[2026-04-16/0006_ARCHITECTURE|Architecture]]
- [[2026-04-16/0006_CODE-SNIPPETS|Code Snippets]]
- [[2026-04-16/0006_QUICK-REFERENCE|Quick Reference]]
- [[2026-04-16/0006_TESTING|Testing]]
- [[2026-04-16/0006_API-SURFACE|API Surface]]

**Key insights**: This repo is an OpenCode plugin plus companion CLI rather than a single monolith; `task(...)` and `BackgroundManager` form the core orchestration runtime; the codebase is unusually focused on runtime reliability with race/recovery/verification-heavy tests.
