import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openKnowledgeStore } from './knowledge-store.mjs'

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
