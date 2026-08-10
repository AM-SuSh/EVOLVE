import test from 'node:test'
import assert from 'node:assert/strict'
import { assessLearningV3, scoreLearningEventsV3 } from './rubric-v3.mjs'

const common = {
  version: 2,
  sessionId: 'learning-v3',
  labId: 'lab2',
}

const assertions = ['hello-output', 'power-result', 'yield-five-rounds', 'all-exited']
  .map((id) => ({ id, passed: true, observed: 'ok' }))

function fullEvidence(stage = 'debug') {
  return {
    events: [
      { ...common, id: 'stage-1', type: 'stage_enter', stage, timestamp: '2026-08-10T00:00:00.000Z' },
      {
        ...common,
        id: 'message-judgment',
        type: 'student_message',
        stage,
        timestamp: '2026-08-10T00:00:00.100Z',
        category: 'cause',
        content: '我的判断是任务状态没有回到 Ready，因为切换路径遗漏了状态更新。',
      },
      {
        ...common,
        id: 'message-evidence',
        type: 'student_message',
        stage,
        timestamp: '2026-08-10T00:00:00.200Z',
        category: 'debug',
        content: 'kernel/src/task.rs 的 switch 函数和 trace 输出都显示了 from/to。',
      },
      {
        ...common,
        id: 'message-hypothesis',
        type: 'student_message',
        stage,
        timestamp: '2026-08-10T00:00:00.300Z',
        category: 'debug',
        content: '假设问题是状态写回过晚，如果成立，那么下一次 trace 输出不会出现 Ready。',
      },
      {
        ...common,
        id: 'code-open',
        type: 'code_open',
        stage,
        timestamp: '2026-08-10T00:00:00.400Z',
        path: 'kernel/src/task.rs',
      },
      {
        ...common,
        id: 'verification',
        type: 'verification_attempt',
        stage,
        timestamp: '2026-08-10T00:03:10.000Z',
        runId: 'run-pass',
        metadata: { trusted: true, verified: true, passed: true },
      },
      {
        ...common,
        id: 'code-save',
        type: 'code_save',
        stage,
        timestamp: '2026-08-10T00:02:00.000Z',
        path: 'kernel/src/task.rs',
      },
      {
        ...common,
        id: 'reflection',
        type: 'reflection_submitted',
        stage,
        timestamp: '2026-08-10T00:04:00.000Z',
        content: '我的判断是状态写回顺序导致异常，因为 trace 中缺少 Ready；AI 提醒我检查切换路径，我用 QEMU 输出和 trace 验证。改变为抢占调度时我会先预测并对照；仅退出码 0 不够，还需要断言和边界条件。',
      },
    ],
    runs: [
      {
        runId: 'run-fail',
        trusted: true,
        verified: false,
        startedAt: '2026-08-10T00:00:30.000Z',
        finishedAt: '2026-08-10T00:01:00.000Z',
        assertions: [],
      },
      {
        runId: 'run-pass',
        trusted: true,
        verified: true,
        startedAt: '2026-08-10T00:03:00.000Z',
        finishedAt: '2026-08-10T00:03:10.000Z',
        assertions,
      },
    ],
  }
}

function assess(input) {
  return assessLearningV3({ labId: 'lab2', sessionId: 'learning-v3', ...input })
}

function itemScore(assessment, id) {
  return assessment.items.find((entry) => entry.id === id)?.score
}

test('rubric v3 detects judgment, evidence, hypothesis, verification, iteration, reflection and transfer', () => {
  const assessment = assess(fullEvidence())
  for (const id of ['J1', 'E1', 'H1', 'V1', 'I1', 'F1', 'F2', 'T1', 'T2']) {
    assert.equal(itemScore(assessment, id), 2, `${id} should be met`)
  }
  assert.deepEqual(assessment.learningDimensions, {
    judgment: 100,
    evidence: 100,
    hypothesis: 100,
    verification: 100,
    iteration: 100,
    reflection: 100,
    transfer: 100,
  })
})

test('stage events and message stage do not change rubric v3 scores', () => {
  const first = assess(fullEvidence('orient'))
  const secondInput = fullEvidence('transfer')
  secondInput.events.unshift({
    ...common,
    id: 'extra-stage',
    type: 'stage_enter',
    stage: 'read',
    timestamp: '2026-08-09T23:59:59.000Z',
  })
  const second = assess(secondInput)
  assert.equal(first.total, second.total)
  assert.deepEqual(first.dimensions, second.dimensions)
  assert.deepEqual(first.learningDimensions, second.learningDimensions)
  assert.deepEqual(first.items.map(({ id, score }) => ({ id, score })), second.items.map(({ id, score }) => ({ id, score })))
})

test('hint telemetry does not change rubric v3 scores', () => {
  const baseline = assess(fullEvidence())
  const withHints = fullEvidence()
  withHints.events.push({
    ...common,
    id: 'hint-4',
    type: 'hint_requested',
    stage: 'orient',
    timestamp: '2026-08-10T00:00:00.500Z',
    hintLevel: 4,
  })
  const hinted = assess(withHints)
  assert.equal(hinted.trajectory.maxHintLevel, 4)
  assert.equal(hinted.total, baseline.total)
  assert.deepEqual(hinted.dimensions, baseline.dimensions)
})

test('untrusted verification cannot receive full verification or result credit', () => {
  const assessment = assess({
    events: [{
      ...common,
      id: 'untrusted-attempt',
      type: 'verification_attempt',
      stage: 'run',
      timestamp: '2026-08-10T00:00:00.000Z',
      runId: 'custom-run',
      metadata: { trusted: false, verified: true, passed: true },
    }],
    runs: [{ runId: 'custom-run', trusted: false, verified: true, assertions }],
  })
  assert.equal(itemScore(assessment, 'V1'), 1)
  assert.equal(itemScore(assessment, 'R1'), 0)
})

test('requesting a direct answer does not receive judgment or hypothesis credit', () => {
  const assessment = assess({
    events: [{
      ...common,
      id: 'direct-answer',
      type: 'student_message',
      stage: 'reflect',
      timestamp: '2026-08-10T00:00:00.000Z',
      category: 'direct_answer',
      content: '请直接给我完整代码和最终答案。',
    }],
    runs: [],
  })
  assert.equal(itemScore(assessment, 'J1'), 0)
  assert.equal(itemScore(assessment, 'H1'), 0)
})

test('iteration requires fail, save and then trusted pass for full credit', () => {
  const complete = fullEvidence()
  const withoutSave = fullEvidence()
  withoutSave.events = withoutSave.events.filter((event) => event.type !== 'code_save')
  assert.equal(itemScore(assess(withoutSave), 'I1'), 1)
  assert.equal(itemScore(assess(complete), 'I1'), 2)
})

test('legacy report score is also independent from stage fields', () => {
  const orient = fullEvidence('orient').events
  const transfer = fullEvidence('transfer').events
  const first = scoreLearningEventsV3(orient)
  const second = scoreLearningEventsV3(transfer)
  assert.deepEqual(first, second)
})
