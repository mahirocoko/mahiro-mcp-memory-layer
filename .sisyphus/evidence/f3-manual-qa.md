VERDICT: APPROVE

# Final Verification Wave F3 Manual QA

Date: 2026-05-08

## Scope

Hands-on QA for `bun run wiki:materialize` using explicit scope and temporary output.

- Project ID: `f3-manual-qa-project`
- Container ID: `f3-manual-qa-container`
- Temp output: `/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output`
- Canonical log: `data/log/canonical-log.jsonl`

## Findings

- Materialization with explicit scope and temp output succeeded.
- Generated file tree contained `index.md`, `log.md`, `manifest.json`, one record page, and one source page.
- Manifest fields were present and internally consistent: `schemaVersion`, `materializerVersion`, `projectId`, `containerId`, `generatedAt`, `filters`, `records`, `includedCount`, `excludedCount`, and `excludedByReason`.
- Counts matched the controlled fixture: `includedCount: 1`, `excludedCount: 18`, `excludedByReason.scope_mismatch: 18`.
- Canonical JSONL did not mutate during materialization: seeded hash before materialization matched hash after materialization.
- Staleness validation behaved correctly: fresh manifest returned exit `0`; controlled canonical append returned stale with `record_added: f3-manual-qa-record-2` and exit `2`.
- Missing required args and unsafe output both failed with exit `1` and clear error messages.
- Canonical log was restored after QA; restored hash matched pre-QA backup hash.

## Exact commands and outcomes

### Temp parent verification

Command:

```bash
rtk ls "/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode"
```

Outcome: exit `0`; temp parent existed.

### Canonical log backup

Command:

```bash
rtk zsh -lc 'set -euo pipefail; QA_ROOT="/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa"; mkdir -p "$QA_ROOT"; rm -rf "$QA_ROOT/wiki-output" "$QA_ROOT/wiki-output-unsafe"; CANON="data/log/canonical-log.jsonl"; BACKUP="$QA_ROOT/canonical-log.before.jsonl"; if [ -f "$CANON" ]; then cp "$CANON" "$BACKUP"; else mkdir -p "$(dirname "$CANON")"; : > "$BACKUP"; fi; BEFORE_ORIGINAL=$(shasum -a 256 "$BACKUP" | cut -d " " -f 1); printf "original_hash=%s\n" "$BEFORE_ORIGINAL"'
```

Outcome: exit `0`; `original_hash=2294d3a18c4120b70e3e489ebe267ce2e16cf5ff09412dab6ef47d607f2fa4e7`.

Note: an earlier quoting-only setup attempt failed with `zsh:1: unmatched "` before any QA fixture was created; the successful command above was used for the actual backup.

### Controlled seed record append

Command:

```bash
rtk node -e 'const fs=require("fs"); const path=require("path"); const p="data/log/canonical-log.jsonl"; fs.mkdirSync(path.dirname(p),{recursive:true}); const r={id:"f3-manual-qa-record-1",kind:"fact",scope:"project",verificationStatus:"verified",verifiedAt:"2026-05-08T06:31:00.000Z",verificationEvidence:[{type:"test",value:"F3 manual QA seed",note:"Controlled seed record for wiki materializer QA"}],projectId:"f3-manual-qa-project",containerId:"f3-manual-qa-container",source:{type:"manual",uri:"qa://f3/manual",title:"F3 Manual QA"},content:"F3 manual QA canonical seed record for materialization output inspection.",summary:"F3 QA seed summary.",tags:["f3","manual-qa","wiki-materializer"],importance:0.7,createdAt:"2026-05-08T06:31:00.000Z",updatedAt:"2026-05-08T06:31:00.000Z"}; fs.appendFileSync(p, JSON.stringify(r)+"\n"); console.log("seeded_hash="+require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex"));'
```

Outcome: exit `0`; `seeded_hash=ecab7bb49660fcc029044cc34b120c6d0abe3ce96d16fa3ecd7d1bcd99bb6148`.

### Materialize explicit scope into temp output

Command:

```bash
rtk bun run wiki:materialize -- --project-id f3-manual-qa-project --container-id f3-manual-qa-container --output-dir "/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output"
```

Outcome: exit `0`.

Observed output:

```text
Wiki materialization scope: /var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output
Manifest path: /var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/manifest.json
Included records: 1
Excluded records: 18
Verification hints:
- verified records only
- excluded review statuses: pending, deferred, rejected
```

Generated file tree inspected:

```text
/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/sources/f3-manual-qa-52476460ab0e.md
/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/manifest.json
/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/index.md
/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/log.md
/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/records/f3-manual-qa-record-1.md
```

Manifest inspection highlights:

```text
schemaVersion: 1
materializerVersion: 0.0.0
projectId: f3-manual-qa-project
containerId: f3-manual-qa-container
filters.mode: verified_only
filters.includeVerificationStatuses: [verified]
filters.excludeReviewStatuses: [pending, deferred, rejected]
records[0].id: f3-manual-qa-record-1
records[0].pagePath: records/f3-manual-qa-record-1.md
records[0].sourceSlug: f3-manual-qa-52476460ab0e
records[0].recordHash: 98f858c53db850d9ac59548c22df94084e91b2c3f0145992beb2720ea5942d52
records[0].contentHash: 9a05777cfba0583ba27490fd615066574c91631e6f0084d8163aecc55865b043
includedCount: 1
excludedCount: 18
excludedByReason.scope_mismatch: 18
```

### Canonical JSONL mutation check during materialization

Command:

```bash
rtk zsh -lc 'set -euo pipefail; CANON="data/log/canonical-log.jsonl"; SEEDED_EXPECTED="ecab7bb49660fcc029044cc34b120c6d0abe3ce96d16fa3ecd7d1bcd99bb6148"; AFTER_MATERIALIZE=$(shasum -a 256 "$CANON" | cut -d " " -f 1); printf "after_materialize_hash=%s\nseeded_expected_hash=%s\nmatch=%s\n" "$AFTER_MATERIALIZE" "$SEEDED_EXPECTED" "$([ "$AFTER_MATERIALIZE" = "$SEEDED_EXPECTED" ] && printf yes || printf no)"'
```

Outcome: exit `0`.

```text
after_materialize_hash=ecab7bb49660fcc029044cc34b120c6d0abe3ce96d16fa3ecd7d1bcd99bb6148
seeded_expected_hash=ecab7bb49660fcc029044cc34b120c6d0abe3ce96d16fa3ecd7d1bcd99bb6148
match=yes
```

### Fresh staleness validation

Command:

```bash
rtk bun run wiki:materialize -- --project-id f3-manual-qa-project --container-id f3-manual-qa-container --output-dir "/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output" --validate-staleness
```

Outcome: exit `0`.

```text
Wiki materialization staleness: fresh
Manifest path: /var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/manifest.json
```

### Controlled stale change append

Command:

```bash
rtk node -e 'const fs=require("fs"); const path=require("path"); const p="data/log/canonical-log.jsonl"; fs.mkdirSync(path.dirname(p),{recursive:true}); const r={id:"f3-manual-qa-record-2",kind:"decision",scope:"project",verificationStatus:"verified",verifiedAt:"2026-05-08T06:34:00.000Z",verificationEvidence:[{type:"test",value:"F3 manual QA stale control",note:"Controlled appended record to force staleness"}],projectId:"f3-manual-qa-project",containerId:"f3-manual-qa-container",source:{type:"manual",uri:"qa://f3/manual-stale",title:"F3 Manual QA Stale Control"},content:"F3 manual QA controlled change that should make the saved wiki manifest stale.",summary:"F3 stale-control summary.",tags:["f3","manual-qa","staleness"],importance:0.6,createdAt:"2026-05-08T06:34:00.000Z",updatedAt:"2026-05-08T06:34:00.000Z"}; fs.appendFileSync(p, JSON.stringify(r)+"\n"); console.log("changed_hash="+require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex"));'
```

Outcome: exit `0`; `changed_hash=6f00b893c823365a87f7db58900f297aad50967bc4560f7862825f8be566e914`.

### Stale validation after controlled change

Command:

```bash
rtk zsh -lc 'set +e; bun run wiki:materialize -- --project-id f3-manual-qa-project --container-id f3-manual-qa-container --output-dir "/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output" --validate-staleness; code=$?; printf "exit_code=%s\n" "$code"; exit 0'
```

Outcome: CLI returned exit `2` as expected for stale; wrapper exited `0` only to capture/report the expected non-zero code.

```text
Wiki materialization staleness: stale
Manifest path: /var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output/manifest.json
Changes:
- record_added: f3-manual-qa-record-2
exit_code=2
```

### Missing-argument behavior

Command:

```bash
rtk zsh -lc 'set +e; bun run wiki:materialize -- --container-id f3-manual-qa-container --output-dir "/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa/wiki-output-missing"; code=$?; printf "exit_code=%s\n" "$code"; exit 0'
```

Outcome: CLI returned exit `1` as expected; wrapper exited `0` only to capture/report the expected non-zero code.

```text
--project-id is required.
error: script "wiki:materialize" exited with code 1
exit_code=1
```

### Unsafe-output behavior

Command:

```bash
rtk zsh -lc 'set +e; bun run wiki:materialize -- --project-id f3-manual-qa-project --container-id f3-manual-qa-container --output-dir data/log; code=$?; printf "exit_code=%s\n" "$code"; exit 0'
```

Outcome: CLI returned exit `1` as expected; wrapper exited `0` only to capture/report the expected non-zero code.

```text
Unsafe wiki output directory: /Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/data/log
error: script "wiki:materialize" exited with code 1
exit_code=1
```

### Canonical log restoration

Command:

```bash
rtk zsh -lc 'set -euo pipefail; QA_ROOT="/var/folders/vy/8tl35jl50978n2j99_d2js5c0000gn/T/opencode/f3-manual-qa"; CANON="data/log/canonical-log.jsonl"; BACKUP="$QA_ROOT/canonical-log.before.jsonl"; if [ -s "$BACKUP" ]; then mkdir -p "$(dirname "$CANON")"; cp "$BACKUP" "$CANON"; else rm -f "$CANON"; fi; RESTORED_HASH=$(if [ -f "$CANON" ]; then shasum -a 256 "$CANON" | cut -d " " -f 1; else printf missing; fi); BACKUP_HASH=$(shasum -a 256 "$BACKUP" | cut -d " " -f 1); printf "restored_hash=%s\nbackup_hash=%s\nmatch=%s\n" "$RESTORED_HASH" "$BACKUP_HASH" "$([ "$RESTORED_HASH" = "$BACKUP_HASH" ] && printf yes || printf no)"'
```

Outcome: exit `0`.

```text
restored_hash=2294d3a18c4120b70e3e489ebe267ce2e16cf5ff09412dab6ef47d607f2fa4e7
backup_hash=2294d3a18c4120b70e3e489ebe267ce2e16cf5ff09412dab6ef47d607f2fa4e7
match=yes
```

## Failure evidence

No product failures found in this F3 manual QA wave.
