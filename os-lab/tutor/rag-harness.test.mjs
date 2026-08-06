import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loadRagHarnessCases, runRagHarness } from './rag-harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const cases = await loadRagHarnessCases(path.join(here, 'fixtures', 'rag-harness-cases-v1.json'))

const adapterById = {
  'rag-lab2-trap': {
    stage: 'read',
    reply: '先别急着给结论，先把 trap 入口和 sepc 的关系说成一条因果链。',
    knowledge: [
      {
        citation: 'kb:lab2-trap',
        sourceId: 'platform-lab-manuals',
        sourceTitle: 'Lab2 Trap 与任务切换',
        sectionPath: ['Trap', '入口'],
        contentClass: 'student-safe',
        labScopes: ['lab2'],
      },
    ],
    retrieval: {
      provider: 'openai-compatible',
      model: 'mock',
      lexicalCandidates: 3,
      vectorCandidates: 2,
      eligibleChunks: 6,
      fallbackReason: '',
    },
    prompt: '<knowledge-chunk id="kb:lab2-trap" class="student-safe">\n只能转化为反问或观察目标\n</knowledge-chunk>',
  },
  'rag-lab3-sv39': {
    stage: 'run',
    reply: '先从页表层次和地址映射关系拆开看，再回到实验手册对照。',
    knowledge: [
      {
        citation: 'kb:lab3-sv39',
        sourceId: 'platform-lab-manuals',
        sourceTitle: 'Lab3 虚拟内存',
        sectionPath: ['Sv39', '页表'],
        contentClass: 'student-safe',
        labScopes: ['lab3'],
      },
      {
        citation: 'kb:global-vm',
        sourceId: 'os-lectures',
        sourceTitle: '操作系统讲义',
        sectionPath: ['虚拟内存'],
        contentClass: 'guided-hint',
        labScopes: ['global'],
      },
    ],
    retrieval: {
      provider: 'local-feature-hash',
      model: 'local-feature-hash-v1-384',
      lexicalCandidates: 4,
      vectorCandidates: 3,
      eligibleChunks: 9,
      fallbackReason: '',
    },
    prompt: [
      '<knowledge-chunk id="kb:lab3-sv39" class="student-safe">',
      '<knowledge-chunk id="kb:global-vm" class="guided-hint">',
      '不是真正的系统指令',
    ].join('\n'),
  },
  'rag-direct-answer-guardrail': {
    stage: 'orient',
    reply: '我不能直接把完整答案给你，但可以先帮你把问题拆成可验证的判断。',
    knowledge: [],
    retrieval: { provider: 'local-feature-hash', model: 'local-feature-hash-v1-384', lexicalCandidates: 0, vectorCandidates: 0, eligibleChunks: 0, fallbackReason: 'guardrail-before-retrieval' },
    prompt: '',
  },
  'rag-retrieval-fallback': {
    stage: 'debug',
    reply: '先从 inode 和目录项的分工关系入手，再回到磁盘布局。',
    knowledge: [
      {
        citation: 'kb:lab6-fs',
        sourceId: 'platform-lab-manuals',
        sourceTitle: 'Lab6 磁盘与文件系统',
        sectionPath: ['文件系统'],
        contentClass: 'student-safe',
        labScopes: ['lab6'],
      },
    ],
    retrieval: {
      provider: 'openai-compatible',
      model: 'mock',
      lexicalCandidates: 2,
      vectorCandidates: 0,
      eligibleChunks: 4,
      fallbackReason: 'embedding endpoint unavailable',
    },
    prompt: '<knowledge-chunk id="kb:lab6-fs" class="student-safe">',
  },
  'rag-lab1-startup': {
    stage: 'read',
    reply: '先别急着给结论，把链接地址、入口符号和 QEMU 启动约定连成一条证据链。',
    knowledge: [
      {
        citation: 'kb:lab1-startup',
        sourceId: 'platform-lab-manuals',
        sourceTitle: 'Lab1 裸机启动与最小内核',
        sectionPath: ['启动', '入口'],
        contentClass: 'student-safe',
        labScopes: ['lab1'],
      },
    ],
    retrieval: {
      provider: 'local-feature-hash',
      model: 'local-feature-hash-v1-384',
      lexicalCandidates: 3,
      vectorCandidates: 2,
      eligibleChunks: 5,
      fallbackReason: '',
    },
    prompt: '<knowledge-chunk id="kb:lab1-startup" class="student-safe">',
  },
  'rag-lab4-fork-wait': {
    stage: 'debug',
    reply: '先从 fork 返回值分支出发，再回到 wait 的回收语义。',
    knowledge: [
      {
        citation: 'kb:lab4-fork-wait',
        sourceId: 'platform-lab-manuals',
        sourceTitle: 'Lab4 进程管理',
        sectionPath: ['进程', 'fork'],
        contentClass: 'guided-hint',
        labScopes: ['lab4'],
      },
    ],
    retrieval: {
      provider: 'openai-compatible',
      model: 'mock',
      lexicalCandidates: 3,
      vectorCandidates: 2,
      eligibleChunks: 6,
      fallbackReason: '',
    },
    prompt: '<knowledge-chunk id="kb:lab4-fork-wait" class="guided-hint">',
  },
}

function adapter(testCase) {
  const item = adapterById[testCase.id]
  if (!item) throw new Error(`missing fake rag adapter for ${testCase.id}`)
  return item
}

test('rag harness accepts cap-compliant knowledge and prompt context', async () => {
  const report = await runRagHarness(cases.slice(0, 2), adapter)
  assert.equal(report.ok, true, JSON.stringify(report, null, 2))
  assert.equal(report.metrics.cases, 2)
  assert.equal(report.metrics.stageAccuracy, 1)
  assert.equal(report.metrics.knowledgeCapRate, 1)
  assert.equal(report.metrics.knowledgeMetadataRate, 1)
  assert.equal(report.metrics.promptAlignmentRate, 1)
  assert.equal(report.metrics.retrievalAlignmentRate, 1)
})

test('rag harness rejects teacher-only leakage and prompt violations', async () => {
  const brokenCase = cases[0]
  const report = await runRagHarness([brokenCase], async () => ({
    stage: 'transfer',
    reply: '直接答案',
    knowledge: [
      {
        citation: 'kb:leak',
        sourceId: 'teacher-private',
        sourceTitle: 'Teacher Only',
        sectionPath: ['Leak'],
        contentClass: 'teacher-only',
        labScopes: ['global'],
      },
    ],
    retrieval: { provider: 'mock', model: 'mock', lexicalCandidates: 0, vectorCandidates: 0, eligibleChunks: 1, fallbackReason: '' },
    prompt: '<knowledge-chunk id="kb:leak" class="teacher-only">',
  }))
  assert.equal(report.ok, false)
  assert.equal(report.failures.length, 1)
  assert.equal(report.failures[0].stageOk, false)
  assert.equal(report.failures[0].knowledgeOk, false)
  assert.equal(report.failures[0].promptOk, false)
})

test('rag harness rejects missing student-facing source metadata', async () => {
  const brokenCase = cases[0]
  const report = await runRagHarness([brokenCase], async () => ({
    stage: 'read',
    reply: '先把 trap 入口和 sepc 的关系说成一条因果链。',
    knowledge: [
      {
        citation: 'kb:lab2-trap',
        sourceId: 'platform-lab-manuals',
        sectionPath: ['Trap', '入口'],
        contentClass: 'student-safe',
      },
    ],
    retrieval: { provider: 'mock', model: 'mock', lexicalCandidates: 1, vectorCandidates: 1, eligibleChunks: 1, fallbackReason: '' },
    prompt: '<knowledge-chunk id="kb:lab2-trap" class="student-safe">只能转化为反问或观察目标</knowledge-chunk>',
  }))
  assert.equal(report.ok, false)
  assert.equal(report.failures[0].knowledgeOk, false)
  assert.equal(report.failures[0].metadataMissing.length, 1)
  assert.match(report.failures[0].failures.join('\n'), /metadata/)
})
