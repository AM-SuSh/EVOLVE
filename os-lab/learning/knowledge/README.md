# EVOLVE Knowledge Source Inventory

This directory contains the versioned source inventory and access policy used
to build the tutor knowledge base. The inventory only contains canonical
sources selected for ingestion; rejected mirrors and deferred sources are not
stored as Source records.

## Selection Rules

1. Platform-owned Lab manuals and Lab package metadata are authoritative for
   the current exercise behavior.
2. Prefer stable, hashable files whose text layer passes quality audit; a
   damaged local PDF must not win over a clean official chapter snapshot.
3. Prefer source repositories or structured course pages over duplicated
   navigation pages.
4. Student Tutor sources must not include answer keys, reference patches, or
   complete reference implementations.
5. Every remote source must be snapshotted and version-pinned before ingestion.
6. License and redistribution terms must be reviewed before a remote snapshot
   is bundled or published.

## Canonical Source Choices

- OSTEP: use 31 official Chinese chapter PDFs covering process, memory,
  concurrency, I/O, and file systems. The merged local PDF is excluded because
  its text layer corrupts code lines and Chinese character mappings.
- RISC-V Reader: use the local PDF at the workspace root instead of downloading
  the supplied remote copy.
- OS lectures: use the Markdown source repository as the canonical form. The
  online lecture site and Yuque list remain discovery links only.
- rCore experiment guidance: use the published Tutorial Guide as the initial
  student-facing source. Reference code and tests are not part of the Tutor
  corpus.

## Files

- `sources.json`: machine-readable canonical sources selected for ingestion.
- `validate-sources.mjs`: zero-dependency structural and local-path validation.
- `access-policy.json`: content classes, source bindings, hard-deny rules, and
  teacher-upload defaults.
- `validate-access-policy.mjs`: validates policy/source coverage and denies
  Tutor access to teacher-only content.
- `document-schema.json` and `normalize.py`: normalize Markdown, HTML,
  JSON/YAML, text, and PDF into traceable Document/Block JSON.
- `chunk-schema.json` and `chunk.py`: build deterministic chunks without
  crossing section boundaries, retaining policy and source locators.
- `quality_filter.py`: apply auditable Block/Chunk quality gates, concept
  semantic projection, deduplication, and answer-risk rejection.
- `build_lab_chunks.py`: normalize, chunk, and validate all Lab1-Lab8 manuals,
  then write an inspectable local build manifest.
- `fetch_source_snapshots.py` and `build_knowledge_sources.py`: fetch pinned,
  text-only remote snapshots and build the other seven canonical sources.
- `knowledge-schema.sql` and `knowledge-store.mjs`: versioned SQLite/FTS5
  persistence, scoped search, ingestion audit, and rollback.
- `knowledge-cli.mjs`: initialize, ingest, inspect, search, and roll back the
  local knowledge database.
- `test_normalize.py`, `test_chunk.py`, `test_quality_filter.py`, and
  `test_build_lab_chunks.py`: parser, quality, chunking, and eight-Lab tests.

Run the inventory validation from `os-lab`:

```powershell
node learning/knowledge/validate-sources.mjs
node learning/knowledge/validate-access-policy.mjs
python -m unittest -v `
  learning/knowledge/test_build_lab_chunks.py `
  learning/knowledge/test_chunk.py `
  learning/knowledge/test_quality_filter.py `
  learning/knowledge/test_normalize.py
```

Build all Lab1-Lab8 manual chunks:

```powershell
python learning/knowledge/build_lab_chunks.py
```

Build and ingest all eight canonical sources from `os-lab/handbook`:

```powershell
npm run knowledge:fetch
npm run knowledge:build:all
npm run knowledge:ingest:all
npm run knowledge:embed
npm run knowledge:stats
```

Git snapshots are pinned by commit; OSTEP chapter snapshots record per-file
URL, byte count, and SHA-256. All snapshots live in the ignored
`build/snapshots/` directory. The current full build contains 8 sources, 220
current documents, 2,312 active chunks, and 2,288 FTS/vector-indexed chunks.
The remaining 24 answer-risk or policy-restricted chunks stay available for
explicit teacher review but are not Tutor-retrievable.

The generated files are intentionally local build artifacts:

```text
learning/knowledge/build/lab-manuals/
  manifest.json
  documents/lab1.document.json ... lab8.document.json
  chunks/lab1.chunks.json ... lab8.chunks.json
```

Inspect the summary or one Lab from PowerShell:

```powershell
Get-Content learning/knowledge/build/lab-manuals/manifest.json -Encoding utf8
Get-Content learning/knowledge/build/lab-manuals/chunks/lab1.chunks.json -Encoding utf8
```

`manifest.json` records each Lab's source hash, block/chunk counts, risk counts,
content classes, and scope. The `build/` directory is ignored by Git because it
is reproducible; run the build command after source or chunking changes.

## SQLite and FTS5

The knowledge database is separate from the account/evidence database and is
stored at `learning/knowledge/knowledge.db` by default. It is ignored by Git and
can be rebuilt from versioned sources.

```powershell
# From os-lab/handbook
npm run knowledge:build
npm run knowledge:ingest
npm run knowledge:stats

# Search from os-lab/
node learning/knowledge/knowledge-cli.mjs search --lab lab2 --query "任务切换" --limit 3
node learning/knowledge/knowledge-cli.mjs versions --source platform-lab-manuals
```

FTS5 uses the `trigram` tokenizer for Chinese substring retrieval. Queries with
fewer than three Unicode characters use a policy-filtered `LIKE` fallback.
Search always requires the current published version, `active=1`,
`indexable=1`, an allowed content class, and a matching Lab or `global` binding.

Re-ingesting the same manifest is idempotent. A changed manifest creates a new
immutable source version, atomically activates its chunks, removes the previous
version from FTS, and retains the old rows for audit and rollback:

```powershell
node learning/knowledge/knowledge-cli.mjs rollback `
  --source platform-lab-manuals `
  --version "<version-id>" `
  --actor "<teacher>"
```

Normalize and chunk one document when debugging a specific source:

```powershell
python learning/knowledge/normalize.py labs/lab2-trap-and-task.md `
  --source-id platform-lab-manuals `
  --output tmp/lab2.document.json

python learning/knowledge/chunk.py tmp/lab2.document.json `
  --policy learning/knowledge/access-policy.json `
  --output tmp/lab2.chunks.json
```

Chunks never merge blocks across different `sectionPath` values. The default
uses no implicit text overlap; stable source locators and the complete parent
heading path provide context without duplicating citation ranges. Each chunk
also carries `contentClass`, `labScope`, `conceptIds`, `answerRisk`, and an
`indexable` decision for the later SQLite/FTS ingestion gate.

## Access Boundary

The policy separates four content classes:

- `student-safe`: retrievable and citable to students.
- `guided-hint`: usable by the Tutor to construct a hint, but not quoted as a
  solution.
- `teacher-only`: unavailable to the student Tutor.
- `system-metadata`: available to the server controller but excluded from
  full-text retrieval.

Teacher uploads default to `teacher-only` and `pending-review`. They become
retrievable only after a teacher assigns scope, licensing status, and a content
class, then publishes the source.

## Teacher workspace and Tutor RAG

Run the Tutor Server and handbook, sign in as a teacher, then open
`/teacher/knowledge`. The workspace exposes the complete Source -> Version ->
Document -> Section -> Chunk trace and supports upload, review, publish,
disable, chunk policy edits, and rollback.

Teacher uploads support PDF, EPUB, Markdown, TXT, and DOCX. The server saves the
original file under `learning/uploads/knowledge/`, runs the same normalizer and
section-aware chunker used by built-in sources, and records rule-based Lab
suggestions with confidence and evidence. Suggested scopes are never published
automatically. Legacy `.doc` is rejected because it cannot be parsed reliably
without a separate binary converter.

Tutor retrieval runs only after the direct-answer guardrail. It requests the
current Lab plus `global`, permits only `student-safe` and `guided-hint`, returns
at most five chunks with at most two global-only chunks, and validates every
`kb:` citation against the current turn's recall set. Runtime run/trace evidence
continues to outrank retrieved teaching material.

## Hybrid retrieval and embeddings

`knowledge_chunk_embeddings` is a rebuildable derivative of the relational
Chunk table. `hybrid-retriever.mjs` fuses FTS candidates and cosine-similarity
candidates with Reciprocal Rank Fusion, then applies small authority and exact
Lab boosts. Permission, current-version, active/indexable, and Tutor chunk
limits remain hard filters after fusion.

The default `local-feature-hash-v1-384` provider is deterministic and offline;
it combines Chinese trigrams, code identifiers, and a small OS concept-alias
map. For a real semantic model, set `OS_LAB_EMBEDDING_BASE_URL`,
`OS_LAB_EMBEDDING_MODEL`, and optionally `OS_LAB_EMBEDDING_API_KEY` for an
OpenAI-compatible `/embeddings` endpoint. A provider failure falls back to FTS
and is recorded as a retrieval diagnostic rather than failing the Tutor.

```powershell
# From os-lab/handbook
npm run knowledge:embed
node ../learning/knowledge/knowledge-cli.mjs search --lab lab2 --query "scheduler"
```
