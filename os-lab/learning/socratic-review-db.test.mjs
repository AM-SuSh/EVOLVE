import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

import { loadConceptCatalog } from './concept-catalog.mjs'
import { normalizeReviewPlan } from './review-contracts.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'os-lab-review-db-'))
process.env.OS_LAB_DB_PATH = path.join(tempRoot, 'learning.db')
const learningDb = await import(`./db.mjs?review-test=${Date.now()}`)

after(() => {
  learningDb.closeLearningDb()
  rmSync(tempRoot, { recursive: true, force: true })
})

function reviewPlan(sessionId = 'review-session-1') {
  const knownConceptIds = new Set(loadConceptCatalog().labs.lab2.conceptIds)
  return normalizeReviewPlan({
    labId: 'lab2',
    sessionId,
    sourceAssessmentId: 'assessment-1',
    maxQuestions: 5,
    questions: [
      {
        questionId: 'q1',
        conceptId: 'os.sched.task-state',
        kind: 'causal-explanation',
        objective: '区分 yield 与 exit 的状态变化',
        prompt: 'yield 与 exit 对任务状态分别有什么影响？',
        reason: '失败运行曾提前退出',
        passCriteria: ['yield 后回到 Ready', 'exit 后进入 Exited'],
        evidenceRefs: ['run:failed-1', 'event:student-1'],
      },
      {
        questionId: 'q2',
        conceptId: 'os.trap.syscall-abi',
        kind: 'counterexample',
        objective: '解释 sepc 推进的不变量',
        prompt: '如果 syscall 返回前不推进 sepc，会发生什么？',
        reason: '运行通过但对话未解释该机制',
        passCriteria: ['会重复执行同一条 ecall'],
        evidenceRefs: ['run:passed-1'],
      },
      {
        questionId: 'q3',
        conceptId: 'os.sched.task-state',
        kind: 'transfer',
        objective: '迁移任务状态判断',
        prompt: '如果调度策略改变，哪些任务状态不变量仍需保持？',
        reason: '检查迁移理解',
        passCriteria: ['指出至少一个不变量'],
        evidenceRefs: ['run:passed-1'],
      },
    ],
  }, { knownConceptIds })
}

test('socratic review persists an auditable 3-5 question lifecycle without a correctness gate', () => {
  const registration = learningDb.register('review-student', 'secret1', '计科2301')
  const student = learningDb.resolveSession(registration.token)
  const created = learningDb.createSocraticReview(student.id, reviewPlan())
  assert.equal(created.status, 'review_ready')
  assert.equal(created.turns.length, 3)
  assert.equal(created.maxQuestions, 5)
  assert.equal(learningDb.createSocraticReview(student.id, reviewPlan()).reviewId, created.reviewId)

  const asked = learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q1')
  assert.equal(asked.status, 'review_active')
  assert.equal(asked.askedCount, 1)
  assert.throws(() => learningDb.completeSocraticReview(student.id, created.reviewId), /至少完成 3 个/)

  learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q1', {
    answer: 'yield 后回到 Ready，exit 后进入 Exited。',
    answerEventRef: 'event:review-answer-1',
    evaluation: { verdict: 'passed', evidenceRefs: ['event:review-answer-1'] },
  })
  learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q2')
  learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q2', {
    answer: 'sepc 不前进会重复执行同一条 ecall。',
    answerEventRef: 'event:review-answer-2',
    evaluation: { verdict: 'passed', evidenceRefs: ['event:review-answer-2'] },
  })
  learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q3')
  learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q3', {
    answer: '我还不能完整说明调度策略变化后的边界。',
    answerEventRef: 'event:review-answer-3',
    evaluation: { verdict: 'partial', evidenceRefs: ['event:review-answer-3'] },
  })
  const completed = learningDb.completeSocraticReview(student.id, created.reviewId, {
    finalSummary: '我理解了状态机和 syscall 返回点。',
    transcriptMarkdown: '## 收获与复盘\n',
  })
  assert.equal(completed.status, 'review_completed')
  assert.equal(completed.answeredCount, 3)
  assert.ok(completed.completedAt)
  assert.equal(learningDb.getSocraticReview(999999, created.reviewId), null)

  learningDb.saveMasteryObservations(student.id, [{
    sessionId: 'review-session-1',
    labId: 'lab2',
    conceptId: 'os.sched.task-state',
    status: 'proficient',
    confidence: 0.9,
    misconceptions: [],
    evidenceRefs: ['event:review-answer-1'],
    sourceType: 'socratic-review',
    sourceId: created.reviewId,
  }])
  const observations = learningDb.listMasteryObservations(student.id, 'lab2')
  assert.equal(observations.length, 1)
  assert.equal(observations[0].conceptId, 'os.sched.task-state')
})

test('database refuses review turns beyond the five-question cap', () => {
  const registration = learningDb.register('review-cap-student', 'secret1', '计科2301')
  const student = learningDb.resolveSession(registration.token)
  const created = learningDb.createSocraticReview(student.id, reviewPlan('review-session-cap'))
  for (let index = 4; index <= 5; index += 1) {
    learningDb.appendSocraticReviewTurn(student.id, created.reviewId, {
      questionId: `q${index}`,
      conceptId: 'os.sched.task-state',
      kind: 'concept-explanation',
      objective: '补充检查',
      prompt: `补充问题 ${index}`,
      reason: '回答需要进一步确认',
      passCriteria: [],
      evidenceRefs: [],
    })
  }
  assert.throws(() => learningDb.appendSocraticReviewTurn(student.id, created.reviewId, {
    questionId: 'q6', conceptId: 'os.sched.task-state', prompt: '不应保存',
  }), /5 题上限/)
})

test('review ordering and answer immutability are enforced', () => {
  const registration = learningDb.register('review-guard-student', 'secret1', '计科2301')
  const student = learningDb.resolveSession(registration.token)
  const created = learningDb.createSocraticReview(student.id, reviewPlan('review-session-guards'))
  assert.throws(
    () => learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q2'),
    /按顺序/,
  )
  assert.throws(
    () => learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q1', { answer: '未提问' }),
    /尚未提出/,
  )
  learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q1')
  learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q1', {
    answer: '这是一条仍需补充证据的回答。',
    evaluation: { verdict: 'partial', evidenceRefs: [] },
  })
  assert.throws(
    () => learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q1', { answer: '覆盖旧回答' }),
    /已经回答/,
  )
  const followed = learningDb.insertSocraticReviewFollowup(student.id, created.reviewId, 'q1', {
    questionId: 'q1-followup',
    conceptId: 'os.sched.task-state',
    kind: 'causal-explanation',
    objective: '补齐状态变化证据',
    prompt: '请补充状态变化的证据。',
    reason: '原回答不完整',
    passCriteria: ['说明 Ready 与 Exited'],
    evidenceRefs: ['run:failed-1'],
  })
  assert.deepEqual(followed.turns.map((turn) => turn.questionId), ['q1', 'q1-followup', 'q2', 'q3'])
  assert.throws(
    () => learningDb.completeSocraticReview(student.id, created.reviewId, { finalSummary: '总结' }),
    /至少完成|未回答/,
  )
})

test('a review enters the teacher queue only when submitted with a report', () => {
  const username = 'review-only-deferred-student'
  const registration = learningDb.register(username, 'secret1', 'review-only-class')
  const student = learningDb.resolveSession(registration.token)
  const created = learningDb.createSocraticReview(student.id, reviewPlan('review-session-deferred'))
  learningDb.markSocraticReviewTurnAsked(student.id, created.reviewId, 'q1')
  learningDb.answerSocraticReviewTurn(student.id, created.reviewId, 'q1', {
    answer: 'I can explain the mechanism, but the required runtime evidence is not available yet.',
    evaluation: {
      verdict: 'defer',
      rationale: 'A teacher should inspect the unavailable runtime environment.',
      evidenceRefs: [],
    },
  })

  const transcriptMarkdown = [
    '## Socratic review',
    '',
    '**Tutor:** Explain the observed state transition.',
    '',
    '**Student:** Runtime evidence is currently unavailable.',
  ].join('\n')
  const deferred = learningDb.deferSocraticReview(
    student.id,
    created.reviewId,
    'Trusted runtime evidence could not be collected.',
    { transcriptMarkdown },
  )
  const persisted = learningDb.getSocraticReview(student.id, created.reviewId)

  assert.equal(deferred.status, 'deferred')
  assert.equal(persisted.transcriptMarkdown, transcriptMarkdown)
  assert.equal(persisted.plan.deferredReason, 'Trusted runtime evidence could not be collected.')
  assert.ok(persisted.completedAt)

  const hiddenQueueItem = learningDb.listAllReports().find((item) =>
    item.user === username && item.labId === 'lab2',
  )
  assert.equal(hiddenQueueItem, undefined)
  assert.equal(learningDb.getSubmittedSocraticReviewForStudent(username, 'lab2'), null)

  learningDb.submitReport(student.id, 'lab2', '# submitted report', [], '', deferred)
  const queueItem = learningDb.listAllReports().find((item) => item.user === username && item.labId === 'lab2')
  assert.equal(queueItem.hasReport, true)
  assert.equal(queueItem.reviewId, deferred.reviewId)
  assert.equal(queueItem.reviewStatus, 'deferred')
  assert.equal(learningDb.getSubmittedSocraticReviewForStudent(username, 'lab2').reviewId, deferred.reviewId)
})

test('follow-up throttle persists pending checks until explicitly resolved', () => {
  const registration = learningDb.register('followup-student', 'secret1', '计科2301')
  const student = learningDb.resolveSession(registration.token)
  const key = 'topic:12345678'
  const asked = learningDb.recordTutorFollowupTurn(student.id, 'followup-session', 'lab2', key, { checkAsked: true })
  assert.equal(asked.pending, true)
  assert.equal(asked.checkCount, 1)
  const preserved = learningDb.recordTutorFollowupTurn(student.id, 'followup-session', 'lab2', key)
  assert.equal(preserved.pending, true)
  const resolved = learningDb.recordTutorFollowupTurn(student.id, 'followup-session', 'lab2', key, { resolvePending: true })
  assert.equal(resolved.pending, false)
  assert.equal(resolved.resolved, true)
})

test('new reflection events never become legacy completion evidence', () => {
  const registration = learningDb.register('review-lifecycle-student', 'secret1', '计算2301')
  const student = learningDb.resolveSession(registration.token)
  learningDb.insertLearningEvents(student.id, [{
    version: 2,
    id: 'new-reflection-event',
    sessionId: 'review-lifecycle-session',
    labId: 'lab1',
    timestamp: new Date().toISOString(),
    type: 'reflection_submitted',
    stage: 'reflect',
    content: '这是一条新系统中的旧事件类型。',
  }])
  const beforeReview = learningDb.getLearningEvidence(student.id).find((item) => item.labId === 'lab1')
  assert.equal(beforeReview, undefined)

  const completed = learningDb.createSocraticReview(student.id, reviewPlan('review-lifecycle-session'))
  learningDb.markSocraticReviewTurnAsked(student.id, completed.reviewId, 'q1')
  learningDb.answerSocraticReviewTurn(student.id, completed.reviewId, 'q1', {
    answer: 'yield 后回到 Ready，exit 后进入 Exited，并可用运行现象验证。',
    evaluation: { verdict: 'passed', evidenceRefs: [] },
  })
  learningDb.markSocraticReviewTurnAsked(student.id, completed.reviewId, 'q2')
  learningDb.answerSocraticReviewTurn(student.id, completed.reviewId, 'q2', {
    answer: '如果 sepc 不推进，返回后会重复执行同一条 ecall。',
    evaluation: { verdict: 'passed', evidenceRefs: [] },
  })
  learningDb.markSocraticReviewTurnAsked(student.id, completed.reviewId, 'q3')
  learningDb.answerSocraticReviewTurn(student.id, completed.reviewId, 'q3', {
    answer: '调度策略改变后，任务状态仍必须保持可区分且转换合法。',
    evaluation: { verdict: 'misconception', evidenceRefs: [] },
  })
  learningDb.completeSocraticReview(student.id, completed.reviewId, {
    finalSummary: '我能用过程证据解释两个机制。',
    transcriptMarkdown: '## transcript',
  })
  const afterReview = learningDb.getLearningEvidence(student.id).find((item) => item.labId === 'lab2')
  assert.equal(afterReview.reviewCompleted, true)
  assert.equal(afterReview.legacyReflected, false)
  assert.equal(afterReview.reportSubmitted, false)
  learningDb.submitReport(student.id, 'lab2', '# report', [], '', learningDb.getSocraticReview(student.id, completed.reviewId))
  const afterSubmission = learningDb.getLearningEvidence(student.id).find((item) => item.labId === 'lab2')
  assert.equal(afterSubmission.reportSubmitted, true)
})
