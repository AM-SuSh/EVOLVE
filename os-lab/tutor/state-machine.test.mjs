import test from 'node:test'
import assert from 'node:assert/strict'
import { decideTutorTurn, enforceTutorOutput, tutorPolicyPrompt } from './state-machine.mjs'

test('C3 server state machine follows evidence gates instead of requested stage', () => {
  const orient = decideTutorTurn({
    currentStage: 'orient',
    requestedStage: 'reflect',
    message: '我认为 yield 会把任务放回 Ready，但不确定在哪里修改状态',
    evidence: {},
    hintLevel: 0,
  })
  assert.equal(orient.stage, 'read')
  assert.equal(orient.requestedStage, 'reflect')
  const run = decideTutorTurn({
    currentStage: 'run',
    requestedStage: 'reflect',
    message: '我已经运行',
    evidence: { latestRun: { runId: 'run-1', verified: false, traceCount: 2 } },
    hintLevel: 0,
  })
  assert.equal(run.stage, 'debug')
  assert.equal(run.evidenceRefs.includes('run:run-1'), true)
})

test('C3 hints advance only on explicit requests and stop at L4', () => {
  const decision = decideTutorTurn({
    currentStage: 'debug',
    requestedStage: 'debug',
    message: '我卡住了，给点提示',
    evidence: { diagnosticCount: 1 },
    hintLevel: 3,
  })
  assert.equal(decision.hintLevel, 4)
  assert.equal(decision.actions.includes('offer-hint-l4'), true)
  const capped = decideTutorTurn({ ...decision, currentStage: 'debug', message: '再给提示', evidence: {}, hintLevel: 4 })
  assert.equal(capped.hintLevel, 4)
  assert.equal(capped.hintAdvanced, false)
})

test('C3 policy exposes only evidence summaries and output guard blocks complete patches', () => {
  const decision = decideTutorTurn({ currentStage: 'read', message: '我打开了 task.rs', evidence: { counts: { code_open: 1 } } })
  assert.match(tutorPolicyPrompt(decision), /服务端教学状态/)
  const guarded = enforceTutorOutput('完整代码如下：\n```rust\nfn a() {}\n```', decision)
  assert.equal(guarded.guarded, true)
  assert.doesNotMatch(guarded.reply, /fn a/)
})
