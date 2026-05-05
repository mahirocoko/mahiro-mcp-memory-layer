# MemPalace Code Snippets

Deep learn run: `2026-05-05 11:37`  
Source read from: `./origin/`  
Focus: representative implementation snippets, not whole-file copies.

## Main entry points

### Console scripts route into CLI and MCP server

`pyproject.toml:40-45`

```toml
[project.scripts]
mempalace = "mempalace.cli:main"
mempalace-mcp = "mempalace.mcp_server:main"

[project.entry-points."mempalace.backends"]
chroma = "mempalace.backends.chroma:ChromaBackend"
```

The package exposes two public executables: the human CLI (`mempalace`) and the stdio MCP server (`mempalace-mcp`). Storage is already extension-shaped through an entry-point group.

### `python -m mempalace` delegates to the same CLI

`mempalace/__main__.py:1-5`

```python
"""Allow running as: python -m mempalace"""

from .cli import main

main()
```

There is no separate module-mode behavior; all command parsing remains centralized in `mempalace.cli`.

### CLI command table is explicit and simple

`mempalace/cli.py:938-957`, `mempalace/cli.py:1282-1296`

```python
def main():
    version_label = f"MemPalace {__version__}"
    parser = argparse.ArgumentParser(
        description="MemPalace — Give your AI a memory. No API key required.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"{version_label}\n\n{__doc__}",
    )
    parser.add_argument("--version", action="version", version=version_label)
    parser.add_argument("--palace", default=None, help="Where the palace lives ...")

    sub = parser.add_subparsers(dest="command")
```

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

The CLI favors an argparse dispatcher rather than framework magic. This makes command behavior easy to trace: parse options, handle a few nested subcommands, then call a `cmd_*` function.

## MCP server patterns

### Protect stdout before importing noisy dependencies

`mempalace/mcp_server.py:26-44`

```python
# stdout MUST carry only valid JSON-RPC messages, stderr is for logs.
_REAL_STDOUT = sys.stdout
_REAL_STDOUT_FD = None
try:
    _REAL_STDOUT_FD = os.dup(1)
    os.dup2(2, 1)
except (OSError, AttributeError):
    pass
sys.stdout = sys.stderr
```

The server redirects stdout to stderr before heavy imports because Chroma/ONNX dependencies can print banners. `main()` later restores stdout only for JSON-RPC output.

### Tool handlers wrap core functions and sanitize inputs

`mempalace/mcp_server.py:611-660`

```python
def tool_search(query: str, limit: int = 5, wing: str = None, room: str = None, max_distance: float = 1.5, min_similarity: float = None, context: str = None):
    limit = max(1, min(limit, _MAX_RESULTS))
    try:
        wing = _sanitize_optional_name(wing, "wing")
        room = _sanitize_optional_name(room, "room")
    except ValueError as e:
        return {"error": str(e)}
    dist = (1.0 - min_similarity) if min_similarity is not None else max_distance
    sanitized = sanitize_query(query)
    _refresh_vector_disabled_flag()
    result = search_memories(
        sanitized["clean_query"],
        palace_path=_config.palace_path,
        wing=wing,
        room=room,
        n_results=limit,
        max_distance=dist,
        vector_disabled=_vector_disabled,
    )
```

MCP handlers are thin but defensive: clamp result counts, validate wing/room names, sanitize prompt-contaminated queries, probe vector safety, then delegate to `searcher.search_memories`.

### Tool registry doubles as schema and dispatch table

`mempalace/mcp_server.py:1663-1693`

```python
"mempalace_search": {
    "description": "Semantic search. Returns verbatim drawer content with similarity scores. IMPORTANT: 'query' must contain ONLY search keywords. Use 'context' for background. Results with cosine distance > max_distance are filtered out.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Short search query ONLY — keywords or a question. Max 250 chars.", "maxLength": 250},
            "limit": {"type": "integer", "description": "Max results (default 5)", "minimum": 1, "maximum": 100},
            "wing": {"type": "string", "description": "Filter by wing (optional)"},
            "room": {"type": "string", "description": "Filter by room (optional)"},
            "max_distance": {"type": "number", "description": "Max cosine distance threshold ..."},
            "context": {"type": "string", "description": "Background context ... NOT used for embedding ..."},
        },
        "required": ["query"],
    },
    "handler": tool_search,
},
```

Adding an MCP tool means adding a handler plus a `TOOLS` entry. The registry drives both `tools/list` and `tools/call`.

### JSON-RPC handler filters and coerces tool arguments

`mempalace/mcp_server.py:1939-1987`

```python
# Whitelist arguments to declared schema properties only.
schema_props = TOOLS[tool_name]["input_schema"].get("properties", {})
...
if not accepts_var_keyword:
    tool_args = {k: v for k, v in tool_args.items() if k in schema_props}

for key, value in list(tool_args.items()):
    prop_schema = schema_props.get(key, {})
    declared_type = prop_schema.get("type")
    try:
        if declared_type == "integer" and not isinstance(value, int):
            tool_args[key] = int(value)
        elif declared_type == "number" and not isinstance(value, (int, float)):
            tool_args[key] = float(value)
    except (ValueError, TypeError):
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": f"Invalid value for parameter '{key}'"}}
```

This is a notable safety idiom: schemas are not just documentation; they constrain caller-provided arguments and normalize JSON transport types before handlers run.

## Mining and verbatim storage

### Project text chunks prefer natural boundaries

`mempalace/miner.py:371-411`

```python
def chunk_text(content: str, source_file: str) -> list:
    content = content.strip()
    if not content:
        return []

    chunks = []
    start = 0
    chunk_index = 0

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
            chunk_index += 1

        start = end - CHUNK_OVERLAP if end < len(content) else end
```

The miner stores verbatim chunks but still tries to avoid cutting across paragraph or line boundaries. Overlap preserves context across drawer boundaries.

### Drawer metadata is centralized for batch writes

`mempalace/miner.py:733-763`

```python
def _build_drawer_metadata(wing: str, room: str, source_file: str, chunk_index: int, agent: str, content: str, source_mtime: Optional[float]) -> dict:
    metadata = {
        "wing": wing,
        "room": room,
        "source_file": source_file,
        "chunk_index": chunk_index,
        "added_by": agent,
        "filed_at": datetime.now().isoformat(),
        "normalize_version": NORMALIZE_VERSION,
    }
    if source_mtime is not None:
        metadata["source_mtime"] = source_mtime
    metadata["hall"] = detect_hall(content)
    entities = _extract_entities_for_metadata(content)
    if entities:
        metadata["entities"] = entities
    return metadata
```

`add_drawer` is retained for compatibility, but current mining builds metadata in batches so embeddings can be amortized across many chunks.

### Re-mining is serialized per source file and replaces stale chunks

`mempalace/miner.py:829-880`

```python
with mine_lock(source_file):
    if file_already_mined(collection, source_file, check_mtime=True):
        return 0, room

    try:
        collection.delete(where={"source_file": source_file})
    except Exception:
        pass

    drawers_added = 0
    for batch_start in range(0, len(chunks), DRAWER_UPSERT_BATCH_SIZE):
        batch_docs: list = []
        batch_ids: list = []
        batch_metas: list = []
        for chunk in chunks[batch_start : batch_start + DRAWER_UPSERT_BATCH_SIZE]:
            drawer_id = f"drawer_{wing}_{room}_{hashlib.sha256((source_file + str(chunk['chunk_index'])).encode()).hexdigest()[:24]}"
            batch_docs.append(chunk["content"])
            batch_ids.append(drawer_id)
            batch_metas.append(_build_drawer_metadata(...))
        collection.upsert(documents=batch_docs, ids=batch_ids, metadatas=batch_metas)
```

Two implementation ideas matter here: deterministic drawer IDs from source path + chunk index, and purge-before-insert to avoid stale normalize versions and Chroma update-path crashes.

### Closets are compact pointer indexes, not the source of truth

`mempalace/palace.py:163-218`

```python
def build_closet_lines(source_file, drawer_ids, content, wing, room):
    """Build compact closet pointer lines from drawer content.

    Format: topic|entities|→drawer_ids
    """
    drawer_ref = ",".join(drawer_ids[:3])
    window = content[:CLOSET_EXTRACT_WINDOW]
    ...
    for topic in topics:
        lines.append(f"{topic}|{entity_str}|→{drawer_ref}")
    for quote in quotes[:3]:
        lines.append(f'"{quote}"|{entity_str}|→{drawer_ref}')

    if not lines:
        name = Path(source_file).stem[:40]
        lines.append(f"{wing}/{room}/{name}|{entity_str}|→{drawer_ref}")
```

Closets are the searchable index layer. They point to drawers with `→drawer_id` references, but the actual stored memory remains the verbatim drawer content.

### Conversation mining chunks by exchange, preserving long answers

`mempalace/convo_miner.py:99-164`

```python
def chunk_exchanges(content: str) -> list:
    lines = content.split("\n")
    quote_lines = sum(1 for line in lines if line.strip().startswith(">"))

    if quote_lines >= 3:
        return _chunk_by_exchange(lines)
    else:
        return _chunk_by_paragraph(content)

def _chunk_by_exchange(lines: list) -> list:
    """One user turn (>) + the AI response that follows = one or more chunks."""
    ...
    if len(content) > CHUNK_SIZE:
        first_part = content[:CHUNK_SIZE]
        ...
        remainder = content[CHUNK_SIZE:]
        while remainder:
            part = remainder[:CHUNK_SIZE]
            remainder = remainder[CHUNK_SIZE:]
            if len(part.strip()) > MIN_CHUNK_SIZE:
                chunks.append({"content": part, "chunk_index": len(chunks)})
```

Conversation mode uses a different unit of memory: user turn + assistant response. Long responses are split rather than discarded, matching the “verbatim always” design principle.

## Retrieval implementation

### Typed-result compatibility helper avoids empty result crashes

`mempalace/searcher.py:35-47`

```python
def _first_or_empty(results, key: str) -> list:
    outer = getattr(results, key, None) if not isinstance(results, dict) else results.get(key)
    if not outer:
        return []
    return outer[0] or []
```

This small helper supports both new dataclass results and legacy Chroma dict mocks, while avoiding `IndexError` on empty collections.

### Hybrid ranking combines vector distance and BM25

`mempalace/searcher.py:121-165`

```python
def _hybrid_rank(results: list, query: str, vector_weight: float = 0.6, bm25_weight: float = 0.4) -> list:
    if not results:
        return results

    docs = [r.get("text", "") for r in results]
    bm25_raw = _bm25_scores(query, docs)
    max_bm25 = max(bm25_raw) if bm25_raw else 0.0
    bm25_norm = [s / max_bm25 for s in bm25_raw] if max_bm25 > 0 else [0.0] * len(bm25_raw)

    scored = []
    for r, raw, norm in zip(results, bm25_raw, bm25_norm):
        distance = r.get("distance")
        vec_sim = 0.0 if distance is None else max(0.0, 1.0 - distance)
        r["bm25_score"] = round(raw, 3)
        scored.append((vector_weight * vec_sim + bm25_weight * norm, r))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    results[:] = [r for _, r in scored]
    return results
```

The search layer keeps semantic similarity and keyword relevance separate, then normalizes BM25 within the candidate set before combining scores.

### Drawer search is the floor; closets only boost

`mempalace/searcher.py:753-798`

```python
# Hybrid retrieval: always query drawers directly (the floor), then use
# closet hits to boost rankings. Closets are a ranking SIGNAL, never a GATE.
try:
    dkwargs = {"query_texts": [query], "n_results": n_results * 3, "include": ["documents", "metadatas", "distances"]}
    if where:
        dkwargs["where"] = where
    drawer_results = drawers_col.query(**dkwargs)
except Exception as e:
    return {"error": f"Search error: {e}"}

closet_boost_by_source: dict = {}
try:
    closets_col = get_closets_collection(palace_path, create=False)
    ...
except Exception:
    pass  # no closets yet — hybrid degrades to pure drawer search
```

This is the core retrieval idiom: weak closet extraction can improve ranking, but can never hide a directly matching drawer.

### Closet-boosted hits are hydrated with neighboring chunks

`mempalace/searcher.py:855-908`

```python
for h in hits:
    if h["matched_via"] == "drawer":
        continue
    full_source = h.get("_source_file_full") or ""
    ...
    indexed.sort(key=lambda p: p[0])
    ordered_docs = [d for _, d in indexed]

    query_terms = set(_tokenize(query))
    best_idx, best_score = 0, -1
    for idx, d in enumerate(ordered_docs):
        d_lower = d.lower()
        s = sum(1 for t in query_terms if t in d_lower)
        if s > best_score:
            best_score, best_idx = s, idx

    start = max(0, best_idx - 1)
    end = min(len(ordered_docs), best_idx + 2)
    expanded = "\n\n".join(ordered_docs[start:end])
```

When closets identify a relevant source but vectors land on the wrong chunk, search reselects the keyword-best drawer and includes immediate neighbors.

## Extension seams

### Backend contract uses typed dataclasses and explicit errors

`mempalace/backends/base.py:26-56`, `mempalace/backends/base.py:117-165`

```python
class BackendError(Exception):
    """Base class for every storage-backend error raised by core."""

class PalaceNotFoundError(BackendError, FileNotFoundError):
    """Raised when get_collection(create=False) is called on a missing palace."""

class UnsupportedFilterError(BackendError):
    """Raised when a where-clause uses an operator the backend does not implement."""
```

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
        return cls(ids=[[] for _ in range(num_queries)], documents=[[] for _ in range(num_queries)], metadatas=[[] for _ in range(num_queries)], distances=[[] for _ in range(num_queries)], embeddings=empty_outer if embeddings_requested else None)
```

The backend layer is moving away from raw Chroma dicts but keeps dict-like compatibility during migration.

### Chroma backend rejects unsupported filters instead of ignoring them

`mempalace/backends/chroma.py:58-77`

```python
def _validate_where(where: Optional[dict]) -> None:
    """Scan a where-clause for unknown operators and raise UnsupportedFilterError."""
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
            if isinstance(v, dict):
                stack.append(v)
            elif isinstance(v, list):
                stack.extend(x for x in v if isinstance(x, dict))
```

The code prefers explicit failure over silently broadening or narrowing searches when a backend cannot honor a filter.

### Source adapters are a parallel ingest-side plugin seam

`mempalace/sources/base.py:164-245`

```python
class BaseSourceAdapter(ABC):
    name: ClassVar[str]
    spec_version: ClassVar[str] = "1.0"
    adapter_version: ClassVar[str] = "0.0.0"
    capabilities: ClassVar[frozenset[str]] = frozenset()
    supported_modes: ClassVar[frozenset[str]] = frozenset({"chunked_content"})
    declared_transformations: ClassVar[frozenset[str]] = frozenset()
    default_privacy_class: ClassVar[str] = "pii_potential"

    @abstractmethod
    def ingest(self, *, source: SourceRef, palace: "PalaceContext") -> Iterator[IngestResult]: ...

    @abstractmethod
    def describe_schema(self) -> AdapterSchema: ...

    def is_current(self, *, item: SourceItemMetadata, existing_metadata: Optional[dict]) -> bool:
        return False
```

This is scaffolding for third-party source packages. It encodes privacy class, transformations, schema, incrementality, and adapter identity.

### Adapter registry discovers entry points lazily and caches instances

`mempalace/sources/registry.py:60-93`, `mempalace/sources/registry.py:111-129`

```python
def _discover_entry_points() -> None:
    global _discovered
    if _discovered:
        return
    with _lock:
        if _discovered:
            return
        try:
            eps = metadata.entry_points()
            group = eps.select(group=_ENTRY_POINT_GROUP) if hasattr(eps, "select") else eps.get(_ENTRY_POINT_GROUP, [])
        except Exception:
            logger.exception("entry-point discovery for %s failed", _ENTRY_POINT_GROUP)
            group = []
        for ep in group:
            if ep.name in _explicit:
                continue
            try:
                cls = ep.load()
            except Exception:
                logger.exception("failed to load adapter entry point %r", ep.name)
                continue
            if not isinstance(cls, type) or not issubclass(cls, BaseSourceAdapter):
                logger.warning("entry point %r did not resolve to a BaseSourceAdapter subclass", ep.name)
                continue
            _registry.setdefault(ep.name, cls)
        _discovered = True
```

```python
def get_adapter(name: str) -> BaseSourceAdapter:
    _discover_entry_points()
    with _lock:
        inst = _instances.get(name)
        if inst is not None:
            return inst
        cls = _registry.get(name)
        if cls is None:
            raise KeyError(f"unknown source adapter {name!r}; available: {sorted(_registry.keys())}")
        inst = cls()
        _instances[name] = inst
        return inst
```

Explicit registration wins over discovered plugins; adapter objects are long-lived and resettable for tests.

## Knowledge graph and wake-up layers

### Temporal KG stores validity windows and provenance in SQLite

`mempalace/knowledge_graph.py:63-99`, `mempalace/knowledge_graph.py:149-221`

```python
conn.executescript("""
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS entities (...);

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
        extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject) REFERENCES entities(id),
        FOREIGN KEY (object) REFERENCES entities(id)
    );
""")
```

```python
existing = conn.execute(
    "SELECT id FROM triples WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
    (sub_id, pred, obj_id),
).fetchone()

if existing:
    return existing["id"]  # Already exists and still valid
```

The KG is local SQLite with WAL mode and thread locking. It deduplicates currently-valid facts and keeps provenance back to closets/files/drawers.

### Layered wake-up keeps startup context bounded

`mempalace/layers.py:76-177`

```python
class Layer1:
    MAX_DRAWERS = 15
    MAX_CHARS = 3200
    MAX_SCAN = 2000

    def generate(self) -> str:
        try:
            col = _get_collection(self.palace_path, create=False)
        except Exception:
            return "## L1 — No palace found. Run: mempalace mine <dir>"
        ...
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[: self.MAX_DRAWERS]
        ...
        if total_len + len(entry_line) > self.MAX_CHARS:
            lines.append("  ... (more in L3 search)")
            return "\n".join(lines)
```

The wake-up stack is intentionally bounded: Layer 1 scans at most 2,000 drawers, emits at most 15 moments, and caps text around 3,200 characters.

## Input validation and contamination handling

### Names, KG values, and content have separate validation rules

`mempalace/config.py:32-92`

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

Wing/room names are filesystem-safe; KG values are more permissive; drawer content is length- and null-byte-checked.

### Query sanitizer mitigates prompt-contaminated embeddings

`mempalace/query_sanitizer.py:39-66`, `mempalace/query_sanitizer.py:101-152`

```python
def sanitize_query(raw_query: str) -> dict:
    if not raw_query or not raw_query.strip():
        return {
            "clean_query": raw_query or "",
            "was_sanitized": False,
            "original_length": len(raw_query) if raw_query else 0,
            "clean_length": len(raw_query) if raw_query else 0,
            "method": "passthrough",
        }
```

```python
if original_length <= SAFE_QUERY_LENGTH:
    return {"clean_query": raw_query, "was_sanitized": False, "original_length": original_length, "clean_length": original_length, "method": "passthrough"}

question_sentences = []
for seg in reversed(all_segments):
    if _QUESTION_MARK.search(seg):
        question_sentences.append(seg)

if question_sentences:
    candidate = question_sentences[0].strip()
    if len(candidate) >= MIN_QUERY_LENGTH:
        if len(candidate) > MAX_QUERY_LENGTH:
            candidate = _trim_candidate(candidate)
        logger.warning("Query sanitized: %d → %d chars (method=question_extraction)", original_length, len(candidate))
        return {"clean_query": candidate, "was_sanitized": True, "original_length": original_length, "clean_length": len(candidate), "method": "question_extraction"}
```

The sanitizer treats long agent-generated queries as potentially contaminated by system prompts and tries to recover the actual search intent near the tail.

## Error handling idioms

### Fail open for optional metadata/index paths

`mempalace/palace.py:221-231`

```python
def purge_file_closets(closets_col, source_file: str) -> None:
    try:
        closets_col.delete(where={"source_file": source_file})
    except Exception:
        pass
```

Many secondary paths (closets, metadata caches, probe checks) fail open so a non-critical index issue does not block verbatim drawer storage or search.

### Return structured errors for user/tool surfaces

`mempalace/searcher.py:744-752`, `mempalace/mcp_server.py:816-821`

```python
try:
    drawers_col = get_collection(palace_path, create=False)
except Exception as e:
    logger.error("No palace found at %s: %s", palace_path, e)
    return {
        "error": "No palace found",
        "hint": "Run: mempalace init <dir> && mempalace mine <dir>",
    }
```

```python
try:
    wing = sanitize_name(wing, "wing")
    room = sanitize_name(room, "room")
    content = sanitize_content(content)
except ValueError as e:
    return {"success": False, "error": str(e)}
```

CLI/MCP-facing functions generally convert expected failures into JSON-friendly error dictionaries instead of throwing through the transport.

### HNSW safety avoids loading potentially crashing vector segments

`mempalace/backends/chroma.py:240-266`, `mempalace/mcp_server.py:134-167`

```python
def _vector_segment_id(palace_path: str, collection_name: str) -> Optional[str]:
    """Return the VECTOR segment UUID for collection_name or None.

    Reads chroma.sqlite3 directly so we never have to load a segment
    that may segfault on open.
    """
    db_path = os.path.join(palace_path, "chroma.sqlite3")
    if not os.path.isfile(db_path):
        return None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        ...
    except sqlite3.Error:
        return None
```

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

Search can route to BM25-only fallback when HNSW capacity diverges, avoiding a known segfault path while still preserving local recall via SQLite.

## Interesting idioms to remember

- **Verbatim drawers + compact closets**: drawers store exact source text; closets store small `topic|entities|→drawer` pointers for ranking.
- **Deterministic IDs**: drawer and closet IDs use hashes of source path/content/position, enabling idempotent writes and duplicate checks.
- **Fail-open secondary systems**: optional indexes, probes, and enrichment paths catch broad exceptions to keep the primary memory path available.
- **Schema-driven MCP dispatch**: tool schemas are used for discovery, argument whitelisting, and numeric coercion.
- **Thread/process safety**: mining uses palace-level and file-level locks; SQLite KG uses a `threading.Lock`; source adapters are cached behind a registry lock.
- **Migration shims**: typed backend result dataclasses still implement dict-like access so tests and older callers can move gradually.
