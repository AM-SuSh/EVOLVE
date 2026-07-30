import test from 'node:test'
import assert from 'node:assert/strict'
import { assessLearningV2 } from './rubric-v2.mjs'
import { deriveMasteryUpdates } from './mastery.mjs'

const events = [
  { id: 'stage-o', type: 'stage_enter', stage: 'orient' },
  { id: 'stage-r', type: 'stage_enter', stage: 'read' },
  { id: 'msg-1', type: 'student_message', stage: 'read', category: 'cause', content: '我认为状态变化需要用 trace 验证' },
  { id: 'hint-1', type: 'hint_requested', stage: 'debug', hintLevel: 2 },
  { id: 'trace-1', type: 'trace_inspected', stage: 'debug' },
  { id: 'reflect-1', type: 'reflection_submitted', stage: 'reflect', content: '我的判断由 AI 提示后，用 QEMU 输出和 trace 验证；退出码不够，还要看断言。我也对照了协程。' },
]
const assertions = ['hello-output', 'power-result', 'yield-five-rounds', 'all-exited'].map((id) => ({ id, passed: true, observed: 'ok' }))
const runs = [
  { runId: 'run-fail', trusted: true, verified: false, assertions: [] },
  { runId: 'run-pass', trusted: true, verified: true, assertions },
]

test('C4 rubric v2 scores trusted evidence and preserves item references', () => {
  const assessment = assessLearningV2({ labId: 'lab2', sessionId: 's1', events, runs })
  assert.equal(assessment.trajectory.failToPass, true)
  assert.equal(assessment.trajectory.maxHintLevel, 2)
  assert.equal(assessment.items.find((item) => item.id === 'R3').score, 2)
  assert.deepEqual(assessment.items.find((item) => item.id === 'R3').evidenceRefs, ['run:run-pass'])
  assert.equal(assessment.llmSuggestion.status, 'not-requested')
})

test('C4 LLM advice cannot score an item without a valid evidence reference', () => {
  const assessment = assessLearningV2({
    labId: 'lab2',
    sessionId: 's1',
    events,
    runs,
    llmSuggestion: {
      model: 'mock',
      promptVersion: 'v1',
      items: [
        { itemId: 'T1', score: 2, evidenceRefs: ['event:reflect-1'], rationale: 'has comparison' },
        { itemId: 'T2', score: 2, evidenceRefs: ['event:invented'], rationale: 'invented' },
      ],
    },
  })
  assert.equal(assessment.llmSuggestion.items[0].score, 2)
  assert.equal(assessment.llmSuggestion.items[1].score, null)
  assert.equal(assessment.llmSuggestion.items[1].status, 'unobserved')
})

test('C4 mastery derives auditable concept states rather than one free-text label', () => {
  const assessment = assessLearningV2({ labId: 'lab2', sessionId: 's1', events, runs })
  const updates = deriveMasteryUpdates(assessment)
  assert.equal(updates.length, 4)
  assert.equal(updates.some((item) => item.conceptId === 'os.sched.context-switch'), true)
  assert.equal(updates.every((item) => Array.isArray(item.evidenceRefs)), true)
})
