import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReviewEvidenceBundle,
  createAssessmentReviewPlan,
  evaluateAssessmentReviewAnswer,
  generateDeterministicReviewPlan,
} from './assessment-agent.mjs'

function evidenceInput() {
  return {
    labId: 'lab2',
    sessionId: 'assessment-agent-session',
    events: [
      {
        id: 'student-question', type: 'student_message', stage: 'debug', category: 'debug',
        timestamp: '2026-08-12T01:00:00.000Z',
        content: '为什么 Yield 只执行了一轮？我的假设是任务状态没有回到 Ready。',
      },
      {
        id: 'tutor-answer', type: 'ai_response', stage: 'debug', category: 'debug',
        timestamp: '2026-08-12T01:00:01.000Z',
        content: '先检查 mark_current_suspended 后的状态以及下一轮调度选择。',
      },
      {
        id: 'code-open', type: 'code_open', stage: 'debug', path: 'kernel/src/task.rs',
        timestamp: '2026-08-12T01:01:00.000Z',
      },
      {
        id: 'hint-2', type: 'hint_requested', stage: 'debug', hintLevel: 2,
        timestamp: '2026-08-12T01:01:30.000Z',
      },
    ],
    runs: [
      {
        runId: 'run-failed', trusted: true, verified: false,
        assertions: [
          { id: 'yield-five-rounds', passed: false, observed: '1' },
          { id: 'all-exited', passed: true, observed: 'ok' },
        ],
      },
      {
        runId: 'run-passed', trusted: true, verified: true,
        assertions: [
          { id: 'yield-five-rounds', passed: true, observed: '5' },
          { id: 'all-exited', passed: true, observed: 'ok' },
          { id: 'hello-output', passed: true, observed: 'ok' },
          { id: 'power-result', passed: true, observed: 'ok' },
        ],
      },
    ],
    conversation: {
      messages: [
        { role: 'student', content: '为什么 Yield 只执行了一轮？' },
        { role: 'assistant', content: '先对比 Ready 和 Exited。', hintLevel: 2 },
        { role: 'student', content: '我检查 task.rs 后认为 yield 应回到 Ready。' },
      ],
    },
    reportDraft: {
      markdownBody: '我先观察运行输出，再打开 task.rs 并修改状态转换。',
      sections: { process: '失败后修改并重新运行。', reflection: '旧文本不应作为最终复盘。' },
    },
    mastery: [],
  }
}

test('evidence bundle combines Tutor history, workspace behavior, trusted runs and report', () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  assert.equal(bundle.conversation.messageCount, 3)
  assert.ok(bundle.events.some((event) => event.type === 'code_open'))
  assert.equal(bundle.runs.length, 2)
  assert.ok(bundle.validEvidenceRefs.includes('event:tutor-answer'))
  assert.ok(bundle.validEvidenceRefs.includes('run:run-failed'))
  assert.ok(bundle.validEvidenceRefs.includes('report:draft:lab2'))
  assert.doesNotMatch(bundle.report.content, /旧文本不应作为最终复盘/)
})

test('deterministic Assessment plan is evidence-backed and capped below five', () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  const plan = generateDeterministicReviewPlan(bundle)
  assert.ok(plan.questions.length >= 2 && plan.questions.length <= 3)
  assert.equal(plan.maxQuestions, 5)
  assert.equal(plan.generator.mode, 'deterministic')
  assert.ok(plan.questions.every((question) => question.evidenceRefs.length > 0))
  assert.ok(plan.questions.every((question) => question.evidenceRefs.every((ref) => bundle.validEvidenceRefs.includes(ref))))
  assert.equal(plan.questions[0].kind, 'evidence-reflection')
  assert.ok(plan.questions.some((question) => question.kind === 'transfer'))
})

test('Assessment review plans rotate historical questions and reject repeated remote prompts', async () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  const firstPlan = generateDeterministicReviewPlan(bundle)
  const previousPrompts = new Set(firstPlan.questions.map((question) => question.prompt.replace(/\s+/g, ' ').toLowerCase()))
  const rotatedPlan = generateDeterministicReviewPlan(bundle, { previousQuestions: firstPlan.questions })

  assert.ok(rotatedPlan.questions.some((question) =>
    !firstPlan.questions.some((previous) => previous.conceptId === question.conceptId),
  ))
  assert.ok(rotatedPlan.questions.every((question) =>
    !previousPrompts.has(question.prompt.replace(/\s+/g, ' ').toLowerCase()),
  ))
  assert.ok(rotatedPlan.questions.every((question) =>
    question.evidenceRefs.every((ref) => bundle.validEvidenceRefs.includes(ref)),
  ))

  let remoteInput
  const repeatedRemotePlan = {
    maxQuestions: 5,
    rationale: 'Repeat recent prompts to exercise novelty validation.',
    questions: firstPlan.questions.slice(0, 2).map((question, index) => ({
      ...question,
      questionId: `remote-repeat-${index + 1}`,
    })),
  }
  const result = await createAssessmentReviewPlan(bundle, {
    previousQuestions: firstPlan.questions,
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body)
      remoteInput = JSON.parse(request.messages.at(-1).content)
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(repeatedRemotePlan) } }] }),
      }
    },
  })

  assert.deepEqual(remoteInput.reviewHistory, firstPlan.questions)
  assert.equal(result.agent.mode, 'deterministic')
  assert.ok(result.agent.error)
  assert.ok(result.plan.questions.every((question) =>
    !previousPrompts.has(question.prompt.replace(/\s+/g, ' ').toLowerCase()),
  ))
})

test('Assessment Agent accepts valid JSON and rejects fabricated evidence by falling back', async () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  const validRaw = {
    maxQuestions: 5,
    rationale: '综合对话与运行',
    questions: [
      {
        questionId: 'remote-q1', conceptId: 'os.sched.task-state', kind: 'evidence-reflection',
        objective: '复盘状态判断', prompt: '哪条证据改变了你的判断？', reason: '对话中提出过假设',
        passCriteria: ['指出判断和证据'], evidenceRefs: ['event:student-question', 'run:run-failed'],
        requiresRunEvidence: true,
      },
      {
        questionId: 'remote-q2', conceptId: 'os.trap.syscall-abi', kind: 'transfer',
        objective: '迁移 syscall 理解', prompt: '改变调用来源后，入口约定有何变化？', reason: '检查迁移',
        passCriteria: ['指出不变量和变化'], evidenceRefs: ['run:run-passed'], requiresRunEvidence: false,
      },
    ],
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(validRaw) } }] }),
  })
  const valid = await createAssessmentReviewPlan(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' }, fetchImpl,
  })
  assert.equal(valid.agent.mode, 'remote')
  assert.equal(valid.plan.generator.model, 'assessment-model')

  const invalidFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({
        ...validRaw,
        questions: validRaw.questions.map((question) => ({ ...question, evidenceRefs: ['run:fabricated'] })),
      }) } }],
    }),
  })
  const invalid = await createAssessmentReviewPlan(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' }, fetchImpl: invalidFetch,
  })
  assert.equal(invalid.agent.mode, 'deterministic')
  assert.match(invalid.agent.error, /不存在的证据/)
  assert.ok(invalid.plan.questions.every((question) => !question.evidenceRefs.includes('run:fabricated')))
})

test('answer evaluation cannot pass an implementation concept without required trusted run evidence', async () => {
  const input = evidenceInput()
  input.runs = input.runs.filter((run) => !run.verified)
  const bundle = buildReviewEvidenceBundle(input)
  const question = {
    conceptId: 'os.sched.task-state',
    objective: '确认状态转换',
    passCriteria: ['yield 后回到 Ready', 'exit 后进入 Exited'],
    evidenceRefs: ['run:run-failed'],
    requiresRunEvidence: true,
  }
  const result = await evaluateAssessmentReviewAnswer(
    question,
    'yield 后回到 Ready，exit 后进入 Exited，我会查看下一轮调度是否还能选中该任务。',
    bundle,
  )
  assert.equal(result.evaluation.verdict, 'needs-evidence')
})

test('remote Assessment verdict cannot override missing trusted run evidence', async () => {
  const input = evidenceInput()
  input.runs = input.runs.filter((run) => !run.verified)
  const bundle = buildReviewEvidenceBundle(input)
  const question = {
    conceptId: 'os.sched.task-state',
    objective: '确认状态转换',
    passCriteria: ['yield 后回到 Ready'],
    evidenceRefs: ['run:run-failed'],
    requiresRunEvidence: true,
  }
  const result = await evaluateAssessmentReviewAnswer(
    question,
    '这是一条足够长但没有可信运行支持的状态转换解释。',
    bundle,
    {
      llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          verdict: 'passed', rationale: '模型认为通过', evidenceRefs: ['run:run-failed'],
        }) } }] }),
      }),
    },
  )
  assert.equal(result.agent.mode, 'remote')
  assert.equal(result.evaluation.verdict, 'needs-evidence')
})
