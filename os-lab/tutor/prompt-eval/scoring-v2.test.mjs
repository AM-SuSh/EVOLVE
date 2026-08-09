import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bestGroundingScore,
  buildAblationV2,
  buildScorecardReport,
  replyQualityScore,
  scoreRecordV2,
  scoreReplyV2,
} from './scoring-v2.mjs'

test('reply scoring separates zero/one/multiple questions', () => {
  const zero = scoreReplyV2('先给出你的判断。', 'orient')
  const one = scoreReplyV2('先给出你的判断：这个边界由谁决定？', 'orient')
  const many = scoreReplyV2('问题一？问题二？问题三？', 'orient')
  assert.equal(zero.questionScore, 0.4)
  assert.equal(one.questionScore, 1)
  assert.equal(many.questionScore, 0.4)
})

test('length uses a soft penalty instead of a hard cliff', () => {
  assert.equal(scoreReplyV2('x'.repeat(220), 'read').lengthScore, 1)
  assert.ok(scoreReplyV2('x'.repeat(240), 'read').lengthScore < 1)
  assert.equal(scoreReplyV2('x'.repeat(440), 'read').lengthScore, 0)
})

test('leak check counts real code lines inside fences', () => {
  const code = '```rust\n' + Array.from({ length: 11 }, () => 'fn x() {}').join('\n') + '\n```'
  const shortCode = '```rust\nfn x() {}\n```'
  assert.equal(scoreReplyV2(code, 'debug').leakScore, 0)
  assert.equal(scoreReplyV2(shortCode, 'debug').leakScore, 1)
})

test('grounding measures whether the reply uses chunk wording', () => {
  const score = bestGroundingScore('pending 与 mask 的区别是什么？', ['信号从 pending 到投递', 'mask 表示当前允许哪些信号'])
  assert.ok(score > 0)
})

test('record scorecard separates pipeline, safety, reply and RAG', () => {
  const record = {
    id: 'lab7-read',
    labId: 'lab7',
    stage: 'read',
    mode: 'remote',
    reply: '先沿源码阅读 kernel/src/signal.rs，定位 take_deliverable：pending 与 mask 如何共同参与筛选？',
    knowledge: [
      {
        citation: 'kb:test:1',
        contentClass: 'student-safe',
        labScopes: ['lab7'],
        retrieval: { score: 0.03, lexicalRank: 1, vectorRank: 2 },
      },
    ],
    retrieval: {
      eligibleChunks: 10,
      fallbackReason: '',
      lexicalCandidates: 3,
      vectorCandidates: 6,
    },
    checks: {
      promptUsed: true,
      stageRoute: true,
      hasQuestion: true,
      singleQuestion: true,
      lengthOk: true,
      stageAdherence: true,
      noLeak: true,
      knowledgeRelevant: true,
      knowledgeClassesOk: true,
      retrievalOk: true,
    },
  }
  const scorecard = scoreRecordV2(record, {
    chunkTexts: ['pending 与 mask 是信号状态', 'take_deliverable 使用 pending 和 mask'],
  })
  assert.equal(scorecard.pipeline, 100)
  assert.equal(scorecard.safety, 100)
  assert.ok(scorecard.replyQuality > 80)
  assert.ok(scorecard.ragQuality < 100)
  assert.ok(scorecard.composite < 100)
})

test('report and ablation expose diagnostic aggregates', () => {
  const record = {
    id: 'lab1-orient',
    labId: 'lab1',
    stage: 'orient',
    mode: 'remote',
    reply: '先给出你的判断：入口地址由谁决定？',
    knowledge: [],
    retrieval: { eligibleChunks: 0, fallbackReason: 'none', lexicalCandidates: 0, vectorCandidates: 0 },
    checks: {
      promptUsed: true,
      stageRoute: true,
      hasQuestion: true,
      singleQuestion: true,
      lengthOk: true,
      stageAdherence: true,
      noLeak: true,
      knowledgeRelevant: false,
      knowledgeClassesOk: false,
      retrievalOk: false,
    },
  }
  const report = buildScorecardReport([record], { tag: 'test' })
  assert.equal(report.json.summary.count, 1)
  assert.equal(report.json.labs[0].labId, 'lab1')

  const ablation = buildAblationV2([
    {
      id: 'lab1-orient',
      labId: 'lab1',
      stage: 'orient',
      full: { ok: true, reply: '你的判断是什么？' },
      baseline: { ok: true, reply: '你的判断是什么？' },
    },
  ])
  assert.equal(ablation.positive, 0)
  assert.equal(ablation.zero, 1)
  assert.equal(ablation.remote.zero, 1)
  assert.equal(ablation.remote.ci95.length, 2)
  assert.deepEqual(ablation.offlineEntries, [])
  assert.equal(replyQualityScore(scoreReplyV2('你的判断是什么？', 'orient')), 100)
})
