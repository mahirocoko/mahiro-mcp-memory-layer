---
tags:
  - wiki-materializer
  - final-verification
  - safety
  - deterministic-projection
---

# Lesson Learned: Final-wave reviews must test cross-module contracts

The memory wiki materializer passed many implementation tests before F2 caught two serious cross-module defects: manifest source slugs could diverge from emitted source pages for identical source identities, and explicit output directory overrides could destructively replace unrelated repo paths. The fix was not just more unit tests; it required a shared source grouping helper used by both renderer and manifest generation, plus adversarial writer/CLI tests around destructive paths.

When a feature emits generated artifacts plus machine-readable metadata, always test that the metadata points to real artifacts. When a writer replaces directories atomically, explicit override paths need stricter safety than default paths because the user can otherwise aim the replacement machinery at project internals.

Future pattern: for derived projections, add one e2e invariant test that reads the generated file tree and compares it against manifest paths/slugs/hashes. For filesystem writers, reject repo root, app-root ancestors, protected repo directories, and canonical storage paths before creating staging directories or running any rename.
