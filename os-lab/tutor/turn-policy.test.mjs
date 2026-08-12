import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferQuestionCategory,
  inferTutorIntent,
  inferTutorResponseMode,
  identifyTutorTopic,
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

test('definition questions answer the term before Socratic follow-up', () => {
  assert.equal(inferTutorResponseMode('fd是什么？'), 'definition-first')
  assert.equal(inferTutorResponseMode('sepc 在 trap 返回中起什么作用？'), 'definition-first')

  const plan = planTutorTurn({
    currentStage: 'orient',
    requestedStage: 'debug',
    message: 'fd是什么？',
    evidence: {},
  })
  assert.equal(plan.intent, 'concept')
  assert.equal(plan.responseMode, 'definition-first')
  assert.match(tutorTurnPolicyPrompt(plan), /先直接定义学生问到的术语/)
  assert.match(tutorTurnPolicyPrompt(plan), /不得以阶段、边界或反问开头/)
})

test('a definition question does not inherit the previous generic topic', () => {
  const previous = identifyTutorTopic({
    message: '页表为什么要分三级？',
    reading: { h2: '内存与虚拟内存' },
  })
  const next = identifyTutorTopic({
    message: '这个是什么？',
    reading: { h2: '内存与虚拟内存' },
    previousTopicKey: previous.topicKey,
    previousIntent: previous.topicIntent,
    previousTopicAnchor: previous.topicAnchor,
  })
  assert.equal(next.responseMode, 'definition-first')
  assert.notEqual(next.topicKey, previous.topicKey)
  assert.equal(next.topicChanged, true)
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

test('hint levels accumulate within one topic and reset after a meaningful topic switch', () => {
  const firstTopic = identifyTutorTopic({
    message: 'sepc 相关代码报错了，给点提示',
    codeContext: { file: 'kernel/src/trap/mod.rs' },
  })
  const first = planTutorTurn({
    message: 'sepc 相关代码报错了，给点提示',
    requestedStage: 'debug',
    topic: firstTopic,
    topicHintLevel: 0,
  })
  assert.equal(first.hintLevel, 1)

  const followUpTopic = identifyTutorTopic({
    message: '再给一点提示',
    previousTopicKey: first.topicKey,
    previousIntent: first.topicIntent,
    previousTopicAnchor: first.topicAnchor,
  })
  const followUp = planTutorTurn({
    message: '再给一点提示',
    requestedStage: 'reflect',
    topic: followUpTopic,
    topicHintLevel: first.hintLevel,
  })
  assert.equal(followUp.topicKey, first.topicKey)
  assert.equal(followUp.intent, 'debug')
  assert.equal(followUp.hintLevel, 2)

  const switchedTopic = identifyTutorTopic({
    message: '页表为什么要分三级？给点提示',
    codeContext: { file: 'kernel/src/mm/page_table.rs' },
    previousTopicKey: followUp.topicKey,
    previousIntent: followUp.topicIntent,
    previousTopicAnchor: followUp.topicAnchor,
  })
  const switched = planTutorTurn({
    message: '页表为什么要分三级？给点提示',
    topic: switchedTopic,
    topicHintLevel: 0,
  })
  assert.notEqual(switched.topicKey, first.topicKey)
  assert.equal(switched.topicChanged, true)
  assert.equal(switched.hintLevel, 1)
})

test('topic identity changes with source file or diagnostic meaning and hints remain capped', () => {
  const trapTopic = identifyTutorTopic({
    message: '这个函数怎么读？',
    codeContext: { file: 'kernel/src/trap/mod.rs' },
  })
  const taskTopic = identifyTutorTopic({
    message: '这个函数怎么读？',
    codeContext: { file: 'kernel/src/task/mod.rs' },
    previousTopicKey: trapTopic.topicKey,
    previousIntent: trapTopic.topicIntent,
    previousTopicAnchor: trapTopic.topicAnchor,
  })
  assert.notEqual(taskTopic.topicKey, trapTopic.topicKey)

  const diagnosticA = identifyTutorTopic({
    message: '这里报错了',
    codeContext: { file: 'kernel/src/task/mod.rs' },
    evidence: { diagnosticKeys: ['E0425:kernel/src/task/mod.rs'] },
  })
  const diagnosticB = identifyTutorTopic({
    message: '这里报错了',
    codeContext: { file: 'kernel/src/task/mod.rs' },
    evidence: { diagnosticKeys: ['E0308:kernel/src/task/mod.rs'] },
  })
  assert.notEqual(diagnosticA.topicKey, diagnosticB.topicKey)
  const capped = planTutorTurn({ message: '再给一点提示', topic: diagnosticB, topicHintLevel: 4 })
  assert.equal(capped.hintLevel, 4)
  assert.equal(capped.hintAdvanced, false)
})

test('understanding checks only close a resolved doubt once per topic', () => {
  const history = [{ role: 'assistant', content: 'sepc 保存异常返回后继续执行的位置。' }]
  const firstQuestion = planTutorTurn({
    message: 'sepc 是什么？',
    requestedStage: 'read',
    history: [],
    followup: { turnIndex: 0, lastCheckTurn: -10, checkCount: 0 },
  })
  assert.equal(firstQuestion.understandingCheck.shouldAsk, false)

  const confused = planTutorTurn({
    message: '我还是没理解它为什么需要前移',
    requestedStage: 'read',
    history,
    followup: { turnIndex: 1, lastCheckTurn: -10, checkCount: 0 },
  })
  assert.equal(confused.understandingCheck.shouldAsk, false)

  const acknowledged = planTutorTurn({
    message: '明白了，也就是说不前移就会再次执行同一条 ecall。',
    requestedStage: 'read',
    history,
    followup: { turnIndex: 2, lastCheckTurn: -10, checkCount: 0 },
  })
  assert.equal(acknowledged.understandingCheck.shouldAsk, true)
  assert.equal(acknowledged.actions.includes('selective-understanding-check'), true)

  const repeated = planTutorTurn({
    message: '我理解了。',
    requestedStage: 'read',
    history,
    followup: { turnIndex: 4, lastCheckTurn: 2, checkCount: 1 },
  })
  assert.equal(repeated.understandingCheck.shouldAsk, false)
})

test('a pending understanding check is answered and closed without another question', () => {
  const plan = planTutorTurn({
    message: '它会重复执行原来的 ecall。',
    requestedStage: 'read',
    history: [{ role: 'assistant', content: '你能解释为什么 sepc 要前移吗？' }],
    followup: { turnIndex: 3, lastCheckTurn: 2, checkCount: 1, pending: true },
  })
  assert.equal(plan.understandingCheck.shouldAsk, false)
  assert.equal(plan.actions.includes('resolve-understanding-check'), true)
  assert.match(tutorTurnPolicyPrompt(plan), /本轮必须结束这条理解检查/)
})

test('explicitly continuing work does not trigger an understanding check', () => {
  const plan = planTutorTurn({
    message: '明白了，我先去跑一下。',
    requestedStage: 'run',
    history: [{ role: 'assistant', content: '先检查保存和恢复路径。' }],
    followup: { turnIndex: 3, lastCheckTurn: -10, checkCount: 0 },
  })
  assert.equal(plan.understandingCheck.shouldAsk, false)
})
