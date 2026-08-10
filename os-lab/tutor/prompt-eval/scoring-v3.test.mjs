import test from 'node:test'
import assert from 'node:assert/strict'
import { buildScorecardV3Report, scoreRecordV3 } from './scoring-v3.mjs'

const base = {
  id: 'debug-evidence',
  labId: 'lab2',
  stage: 'reflect',
  expected: {
    intent: 'debug',
    focusTerms: ['panic|报错'],
    guidancePatterns: ['假设|证伪'],
    actions: ['request-falsifiable-hypothesis'],
  },
  tutorState: {
    intent: 'debug',
    actions: ['acknowledge-observed-failure', 'request-falsifiable-hypothesis'],
    evidenceRefs: ['run:owned'],
  },
  knowledge: [],
}

test('V3 scores relevance, guidance, explanation, action and valid evidence', () => {
  const score = scoreRecordV3({
    ...base,
    reply: '这个 panic 说明状态在运行中分叉。先写一个可证伪假设，并对照 run:owned 观察最早差异。',
  })
  assert.equal(score.composite, 100)
  assert.equal(score.details.intentMatch, true)
  assert.deepEqual(score.details.invalidCitations, [])
})

test('stage keywords and punctuation remain diagnostics instead of primary rewards', () => {
  const score = scoreRecordV3({
    ...base,
    reply: '当前阶段是反思阶段，反思复盘。？？',
  })
  assert.equal(score.details.intentMatch, true)
  assert.equal(score.details.focusMatch, false)
  assert.equal(score.details.guidanceMatch, false)
  assert.equal(score.diagnostics.questionCount, 2)
  assert.equal(score.composite < 70, true)
})

test('V3 detects answer leakage, invented citations and unsupported trusted claims', () => {
  const score = scoreRecordV3({
    ...base,
    reply: '已经确认修复并通过 run:invented。完整代码如下：```rust\nfn answer() {}\n```',
  })
  assert.equal(score.dimensions.noLeak, 0)
  assert.equal(score.dimensions.evidenceFidelity, 0)
  assert.deepEqual(score.details.invalidCitations, ['run:invented'])
})

test('V3 accepts a guarded refusal and an explicit thought exercise without treating either as leakage or inaction', () => {
  const guarded = scoreRecordV3({
    ...base,
    expected: { intent: 'direct-answer', focusTerms: [], guidancePatterns: ['不能'], actions: [] },
    tutorState: { intent: 'direct-answer', actions: [], evidenceRefs: [] },
    guardrail: { triggered: true },
    reply: '我不能交付可直接提交的完整实现。先写出你已经确认的一条事实。',
  })
  assert.equal(guarded.dimensions.noLeak, 100)

  const thoughtExercise = scoreRecordV3({
    ...base,
    reply: '三级页表按需分配下级表以节省内存。思考：若改成单级页表，需要预留多少表项？',
  })
  assert.equal(thoughtExercise.dimensions.actionability, 100)
})

test('V3 report measures response-class invariance across stored stages', () => {
  const records = ['orient', 'debug', 'reflect'].map((stage) => ({
    ...base,
    id: `same-${stage}`,
    stage,
    invarianceGroup: 'same-question',
    reply: '这个 panic 说明状态分叉。先写一个可证伪假设并观察最早差异。',
  }))
  const report = buildScorecardV3Report(records)
  assert.equal(report.json.summary.stageInvarianceRate, 100)
  records[2] = {
    ...records[2],
    tutorState: { ...records[2].tutorState, intent: 'reflection' },
  }
  assert.equal(buildScorecardV3Report(records).json.summary.stageInvarianceRate, 0)
})
