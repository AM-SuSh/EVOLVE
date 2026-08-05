import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const knowledgeRoot = path.dirname(fileURLToPath(import.meta.url))
export const defaultKnowledgeDbPath = path.join(knowledgeRoot, 'knowledge.db')

const CONTENT_CLASSES = new Set(['student-safe', 'guided-hint', 'teacher-only', 'system-metadata'])
const LAB_ID_RE = /^(?:global|lab[1-8])$/

function now() {
  return new Date().toISOString()
}

function json(value) {
  return JSON.stringify(value ?? null)
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function validateLabId(value) {
  const labId = String(value || '')
  if (!LAB_ID_RE.test(labId)) throw new TypeError(`invalid lab id: ${labId}`)
  return labId
}

function validateChunkShape(chunk) {
  if (!chunk?.id || !chunk?.documentId || !String(chunk.text || '').trim()) throw new TypeError('invalid chunk payload')
  if (!CONTENT_CLASSES.has(chunk.contentClass)) throw new TypeError(`invalid chunk content class: ${chunk.contentClass}`)
  if (!Array.isArray(chunk.labScope) || !chunk.labScope.length) throw new TypeError('chunk must have labScope')
  chunk.labScope.forEach(validateLabId)
}

export function openKnowledgeStore(options = {}) {
  const dbPath = path.resolve(options.dbPath || process.env.OS_LAB_KNOWLEDGE_DB_PATH || defaultKnowledgeDbPath)
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(readFileSync(path.join(knowledgeRoot, 'knowledge-schema.sql'), 'utf8'))
  db.prepare('INSERT OR IGNORE INTO knowledge_schema_migrations(version, applied_at) VALUES (?, ?)')
    .run('knowledge-v1', now())

  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = callback()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function audit(actor, action, entityType, entityId, before = {}, after = {}) {
    db.prepare(`
      INSERT INTO knowledge_audit_log(id, actor, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), actor, action, entityType, entityId, json(before), json(after), now())
  }

  function ensureSource(sourceId, title, actor) {
    const timestamp = now()
    db.prepare(`
      INSERT INTO knowledge_sources(
        id, title, source_type, origin_kind, authority_rank, default_class, status,
        original_uri, created_by, created_at, updated_at
      ) VALUES (?, ?, 'local-files', 'builtin', 100, 'student-safe', 'pending-review', '', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
    `).run(sourceId, title, actor, timestamp, timestamp)
  }

  function indexVersion(sourceId, versionId) {
    db.prepare('DELETE FROM knowledge_chunks_fts WHERE source_id = ?').run(sourceId)
    const rows = db.prepare(`
      SELECT id, source_id, text, section_path_text, concept_ids_text
      FROM knowledge_chunks
      WHERE source_version_id = ? AND indexable = 1
      ORDER BY ordinal
    `).all(versionId)
    const insert = db.prepare(`
      INSERT INTO knowledge_chunks_fts(chunk_id, source_id, text, section_path, concept_ids)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const row of rows) insert.run(row.id, row.source_id, row.text, row.section_path_text, row.concept_ids_text)
    return rows.length
  }

  function activateVersion(sourceId, versionId, actor, reason = 'publish') {
    const version = db.prepare('SELECT * FROM knowledge_source_versions WHERE id = ? AND source_id = ?').get(versionId, sourceId)
    if (!version) throw new Error(`knowledge version not found: ${versionId}`)
    const source = db.prepare('SELECT current_version_id, status FROM knowledge_sources WHERE id = ?').get(sourceId)
    const previousVersionId = source?.current_version_id || null
    db.prepare("UPDATE knowledge_source_versions SET status = 'superseded' WHERE source_id = ? AND status = 'published' AND id <> ?")
      .run(sourceId, versionId)
    db.prepare('UPDATE knowledge_chunks SET active = 0 WHERE source_id = ?').run(sourceId)
    db.prepare('UPDATE knowledge_chunks SET active = 1 WHERE source_version_id = ?').run(versionId)
    const indexed = indexVersion(sourceId, versionId)
    const timestamp = now()
    db.prepare("UPDATE knowledge_source_versions SET status = 'published', published_at = COALESCE(published_at, ?) WHERE id = ?")
      .run(timestamp, versionId)
    db.prepare("UPDATE knowledge_sources SET current_version_id = ?, status = 'published', updated_at = ? WHERE id = ?")
      .run(versionId, timestamp, sourceId)
    audit(actor, reason, 'source-version', versionId, { previousVersionId }, { sourceId, indexed })
    return { previousVersionId, indexed }
  }

  function ingestLabManualBuild(manifestFile, options = {}) {
    const actor = String(options.actor || 'system')
    const absoluteManifest = path.resolve(manifestFile)
    const buildRoot = path.dirname(absoluteManifest)
    const manifestRaw = readFileSync(absoluteManifest, 'utf8')
    const manifest = JSON.parse(manifestRaw)
    const sourceId = String(manifest.sourceId || 'platform-lab-manuals')
    const sourceTitle = String(options.title || 'OS Lab 本地实验手册')
    const inputHash = sha256(manifestRaw)
    ensureSource(sourceId, sourceTitle, actor)
    const runId = randomUUID()
    db.prepare(`
      INSERT INTO knowledge_ingestion_runs(id, source_id, trigger_kind, requested_by, status, input_hash, started_at)
      VALUES (?, ?, ?, ?, 'running', ?, ?)
    `).run(runId, sourceId, options.triggerKind || 'builtin-build', actor, inputHash, now())

    try {
      const existing = db.prepare('SELECT id FROM knowledge_source_versions WHERE source_id = ? AND content_hash = ?').get(sourceId, inputHash)
      if (existing) {
        const activated = transaction(() => activateVersion(sourceId, existing.id, actor, 'reuse-version'))
        db.prepare(`
          UPDATE knowledge_ingestion_runs
          SET source_version_id = ?, status = 'succeeded', reused = 1, indexed_chunk_count = ?, finished_at = ?
          WHERE id = ?
        `).run(existing.id, activated.indexed, now(), runId)
        return { ok: true, runId, sourceId, versionId: existing.id, reused: true, indexedChunks: activated.indexed }
      }

      const result = transaction(() => {
        const maxVersion = db.prepare('SELECT COALESCE(MAX(version_number), 0) AS value FROM knowledge_source_versions WHERE source_id = ?').get(sourceId)
        const versionNumber = Number(maxVersion.value) + 1
        const versionId = `${sourceId}:v${versionNumber}:${inputHash.slice(0, 12)}`
        const timestamp = now()
        db.prepare(`
          INSERT INTO knowledge_source_versions(
            id, source_id, version_number, content_hash, parser_version, chunker_version,
            status, license_status, answer_risk_reviewed, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'knowledge-normalize-v1', 'section-aware-v1', 'parsing', 'platform-owned', 1, ?, ?)
        `).run(versionId, sourceId, versionNumber, inputHash, actor, timestamp)

        let documentCount = 0
        let chunkCount = 0
        for (const entry of manifest.labs || []) {
          const labId = validateLabId(entry.labId)
          const document = readJson(path.resolve(buildRoot, entry.documentFile))
          const chunkSet = readJson(path.resolve(buildRoot, entry.chunkFile))
          if (document.sourceId !== sourceId || chunkSet.sourceId !== sourceId || chunkSet.documentId !== document.documentId) {
            throw new Error(`source/document mismatch for ${labId}`)
          }
          const documentId = `${versionId}:doc:${document.contentHash.slice(0, 16)}:${labId}`
          const sourcePath = String(document.metadata?.sourcePath || entry.sourcePath || '')
          db.prepare(`
            INSERT INTO knowledge_documents(
              id, document_key, source_id, source_version_id, title, format, language,
              content_hash, source_path, metadata_json, block_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            documentId, document.documentId, sourceId, versionId, document.title, document.format,
            document.language, document.contentHash, sourcePath, json(document.metadata),
            document.blocks.length, timestamp,
          )
          documentCount += 1

          for (const chunk of chunkSet.chunks || []) {
            validateChunkShape(chunk)
            const chunkId = `${versionId}:chunk:${labId}:${String(chunk.ordinal).padStart(6, '0')}`
            const sectionPath = Array.isArray(chunk.sectionPath) ? chunk.sectionPath : []
            const conceptIds = Array.isArray(chunk.conceptIds) ? chunk.conceptIds : []
            db.prepare(`
              INSERT INTO knowledge_chunks(
                id, external_chunk_id, document_id, source_id, source_version_id, ordinal,
                chunk_type, text, section_path_json, section_path_text, block_ordinals_json,
                locator_start_json, locator_end_json, content_class, concept_ids_json,
                concept_ids_text, answer_risk, indexable, active, char_count, token_estimate,
                metadata_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            `).run(
              chunkId, chunk.id, documentId, sourceId, versionId, chunk.ordinal,
              chunk.chunkType, chunk.text, json(sectionPath), sectionPath.join(' > '),
              json(chunk.blockOrdinals), json(chunk.locatorStart), json(chunk.locatorEnd),
              chunk.contentClass, json(conceptIds), conceptIds.join(' '), chunk.answerRisk,
              chunk.indexable ? 1 : 0, chunk.metadata.charCount, chunk.metadata.tokenEstimate,
              json(chunk.metadata), timestamp,
            )
            for (const scope of chunk.labScope) {
              const scopeId = validateLabId(scope)
              db.prepare(`
                INSERT INTO knowledge_chunk_labs(chunk_id, lab_id, binding_kind, confidence, reason)
                VALUES (?, ?, 'derived', 1.0, ?)
              `).run(chunkId, scopeId, `derived from ${sourcePath || labId}`)
            }
            chunkCount += 1
          }
        }
        const activated = activateVersion(sourceId, versionId, actor, 'publish-ingestion')
        return { versionId, documentCount, chunkCount, indexedChunks: activated.indexed }
      })

      db.prepare(`
        UPDATE knowledge_ingestion_runs
        SET source_version_id = ?, status = 'succeeded', document_count = ?, chunk_count = ?,
            indexed_chunk_count = ?, finished_at = ?
        WHERE id = ?
      `).run(result.versionId, result.documentCount, result.chunkCount, result.indexedChunks, now(), runId)
      return { ok: true, runId, sourceId, reused: false, ...result }
    } catch (error) {
      db.prepare("UPDATE knowledge_ingestion_runs SET status = 'failed', error_text = ?, finished_at = ? WHERE id = ?")
        .run(error instanceof Error ? error.message : String(error), now(), runId)
      db.prepare("UPDATE knowledge_sources SET status = 'failed', updated_at = ? WHERE id = ?").run(now(), sourceId)
      throw error
    }
  }

  function rollbackSource(sourceId, versionId, options = {}) {
    const actor = String(options.actor || 'teacher')
    const result = transaction(() => activateVersion(sourceId, versionId, actor, 'rollback'))
    const runId = randomUUID()
    db.prepare(`
      INSERT INTO knowledge_ingestion_runs(
        id, source_id, source_version_id, trigger_kind, requested_by, status, input_hash,
        indexed_chunk_count, started_at, finished_at
      ) VALUES (?, ?, ?, 'rollback', ?, 'succeeded', ?, ?, ?, ?)
    `).run(runId, sourceId, versionId, actor, sha256(`${sourceId}:${versionId}`), result.indexed, now(), now())
    return { ok: true, runId, sourceId, versionId, indexedChunks: result.indexed }
  }

  function search(query, options = {}) {
    const text = String(query || '').trim()
    if (!text) return []
    const labId = options.labId ? validateLabId(options.labId) : ''
    const allowedClasses = (options.allowedClasses || ['student-safe', 'guided-hint']).filter((value) => CONTENT_CLASSES.has(value))
    if (!allowedClasses.length) return []
    const limit = Math.max(1, Math.min(Number(options.limit) || 10, 50))
    const classPlaceholders = allowedClasses.map(() => '?').join(', ')
    const labClause = labId
      ? "AND EXISTS (SELECT 1 FROM knowledge_chunk_labs kl WHERE kl.chunk_id = c.id AND kl.lab_id IN (?, 'global'))"
      : ''
    const commonParams = [...allowedClasses, ...(labId ? [labId] : [])]
    let rows
    if ([...text].length >= 3) {
      const phrase = `"${text.replaceAll('"', '""')}"`
      rows = db.prepare(`
        SELECT c.*, bm25(knowledge_chunks_fts) AS rank
        FROM knowledge_chunks_fts
        JOIN knowledge_chunks c ON c.id = knowledge_chunks_fts.chunk_id
        JOIN knowledge_sources s ON s.id = c.source_id AND s.current_version_id = c.source_version_id
        JOIN knowledge_source_versions v ON v.id = c.source_version_id AND v.status = 'published'
        WHERE knowledge_chunks_fts MATCH ?
          AND c.active = 1 AND c.indexable = 1
          AND c.content_class IN (${classPlaceholders})
          ${labClause}
        ORDER BY rank ASC, c.char_count ASC
        LIMIT ?
      `).all(phrase, ...commonParams, limit)
    } else {
      const like = `%${text}%`
      rows = db.prepare(`
        SELECT c.*, 0.0 AS rank
        FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id = c.source_id AND s.current_version_id = c.source_version_id
        JOIN knowledge_source_versions v ON v.id = c.source_version_id AND v.status = 'published'
        WHERE (c.text LIKE ? OR c.section_path_text LIKE ? OR c.concept_ids_text LIKE ?)
          AND c.active = 1 AND c.indexable = 1
          AND c.content_class IN (${classPlaceholders})
          ${labClause}
        ORDER BY c.char_count ASC
        LIMIT ?
      `).all(like, like, like, ...commonParams, limit)
    }
    return rows.map((row) => ({
      id: row.id,
      citation: `kb:${row.id}`,
      sourceId: row.source_id,
      versionId: row.source_version_id,
      documentId: row.document_id,
      ordinal: row.ordinal,
      text: row.text,
      sectionPath: parseJson(row.section_path_json, []),
      locatorStart: parseJson(row.locator_start_json, {}),
      locatorEnd: parseJson(row.locator_end_json, {}),
      contentClass: row.content_class,
      conceptIds: parseJson(row.concept_ids_json, []),
      answerRisk: row.answer_risk,
      rank: Number(row.rank),
    }))
  }

  function stats() {
    const scalar = (sql) => Number(db.prepare(sql).get().value)
    return {
      dbPath,
      sources: scalar('SELECT COUNT(*) AS value FROM knowledge_sources'),
      versions: scalar('SELECT COUNT(*) AS value FROM knowledge_source_versions'),
      documents: scalar('SELECT COUNT(*) AS value FROM knowledge_documents'),
      chunks: scalar('SELECT COUNT(*) AS value FROM knowledge_chunks'),
      activeChunks: scalar('SELECT COUNT(*) AS value FROM knowledge_chunks WHERE active = 1'),
      indexedChunks: scalar('SELECT COUNT(*) AS value FROM knowledge_chunks_fts'),
      ingestionRuns: scalar('SELECT COUNT(*) AS value FROM knowledge_ingestion_runs'),
      auditEntries: scalar('SELECT COUNT(*) AS value FROM knowledge_audit_log'),
      labs: db.prepare(`
        SELECT kl.lab_id AS labId, COUNT(*) AS chunks
        FROM knowledge_chunk_labs kl
        JOIN knowledge_chunks c ON c.id = kl.chunk_id
        WHERE c.active = 1
        GROUP BY kl.lab_id ORDER BY kl.lab_id
      `).all().map((row) => ({ labId: row.labId, chunks: Number(row.chunks) })),
    }
  }

  function listVersions(sourceId) {
    return db.prepare(`
      SELECT id, source_id AS sourceId, version_number AS versionNumber, content_hash AS contentHash,
             status, created_by AS createdBy, created_at AS createdAt, published_at AS publishedAt
      FROM knowledge_source_versions WHERE source_id = ? ORDER BY version_number DESC
    `).all(sourceId)
  }

  function listSources() {
    return db.prepare(`
      SELECT s.id, s.title, s.source_type AS sourceType, s.origin_kind AS originKind,
             s.default_class AS defaultClass, s.status, s.current_version_id AS currentVersionId,
             s.updated_at AS updatedAt, v.version_number AS versionNumber,
             COUNT(c.id) AS activeChunks
      FROM knowledge_sources s
      LEFT JOIN knowledge_source_versions v ON v.id = s.current_version_id
      LEFT JOIN knowledge_chunks c ON c.source_id = s.id AND c.active = 1
      GROUP BY s.id
      ORDER BY s.authority_rank DESC, s.title
    `).all().map((row) => ({ ...row, versionNumber: Number(row.versionNumber || 0), activeChunks: Number(row.activeChunks) }))
  }

  function mapChunkRow(row) {
    return {
      id: row.id,
      citation: `kb:${row.id}`,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      versionId: row.source_version_id,
      documentId: row.document_id,
      ordinal: Number(row.ordinal),
      chunkType: row.chunk_type,
      text: row.text,
      sectionPath: parseJson(row.section_path_json, []),
      blockOrdinals: parseJson(row.block_ordinals_json, []),
      locatorStart: parseJson(row.locator_start_json, {}),
      locatorEnd: parseJson(row.locator_end_json, {}),
      contentClass: row.content_class,
      conceptIds: parseJson(row.concept_ids_json, []),
      answerRisk: row.answer_risk,
      indexable: Boolean(row.indexable),
      active: Boolean(row.active),
      charCount: Number(row.char_count),
      tokenEstimate: Number(row.token_estimate),
      labScopes: parseJson(row.lab_scopes_json, []),
    }
  }

  function listChunks(options = {}) {
    const labId = options.labId ? validateLabId(options.labId) : ''
    const sourceId = String(options.sourceId || '')
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 200))
    const offset = Math.max(0, Number(options.offset) || 0)
    const clauses = ['c.active = 1', 's.current_version_id = c.source_version_id']
    const params = []
    if (labId) {
      clauses.push("EXISTS (SELECT 1 FROM knowledge_chunk_labs filter_labs WHERE filter_labs.chunk_id = c.id AND filter_labs.lab_id = ?)")
      params.push(labId)
    }
    if (sourceId) {
      clauses.push('c.source_id = ?')
      params.push(sourceId)
    }
    const rows = db.prepare(`
      SELECT c.*, s.title AS source_title,
             (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.source_id, c.document_id, c.ordinal
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
    return rows.map(mapChunkRow)
  }

  function getChunk(chunkId) {
    const row = db.prepare(`
      SELECT c.*, s.title AS source_title,
             (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.id = ?
    `).get(chunkId)
    return row ? mapChunkRow(row) : null
  }

  function knowledgeTree() {
    const counts = new Map(stats().labs.map((item) => [item.labId, item.chunks]))
    return {
      labs: ['global', ...Array.from({ length: 8 }, (_, index) => `lab${index + 1}`)]
        .map((labId) => ({ labId, chunks: counts.get(labId) || 0 })),
      sources: listSources(),
    }
  }

  function close() {
    db.close()
  }

  return {
    dbPath,
    ingestLabManualBuild,
    rollbackSource,
    search,
    stats,
    listVersions,
    listSources,
    listChunks,
    getChunk,
    knowledgeTree,
    close,
  }
}
