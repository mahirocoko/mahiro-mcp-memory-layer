# Final Wave F2 Remediation Evidence

## Verdict

PASS — both HIGH defects from `.sisyphus/evidence/f2-code-quality.md` were remediated and verified.

## Defect A — Manifest/source invariant

- Added `src/features/memory/wiki-materializer/source-groups.ts` as the shared source identity, grouping, record-sort, and source-slug map builder.
- Updated `renderers.ts` to emit source pages from the shared grouped source model.
- Updated `manifest.ts` to derive each `manifest.records[*].sourceSlug` from the same shared source slug map used by source page emission.
- Updated source slug generation so slugs are based on normalized source identity `{ type, uri, title }`, not individual record IDs.

Coverage:

- `tests/wiki-materializer-e2e.test.ts` now materializes two records with identical source identity and asserts:
  - both manifest records share one `sourceSlug`
  - the emitted `sources/<slug>.md` page exists
  - the emitted source page contains both grouped records
- Existing renderer tests now assert identical source records resolve to the same source slug.
- Utility tests now assert identical source identity is stable while different identities still diverge.

## Defect B — Unsafe explicit output-dir

- Tightened `writeWikiMaterialization()` safety before staging/replacement begins.
- Explicit output directories now reject:
  - repo root and ancestors of `paths.appRoot`
  - non-wiki paths under the repo root
  - protected repo paths such as `.sisyphus`, `src`, `tests`, `docs`, and `data`
  - existing canonical memory path overlap protections remain intact
- Explicit temp output directories and default `.agent-state/wiki/<project>/<container>` output remain supported.

Coverage:

- `tests/wiki-materializer-writer.test.ts` rejects explicit repo root, `.sisyphus`, `src`, and app-root ancestors.
- `tests/wiki-materializer-cli.test.ts` rejects `.`, repo root, `.sisyphus`, and an unrelated existing repo directory (`tests`) with non-zero exit and clear `Unsafe wiki output directory` stderr.

## Verification

Commands run from repo root:

```bash
rtk bun test tests/wiki-materializer-utils.test.ts tests/wiki-materializer-renderers.test.ts tests/wiki-materializer-e2e.test.ts tests/wiki-materializer-writer.test.ts tests/wiki-materializer-cli.test.ts
rtk bun run typecheck
rtk bun run test
rtk bun run build
```

Combined verification result:

- Targeted wiki materializer tests: 27 passed, 0 failed.
- Typecheck: passed.
- Full test suite: 27 files passed, 202 tests passed, 0 failed.
- Build: passed.

LSP diagnostics were also clean for all modified TypeScript source and test files.
