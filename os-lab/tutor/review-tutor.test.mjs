import assert from 'node:assert/strict'
import test from 'node:test'

import {
  materializeTutorReviewPlan,
  materializeTutorReviewQuestion,
} from './review-tutor.mjs'

function reviewPlan() {
  return {
    version: 'socratic-review-plan-v1',
    labId: 'lab2',
    sessionId: 'review-session',
    maxQuestions: 3,
    questions: [1, 2, 3].map((index) => ({
      questionId: `q${index}`,
      conceptId: `concept-${index}`,
      kind: index === 3 ? 'transfer' : 'causal-explanation',
      objective: `考查机制 ${index}`,
      prompt: `Assessment seed question ${index}?`,
      reason: '根据行为证据定位薄弱点',
      passCriteria: [`内部通过要点 ${index}`],
      evidenceRefs: [`run:trusted-${index}`],
      requiresRunEvidence: index === 1,
    })),
  }
}

function jsonResponse(value) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  }
}

test('Tutor materializes Assessment briefs without changing their scoring contract', async () => {
  const plan = reviewPlan()
  let requestInput
  const result = await materializeTutorReviewPlan(plan, {
    frameworkPrompt: 'Tutor system and Lab2 reflection context',
    recentConversation: [{ role: 'student', content: '我先检查了任务状态。' }],
    allowedKnowledgeRefs: ['kb:lab2:scheduler'],
  }, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body)
      requestInput = JSON.parse(request.messages.at(-1).content)
      return jsonResponse({
        questions: requestInput.briefs.map((brief, index) => ({
          questionId: brief.questionId,
          prompt: `Tutor question ${index + 1}: 请结合当前实验解释对应机制？`,
        })),
      })
    },
  })

  assert.equal(requestInput.task, 'tutor-review-questions')
  assert.equal(requestInput.recentTutorConversation.length, 1)
  assert.equal(result.agent.role, 'tutor')
  assert.equal(result.agent.mode, 'remote')
  assert.deepEqual(
    result.plan.questions.map(({ prompt, ...question }) => question),
    plan.questions.map(({ prompt, ...question }) => question),
  )
  assert.match(result.plan.questions[0].prompt, /^Tutor question 1/)
  assert.deepEqual(result.plan.questions[0].passCriteria, plan.questions[0].passCriteria)
})

test('Tutor plan falls back to Assessment seeds on changed ids or fabricated evidence', async () => {
  const plan = reviewPlan()
  const changedIds = await materializeTutorReviewPlan(plan, {}, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async () => jsonResponse({
      questions: plan.questions.map((question, index) => ({
        questionId: `changed-${index}`,
        prompt: `Changed question ${index}?`,
      })),
    }),
  })
  assert.equal(changedIds.agent.mode, 'deterministic')
  assert.match(changedIds.agent.error, /questionId/)
  assert.deepEqual(changedIds.plan.questions.map((question) => question.prompt),
    plan.questions.map((question) => question.prompt))

  const fabricated = await materializeTutorReviewPlan(plan, {}, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async () => jsonResponse({
      questions: plan.questions.map((question, index) => ({
        questionId: question.questionId,
        prompt: `请根据 run:fabricated-${index} 解释这条机制为什么成立？`,
      })),
    }),
  })
  assert.equal(fabricated.agent.mode, 'deterministic')
  assert.match(fabricated.agent.error, /invalid-evidence-reference/)
})

test('Tutor follow-up uses the student answer and independent Assessment feedback', async () => {
  const brief = reviewPlan().questions[0]
  let requestInput
  const result = await materializeTutorReviewQuestion(brief, {
    labId: 'lab2',
    frameworkPrompt: 'Tutor reflection context',
    studentAnswer: '我只说明了运行结果。',
    assessmentFeedback: {
      verdict: 'partial',
      missingPoints: ['补充状态变化的原因'],
      correctReasoning: '内部参考答案不应传给 Tutor',
    },
    previousQuestions: [{ prompt: '之前已经问过的问题？' }],
  }, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async (_url, init) => {
      requestInput = JSON.parse(JSON.parse(init.body).messages.at(-1).content)
      return jsonResponse({
        questionId: brief.questionId,
        prompt: '你已经指出运行结果；触发条件如何导致对应的任务状态变化？',
      })
    },
  })

  assert.equal(requestInput.task, 'tutor-review-question')
  assert.equal(requestInput.studentAnswer, '我只说明了运行结果。')
  assert.equal(requestInput.assessmentFeedback.verdict, 'partial')
  assert.equal(requestInput.assessmentFeedback.correctReasoning, undefined)
  assert.equal(result.agent.mode, 'remote')
  assert.equal(result.question.objective, brief.objective)
  assert.notEqual(result.question.prompt, brief.prompt)
})

test('Tutor rejects repeated questions and hidden scoring-language leaks', async () => {
  const brief = reviewPlan().questions[0]
  const repeated = await materializeTutorReviewQuestion(brief, {
    previousQuestions: [{ prompt: '这条问题已经问过了？' }],
  }, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async () => jsonResponse({ questionId: brief.questionId, prompt: '这条问题已经问过了？' }),
  })
  assert.equal(repeated.agent.mode, 'deterministic')
  assert.match(repeated.agent.error, /重复/)

  const leaked = await materializeTutorReviewQuestion(brief, {}, {
    llm: { upstream: 'http://tutor.test/v1', model: 'tutor-model' },
    fetchImpl: async () => jsonResponse({
      questionId: brief.questionId,
      prompt: '本题评分标准是先说明触发条件，再说明状态变化，你能回答吗？',
    }),
  })
  assert.equal(leaked.agent.mode, 'deterministic')
  assert.match(leaked.agent.error, /内部评价标准/)
})
