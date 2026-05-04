# MemPalace Code Snippets and Implementation Idioms

Source inspected: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/mempalace/mempalace/origin/`

MemPalace is a Python package for local-first, verbatim memory storage. The core idiom is: **mine text into deterministic drawer IDs with metadata, store in a pluggable vector backend, expose retrieval and write operations through CLI and MCP, and keep safety fallbacks local.**

## 1. Package entry points

### `pyproject.toml` — CLI, MCP, backend registration

```toml
[project.scripts]
mempalace = "mempalace.cli:main"
mempalace-mcp = "mempalace.mcp_server:main"

[project.entry-points."mempalace.backends"]
chroma = "mempalace.backends.chroma:ChromaBackend"
```

Why it matters: the installed package exposes two public executables. `mempalace` is the human CLI; `mempalace-mcp` is the JSON-RPC stdio server used by agent clients. Backend registration is already shaped for alternative storage implementations.

## 2. CLI dispatch idioms

### `mempalace/cli.py` — command router

```python
dispatch = {
    "init": cmd_init,
    "mine": cmd_mine,
    "split": cmd_split,
    "search": cmd_search,
    "sweep": cmd_sweep,
    "mcp": cmd_mcp,
    "compress": cmd_compress,
    "wake-up": cmd_wakeup,
    "repair": cmd_repair,
    "repair-status": cmd_repair_status,
    "migrate": cmd_migrate,
    "status": cmd_status,
}
dispatch[args.command](args)
```

Why it matters: the CLI is intentionally thin. Argument parsing and dispatch live in `cli.py`, but implementation is delegated to focused modules (`miner.py`, `convo_miner.py`, `searcher.py`, `layers.py`, `repair.py`). Future CLI commands should follow this pattern instead of growing more logic in `main()`.

### `mempalace/cli.py` — mine mode chooses project vs conversation ingest

```python
if args.mode == "convos":
    from .convo_miner import mine_convos

    mine_convos(
        convo_dir=args.dir,
        palace_path=palace_path,
        wing=args.wing,
        agent=args.agent,
        limit=args.limit,
        dry_run=args.dry_run,
        extract_mode=args.extract,
    )
else:
    from .miner import mine

    mine(
        project_dir=args.dir,
        palace_path=palace_path,
        wing_override=args.wing,
        agent=args.agent,
        limit=args.limit,
        dry_run=args.dry_run,
        respect_gitignore=not args.no_gitignore,
        include_ignored=include_ignored,
    )
```

Why it matters: there is one palace, but two ingest strategies. Project files are paragraph/line chunked; conversations are normalized and exchange chunked.

### `mempalace/cli.py` — init never silently sends data to an external LLM

```python
if candidate.is_external_service:
    print(
        f"  ⚠ {provider_name} is an EXTERNAL API. Your folder "
        f"content will be sent to the provider during init. "
        f"MemPalace does not control how the provider logs, "
        f"retains, or uses your data. Pass --no-llm to keep "
        f"init fully local."
    )
    api_key_source = getattr(candidate, "api_key_source", None)
    accept_flag = getattr(args, "accept_external_llm", False)
    if api_key_source == "env" and not accept_flag:
        answer = input("  Your API key was loaded from the environment ... Continue? [y/N] ")
        if answer != "y":
            llm_provider = None
```

Why it matters: local-first privacy is enforced in code. Environment credentials alone do not imply consent for sending corpus text to a remote model.

## 3. Shared palace abstractions

### `mempalace/palace.py` — one backend seam for collection access

```python
_DEFAULT_BACKEND = ChromaBackend()

def get_collection(
    palace_path: str,
    collection_name: str = "mempalace_drawers",
    create: bool = True,
):
    """Get the palace collection through the backend layer."""
    return _DEFAULT_BACKEND.get_collection(
        palace_path,
        collection_name=collection_name,
        create=create,
    )

def get_closets_collection(palace_path: str, create: bool = True):
    """Get the closets collection — the searchable index layer."""
    return get_collection(palace_path, collection_name="mempalace_closets", create=create)
```

Why it matters: almost all modules route Chroma access through this seam. The `mempalace_drawers` collection stores verbatim content; `mempalace_closets` stores compact index/pointer lines.

### `mempalace/backends/base.py` — typed backend contract with transitional dict access

```python
@dataclass(frozen=True)
class QueryResult(_DictCompatMixin):
    ids: list[list[str]]
    documents: list[list[str]]
    metadatas: list[list[dict]]
    distances: list[list[float]]
    embeddings: Optional[list[list[list[float]]]] = None

    @classmethod
    def empty(cls, num_queries: int = 1, embeddings_requested: bool = False) -> "QueryResult":
        empty_outer = [[] for _ in range(num_queries)]
        return cls(
            ids=[[] for _ in range(num_queries)],
            documents=[[] for _ in range(num_queries)],
            metadatas=[[] for _ in range(num_queries)],
            distances=[[] for _ in range(num_queries)],
            embeddings=empty_outer if embeddings_requested else None,
        )
```

Why it matters: core code is migrating from Chroma dict-shaped results to typed dataclasses. `_DictCompatMixin` preserves `result["ids"]` and `result.get("ids")` while new code can use `result.ids`.

### `mempalace/backends/base.py` — backend update defaults are explicit and non-atomic

```python
def update(
    self,
    *,
    ids: list[str],
    documents: Optional[list[str]] = None,
    metadatas: Optional[list[dict]] = None,
    embeddings: Optional[list[list[float]]] = None,
) -> None:
    """Default non-atomic update: get + merge + upsert."""
    if documents is None and metadatas is None and embeddings is None:
        raise ValueError("update requires at least one of documents, metadatas, embeddings")
```

Why it matters: the backend API is conservative. Backends that advertise atomic update support must override the default.

## 4. Chroma backend safety idioms

### `mempalace/backends/chroma.py` — reject unsupported filters instead of dropping them

```python
_SUPPORTED_OPERATORS = _REQUIRED_OPERATORS | _OPTIONAL_OPERATORS

def _validate_where(where: Optional[dict]) -> None:
    """Scan a where-clause for unknown operators and raise ``UnsupportedFilterError``."""
    if not where:
        return
    stack = [where]
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        for k, v in node.items():
            if k.startswith("$") and k not in _SUPPORTED_OPERATORS:
                raise UnsupportedFilterError(f"operator {k!r} not supported by chroma backend")
```

Why it matters: filter correctness is treated as a safety issue. Unknown operators fail loudly rather than producing broad, privacy-sensitive results.

### `mempalace/backends/chroma.py` — pre-open repair/quarantine gate

```python
@staticmethod
def _prepare_palace_for_open(palace_path: str) -> None:
    """Run the pre-open safety pass shared by :meth:`make_client` and :meth:`_client`."""
    _fix_blob_seq_ids(palace_path)
    if palace_path not in ChromaBackend._quarantined_paths:
        quarantine_stale_hnsw(palace_path)
        ChromaBackend._quarantined_paths.add(palace_path)
```

Why it matters: every Chroma open path first repairs known SQLite/Chroma quirks and quarantines stale HNSW segments once per process. This is a recurring repo idiom: avoid loading dangerous vector state when filesystem probes can detect trouble first.

### `mempalace/backends/chroma.py` — collection creation pins HNSW safety metadata

```python
collection = client.create_collection(
    collection_name,
    metadata={
        "hnsw:space": hnsw_space,
        "hnsw:num_threads": 1,
        **_HNSW_BLOAT_GUARD,
    },
    **ef_kwargs,
)
_pin_hnsw_threads(collection)
return ChromaCollection(collection)
```

Why it matters: MemPalace hardens Chroma collection creation for cosine search and single-threaded HNSW insertion. `_HNSW_BLOAT_GUARD` raises batch/sync thresholds to avoid huge `link_lists.bin` growth on large mines.

### `mempalace/backends/chroma.py` — explicit embedding function on every open

```python
@staticmethod
def _resolve_embedding_function():
    """Return the EF for the user's ``embedding_device`` setting."""
    try:
        from ..embedding import get_embedding_function

        return get_embedding_function()
    except Exception:
        logger.exception("Failed to build embedding function; using chromadb default")
        return None
```

Why it matters: ChromaDB persists embedding function identity but not the full runtime configuration. MemPalace passes the embedding function explicitly when opening collections so reader and writer vectors stay compatible.

## 5. Project mining: verbatim drawers + closets

### `mempalace/miner.py` — gitignore-aware project scanner

```python
for root, dirs, filenames in os.walk(project_path):
    root_path = Path(root)
    if respect_gitignore:
        active_matchers = [
            matcher
            for matcher in active_matchers
            if root_path == matcher.base_dir or matcher.base_dir in root_path.parents
        ]
        current_matcher = load_gitignore_matcher(root_path, matcher_cache)
        if current_matcher is not None:
            active_matchers.append(current_matcher)

    dirs[:] = [d for d in dirs if is_force_included(root_path / d, project_path, include_paths)
               or not should_skip_dir(d)]
```

Why it matters: the miner avoids generated/cache directories, respects nested `.gitignore` files, skips symlinks and oversized files, and supports explicit `--include-ignored` overrides.

### `mempalace/miner.py` — room detection is deterministic and local

```python
def detect_room(filepath: Path, content: str, rooms: list, project_path: Path) -> str:
    relative = str(filepath.relative_to(project_path)).lower()
    filename = filepath.stem.lower()
    content_lower = content[:2000].lower()

    # Priority 1: folder path matches room name or keywords
    path_parts = relative.replace("\\", "/").split("/")
    for part in path_parts[:-1]:
        for room in rooms:
            candidates = [room["name"].lower()] + [k.lower() for k in room.get("keywords", [])]
            if any(part == c or c in part or part in c for c in candidates):
                return room["name"]
```

Why it matters: files are routed to rooms without API calls. The order is folder match, filename match, keyword scoring, then `general`.

### `mempalace/miner.py` — paragraph-aware chunking with overlap

```python
while start < len(content):
    end = min(start + CHUNK_SIZE, len(content))
    if end < len(content):
        newline_pos = content.rfind("\n\n", start, end)
        if newline_pos > start + CHUNK_SIZE // 2:
            end = newline_pos
        else:
            newline_pos = content.rfind("\n", start, end)
            if newline_pos > start + CHUNK_SIZE // 2:
                end = newline_pos

    chunk = content[start:end].strip()
    if len(chunk) >= MIN_CHUNK_SIZE:
        chunks.append({"content": chunk, "chunk_index": chunk_index})
    start = end - CHUNK_OVERLAP if end < len(content) else end
```

Why it matters: drawers are small, mostly boundary-aware, and overlapping. This keeps retrieval granular while preserving enough context around chunk boundaries.

### `mempalace/miner.py` — deterministic IDs and batched upserts

```python
for chunk in chunks[batch_start : batch_start + DRAWER_UPSERT_BATCH_SIZE]:
    drawer_id = f"drawer_{wing}_{room}_{hashlib.sha256((source_file + str(chunk['chunk_index'])).encode()).hexdigest()[:24]}"
    batch_docs.append(chunk["content"])
    batch_ids.append(drawer_id)
    batch_metas.append(
        _build_drawer_metadata(
            wing, room, source_file, chunk["chunk_index"], agent, chunk["content"], source_mtime
        )
    )
collection.upsert(documents=batch_docs, ids=batch_ids, metadatas=batch_metas)
```

Why it matters: deterministic IDs make re-mining idempotent, and batching amortizes embedding model work across many chunks.

### `mempalace/miner.py` — per-file locking and purge-before-reinsert

```python
with mine_lock(source_file):
    if file_already_mined(collection, source_file, check_mtime=True):
        return 0, room

    try:
        collection.delete(where={"source_file": source_file})
    except Exception:
        pass
    # then upsert fresh chunks
```

Why it matters: concurrent hooks/agents cannot interleave delete+insert for the same file. Modified-file re-mines purge stale drawers first, avoiding Chroma update paths that have historically segfaulted.

### `mempalace/palace.py` — closet pointer lines are compact, not content replacements

```python
def build_closet_lines(source_file, drawer_ids, content, wing, room):
    drawer_ref = ",".join(drawer_ids[:3])
    window = content[:CLOSET_EXTRACT_WINDOW]
    # extract entities/topics/quotes ...
    for topic in topics:
        lines.append(f"{topic}|{entity_str}|→{drawer_ref}")
    for quote in quotes[:3]:
        lines.append(f'"{quote}"|{entity_str}|→{drawer_ref}')
    if not lines:
        name = Path(source_file).stem[:40]
        lines.append(f"{wing}/{room}/{name}|{entity_str}|→{drawer_ref}")
    return lines
```

Why it matters: closets are searchable pointers into verbatim drawers. They improve ranking and navigation but do not replace original content.

## 6. Conversation mining and normalization

### `mempalace/normalize.py` — format detection order

```python
def _try_normalize_json(content: str) -> Optional[str]:
    normalized = _try_claude_code_jsonl(content)
    if normalized:
        return normalized

    normalized = _try_codex_jsonl(content)
    if normalized:
        return normalized

    normalized = _try_gemini_jsonl(content)
    if normalized:
        return normalized

    data = json.loads(content)
    for parser in (_try_claude_ai_json, _try_chatgpt_json, _try_slack_json):
        normalized = parser(data)
        if normalized:
            return normalized
```

Why it matters: JSONL session formats are checked before generic JSON exports. Each parser returns a standard transcript shape, usually alternating user/assistant turns.

### `mempalace/normalize.py` — line-anchored noise stripping preserves user prose

```python
def strip_noise(text: str) -> str:
    """Remove system tags, hook output, and Claude Code UI chrome from text."""
    for pat in _NOISE_TAG_PATTERNS:
        text = pat.sub("", text)
    for pat in _NOISE_LINE_PATTERNS:
        text = pat.sub("", text)
    text = _HOOK_LINE_RE.sub("", text)
    text = _COLLAPSED_LINES_RE.sub("", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()
```

Why it matters: the code explicitly says “verbatim is sacred,” so noise removal is narrowly anchored to system/hook chrome and avoids crossing blank lines.

### `mempalace/convo_miner.py` — exchange-pair chunking preserves long answers

```python
if len(content) > CHUNK_SIZE:
    first_part = content[:CHUNK_SIZE]
    if len(first_part.strip()) > MIN_CHUNK_SIZE:
        chunks.append({"content": first_part, "chunk_index": len(chunks)})
    remainder = content[CHUNK_SIZE:]
    while remainder:
        part = remainder[:CHUNK_SIZE]
        remainder = remainder[CHUNK_SIZE:]
        if len(part.strip()) > MIN_CHUNK_SIZE:
            chunks.append({"content": part, "chunk_index": len(chunks)})
elif len(content.strip()) > MIN_CHUNK_SIZE:
    chunks.append({"content": content, "chunk_index": len(chunks)})
```

Why it matters: one user turn plus AI response is the preferred memory unit, but oversized exchanges are split rather than discarded.

### `mempalace/convo_miner.py` — zero-content files still get a registry sentinel

```python
def _register_file(collection, source_file: str, wing: str, agent: str):
    sentinel_id = f"_reg_{hashlib.sha256(source_file.encode()).hexdigest()[:24]}"
    collection.upsert(
        documents=[f"[registry] {source_file}"],
        ids=[sentinel_id],
        metadatas=[{"wing": wing, "room": "_registry", "source_file": source_file, ...}],
    )
```

Why it matters: files that normalize to nothing are not reprocessed forever. This is an idempotency pattern specific to conversation ingest.

## 7. Search and retrieval implementation

### `mempalace/searcher.py` — Chroma filters are assembled in one helper

```python
def build_where_filter(wing: str = None, room: str = None) -> dict:
    """Build ChromaDB where filter for wing/room filtering."""
    if wing and room:
        return {"$and": [{"wing": wing}, {"room": room}]}
    elif wing:
        return {"wing": wing}
    elif room:
        return {"room": room}
    return {}
```

Why it matters: CLI, MCP, and layers share wing/room filtering semantics.

### `mempalace/searcher.py` — BM25 is local and None-safe

```python
def _tokenize(text: str) -> list:
    """Lowercase + strip to alphanumeric tokens of length ≥ 2."""
    if not text:
        return []
    return _TOKEN_RE.findall(text.lower())
```

Why it matters: tests document production crashes where Chroma returned `None` documents. Retrieval code defensively degrades rather than throwing.

### `mempalace/searcher.py` — hybrid rank combines vector similarity and BM25

```python
for r, raw, norm in zip(results, bm25_raw, bm25_norm):
    distance = r.get("distance")
    if distance is None:
        vec_sim = 0.0
    else:
        vec_sim = max(0.0, 1.0 - distance)
    r["bm25_score"] = round(raw, 3)
    scored.append((vector_weight * vec_sim + bm25_weight * norm, r))

scored.sort(key=lambda pair: pair[0], reverse=True)
results[:] = [r for _, r in scored]
```

Why it matters: semantic vectors are the default, but lexical matches can rescue exact-term/code/log searches. The CLI and MCP paths both use hybrid ranking.

### `mempalace/searcher.py` — closets boost ranking but never gate recall

```python
# Hybrid retrieval: always query drawers directly (the floor), then use
# closet hits to boost rankings. Closets are a ranking SIGNAL, never a
# GATE — direct drawer search is always the baseline.
drawer_results = drawers_col.query(**dkwargs)

try:
    closets_col = get_closets_collection(palace_path, create=False)
    closet_results = closets_col.query(**ckwargs)
    # build closet_boost_by_source
except Exception:
    pass  # no closets yet — hybrid degrades to pure drawer search
```

Why it matters: weak closet extraction cannot hide verbatim drawer matches. This preserves the “drawer query is the floor” recall guarantee.

### `mempalace/searcher.py` — SQLite BM25 fallback avoids loading corrupt vector state

```python
def _bm25_only_via_sqlite(query: str, palace_path: str, ...):
    db_path = os.path.join(palace_path, "chroma.sqlite3")
    if not os.path.isfile(db_path):
        return {"error": "No palace found", "hint": "Run: mempalace init <dir> && mempalace mine <dir>"}

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = conn.execute(
        """
        SELECT rowid
        FROM embedding_fulltext_search
        WHERE embedding_fulltext_search MATCH ?
        LIMIT ?
        """,
        (fts_query, max_candidates),
    ).fetchall()
```

Why it matters: when HNSW metadata diverges enough that opening Chroma could segfault, MCP search can still return local BM25 results from SQLite.

### `mempalace/query_sanitizer.py` — prompt-contamination mitigation

```python
if original_length <= SAFE_QUERY_LENGTH:
    return {"clean_query": raw_query, "was_sanitized": False, ...}

# Look for question marks in later segments first.
for seg in reversed(all_segments):
    if _QUESTION_MARK.search(seg):
        question_sentences.append(seg)

if question_sentences:
    candidate = question_sentences[0].strip()
    return {"clean_query": candidate, "was_sanitized": True, "method": "question_extraction", ...}
```

Why it matters: agent clients sometimes send long system-prompt-contaminated queries. Search sanitization extracts the likely real query before embedding, preventing catastrophic retrieval degradation.

## 8. MCP server idioms

### `mempalace/mcp_server.py` — stdio protection before heavy imports

```python
_REAL_STDOUT = sys.stdout
_REAL_STDOUT_FD = None
try:
    _REAL_STDOUT_FD = os.dup(1)
    os.dup2(2, 1)
except (OSError, AttributeError):
    pass
sys.stdout = sys.stderr
```

Why it matters: MCP JSON-RPC uses stdout for protocol messages only. Dependencies that print banners to stdout can corrupt the stream, so stdout is redirected to stderr until `main()` restores it for JSON-RPC output.

### `mempalace/mcp_server.py` — vector-disabled flag is probed safely

```python
def _refresh_vector_disabled_flag() -> None:
    global _vector_disabled, _vector_disabled_reason, _vector_capacity_status
    try:
        info = hnsw_capacity_status(_config.palace_path, "mempalace_drawers")
    except Exception:
        logger.debug("HNSW capacity probe raised", exc_info=True)
        return
    _vector_capacity_status = info
    if info.get("diverged"):
        _vector_disabled = True
        _vector_disabled_reason = info.get("message", "")
    else:
        _vector_disabled = False
        _vector_disabled_reason = ""
```

Why it matters: the probe uses SQLite/pickle reads before Chroma is opened. Search/status can route around dangerous vector state.

### `mempalace/mcp_server.py` — write-ahead log redacts sensitive content

```python
_WAL_REDACT_KEYS = frozenset(
    {"content", "content_preview", "document", "entry", "entry_preview", "query", "text"}
)

def _wal_log(operation: str, params: dict, result: dict = None):
    safe_params = {}
    for k, v in params.items():
        if k in _WAL_REDACT_KEYS:
            safe_params[k] = f"[REDACTED {len(v)} chars]" if isinstance(v, str) else "[REDACTED]"
        else:
            safe_params[k] = v
```

Why it matters: MCP writes are auditable without leaking full user memory into logs.

### `mempalace/mcp_server.py` — tool registry is declarative

```python
TOOLS = {
    "mempalace_status": {
        "description": "Palace overview — total drawers, wing and room counts",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_status,
    },
    "mempalace_search": {
        "description": "Semantic search. Returns verbatim drawer content with similarity scores...",
        "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        "handler": tool_search,
    },
}
```

Why it matters: adding an MCP tool means adding a handler and a `TOOLS` entry. The same registry powers `tools/list` and `tools/call`.

### `mempalace/mcp_server.py` — dispatch filters and coerces arguments

```python
schema_props = TOOLS[tool_name]["input_schema"].get("properties", {})
sig = inspect.signature(handler)
accepts_var_keyword = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
if not accepts_var_keyword:
    tool_args = {k: v for k, v in tool_args.items() if k in schema_props}

for key, value in list(tool_args.items()):
    declared_type = schema_props.get(key, {}).get("type")
    if declared_type == "integer" and not isinstance(value, int):
        tool_args[key] = int(value)
    elif declared_type == "number" and not isinstance(value, (int, float)):
        tool_args[key] = float(value)
```

Why it matters: clients cannot pass internal-only parameters such as `added_by` or `source_file`, and JSON numeric types are normalized before handlers see them.

### `mempalace/mcp_server.py` — add drawer is idempotent and sanitized

```python
try:
    wing = sanitize_name(wing, "wing")
    room = sanitize_name(room, "room")
    content = sanitize_content(content)
except ValueError as e:
    return {"success": False, "error": str(e)}

drawer_id = f"drawer_{wing}_{room}_{hashlib.sha256((wing + room + content).encode()).hexdigest()[:24]}"

existing = col.get(ids=[drawer_id])
if existing and existing["ids"]:
    return {"success": True, "reason": "already_exists", "drawer_id": drawer_id}
```

Why it matters: MCP writes validate names/content and use deterministic IDs. Repeated calls with the same content are safe no-ops.

### `mempalace/mcp_server.py` — server loop returns JSON-RPC only

```python
def main():
    _restore_stdout()
    logger.info("MemPalace MCP Server starting...")
    _refresh_vector_disabled_flag()
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        request = json.loads(line.strip())
        response = handle_request(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
```

Why it matters: all human logs go to stderr, while stdout carries one JSON-RPC response per line.

## 9. Knowledge graph implementation

### `mempalace/knowledge_graph.py` — local SQLite schema with temporal validity

```python
conn.executescript("""
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'unknown',
        properties TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS triples (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        valid_from TEXT,
        valid_to TEXT,
        confidence REAL DEFAULT 1.0,
        source_closet TEXT,
        source_file TEXT,
        source_drawer_id TEXT,
        adapter_name TEXT,
        extracted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
""")
```

Why it matters: relationship facts are separate from vector drawers, time-scoped, and local. Provenance columns link facts back to closets/files/drawers.

### `mempalace/knowledge_graph.py` — add_triple auto-creates entities and dedupes current facts

```python
conn.execute("INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)", (sub_id, subject))
conn.execute("INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)", (obj_id, obj))

existing = conn.execute(
    "SELECT id FROM triples WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
    (sub_id, pred, obj_id),
).fetchone()

if existing:
    return existing["id"]
```

Why it matters: adding a fact is idempotent while a current identical triple exists. Changed facts are modeled by invalidating old rows rather than overwriting history.

### `mempalace/knowledge_graph.py` — as-of queries filter validity windows

```python
if as_of:
    query += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)"
    params.extend([as_of, as_of])
```

Why it matters: agents can ask “what was true at this date?” instead of only retrieving current facts.

## 10. Layered wake-up and recall

### `mempalace/layers.py` — MemoryStack wires L0-L3

```python
class MemoryStack:
    def __init__(self, palace_path: str = None, identity_path: str = None):
        cfg = MempalaceConfig()
        self.palace_path = palace_path or cfg.palace_path
        self.identity_path = identity_path or os.path.expanduser("~/.mempalace/identity.txt")

        self.l0 = Layer0(self.identity_path)
        self.l1 = Layer1(self.palace_path)
        self.l2 = Layer2(self.palace_path)
        self.l3 = Layer3(self.palace_path)
```

Why it matters: the public wake-up API is a lightweight composition over identity text, top memories, filtered recall, and deep search.

### `mempalace/layers.py` — wake-up returns identity + essential story

```python
def wake_up(self, wing: str = None) -> str:
    parts = []
    parts.append(self.l0.render())
    parts.append("")
    if wing:
        self.l1.wing = wing
    parts.append(self.l1.generate())
    return "\n".join(parts)
```

Why it matters: startup context is intentionally bounded. L0 comes from a user-controlled text file; L1 is generated from a capped scan of top drawers.

## 11. Validation and safety utilities

### `mempalace/config.py` — names reject traversal and unsafe chars

```python
def sanitize_name(value: str, field_name: str = "name") -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    value = value.strip()
    if len(value) > MAX_NAME_LENGTH:
        raise ValueError(f"{field_name} exceeds maximum length of {MAX_NAME_LENGTH} characters")
    if ".." in value or "/" in value or "\\" in value:
        raise ValueError(f"{field_name} contains invalid path characters")
    if "\x00" in value:
        raise ValueError(f"{field_name} contains null bytes")
    if not _SAFE_NAME_RE.match(value):
        raise ValueError(f"{field_name} contains invalid characters")
    return value
```

Why it matters: wing/room/entity names are used in metadata and IDs, so they are validated centrally before writes.

### `mempalace/config.py` — content length guard

```python
def sanitize_content(value: str, max_length: int = 100_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("content must be a non-empty string")
    if len(value) > max_length:
        raise ValueError(f"content exceeds maximum length of {max_length} characters")
    if "\x00" in value:
        raise ValueError("content contains null bytes")
    return value
```

Why it matters: MCP write tools accept external client input; content is bounded before storage.

## 12. Error handling patterns

### Missing palace becomes actionable user guidance

Files: `mempalace/searcher.py`, `mempalace/mcp_server.py`, `mempalace/miner.py`

```python
except Exception:
    print(f"\n  No palace found at {palace_path}")
    print("  Run: mempalace init <dir> then mempalace mine <dir>")
    raise SearchError(f"No palace found at {palace_path}")
```

Why it matters: CLI errors are human-readable and usually include the next command to run. MCP errors return dicts with `error`/`hint` instead of raising over JSON-RPC.

### Best-effort cleanup and metadata operations do not fail mining

Files: `mempalace/miner.py`, `mempalace/palace.py`, `mempalace/convo_miner.py`

```python
try:
    collection.delete(where={"source_file": source_file})
except Exception:
    pass
```

Why it matters: purge and cleanup operations are best effort when they are recovery aids. The code usually rechecks idempotency before writing and lets the fresh upsert path proceed.

### KeyboardInterrupt gets resumable progress reporting

File: `mempalace/miner.py`

```python
except KeyboardInterrupt:
    print("\n\n  Mine interrupted.")
    print(f"    files_processed: {files_processed}/{len(files)}")
    print(f"    drawers_filed:   {total_drawers}")
    print(f"    last_file:       {last_file or '<none>'}")
    print(
        f"\n  Re-run `mempalace mine {shlex.quote(project_dir)}` to resume — "
        "already-filed drawers are\n  upserted idempotently and will not duplicate.\n"
    )
    sys.exit(130)
```

Why it matters: mining can take a long time. Interrupting it is safe because drawer IDs are deterministic and re-runs are idempotent.

### MCP internal exceptions are logged but hidden from clients

File: `mempalace/mcp_server.py`

```python
try:
    result = TOOLS[tool_name]["handler"](**tool_args)
    return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}}
except Exception:
    logger.exception(f"Tool error in {tool_name}")
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32000, "message": "Internal tool error"},
    }
```

Why it matters: server logs retain stack traces, while MCP clients get stable JSON-RPC errors without accidental data leakage.

## 13. Test idioms worth copying

### `tests/test_mcp_server.py` — tests patch module globals to isolate real user data

```python
def _patch_mcp_server(monkeypatch, config, kg):
    """Patch the mcp_server module globals to use test fixtures."""
    from mempalace import mcp_server

    monkeypatch.setattr(mcp_server, "_config", config)
    monkeypatch.setattr(mcp_server, "_kg", kg)
```

Why it matters: MCP module globals are initialized at import time. Tests monkeypatch `_config` and `_kg` so they operate on isolated temp palaces and KGs.

### `tests/test_searcher.py` — regression tests encode production failure modes

```python
def test_tokenize_handles_none(self):
    from mempalace.searcher import _tokenize

    assert _tokenize(None) == []

def test_bm25_scores_does_not_crash_on_none_documents(self):
    scores = _bm25_scores("postgres migration", ["postgres migration done", None, "kafka rebalance"])
    assert len(scores) == 3
    assert scores[1] == 0.0
```

Why it matters: many tests document exact bugs and issue numbers. Future changes should preserve that style: name the failure mode and assert graceful degradation.

## 14. Mental model for future engineers

1. **CLI entry**: `mempalace.cli:main` parses commands and delegates.
2. **Mine project files**: `miner.scan_project()` → `process_file()` → deterministic drawer IDs in `mempalace_drawers` + compact closet pointers in `mempalace_closets`.
3. **Mine conversations**: `normalize.normalize()` converts chat exports → `convo_miner.chunk_exchanges()` or `general_extractor.extract_memories()` → same palace storage.
4. **Search**: direct drawer vector query is baseline; closets and BM25 only boost/re-rank. SQLite BM25 fallback avoids unsafe HNSW loads.
5. **MCP**: `mempalace.mcp_server:main` exposes tools through a declarative `TOOLS` map, sanitizes arguments, and returns JSON-RPC on stdout only.
6. **KG**: `KnowledgeGraph` is a local SQLite temporal graph; it complements drawers but does not replace verbatim memory.
7. **Wake-up**: `MemoryStack` composes identity, essential story, filtered recall, and deep semantic search.

The strongest implementation idioms are deterministic IDs, local-first privacy gates, explicit sanitization, pre-open Chroma safety probes, best-effort degradation, and preserving verbatim drawers as the source of truth.
