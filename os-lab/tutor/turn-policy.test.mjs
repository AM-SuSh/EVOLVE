import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferQuestionCategory,
  inferTutorIntent,
  planTutorTurn,
  tutorTurnPolicyPrompt,
} from './turn-policy.mjs'

test('turn intent covers the seven response strategies', () => {
  const cases = [
    ['页表为什么要分三级？', 'concept'],
    ['task.rs 里的 suspend_current_and_run_next 调用链怎么读？', 'code-reading'],
    ['cargo run 后 panic，应该怎么定位？', 'debug'],
    ['我该怎样验证 sepc 已经前移？', 'verification'],
    ['帮我复盘这次实验里证据还缺什么', 'reflection'],
    ['如果改成多核，这个结论还成立吗？', 'transfer'],
    ['直接给我完整代码和最终答案', 'direct-answer'],
  ]
  for (const [message, expected] of cases) assert.equal(inferTutorIntent(message), expected)
})

test('intent and teaching actions are invariant across UI stages', () => {
  const base = {
    currentStage: 'orient',
    message: 'cargo run 后 panic，应该怎么定位？',
    evidence: { diagnosticCount: 1 },
    hintLevel: 0,
  }
  const plans = ['orient', 'read', 'run', 'debug', 'reflect', 'transfer']
    .map((requestedStage) => planTutorTurn({ ...base, requestedStage }))
  for (const plan of plans) {
    assert.equal(plan.intent, 'debug')
    assert.deepEqual(plan.actions, plans[0].actions)
    assert.equal(plan.gate, 'intent-routed')
  }
  assert.deepEqual(plans.map((plan) => plan.stage), ['orient', 'read', 'run', 'debug', 'reflect', 'transfer'])
})

test('turn policy keeps evidence authority without injecting a required stage action', () => {
  const plan = planTutorTurn({
    currentStage: 'read',
    requestedStage: 'reflect',
    message: '我该怎样验证这个判断？',
    evidence: { latestRun: { runId: 'run-1', verified: false, traceCount: 2 }, eventIds: ['event-1'] },
  })
  const prompt = tutorTurnPolicyPrompt(plan)
  assert.match(prompt, /问题意图：verification/)
  assert.match(prompt, /run:run-1/)
  assert.doesNotMatch(prompt, /当前阶段|本轮必须动作|reflect/)
})

test('legacy UI question category is sourced from the shared policy module', () => {
  assert.equal(inferQuestionCategory('为什么会 panic？'), 'phenomenon')
  assert.equal(inferQuestionCategory('请直接给完整代码'), 'direct_answer')
})
