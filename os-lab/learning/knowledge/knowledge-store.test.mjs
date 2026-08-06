import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openKnowledgeStore } from './knowledge-store.mjs'
import { createHybridRetriever } from './hybrid-retriever.mjs'
import { createLocalEmbeddingProvider } from './embedding-provider.mjs'

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function fixture(root, revision = 1) {
  const labs = [
    { labId: 'lab1', text: revision === 1 ? '裸机启动地址与入口汇编' : '裸机启动地址与链接脚本', section: ['实验 1', '启动'] },
    { labId: 'lab2', text: '任务调度原理与中断处理流程', section: ['实验 2', '调度'] },
  ]
  const entries = []
  for (const [index, item] of labs.entries()) {
    const hash = String(index + revision).repeat(64).slice(0, 64)
    const documentId = `platform-lab-manuals:${item.labId}:r${revision}`
    const documentFile = `documents/${item.labId}.json`
    const chunkFile = `chunks/${item.labId}.json`
    writeJson(path.join(root, documentFile), {
      schemaVersion: 1,
      documentId,
      sourceId: 'platform-lab-manuals',
      title: item.labId,
      format: 'markdown',
      language: 'zh-CN',
      contentHash: hash,
      metadata: { sourcePath: `os-lab/labs/${item.labId}.md` },
      blocks: [{ id: 'b0', ordinal: 0, type: 'paragraph', text: item.text, sectionPath: item.section, locator: { lineStart: 1 } }],
    })
    writeJson(path.join(root, chunkFile), {
      schemaVersion: 1,
      chunkSetId: `${documentId}:chunks`,
      documentId,
      sourceId: 'platform-lab-manuals',
      chunking: { algorithm: 'section-aware-v1', targetChars: 1000, maxChars: 1400, overlapChars: 0, chunkCount: 2 },
      chunks: [
        {
          id: `${documentId}:chunk-0`, ordinal: 0, documentId, sourceId: 'platform-lab-manuals',
          chunkType: 'text', text: item.text, sectionPath: item.section, blockOrdinals: [0],
          locatorStart: { lineStart: 1 }, locatorEnd: { lineEnd: 1 }, contentClass: 'student-safe',
          labScope: [item.labId], conceptIds: [`os.${item.labId}`], answerRisk: 'low', indexable: true,
          metadata: { charCount: item.text.length, tokenEstimate: 8, blockTypes: ['paragraph'], sourcePath: `os-lab/labs/${item.labId}.md` },
        },
        {
          id: `${documentId}:chunk-blocked`, ordinal: 1, documentId, sourceId: 'platform-lab-manuals',
          chunkType: 'text', text: '完整参考答案不能进入检索', sectionPath: item.section, blockOrdinals: [0],
          locatorStart: { lineStart: 2 }, locatorEnd: { lineEnd: 2 }, contentClass: 'teacher-only',
          labScope: [item.labId], conceptIds: [], answerRisk: 'blocked', indexable: false,
          metadata: { charCount: 12, tokenEstimate: 3, blockTypes: ['paragraph'], sourcePath: `os-lab/labs/${item.labId}.md` },
        },
      ],
    })
    entries.push({ labId: item.labId, title: item.labId, sourcePath: `os-lab/labs/${item.labId}.md`, documentFile, chunkFile, contentHash: hash })
  }
  const manifest = { schemaVersion: 1, buildId: `fixture-r${revision}`, sourceId: 'platform-lab-manuals', labs: entries }
  const manifestFile = path.join(root, 'manifest.json')
  writeJson(manifestFile, manifest)
  return manifestFile
}

function sourceFixture(root) {
  const sourceId = 'textbook-fixture'
  const documentId = `${sourceId}:document`
  const text = '虚拟内存通过页表建立地址空间映射。'
  writeJson(path.join(root, sourceId, 'documents/doc.json'), {
    schemaVersion: 1, documentId, sourceId, title: '测试教材', format: 'markdown', language: 'zh-CN',
    contentHash: 'd'.repeat(64), metadata: { sourcePath: 'snapshot/chapter.md' },
    blocks: [{ id: 'b0', ordinal: 0, type: 'paragraph', text, sectionPath: ['虚拟内存'], locator: { lineStart: 1 } }],
  })
  writeJson(path.join(root, sourceId, 'chunks/doc.json'), {
    schemaVersion: 1, chunkSetId: `${documentId}:chunks`, documentId, sourceId,
    chunking: { algorithm: 'section-aware-v1', targetChars: 1000, maxChars: 1400, overlapChars: 0, chunkCount: 1 },
    chunks: [{
      id: `${documentId}:chunk-0`, ordinal: 0, documentId, sourceId, chunkType: 'text', text,
      sectionPath: ['虚拟内存'], blockOrdinals: [0], locatorStart: { lineStart: 1 }, locatorEnd: { lineEnd: 1 },
      contentClass: 'student-safe', labScope: ['global'], conceptIds: ['os.vm'], answerRisk: 'low', indexable: true,
      metadata: { charCount: text.length, tokenEstimate: 8, blockTypes: ['paragraph'], sourcePath: 'snapshot/chapter.md' },
    }],
  })
  const manifest = {
    schemaVersion: 1, buildId: 'multi-source-fixture', sources: [
      {
        id: sourceId, title: '测试教材', sourceType: 'snapshot', authorityRank: 70, defaultClass: 'student-safe',
        status: 'published', documents: [{ documentFile: 'documents/doc.json', chunkFile: 'chunks/doc.json', contentHash: 'd'.repeat(64) }],
      },
      { id: 'pending-fixture', title: '待快照来源', sourceType: 'website', authorityRank: 10, defaultClass: 'student-safe', status: 'pending-review', documents: [] },
    ],
  }
  const manifestFile = path.join(root, 'manifest.json')
  writeJson(manifestFile, manifest)
  return manifestFile
}

test('generic build imports multiple source identities and keeps pending inventory visible', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'os-lab-kb-sources-'))
  const store = openKnowledgeStore({ dbPath: path.join(root, 'knowledge.db') })
  try {
    const result = store.ingestKnowledgeBuild(sourceFixture(path.join(root, 'build')), { actor: 'system' })
    assert.equal(result.sources.length, 2)
    assert.equal(store.stats().sources, 2)
    assert.equal(store.stats().documents, 1)
    assert.equal(store.search('页表', { labId: 'lab3' }).length, 1)
    assert.equal(store.getSource('pending-fixture').status, 'pending-review')
    assert.equal(store.listSources().find((item) => item.id === 'pending-fixture').activeChunks, 0)
    const reused = store.ingestKnowledgeBuild(sourceFixture(path.join(root, 'build')), { actor: 'system' })
    assert.equal(reused.sources.every((item) => item.reused), true)
    assert.equal(store.stats().versions, 2)
  } finally {
    store.close()
  }
})

test('ingestion is scoped, searchable, idempotent, and rollback-safe', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'os-lab-kb-'))
  const store = openKnowledgeStore({ dbPath: path.join(root, 'knowledge.db') })
  try {
    const firstManifest = fixture(path.join(root, 'build-v1'), 1)
    const first = store.ingestLabManualBuild(firstManifest, { actor: 'teacher-a' })
    assert.equal(first.ok, true)
    assert.equal(first.reused, false)
    assert.deepEqual(store.stats(), {
      dbPath: path.join(root, 'knowledge.db'), sources: 1, versions: 1, documents: 2,
      chunks: 4, activeChunks: 4, indexedChunks: 2, ingestionRuns: 1, auditEntries: 1,
      embeddings: 0, embeddingModels: [], retrievalRuns: 0,
      labs: [{ labId: 'lab1', chunks: 2 }, { labId: 'lab2', chunks: 2 }],
    })
    assert.equal(store.search('任务调度', { labId: 'lab2' }).length, 1)
    assert.equal(store.search('任务调度', { labId: 'lab1' }).length, 0)
    assert.equal(store.search('中断', { labId: 'lab2' }).length, 1)
    assert.equal(store.search('参考答案', { labId: 'lab2', allowedClasses: ['teacher-only'] }).length, 0)
    assert.equal(store.knowledgeTree().labs.find((item) => item.labId === 'lab1').chunks, 2)
    assert.equal(store.listSources()[0].activeChunks, 4)
    const browsed = store.listChunks({ labId: 'lab2', limit: 10 })
    assert.equal(browsed.length, 2)
    assert.deepEqual(browsed[0].labScopes, ['lab2'])
    assert.equal(store.getChunk(browsed[0].id).id, browsed[0].id)

    const reused = store.ingestLabManualBuild(firstManifest, { actor: 'teacher-a' })
    assert.equal(reused.reused, true)
    assert.equal(store.stats().versions, 1)
    assert.equal(store.stats().chunks, 4)

    const secondManifest = fixture(path.join(root, 'build-v2'), 2)
    const second = store.ingestLabManualBuild(secondManifest, { actor: 'teacher-a', triggerKind: 'rebuild' })
    assert.equal(second.reused, false)
    assert.equal(store.stats().versions, 2)
    assert.equal(store.stats().chunks, 8)
    assert.equal(store.stats().activeChunks, 4)
    assert.equal(store.stats().indexedChunks, 2)
    assert.equal(store.search('链接脚本', { labId: 'lab1' }).length, 1)
    assert.equal(store.search('入口汇编', { labId: 'lab1' }).length, 0)

    store.rollbackSource('platform-lab-manuals', first.versionId, { actor: 'teacher-a' })
    assert.equal(store.search('入口汇编', { labId: 'lab1' }).length, 1)
    assert.equal(store.search('链接脚本', { labId: 'lab1' }).length, 0)
    assert.equal(store.stats().indexedChunks, 2)
    assert.equal(store.listVersions('platform-lab-manuals').filter((item) => item.status === 'published').length, 1)
  } finally {
    store.close()
  }
})

test('hybrid retrieval caches vectors, bridges OS aliases, and falls back to FTS', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'os-lab-kb-hybrid-'))
  const store = openKnowledgeStore({ dbPath: path.join(root, 'knowledge.db') })
  try {
    store.ingestLabManualBuild(fixture(path.join(root, 'build'), 1), { actor: 'teacher-a' })
    const retriever = createHybridRetriever(store, { provider: createLocalEmbeddingProvider({ dimensions: 128 }) })
    const built = await retriever.index()
    assert.equal(built.upserted, 2)
    const semantic = await retriever.search('scheduler', { labId: 'lab2', limit: 3 })
    assert.equal(semantic.results[0].text.includes('任务调度'), true)
    assert.equal(semantic.results[0].retrieval.vectorRank, 1)
    assert.equal(semantic.diagnostics.model, 'local-feature-hash-v1-128')
    assert.equal(store.stats().embeddings, 2)

    const cached = await retriever.index()
    assert.equal(cached.upserted, 0)
    assert.equal(store.stats().retrievalRuns, 1)

    const unavailable = createHybridRetriever(store, {
      provider: {
        kind: 'unavailable-test-provider', model: 'test:offline', dimensions: 128,
        async embed() { throw new Error('embedding endpoint unavailable') },
      },
    })
    const lexicalFallback = await unavailable.search('任务调度', { labId: 'lab2', limit: 3 })
    assert.equal(lexicalFallback.results.length, 1)
    assert.match(lexicalFallback.diagnostics.fallbackReason, /unavailable/)
  } finally {
    store.close()
  }
})

test('teacher upload stays private until reviewed and supports publish, chunk edits, and disable', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'os-lab-kb-teacher-'))
  const store = openKnowledgeStore({ dbPath: path.join(root, 'knowledge.db') })
  const sourceId = 'teacher-trap-notes'
  const text = 'stvec 决定 trap 入口，sscratch 用于保存用户态与内核态切换所需的信息。'
  const document = {
    schemaVersion: 1, documentId: `${sourceId}:doc`, sourceId, title: 'Trap 补充讲义',
    format: 'markdown', language: 'mixed', contentHash: 'a'.repeat(64),
    metadata: { sourcePath: 'trap-notes.md' },
    blocks: [{ id: 'block-000000', ordinal: 0, type: 'paragraph', text, sectionPath: ['Trap', '入口'], locator: { lineStart: 1 } }],
  }
  const chunkSet = {
    schemaVersion: 1, documentId: document.documentId, sourceId,
    chunks: [{
      id: `${document.documentId}:chunk-0`, ordinal: 0, documentId: document.documentId, sourceId,
      chunkType: 'text', text, sectionPath: ['Trap', '入口'], blockOrdinals: [0],
      locatorStart: { lineStart: 1 }, locatorEnd: { lineEnd: 1 }, contentClass: 'student-safe',
      labScope: ['lab2'], conceptIds: ['os.trap'], answerRisk: 'low', indexable: true,
      metadata: { charCount: text.length, tokenEstimate: 20, blockTypes: ['paragraph'] },
    }],
  }
  try {
    const uploaded = store.ingestTeacherDocument(document, chunkSet, {
      actor: 'teacher-a', sourceId, title: document.title,
      scopeSuggestions: [{ labId: 'lab2', confidence: 0.85, reason: '匹配 trap、stvec' }],
    })
    assert.equal(uploaded.status, 'pending-review')
    assert.equal(store.search('stvec', { labId: 'lab2' }).length, 0)
    assert.equal(store.listChunks({ sourceId, includeInactive: true })[0].contentClass, 'teacher-only')
    assert.throws(() => store.publishVersion(sourceId, uploaded.versionId), /许可证/)

    store.reviewVersion(sourceId, uploaded.versionId, {
      labScopes: ['lab2'], contentClass: 'guided-hint', licenseStatus: 'authorized',
      answerRiskReviewed: true, note: '仅作为追问依据',
    }, { actor: 'teacher-a' })
    assert.equal(store.search('stvec', { labId: 'lab2' }).length, 0)
    store.publishVersion(sourceId, uploaded.versionId, { actor: 'teacher-a' })
    assert.equal(store.search('stvec', { labId: 'lab2' }).length, 1)
    assert.equal(store.search('stvec', { labId: 'lab1' }).length, 0)

    const chunk = store.listChunks({ sourceId })[0]
    const highRisk = store.updateChunk(chunk.id, { answerRisk: 'high', indexable: true }, { actor: 'teacher-a' }).chunk
    assert.equal(highRisk.indexable, false)
    assert.equal(store.search('stvec', { labId: 'lab2', allowedClasses: ['guided-hint'] }).length, 0)
    assert.equal(store.listRetrievalCandidates({ sourceId }).length, 0)
    store.updateChunk(chunk.id, {
      labScopes: ['global'], contentClass: 'student-safe', answerRisk: 'low', indexable: true, active: true,
    }, { actor: 'teacher-a' })
    assert.equal(store.search('stvec', { labId: 'lab1' }).length, 1)
    const removed = store.removeChunk(chunk.id, { actor: 'teacher-a', note: '内容解析异常' }).chunk
    assert.equal(removed.active, false)
    assert.equal(removed.indexable, false)
    assert.equal(store.search('stvec', { labId: 'lab1' }).length, 0)
    assert.equal(store.listChunks({ sourceId }).length, 0)
    assert.equal(store.listChunks({ sourceId, includeInactive: true }).length, 1)
    store.disableSource(sourceId, { actor: 'teacher-a', note: '课程结束' })
    assert.equal(store.search('stvec', { labId: 'lab2' }).length, 0)
    assert.deepEqual(store.listAudit().map((entry) => entry.action), ['disable', 'remove', 'update', 'update', 'publish', 'review', 'upload'])
  } finally {
    store.close()
  }
})
