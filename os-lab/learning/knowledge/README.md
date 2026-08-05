# OS Lab Knowledge Source Inventory

This directory contains the versioned source inventory and access policy used
to build the tutor knowledge base. The inventory only contains canonical
sources selected for ingestion; rejected mirrors and deferred sources are not
stored as Source records.

## Selection Rules

1. Platform-owned Lab manuals and Lab package metadata are authoritative for
   the current exercise behavior.
2. Prefer local, stable files over equivalent remote mirrors.
3. Prefer source repositories or structured course pages over duplicated
   navigation pages.
4. Student Tutor sources must not include answer keys, reference patches, or
   complete reference implementations.
5. Every remote source must be snapshotted and version-pinned before ingestion.
6. License and redistribution terms must be reviewed before a remote snapshot
   is bundled or published.

## Canonical Source Choices

- OSTEP: use the complete local PDF at the workspace root. Do not ingest the
  split chapter PDFs under `操作系统/` or either online Chinese mirror.
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

Run the inventory validation from `os-lab`:

```powershell
node learning/knowledge/validate-sources.mjs
node learning/knowledge/validate-access-policy.mjs
```

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

