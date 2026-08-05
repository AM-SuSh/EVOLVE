PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('builtin', 'teacher-upload')),
  authority_rank INTEGER NOT NULL DEFAULT 0,
  default_class TEXT NOT NULL CHECK (default_class IN ('student-safe', 'guided-hint', 'teacher-only', 'system-metadata')),
  status TEXT NOT NULL CHECK (status IN ('pending-review', 'published', 'disabled', 'failed')),
  original_uri TEXT NOT NULL DEFAULT '',
  current_version_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_source_versions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  chunker_version TEXT NOT NULL,
  original_filename TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('parsing', 'pending-review', 'published', 'superseded', 'disabled', 'failed')),
  license_status TEXT NOT NULL DEFAULT 'unreviewed',
  answer_risk_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (answer_risk_reviewed IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  error_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source_id, version_number),
  UNIQUE(source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  document_key TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  source_version_id TEXT NOT NULL REFERENCES knowledge_source_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  language TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  block_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_version_id, document_key)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  external_chunk_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  source_version_id TEXT NOT NULL REFERENCES knowledge_source_versions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,
  text TEXT NOT NULL,
  section_path_json TEXT NOT NULL,
  section_path_text TEXT NOT NULL,
  block_ordinals_json TEXT NOT NULL,
  locator_start_json TEXT NOT NULL,
  locator_end_json TEXT NOT NULL,
  content_class TEXT NOT NULL CHECK (content_class IN ('student-safe', 'guided-hint', 'teacher-only', 'system-metadata')),
  concept_ids_json TEXT NOT NULL,
  concept_ids_text TEXT NOT NULL,
  answer_risk TEXT NOT NULL CHECK (answer_risk IN ('low', 'medium', 'high', 'blocked')),
  indexable INTEGER NOT NULL CHECK (indexable IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  char_count INTEGER NOT NULL,
  token_estimate INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_version_id, external_chunk_id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunk_labs (
  chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL,
  binding_kind TEXT NOT NULL CHECK (binding_kind IN ('derived', 'teacher')),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(chunk_id, lab_id)
);

CREATE TABLE IF NOT EXISTS knowledge_ingestion_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('builtin-build', 'teacher-upload', 'rebuild', 'rollback')),
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  input_hash TEXT NOT NULL,
  document_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  indexed_chunk_count INTEGER NOT NULL DEFAULT 0,
  reused INTEGER NOT NULL DEFAULT 0 CHECK (reused IN (0, 1)),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS knowledge_audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_versions_source_idx ON knowledge_source_versions(source_id, version_number DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_version_idx ON knowledge_documents(source_version_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_source_active_idx ON knowledge_chunks(source_id, active, indexable);
CREATE INDEX IF NOT EXISTS knowledge_chunks_version_idx ON knowledge_chunks(source_version_id, ordinal);
CREATE INDEX IF NOT EXISTS knowledge_chunks_class_idx ON knowledge_chunks(content_class, active, indexable);
CREATE INDEX IF NOT EXISTS knowledge_chunk_labs_lab_idx ON knowledge_chunk_labs(lab_id, chunk_id);
CREATE INDEX IF NOT EXISTS knowledge_ingestion_source_idx ON knowledge_ingestion_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_audit_entity_idx ON knowledge_audit_log(entity_type, entity_id, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  source_id UNINDEXED,
  text,
  section_path,
  concept_ids,
  tokenize = 'trigram'
);
