import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReviewEvidenceBundle,
  createAssessmentReviewPlan,
  evaluateAssessmentReviewAnswer,
  generateDeterministicReviewPlan,
  scoreAssessmentBehavior,
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
  assert.equal(plan.questions.length, 3)
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
    questions: firstPlan.questions.slice(0, 3).map((question, index) => ({
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
      {
        questionId: 'remote-q3', conceptId: 'os.sched.task-state', kind: 'counterexample',
        objective: '检查状态判断边界', prompt: '如果任务没有回到 Ready，哪条现象会最先变化？', reason: '检查边界条件',
        passCriteria: ['指出可观察变化'], evidenceRefs: ['event:student-question'], requiresRunEvidence: false,
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

test('Assessment scoring Agent returns an evidence-backed behavior score', async () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  let remoteInput
  const result = await scoreAssessmentBehavior(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body)
      remoteInput = JSON.parse(request.messages.at(-1).content)
      assert.equal(request.max_tokens, 1_600)
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          score: 82,
          rationale: '学生提出假设，并在提示后完成了失败到通过的验证。',
          strengths: ['能把调度假设与运行现象对应'],
          improvements: ['在反思中进一步区分 AI 提醒与自己的判断'],
          evidenceRefs: ['event:student-question', 'run:run-passed'],
          criteria: [
            { id: 'B1', status: 'met', rationale: '提出了状态假设', evidenceRefs: ['event:student-question'] },
            { id: 'B4', status: 'met', rationale: '存在可信复验', evidenceRefs: ['run:run-passed'] },
          ],
        }) } }] }),
      }
    },
  })
  assert.equal(result.agent.mode, 'remote')
  assert.equal(result.assessment.status, 'scored')
  assert.equal(result.assessment.score, 82)
  assert.equal(result.assessment.criteria.length, 6)
  assert.equal(remoteInput.conversation.sampledCount, 3)
  assert.equal(remoteInput.ruleAssessment, null)
  assert.deepEqual(remoteInput.validEvidenceRefs, bundle.validEvidenceRefs)
})

test('Assessment scoring Agent reports a distinct timeout fallback', async () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  const result = await scoreAssessmentBehavior(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
    fetchImpl: async () => {
      const error = new Error('This operation was aborted')
      error.name = 'AbortError'
      throw error
    },
  })
  assert.equal(result.agent.mode, 'unavailable')
  assert.equal(result.assessment.status, 'timeout')
  assert.match(result.assessment.rationale, /响应超时/)
  assert.match(result.assessment.error, /120 seconds/)
})

test('Assessment scoring Agent samples the full behavior timeline without dropping its endpoints', async () => {
  const input = evidenceInput()
  input.events = Array.from({ length: 120 }, (_, index) => ({
    id: `timeline-${index}`,
    type: index % 2 === 0 ? 'student_message' : 'ai_response',
    timestamp: new Date(Date.UTC(2026, 7, 12, 1, index)).toISOString(),
    content: `timeline event ${index}`,
  }))
  input.runs = Array.from({ length: 25 }, (_, index) => ({
    runId: `run-${index}`,
    trusted: true,
    verified: index === 24,
    assertions: [{ id: `assertion-${index}`, passed: index === 24 }],
  }))
  input.conversation.messages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? 'student' : 'assistant',
    content: `message ${index}`,
  }))
  input.reportDraft.markdownBody = '报告证据'.repeat(1_200)
  const bundle = buildReviewEvidenceBundle(input)
  let remoteInput
  const result = await scoreAssessmentBehavior(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
    fetchImpl: async (_url, init) => {
      remoteInput = JSON.parse(JSON.parse(init.body).messages.at(-1).content)
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          score: 70,
          rationale: '覆盖完整时间线。',
          evidenceRefs: ['event:timeline-0', 'event:timeline-119'],
          criteria: [],
        }) } }] }),
      }
    },
  })
  assert.equal(result.assessment.status, 'scored')
  assert.equal(remoteInput.events.length, 80)
  assert.equal(remoteInput.events[0].ref, 'event:timeline-0')
  assert.equal(remoteInput.events.at(-1).ref, 'event:timeline-119')
  assert.equal(remoteInput.runs.length, 20)
  assert.equal(remoteInput.conversation.messages.length, 48)
  assert.equal(remoteInput.report.content.length, 3_000)
})

test('Assessment scoring Agent cannot cite fabricated behavior evidence', async () => {
  const bundle = buildReviewEvidenceBundle(evidenceInput())
  const result = await scoreAssessmentBehavior(bundle, {
    llm: { upstream: 'http://assessment.test/v1', model: 'assessment-model' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        score: 100,
        rationale: 'fabricated',
        evidenceRefs: ['run:not-real'],
        criteria: [],
      }) } }] }),
    }),
  })
  assert.equal(result.agent.mode, 'unavailable')
  assert.equal(result.assessment.status, 'unavailable')
  assert.equal(result.assessment.score, null)
  assert.match(result.agent.error, /不存在的证据/)
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
