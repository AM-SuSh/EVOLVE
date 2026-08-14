import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { assessLearningV2 } from './rubric-v2.mjs'
import { deriveMasteryUpdates } from './mastery.mjs'
import { evaluateReviewGates } from './review-gates.mjs'
import { validateInteractionEvent } from '../tutor/contracts.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'os-lab-db-'))
process.env.OS_LAB_DB_PATH = path.join(tempRoot, 'learning.db')
const learningDb = await import(`./db.mjs?test=${Date.now()}`)

after(() => {
  learningDb.closeLearningDb()
  rmSync(tempRoot, { recursive: true, force: true })
})

test('student registration requires a class', () => {
  const result = learningDb.register('no-class-test', 'secret1', '')
  assert.equal(result.ok, false)
  assert.match(result.error, /班级/)
})

test('student registration rejects classes outside the teacher class list', () => {
  const result = learningDb.register('bad-class-test', 'secret1', '不存在班级', ['计科2301'])
  assert.equal(result.ok, false)
  assert.match(result.error, /班级/)
})

test('migration binds events and immutable runs to the authenticated user', () => {
  const registration = learningDb.register('member-c-test', 'secret1', '计科2301')
  const session = learningDb.resolveSession(registration.token)
  assert.ok(session?.id)

  const runId = '11111111-1111-4111-8111-111111111111'
  learningDb.createRun({
    id: runId,
    userId: session.id,
    learningSessionId: 'learning-1',
    labId: 'lab2',
    recipeId: 'lab2.verify-trace.v1',
    workspaceVersion: 'workspace-1',
    trusted: true,
    steps: [{ cmd: 'cargo', args: ['run'] }],
    startedAt: '2026-07-28T00:00:00.000Z',
  })
  const event = {
    version: 2,
    id: 'event-1',
    sessionId: 'learning-1',
    labId: 'lab2',
    timestamp: '2026-07-28T00:00:00.000Z',
    type: 'run_started',
    stage: 'run',
    runId,
    recipeId: 'lab2.verify-trace.v1',
    workspaceVersion: 'workspace-1',
  }
  assert.equal(learningDb.insertLearningEvents(session.id, [event]).accepted, 1)
  assert.equal(learningDb.insertLearningEvents(session.id, [event]).accepted, 0)

  learningDb.finishRun(session.id, {
    runId,
    finishedAt: '2026-07-28T00:00:01.000Z',
    exitCode: 0,
    durationMs: 1000,
    verified: true,
    assertions: [{ id: 'a1', label: 'trace', passed: true, expected: '1', observed: '1', hint: '先检查 trace 输出' }],
    output: { hash: 'a'.repeat(64), bytes: 10, path: 'runs/run.output.log' },
    trace: { version: 1, count: 2, hash: 'b'.repeat(64), path: 'runs/run.trace.jsonl' },
  }, [{
    level: 'error',
    code: 'E0425',
    message: 'cannot find value',
    file: 'kernel/src/main.rs',
    line: 12,
    column: 5,
    endLine: 12,
    endColumn: 12,
    rendered: 'error[E0425]: cannot find value',
  }])
  const stored = learningDb.getRun(session.id, runId)
  assert.equal(stored.verified, true)
  assert.equal(stored.trace.count, 2)
  assert.equal(stored.assertions[0].hint, '先检查 trace 输出')
  const history = learningDb.listRunHistory(session.id, 'lab2', 10)
  assert.equal(history.length, 1)
  assert.equal(history[0].runId, runId)
  assert.equal(history[0].verified, true)
  assert.equal(history[0].assertions[0].passed, true)
  assert.equal(history[0].assertions[0].hint, '先检查 trace 输出')
  assert.equal(learningDb.listRunHistory(999999, 'lab2').length, 0)
  const diagnosticResult = learningDb.getRunDiagnostics(session.id, runId)
  assert.equal(diagnosticResult.diagnostics.length, 1)
  assert.equal(diagnosticResult.diagnostics[0].code, 'E0425')
  assert.equal(learningDb.getRunDiagnostics(999999, runId), null)
  const score = learningDb.submitFinalPerformance(session.id, {
    metric: 'syscall-latency-ns',
    value: 120,
    direction: 'lower',
    unit: 'ns',
    evidenceRunId: runId,
    note: 'baseline',
  })
  assert.equal(score.ok, true)
  const worse = learningDb.submitFinalPerformance(session.id, {
    metric: 'syscall-latency-ns',
    value: 200,
    direction: 'lower',
    unit: 'ns',
    evidenceRunId: runId,
    note: 'worse',
  })
  assert.equal(worse.kept, true)
  const better = learningDb.submitFinalPerformance(session.id, {
    metric: 'syscall-latency-ns',
    value: 80,
    direction: 'lower',
    unit: 'ns',
    evidenceRunId: runId,
    note: 'optimized',
  })
  assert.equal(better.kept, false)
  const leaderboard = learningDb.listFinalPerformance('syscall-latency-ns')
  assert.equal(leaderboard.length, 1)
  assert.equal(leaderboard[0].value, 80)
  assert.equal(leaderboard[0].rank, 1)
  assert.equal(learningDb.listMyFinalPerformance(session.id).length, 1)
  const batch = learningDb.submitFinalPerformanceBatch(session.id, {
    evidenceRunId: runId,
    scores: [
      { metric: 'pipe-mbps', value: 12, direction: 'higher', unit: 'MB/s' },
      { metric: 'alloc-ops-ms', value: 30, direction: 'higher', unit: 'ops/ms' },
    ],
  })
  assert.equal(batch.ok, true)
  assert.equal(batch.results.length, 2)
  assert.equal(learningDb.listMyFinalPerformance(session.id).length, 3)
  assert.throws(() => learningDb.finishRun(999999, { ...stored, stopped: false }), /不属于当前用户/)

  assert.deepEqual(learningDb.getTutorSessionState(session.id, 'learning-1', 'lab2').stage, 'orient')
  learningDb.saveTutorSessionState(session.id, 'learning-1', 'lab2', {
    stage: 'transfer',
    hintLevel: 4,
    version: 'c3-v1',
  })
  const tutorState = learningDb.getTutorSessionState(session.id, 'learning-1', 'lab2')
  assert.equal(tutorState.stage, 'transfer')
  assert.equal(tutorState.hintLevel, 4)
  assert.equal(tutorState.topicKey, '')
  learningDb.saveTutorSessionState(session.id, 'learning-1', 'lab2', {
    stage: 'transfer',
    hintLevel: 3,
    version: 'turn-policy-v2',
    topicKey: 'topic:sepc',
    topicIntent: 'debug',
    topicAnchor: 'sepc|E0425:kernel/src/main.rs',
  })
  learningDb.saveTutorSessionState(session.id, 'learning-1', 'lab2', {
    stage: 'transfer',
    hintLevel: 1,
    version: 'turn-policy-v2',
    topicKey: 'topic:page-table',
    topicIntent: 'concept',
    topicAnchor: '页表',
  })
  assert.equal(learningDb.getTutorTopicHintState(session.id, 'learning-1', 'lab2', 'topic:sepc').hintLevel, 3)
  assert.equal(learningDb.getTutorTopicHintState(session.id, 'learning-1', 'lab2', 'topic:page-table').hintLevel, 1)
  assert.equal(learningDb.getTutorTopicHintState(session.id, 'learning-1', 'lab2', 'topic:new').hintLevel, 0)
  const currentTopic = learningDb.getTutorSessionState(session.id, 'learning-1', 'lab2')
  assert.equal(currentTopic.topicKey, 'topic:page-table')
  assert.equal(currentTopic.hintLevel, 1)
  const evidence = learningDb.getTutorEvidenceSummary(session.id, 'learning-1', 'lab2')
  assert.equal(evidence.latestRun.runId, runId)
  assert.equal(evidence.latestRun.verified, true)
  assert.equal(evidence.diagnosticCount, 1)

  const assessmentInput = learningDb.getAssessmentInput(session.id, 'learning-1', 'lab2')
  const assessment = assessLearningV2({ labId: 'lab2', sessionId: 'learning-1', ...assessmentInput })
  const saved = learningDb.saveAssessment(session.id, assessment, deriveMasteryUpdates(assessment))
  assert.match(saved.assessmentId, /^[0-9a-f-]{36}$/)
  const gateResult = evaluateReviewGates(assessment, { appeal: true, appealRefs: [`run:${runId}`] })
  const queued = learningDb.enqueueAssessmentReview(session.id, saved.assessmentId, assessment, gateResult)
  assert.equal(queued.priority, 'hard')
  const reviews = learningDb.listAssessmentReviews('pending')
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].assessmentId, saved.assessmentId)
  assert.equal(reviews[0].automaticResult.total, assessment.total)

  const teacher = learningDb.resolveSession(learningDb.login('admin', 'admin123').token)
  const rejected = learningDb.submitAssessmentReview(teacher.id, {
    reviewId: queued.reviewId,
    decision: 'confirmed',
    rationale: '引用不属于原始评价的证据',
    evidenceRefs: ['run:not-owned'],
  })
  assert.equal(rejected.ok, false)
  const corrected = learningDb.submitAssessmentReview(teacher.id, {
    reviewId: queued.reviewId,
    decision: 'corrected',
    rationale: '复核可信运行后修正过程维度',
    evidenceRefs: [`run:${runId}`],
    correctedResult: { total: 88, dimensions: { process: 82, reflection: 70 } },
  })
  assert.equal(corrected.ok, true)
  assert.equal(corrected.revision, 1)
  const confirmed = learningDb.submitAssessmentReview(teacher.id, {
    reviewId: queued.reviewId,
    decision: 'confirmed',
    rationale: '第二位次复核确认修正记录与原证据一致',
    evidenceRefs: [`run:${runId}`],
  })
  assert.equal(confirmed.revision, 2)
  const audited = learningDb.listAssessmentReviews()[0]
  assert.equal(audited.automaticResult.total, assessment.total)
  assert.deepEqual(audited.decisions.map((decision) => decision.revision), [1, 2])
  assert.equal(audited.decisions[0].correctedResult.total, 88)
  assert.equal(learningDb.getAssessmentInput(session.id, 'learning-1', 'lab2').events.some((event) => event.type === 'teacher_reviewed'), true)

  const latestAssessment = {
    ...assessment,
    sessionId: 'learning-acceptance',
    total: Math.max(0, assessment.total - 1),
  }
  const latestSaved = learningDb.saveAssessment(session.id, latestAssessment)
  const beforeReport = learningDb.getReportAssessment('member-c-test', 'lab2')
  assert.equal(beforeReport.hasReport, false)
  assert.equal(beforeReport.assessment, null)
  assert.equal(beforeReport.assessmentReview, null)
  assert.equal(beforeReport.acceptance, null)
  const noReportAcceptance = learningDb.submitReportAcceptance(teacher.id, {
    user: 'member-c-test',
    labId: 'lab2',
    assessmentId: latestSaved.assessmentId,
    finalScore: { total: 91, dimensions: { process: 90, reflection: 75 } },
    feedback: '报告反馈',
    acceptanceAdvice: '继续保留证据链。',
  })
  assert.equal(noReportAcceptance.ok, false)
  assert.match(noReportAcceptance.error, /尚未提交/)

  learningDb.submitReport(session.id, 'lab2', '# Lab2 report')
  const firstAcceptance = learningDb.submitReportAcceptance(teacher.id, {
    user: 'member-c-test',
    labId: 'lab2',
    assessmentId: latestSaved.assessmentId,
    finalScore: { total: 91, dimensions: { process: 90, reflection: 75 } },
    feedback: '报告结构完整，证据引用有效。',
    acceptanceAdvice: '后续说明调度边界条件。',
  })
  assert.equal(firstAcceptance.ok, true)
  assert.equal(firstAcceptance.revision, 1)
  const secondAcceptance = learningDb.submitReportAcceptance(teacher.id, {
    user: 'member-c-test',
    labId: 'lab2',
    assessmentId: latestSaved.assessmentId,
    finalScore: { total: 93, dimensions: { process: 92, reflection: 80 } },
    feedback: '补充说明后通过最终验收。',
    acceptanceAdvice: '将因果链迁移到下一实验。',
  })
  assert.equal(secondAcceptance.revision, 2)
  const acceptanceBundle = learningDb.getReportAssessment('member-c-test', 'lab2')
  assert.equal(acceptanceBundle.assessment.assessmentId, latestSaved.assessmentId)
  assert.equal(acceptanceBundle.assessment.automaticResult.total, latestAssessment.total)
  assert.equal(acceptanceBundle.acceptance.finalScore.total, 93)
  assert.equal(acceptanceBundle.acceptanceHistory.length, 2)
  assert.deepEqual(acceptanceBundle.acceptanceHistory.map((item) => item.revision), [2, 1])
  assert.equal(acceptanceBundle.reportFeedback, '补充说明后通过最终验收。')
  assert.equal(learningDb.listAssessmentReviews().length, 1)
  assert.equal(learningDb.listAssessmentReviews()[0].automaticResult.total, assessment.total)
  const acceptanceEvent = learningDb.getAssessmentInput(session.id, 'learning-acceptance', 'lab2').events
    .find((event) => event.metadata?.acceptanceId === secondAcceptance.acceptanceId)
  assert.equal(acceptanceEvent.type, 'teacher_reviewed')
  assert.equal(acceptanceEvent.metadata.finalScore.total, 93)
  assert.equal(validateInteractionEvent(acceptanceEvent), true)

  const mastery = learningDb.listMastery(session.id)
  assert.equal(mastery.length, 4)
  assert.equal(mastery.every((item) => item.assessmentId === saved.assessmentId), true)
})

test('listLearningEvents returns only the authenticated user events', () => {
  const registration = learningDb.register('events-reader-test', 'secret1', 'class1')
  const session = learningDb.resolveSession(registration.token)
  const base = {
    version: 2,
    sessionId: 'learning-events',
    labId: 'lab2',
    timestamp: '2026-07-28T00:00:00.000Z',
    type: 'student_message',
    stage: 'read',
    category: 'concept',
    content: 'what is a trap?',
  }
  learningDb.insertLearningEvents(session.id, [
    { ...base, id: 'events-read-1' },
    { ...base, id: 'events-read-2', labId: 'lab3' },
  ])
  const all = learningDb.listLearningEvents(session.id)
  assert.ok(all.some((event) => event.id === 'events-read-1'))
  assert.ok(all.some((event) => event.id === 'events-read-2'))
  const lab2 = learningDb.listLearningEvents(session.id, 'lab2')
  assert.deepEqual(lab2.map((event) => event.id), ['events-read-1'])
  assert.deepEqual(learningDb.listLearningEvents(999999), [])
})

test('teacher can manage student class and password, and delete unused accounts', () => {
  const registration = learningDb.register('manage-acct-test', 'secret1', '计科2301')
  assert.equal(registration.ok, true)
  const moved = learningDb.setStudentClassName('manage-acct-test', '计科2302')
  assert.equal(moved.ok, true)
  assert.equal(moved.className, '计科2302')
  assert.equal(learningDb.countStudentsInClass('计科2302'), 1)
  const renamed = learningDb.renameUserClassName('计科2302', '计科2303')
  assert.equal(renamed.ok, true)
  assert.equal(renamed.updated, 1)
  const reset = learningDb.resetStudentPassword('manage-acct-test', 'secret99')
  assert.equal(reset.ok, true)
  const login = learningDb.login('manage-acct-test', 'secret99')
  assert.equal(login.ok, true)
  const blocked = learningDb.deleteStudentAccount('member-c-test')
  assert.equal(blocked.ok, false)
  const fresh = learningDb.register('manage-acct-fresh', 'secret1', '计科2301')
  assert.equal(fresh.ok, true)
  const removed = learningDb.deleteStudentAccount('manage-acct-fresh')
  assert.equal(removed.ok, true)
  assert.equal(learningDb.listUsers().some((user) => user.username === 'manage-acct-fresh'), false)
})
