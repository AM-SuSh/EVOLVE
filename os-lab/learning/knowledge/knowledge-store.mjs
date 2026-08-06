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

function ftsQuery(value) {
  const text = String(value || '').trim()
  const terms = []
  const push = (term) => {
    const clean = String(term || '').trim()
    if ([...clean].length >= 3 && !terms.includes(clean)) terms.push(clean)
  }
  for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_.:-]{2,}/g)) push(match[0])
  for (const match of text.matchAll(/[\u3400-\u9fff]{3,}/g)) {
    const phrase = match[0]
    if (phrase.length <= 8) push(phrase)
    else {
      for (let index = 0; index <= phrase.length - 3; index += 2) push(phrase.slice(index, index + 3))
    }
  }
  if (!terms.length) push(text)
  return terms.slice(0, 12).map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')
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

  const versionColumns = new Set(db.prepare('PRAGMA table_info(knowledge_source_versions)').all().map((row) => row.name))
  for (const [name, definition] of [
    ['scope_suggestions_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['teacher_scope_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['review_note', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!versionColumns.has(name)) db.exec(`ALTER TABLE knowledge_source_versions ADD COLUMN ${name} ${definition}`)
  }
  db.prepare('INSERT OR IGNORE INTO knowledge_schema_migrations(version, applied_at) VALUES (?, ?)')
    .run('knowledge-v2', now())
  db.prepare('INSERT OR IGNORE INTO knowledge_schema_migrations(version, applied_at) VALUES (?, ?)')
    .run('knowledge-v3', now())

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

  function ensureSource(sourceId, title, actor, options = {}) {
    const timestamp = now()
    const sourceType = String(options.sourceType || 'local-files')
    const authorityRank = Number(options.authorityRank || 100)
    const defaultClass = CONTENT_CLASSES.has(options.defaultClass) ? options.defaultClass : 'student-safe'
    const status = ['pending-review', 'published', 'disabled', 'failed'].includes(options.status) ? options.status : 'pending-review'
    const originalUri = String(options.originalUri || '')
    db.prepare(`
      INSERT INTO knowledge_sources(
        id, title, source_type, origin_kind, authority_rank, default_class, status,
        original_uri, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'builtin', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, source_type = excluded.source_type,
        authority_rank = excluded.authority_rank, default_class = excluded.default_class,
        original_uri = excluded.original_uri, updated_at = excluded.updated_at
    `).run(sourceId, title, sourceType, authorityRank, defaultClass, status, originalUri, actor, timestamp, timestamp)
  }

  function sourceVersion(sourceId, versionId) {
    return db.prepare(`
      SELECT v.*, s.title AS source_title, s.status AS source_status, s.current_version_id
      FROM knowledge_source_versions v JOIN knowledge_sources s ON s.id = v.source_id
      WHERE v.source_id = ? AND v.id = ?
    `).get(sourceId, versionId)
  }

  function indexVersion(sourceId, versionId) {
    db.prepare('DELETE FROM knowledge_chunks_fts WHERE source_id = ?').run(sourceId)
    const rows = db.prepare(`
      SELECT id, source_id, text, section_path_text, concept_ids_text
      FROM knowledge_chunks
      WHERE source_version_id = ? AND indexable = 1 AND answer_risk IN ('low', 'medium')
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

  function ingestTeacherDocument(document, chunkSet, options = {}) {
    const actor = String(options.actor || 'teacher')
    const title = String(options.title || document?.title || '未命名知识源').trim().slice(0, 160)
    const sourceId = String(options.sourceId || `teacher-${randomUUID().replaceAll('-', '').slice(0, 16)}`)
    if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(sourceId)) throw new TypeError('invalid source id')
    if (!document || !chunkSet || document.sourceId !== sourceId || chunkSet.sourceId !== sourceId || chunkSet.documentId !== document.documentId) {
      throw new TypeError('teacher document/chunk source mismatch')
    }
    const chunks = Array.isArray(chunkSet.chunks) ? chunkSet.chunks : []
    chunks.forEach(validateChunkShape)
    const suggestions = Array.isArray(options.scopeSuggestions)
      ? options.scopeSuggestions.filter((item) => LAB_ID_RE.test(String(item?.labId || '')))
      : []
    const contentHash = String(document.contentHash || sha256(JSON.stringify(document)))
    const runId = randomUUID()
    const timestamp = now()
    const existingSource = db.prepare('SELECT * FROM knowledge_sources WHERE id = ?').get(sourceId)
    const duplicate = db.prepare('SELECT id FROM knowledge_source_versions WHERE source_id = ? AND content_hash = ?').get(sourceId, contentHash)
    if (duplicate) throw new Error('相同内容版本已存在')
    if (!existingSource) {
      db.prepare(`
        INSERT INTO knowledge_sources(
          id, title, source_type, origin_kind, authority_rank, default_class, status,
          original_uri, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'teacher-upload', 40, 'teacher-only', 'pending-review', ?, ?, ?, ?)
      `).run(sourceId, title, String(options.sourceType || document.format || 'upload'), String(options.originalUri || ''), actor, timestamp, timestamp)
    } else if (existingSource.origin_kind !== 'teacher-upload') {
      throw new Error('builtin source cannot be replaced through teacher upload')
    } else {
      db.prepare("UPDATE knowledge_sources SET title = ?, status = 'pending-review', updated_at = ? WHERE id = ?")
        .run(title, timestamp, sourceId)
    }
    db.prepare(`
      INSERT INTO knowledge_ingestion_runs(id, source_id, trigger_kind, requested_by, status, input_hash, started_at)
      VALUES (?, ?, ?, ?, 'running', ?, ?)
    `).run(runId, sourceId, existingSource ? 'rebuild' : 'teacher-upload', actor, contentHash, timestamp)

    try {
      const result = transaction(() => {
        const maxVersion = db.prepare('SELECT COALESCE(MAX(version_number), 0) AS value FROM knowledge_source_versions WHERE source_id = ?').get(sourceId)
        const versionNumber = Number(maxVersion.value) + 1
        const versionId = `${sourceId}:v${versionNumber}:${contentHash.slice(0, 12)}`
        db.prepare(`
          INSERT INTO knowledge_source_versions(
            id, source_id, version_number, content_hash, parser_version, chunker_version,
            original_filename, stored_path, mime, status, license_status,
            answer_risk_reviewed, created_by, created_at, scope_suggestions_json
          ) VALUES (?, ?, ?, ?, 'knowledge-normalize-v1', 'section-aware-v1', ?, ?, ?,
                    'pending-review', 'unreviewed', 0, ?, ?, ?)
        `).run(
          versionId, sourceId, versionNumber, contentHash, String(options.originalFilename || ''),
          String(options.storedPath || ''), String(options.mime || ''), actor, timestamp, json(suggestions),
        )
        const documentId = `${versionId}:doc:${contentHash.slice(0, 16)}`
        db.prepare(`
          INSERT INTO knowledge_documents(
            id, document_key, source_id, source_version_id, title, format, language,
            content_hash, source_path, metadata_json, block_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          documentId, document.documentId, sourceId, versionId, document.title, document.format,
          document.language, contentHash, String(document.metadata?.sourcePath || options.storedPath || ''),
          json(document.metadata), Number(document.blocks?.length || 0), timestamp,
        )
        const insertChunk = db.prepare(`
          INSERT INTO knowledge_chunks(
            id, external_chunk_id, document_id, source_id, source_version_id, ordinal,
            chunk_type, text, section_path_json, section_path_text, block_ordinals_json,
            locator_start_json, locator_end_json, content_class, concept_ids_json,
            concept_ids_text, answer_risk, indexable, active, char_count, token_estimate,
            metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher-only', ?, ?, ?, 0, 0, ?, ?, ?, ?)
        `)
        for (const chunk of chunks) {
          const chunkId = `${versionId}:chunk:${String(chunk.ordinal).padStart(6, '0')}`
          const sectionPath = Array.isArray(chunk.sectionPath) ? chunk.sectionPath : []
          const conceptIds = Array.isArray(chunk.conceptIds) ? chunk.conceptIds : []
          insertChunk.run(
            chunkId, chunk.id, documentId, sourceId, versionId, chunk.ordinal, chunk.chunkType,
            chunk.text, json(sectionPath), sectionPath.join(' > '), json(chunk.blockOrdinals),
            json(chunk.locatorStart), json(chunk.locatorEnd), json(conceptIds), conceptIds.join(' '),
            chunk.answerRisk, Number(chunk.metadata?.charCount || chunk.text.length),
            Number(chunk.metadata?.tokenEstimate || Math.ceil(chunk.text.length / 4)), json(chunk.metadata), timestamp,
          )
          for (const suggestion of suggestions) {
            db.prepare(`
              INSERT INTO knowledge_chunk_labs(chunk_id, lab_id, binding_kind, confidence, reason)
              VALUES (?, ?, 'derived', ?, ?)
            `).run(chunkId, validateLabId(suggestion.labId), Number(suggestion.confidence || 0), String(suggestion.reason || '自动范围建议'))
          }
        }
        audit(actor, 'upload', 'source-version', versionId, {}, { sourceId, chunks: chunks.length, suggestions })
        return { versionId, versionNumber, chunks: chunks.length }
      })
      db.prepare(`
        UPDATE knowledge_ingestion_runs SET source_version_id = ?, status = 'succeeded', document_count = 1,
          chunk_count = ?, finished_at = ? WHERE id = ?
      `).run(result.versionId, result.chunks, now(), runId)
      return { ok: true, runId, sourceId, status: 'pending-review', ...result }
    } catch (error) {
      db.prepare("UPDATE knowledge_ingestion_runs SET status = 'failed', error_text = ?, finished_at = ? WHERE id = ?")
        .run(error instanceof Error ? error.message : String(error), now(), runId)
      throw error
    }
  }

  function reviewVersion(sourceId, versionId, review = {}, options = {}) {
    const actor = String(options.actor || 'teacher')
    const scopes = [...new Set((review.labScopes || []).map(validateLabId))]
    if (!scopes.length) throw new TypeError('至少确认一个 Global 或 Lab 范围')
    const contentClass = String(review.contentClass || 'student-safe')
    if (!CONTENT_CLASSES.has(contentClass)) throw new TypeError('invalid content class')
    const licenseStatus = String(review.licenseStatus || '')
    if (!['platform-owned', 'authorized', 'public-license'].includes(licenseStatus)) throw new TypeError('必须确认材料许可证状态')
    const version = sourceVersion(sourceId, versionId)
    if (!version || !['pending-review', 'published'].includes(version.status)) throw new Error('knowledge version is not reviewable')
    return transaction(() => {
      const before = {
        scopes: parseJson(version.teacher_scope_json, []), contentClass: version.default_class,
        licenseStatus: version.license_status, answerRiskReviewed: Boolean(version.answer_risk_reviewed),
      }
      const chunkIds = db.prepare('SELECT id FROM knowledge_chunks WHERE source_version_id = ?').all(versionId)
      for (const { id } of chunkIds) {
        db.prepare('DELETE FROM knowledge_chunk_labs WHERE chunk_id = ?').run(id)
        for (const labId of scopes) {
          db.prepare(`INSERT INTO knowledge_chunk_labs(chunk_id, lab_id, binding_kind, confidence, reason) VALUES (?, ?, 'teacher', 1, ?)`)
            .run(id, labId, String(review.note || '教师审核确认'))
        }
      }
      db.prepare(`
        UPDATE knowledge_chunks SET content_class = ?, indexable = CASE WHEN answer_risk IN ('high', 'blocked') OR ? = 'system-metadata' THEN 0 ELSE 1 END
        WHERE source_version_id = ?
      `).run(contentClass, contentClass, versionId)
      const nextStatus = version.status === 'published' ? 'published' : 'pending-review'
      db.prepare(`
        UPDATE knowledge_source_versions SET teacher_scope_json = ?, review_note = ?, license_status = ?,
          answer_risk_reviewed = ?, status = ? WHERE id = ?
      `).run(json(scopes), String(review.note || ''), licenseStatus, review.answerRiskReviewed === true ? 1 : 0, nextStatus, versionId)
      db.prepare('UPDATE knowledge_sources SET default_class = ?, updated_at = ? WHERE id = ?').run(contentClass, now(), sourceId)
      if (nextStatus === 'published') indexVersion(sourceId, versionId)
      audit(actor, 'review', 'source-version', versionId, before, {
        scopes, contentClass, licenseStatus, answerRiskReviewed: review.answerRiskReviewed === true,
      })
      return { ok: true, sourceId, versionId, scopes, contentClass, status: nextStatus }
    })
  }

  function publishVersion(sourceId, versionId, options = {}) {
    const actor = String(options.actor || 'teacher')
    const version = sourceVersion(sourceId, versionId)
    if (!version || version.status !== 'pending-review') throw new Error('仅待审核版本可以发布')
    if (version.license_status === 'unreviewed') throw new Error('发布前必须确认许可证')
    if (!version.answer_risk_reviewed) throw new Error('发布前必须完成人工答案风险复核')
    if (!parseJson(version.teacher_scope_json, []).length) throw new Error('发布前必须确认 Lab 范围')
    const result = transaction(() => activateVersion(sourceId, versionId, actor, 'publish'))
    return { ok: true, sourceId, versionId, status: 'published', indexedChunks: result.indexed }
  }

  function disableSource(sourceId, options = {}) {
    const actor = String(options.actor || 'teacher')
    const source = db.prepare('SELECT * FROM knowledge_sources WHERE id = ?').get(sourceId)
    if (!source) throw new Error('knowledge source not found')
    return transaction(() => {
      db.prepare('UPDATE knowledge_chunks SET active = 0 WHERE source_id = ?').run(sourceId)
      db.prepare('DELETE FROM knowledge_chunks_fts WHERE source_id = ?').run(sourceId)
      db.prepare("UPDATE knowledge_sources SET status = 'disabled', updated_at = ? WHERE id = ?").run(now(), sourceId)
      if (source.current_version_id) db.prepare("UPDATE knowledge_source_versions SET status = 'disabled' WHERE id = ?").run(source.current_version_id)
      audit(actor, 'disable', 'source', sourceId, { status: source.status }, { status: 'disabled', note: String(options.note || '') })
      return { ok: true, sourceId, status: 'disabled' }
    })
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

  // Generic importer used by the canonical source inventory.  The manifest is
  // deliberately format-neutral: each source owns immutable documents and
  // chunk JSON, while the store remains the single version/audit boundary.
  function ingestKnowledgeBuild(manifestFile, options = {}) {
    const actor = String(options.actor || 'system')
    const absoluteManifest = path.resolve(manifestFile)
    const buildRoot = path.dirname(absoluteManifest)
    const manifestRaw = readFileSync(absoluteManifest, 'utf8')
    const manifest = JSON.parse(manifestRaw)
    const results = []

    for (const entry of manifest.sources || []) {
      const sourceId = String(entry.id || '')
      if (!sourceId) continue
      const sourceTitle = String(entry.title || sourceId)
      const sourceStatus = entry.status === 'published' ? 'published' : 'pending-review'
      const documents = (entry.documents || []).filter((item) => item.documentFile && item.chunkFile && !item.error)
      const sourceHash = sha256(JSON.stringify({
        sourceId,
        algorithm: manifest.algorithm || '',
        documents: documents.map((item) => ({
          path: item.sourcePath || '',
          hash: item.contentHash || item.documentId,
          chunkHash: item.chunkContentHash || '',
        })),
      }))
      ensureSource(sourceId, sourceTitle, actor, {
        sourceType: entry.sourceType,
        authorityRank: entry.authorityRank,
        defaultClass: entry.defaultClass,
        status: sourceStatus,
        originalUri: entry.originalUri,
      })
      const runId = randomUUID()
      db.prepare(`
        INSERT INTO knowledge_ingestion_runs(id, source_id, trigger_kind, requested_by, status, input_hash, started_at)
        VALUES (?, ?, 'builtin-build', ?, 'running', ?, ?)
      `).run(runId, sourceId, actor, sourceHash, now())
      try {
        const existing = db.prepare('SELECT id FROM knowledge_source_versions WHERE source_id = ? AND content_hash = ?').get(sourceId, sourceHash)
        if (existing) {
          if (sourceStatus === 'published') activateVersion(sourceId, existing.id, actor, 'reuse-version')
          db.prepare(`UPDATE knowledge_ingestion_runs SET source_version_id = ?, status = 'succeeded', reused = 1, finished_at = ? WHERE id = ?`)
            .run(existing.id, now(), runId)
          results.push({ sourceId, versionId: existing.id, reused: true })
          continue
        }
        const result = transaction(() => {
          const maxVersion = db.prepare('SELECT COALESCE(MAX(version_number), 0) AS value FROM knowledge_source_versions WHERE source_id = ?').get(sourceId)
          const versionNumber = Number(maxVersion.value) + 1
          const versionId = `${sourceId}:v${versionNumber}:${sourceHash.slice(0, 12)}`
          const timestamp = now()
          db.prepare(`
            INSERT INTO knowledge_source_versions(
              id, source_id, version_number, content_hash, parser_version, chunker_version,
              status, license_status, answer_risk_reviewed, created_by, created_at
            ) VALUES (?, ?, ?, ?, 'knowledge-normalize-v1', 'section-aware-v1', ?, 'source-attribution-required', 0, ?, ?)
          `).run(versionId, sourceId, versionNumber, sourceHash, sourceStatus, actor, timestamp)
          let documentCount = 0
          let chunkCount = 0
          for (const entryDocument of documents) {
            const document = readJson(path.resolve(buildRoot, sourceId, entryDocument.documentFile))
            const chunkSet = readJson(path.resolve(buildRoot, sourceId, entryDocument.chunkFile))
            if (document.sourceId !== sourceId || chunkSet.sourceId !== sourceId || chunkSet.documentId !== document.documentId) {
              throw new Error(`source/document mismatch for ${sourceId}`)
            }
            const sourcePath = String(document.metadata?.sourcePath || entryDocument.sourcePath || '')
            const pathHash = sha256(sourcePath).slice(0, 12)
            const documentId = `${versionId}:doc:${document.contentHash.slice(0, 16)}:${pathHash}`
            const documentKey = `${document.documentId}:${pathHash}`
            db.prepare(`
              INSERT INTO knowledge_documents(
                id, document_key, source_id, source_version_id, title, format, language,
                content_hash, source_path, metadata_json, block_count, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(documentId, documentKey, sourceId, versionId, document.title, document.format,
              document.language, document.contentHash, sourcePath, json(document.metadata), document.blocks.length, timestamp)
            documentCount += 1
            for (const chunk of chunkSet.chunks || []) {
              validateChunkShape(chunk)
              const chunkId = `${versionId}:chunk:${String(chunkCount).padStart(7, '0')}`
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
              `).run(chunkId, `${chunk.id}:${pathHash}`, documentId, sourceId, versionId, chunkCount,
                chunk.chunkType, chunk.text, json(sectionPath), sectionPath.join(' > '), json(chunk.blockOrdinals),
                json(chunk.locatorStart), json(chunk.locatorEnd), chunk.contentClass, json(conceptIds), conceptIds.join(' '),
                chunk.answerRisk, chunk.indexable ? 1 : 0, chunk.metadata.charCount, chunk.metadata.tokenEstimate, json(chunk.metadata), timestamp)
              for (const scope of chunk.labScope || ['global']) {
                db.prepare(`INSERT INTO knowledge_chunk_labs(chunk_id, lab_id, binding_kind, confidence, reason) VALUES (?, ?, 'derived', 1, ?)`)
                  .run(chunkId, validateLabId(scope), `derived from ${sourcePath}`)
              }
              chunkCount += 1
            }
          }
          return { versionId, versionNumber, documentCount, chunkCount }
        })
        let indexedChunks = 0
        if (sourceStatus === 'published') indexedChunks = activateVersion(sourceId, result.versionId, actor, 'publish-ingestion').indexed
        db.prepare(`UPDATE knowledge_ingestion_runs SET source_version_id = ?, status = 'succeeded', document_count = ?, chunk_count = ?, indexed_chunk_count = ?, finished_at = ? WHERE id = ?`)
          .run(result.versionId, result.documentCount, result.chunkCount, indexedChunks, now(), runId)
        results.push({ sourceId, ...result, indexedChunks, status: sourceStatus })
      } catch (error) {
        db.prepare(`UPDATE knowledge_ingestion_runs SET status = 'failed', error_text = ?, finished_at = ? WHERE id = ?`)
          .run(error instanceof Error ? error.message : String(error), now(), runId)
        db.prepare(`UPDATE knowledge_sources SET status = 'failed', updated_at = ? WHERE id = ?`).run(now(), sourceId)
        throw error
      }
    }
    return { ok: true, buildId: manifest.buildId, sources: results }
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
      const phrase = ftsQuery(text)
      rows = db.prepare(`
        SELECT c.*, s.title AS source_title, s.authority_rank AS source_authority,
          bm25(knowledge_chunks_fts) AS rank,
          (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
        FROM knowledge_chunks_fts
        JOIN knowledge_chunks c ON c.id = knowledge_chunks_fts.chunk_id
        JOIN knowledge_sources s ON s.id = c.source_id AND s.current_version_id = c.source_version_id
        JOIN knowledge_source_versions v ON v.id = c.source_version_id AND v.status = 'published'
        WHERE knowledge_chunks_fts MATCH ?
          AND c.active = 1 AND c.indexable = 1 AND c.answer_risk IN ('low', 'medium')
          AND c.content_class IN (${classPlaceholders})
          ${labClause}
        ORDER BY rank ASC, c.char_count ASC
        LIMIT ?
      `).all(phrase, ...commonParams, limit)
    } else {
      const like = `%${text}%`
      rows = db.prepare(`
        SELECT c.*, s.title AS source_title, s.authority_rank AS source_authority, 0.0 AS rank,
          (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
        FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id = c.source_id AND s.current_version_id = c.source_version_id
        JOIN knowledge_source_versions v ON v.id = c.source_version_id AND v.status = 'published'
        WHERE (c.text LIKE ? OR c.section_path_text LIKE ? OR c.concept_ids_text LIKE ?)
          AND c.active = 1 AND c.indexable = 1 AND c.answer_risk IN ('low', 'medium')
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
      sourceTitle: row.source_title,
      sourceAuthority: Number(row.source_authority || 0),
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
      labScopes: parseJson(row.lab_scopes_json, []),
      rank: Number(row.rank),
    }))
  }

  function listRetrievalCandidates(options = {}) {
    const labId = options.labId ? validateLabId(options.labId) : ''
    const sourceId = String(options.sourceId || '')
    const allowedClasses = (options.allowedClasses || ['student-safe', 'guided-hint']).filter((value) => CONTENT_CLASSES.has(value))
    if (!allowedClasses.length) return []
    const limit = Math.max(1, Math.min(Number(options.limit) || 5000, 10_000))
    const placeholders = allowedClasses.map(() => '?').join(', ')
    const labClause = labId
      ? "AND EXISTS (SELECT 1 FROM knowledge_chunk_labs filter_labs WHERE filter_labs.chunk_id = c.id AND filter_labs.lab_id IN (?, 'global'))"
      : ''
    const sourceClause = sourceId ? 'AND c.source_id = ?' : ''
    const rows = db.prepare(`
      SELECT c.*, s.title AS source_title, s.authority_rank AS source_authority,
             (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id AND s.current_version_id = c.source_version_id
      JOIN knowledge_source_versions v ON v.id = c.source_version_id AND v.status = 'published'
      WHERE c.active = 1 AND c.indexable = 1 AND c.answer_risk IN ('low', 'medium') AND c.content_class IN (${placeholders})
        ${labClause}
        ${sourceClause}
      ORDER BY s.authority_rank DESC, c.source_id, c.ordinal
      LIMIT ?
    `).all(...allowedClasses, ...(labId ? [labId] : []), ...(sourceId ? [sourceId] : []), limit)
    return rows.map((row) => ({ ...mapChunkRow(row), contentHash: sha256(row.text) }))
  }

  function getEmbeddings(model, chunkIds = []) {
    const safeModel = String(model || '').trim()
    if (!safeModel) return []
    if (chunkIds.length) {
      const placeholders = chunkIds.map(() => '?').join(', ')
      return db.prepare(`
        SELECT chunk_id AS chunkId, model, dimensions, vector_blob AS vectorBlob,
               content_hash AS contentHash, created_at AS createdAt
        FROM knowledge_chunk_embeddings WHERE model = ? AND chunk_id IN (${placeholders})
      `).all(safeModel, ...chunkIds)
    }
    return db.prepare(`
      SELECT chunk_id AS chunkId, model, dimensions, vector_blob AS vectorBlob,
             content_hash AS contentHash, created_at AS createdAt
      FROM knowledge_chunk_embeddings WHERE model = ?
    `).all(safeModel)
  }

  function upsertEmbeddings(model, dimensions, items) {
    const safeModel = String(model || '').trim()
    const safeDimensions = Number(dimensions)
    if (!safeModel || !Number.isInteger(safeDimensions) || safeDimensions < 1) throw new TypeError('invalid embedding metadata')
    const rows = Array.isArray(items) ? items : []
    return transaction(() => {
      const statement = db.prepare(`
        INSERT INTO knowledge_chunk_embeddings(chunk_id, model, dimensions, vector_blob, content_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chunk_id, model) DO UPDATE SET dimensions = excluded.dimensions,
          vector_blob = excluded.vector_blob, content_hash = excluded.content_hash, created_at = excluded.created_at
      `)
      for (const item of rows) {
        const blob = Buffer.isBuffer(item.vectorBlob) ? item.vectorBlob : Buffer.from(item.vectorBlob)
        if (blob.byteLength !== safeDimensions * 4) throw new TypeError(`invalid vector bytes for ${item.chunkId}`)
        statement.run(String(item.chunkId), safeModel, safeDimensions, blob, String(item.contentHash), now())
      }
      return { ok: true, model: safeModel, dimensions: safeDimensions, upserted: rows.length }
    })
  }

  function deleteEmbeddings(options = {}) {
    const model = String(options.model || '')
    const sourceId = String(options.sourceId || '')
    if (model && sourceId) {
      return db.prepare('DELETE FROM knowledge_chunk_embeddings WHERE model = ? AND chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)').run(model, sourceId).changes
    }
    if (model) return db.prepare('DELETE FROM knowledge_chunk_embeddings WHERE model = ?').run(model).changes
    if (sourceId) return db.prepare('DELETE FROM knowledge_chunk_embeddings WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)').run(sourceId).changes
    return 0
  }

  function pruneStaleEmbeddings(options = {}) {
    const model = String(options.model || '')
    const sourceId = String(options.sourceId || '')
    if (!model) throw new TypeError('embedding model is required')
    const sourceClause = sourceId ? 'AND c.source_id = ?' : ''
    return db.prepare(`
      DELETE FROM knowledge_chunk_embeddings
      WHERE model = ? AND chunk_id IN (
        SELECT c.id FROM knowledge_chunks c
        JOIN knowledge_sources s ON s.id = c.source_id
        WHERE (
          c.active <> 1 OR c.indexable <> 1 OR c.answer_risk NOT IN ('low', 'medium')
          OR s.current_version_id <> c.source_version_id
        ) ${sourceClause}
      )
    `).run(model, ...(sourceId ? [sourceId] : [])).changes
  }

  function recordRetrieval(entry = {}) {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO knowledge_retrieval_log(
        id, query_hash, lab_id, provider, lexical_count, vector_count,
        selected_ids_json, fallback_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, sha256(String(entry.query || '')), String(entry.labId || ''), String(entry.provider || ''),
      Number(entry.lexicalCount || 0), Number(entry.vectorCount || 0), json(entry.selectedIds || []),
      String(entry.fallbackReason || ''), now(),
    )
    return id
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
      embeddings: scalar(`SELECT COUNT(*) AS value FROM knowledge_chunk_embeddings e
        JOIN knowledge_chunks c ON c.id = e.chunk_id JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.active = 1 AND c.indexable = 1 AND c.answer_risk IN ('low', 'medium') AND s.current_version_id = c.source_version_id`),
      embeddingModels: db.prepare(`SELECT e.model, e.dimensions, COUNT(*) AS chunks FROM knowledge_chunk_embeddings e
        JOIN knowledge_chunks c ON c.id = e.chunk_id JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.active = 1 AND c.indexable = 1 AND c.answer_risk IN ('low', 'medium') AND s.current_version_id = c.source_version_id
        GROUP BY e.model, e.dimensions ORDER BY e.model`)
        .all().map((row) => ({ model: row.model, dimensions: Number(row.dimensions), chunks: Number(row.chunks) })),
      retrievalRuns: scalar('SELECT COUNT(*) AS value FROM knowledge_retrieval_log'),
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
             status, original_filename AS originalFilename, mime, license_status AS licenseStatus,
             answer_risk_reviewed AS answerRiskReviewed, scope_suggestions_json AS scopeSuggestionsJson,
             teacher_scope_json AS teacherScopeJson, review_note AS reviewNote,
             created_by AS createdBy, created_at AS createdAt, published_at AS publishedAt
      FROM knowledge_source_versions WHERE source_id = ? ORDER BY version_number DESC
    `).all(sourceId).map((row) => ({
      ...row,
      answerRiskReviewed: Boolean(row.answerRiskReviewed),
      scopeSuggestions: parseJson(row.scopeSuggestionsJson, []),
      teacherScopes: parseJson(row.teacherScopeJson, []),
      scopeSuggestionsJson: undefined,
      teacherScopeJson: undefined,
    }))
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

  function getSource(sourceId) {
    const source = db.prepare(`
      SELECT id, title, source_type AS sourceType, origin_kind AS originKind,
             authority_rank AS authorityRank, default_class AS defaultClass, status,
             original_uri AS originalUri, current_version_id AS currentVersionId,
             created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
      FROM knowledge_sources WHERE id = ?
    `).get(sourceId)
    if (!source) return null
    return { ...source, versions: listVersions(sourceId) }
  }

  function mapChunkRow(row) {
    return {
      id: row.id,
      citation: `kb:${row.id}`,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      sourceAuthority: Number(row.source_authority || 0),
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
    const includeInactive = options.includeInactive === true
    const retrievableOnly = options.retrievableOnly === true
    const versionId = String(options.versionId || '')
    const query = String(options.query || '').trim()
    const clauses = includeInactive ? ['1 = 1'] : ['c.active = 1', 's.current_version_id = c.source_version_id']
    const params = []
    if (labId) {
      clauses.push("EXISTS (SELECT 1 FROM knowledge_chunk_labs filter_labs WHERE filter_labs.chunk_id = c.id AND filter_labs.lab_id = ?)")
      params.push(labId)
    }
    if (sourceId) {
      clauses.push('c.source_id = ?')
      params.push(sourceId)
    }
    if (versionId) {
      clauses.push('c.source_version_id = ?')
      params.push(versionId)
    }
    if (retrievableOnly) {
      clauses.push("c.indexable = 1 AND c.answer_risk IN ('low', 'medium') AND c.content_class <> 'system-metadata'")
    }
    if (query) {
      clauses.push('(c.text LIKE ? OR c.section_path_text LIKE ? OR c.concept_ids_text LIKE ?)')
      const like = `%${query}%`
      params.push(like, like, like)
    }
    const rows = db.prepare(`
      SELECT c.*, s.title AS source_title, s.authority_rank AS source_authority,
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
      SELECT c.*, s.title AS source_title, s.authority_rank AS source_authority,
             (SELECT json_group_array(lab_id) FROM knowledge_chunk_labs scopes WHERE scopes.chunk_id = c.id) AS lab_scopes_json
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.id = ?
    `).get(chunkId)
    return row ? mapChunkRow(row) : null
  }

  function updateChunk(chunkId, patch = {}, options = {}) {
    const actor = String(options.actor || 'teacher')
    const current = getChunk(chunkId)
    if (!current) throw new Error('knowledge chunk not found')
    const contentClass = patch.contentClass == null ? current.contentClass : String(patch.contentClass)
    if (!CONTENT_CLASSES.has(contentClass)) throw new TypeError('invalid content class')
    const answerRisk = patch.answerRisk == null ? current.answerRisk : String(patch.answerRisk)
    if (!['low', 'medium', 'high', 'blocked'].includes(answerRisk)) throw new TypeError('invalid answer risk')
    const labScopes = patch.labScopes == null ? current.labScopes : [...new Set(patch.labScopes.map(validateLabId))]
    if (!labScopes.length) throw new TypeError('chunk must retain at least one scope')
    const indexable = patch.indexable == null ? current.indexable : patch.indexable === true
    const active = patch.active == null ? current.active : patch.active === true
    return transaction(() => {
      db.prepare(`
        UPDATE knowledge_chunks SET content_class = ?, answer_risk = ?, indexable = ?, active = ? WHERE id = ?
      `).run(contentClass, answerRisk, indexable && !['high', 'blocked'].includes(answerRisk) && contentClass !== 'system-metadata' ? 1 : 0, active ? 1 : 0, chunkId)
      db.prepare('DELETE FROM knowledge_chunk_labs WHERE chunk_id = ?').run(chunkId)
      for (const labId of labScopes) {
        db.prepare(`INSERT INTO knowledge_chunk_labs(chunk_id, lab_id, binding_kind, confidence, reason) VALUES (?, ?, 'teacher', 1, ?)`)
          .run(chunkId, labId, String(patch.note || '教师调整知识块'))
      }
      const source = db.prepare('SELECT current_version_id FROM knowledge_sources WHERE id = ?').get(current.sourceId)
      if (source?.current_version_id === current.versionId) indexVersion(current.sourceId, current.versionId)
      const updated = getChunk(chunkId)
      audit(actor, 'update', 'chunk', chunkId, current, updated)
      return { ok: true, chunk: updated }
    })
  }

  function removeChunk(chunkId, options = {}) {
    const actor = String(options.actor || 'teacher')
    const current = getChunk(chunkId)
    if (!current) throw new Error('knowledge chunk not found')
    return transaction(() => {
      db.prepare('UPDATE knowledge_chunks SET indexable = 0, active = 0 WHERE id = ?').run(chunkId)
      db.prepare('DELETE FROM knowledge_chunk_embeddings WHERE chunk_id = ?').run(chunkId)
      const source = db.prepare('SELECT current_version_id FROM knowledge_sources WHERE id = ?').get(current.sourceId)
      if (source?.current_version_id === current.versionId) indexVersion(current.sourceId, current.versionId)
      const removed = getChunk(chunkId)
      audit(actor, 'remove', 'chunk', chunkId, current, {
        ...removed,
        note: String(options.note || '教师人工核查后移除知识块'),
      })
      return { ok: true, chunk: removed }
    })
  }

  function listAudit(options = {}) {
    const entityId = String(options.entityId || '')
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 200))
    const rows = entityId
      ? db.prepare('SELECT * FROM knowledge_audit_log WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?').all(entityId, limit)
      : db.prepare('SELECT * FROM knowledge_audit_log ORDER BY created_at DESC LIMIT ?').all(limit)
    return rows.map((row) => ({
      id: row.id, actor: row.actor, action: row.action, entityType: row.entity_type,
      entityId: row.entity_id, before: parseJson(row.before_json, {}), after: parseJson(row.after_json, {}), createdAt: row.created_at,
    }))
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
    ingestKnowledgeBuild,
    ingestTeacherDocument,
    reviewVersion,
    publishVersion,
    disableSource,
    rollbackSource,
    search,
    listRetrievalCandidates,
    getEmbeddings,
    upsertEmbeddings,
    deleteEmbeddings,
    pruneStaleEmbeddings,
    recordRetrieval,
    stats,
    listVersions,
    listSources,
    getSource,
    listChunks,
    getChunk,
    updateChunk,
    removeChunk,
    listAudit,
    knowledgeTree,
    close,
  }
}
