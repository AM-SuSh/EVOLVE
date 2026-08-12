import { readFile } from 'node:fs/promises'

import { buildReviewEvidenceBundle } from './assessment-agent.mjs'

export const ASSESSMENT_HARNESS_THRESHOLDS = Object.freeze({
  planValidityRate: 1,
  planNoveltyRate: 1,
  narrativeNeutralityRate: 1,
  verdictAccuracy: 1,
  invalidCitationRate: 0,
  unsupportedPassRate: 0,
  actionableFeedbackRate: 1,
})

function ratio(numerator, denominator, emptyValue = 1) {
  return denominator ? numerator / denominator : emptyValue
}

function matches(value, pattern) {
  try {
    return new RegExp(pattern, 'iu').test(value)
  } catch {
    return String(value).toLowerCase().includes(String(pattern).toLowerCase())
  }
}

function normalizePrompt(prompt) {
  return String(prompt || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function validateAssessmentHarnessCase(testCase) {
  if (!testCase || typeof testCase !== 'object') return false
  if (!testCase.id || !testCase.bundle) return false
  if (!['plan', 'answer'].includes(testCase.type)) return false
  if (testCase.type === 'answer') {
    if (!testCase.question || typeof testCase.question !== 'object') return false
    if (typeof testCase.answer !== 'string') return false
    if (!Array.isArray(testCase.expected?.verdicts) || testCase.expected.verdicts.length === 0) return false
  }
  return true
}

export function evaluatePlanCase(testCase, bundle, outcome) {
  const plan = outcome?.plan || {}
  const questions = Array.isArray(plan.questions) ? plan.questions : []
  const validRefs = new Set(bundle.validEvidenceRefs)
  const knownConcepts = new Set(bundle.catalog.concepts.map((concept) => concept.conceptId))
  const requiredKinds = testCase.expected?.requiredKinds || []
  const shapeOk = questions.length >= 2 && questions.length <= 5
    && requiredKinds.every((kind) => questions.some((question) => question.kind === kind))
  const invalidRefs = questions.flatMap((question) =>
    (question.evidenceRefs || []).filter((ref) => !validRefs.has(ref)))
  const unknownConcepts = [...new Set(
    questions.filter((question) => !knownConcepts.has(question.conceptId)).map((question) => question.conceptId),
  )]
  const ungroundedQuestions = questions
    .filter((question) => !(question.evidenceRefs || []).length)
    .map((question) => question.questionId)
  // 叙事中立：学生可见文本不得要求固定叙事格式（如先复述最初的错误判断）。
  const forbiddenPatterns = testCase.expected?.forbiddenPatterns || []
  const narrativeHits = questions.flatMap((question) => {
    const studentFacing = [question.prompt, question.objective, ...(question.passCriteria || [])].join('\n')
    return forbiddenPatterns
      .filter((pattern) => matches(studentFacing, pattern))
      .map((pattern) => ({ questionId: question.questionId, pattern }))
  })
  const previousPrompts = new Set(
    (outcome?.previousQuestions || []).map((question) => normalizePrompt(question.prompt)).filter(Boolean),
  )
  const repeatedPrompts = questions
    .filter((question) => previousPrompts.has(normalizePrompt(question.prompt)))
    .map((question) => question.questionId)
  return {
    id: testCase.id,
    type: 'plan',
    tags: testCase.tags || [],
    planValid: shapeOk && !invalidRefs.length && !unknownConcepts.length && !ungroundedQuestions.length,
    shapeOk,
    invalidRefs,
    unknownConcepts,
    ungroundedQuestions,
    novel: !repeatedPrompts.length,
    repeatedPrompts,
    narrativeNeutral: !narrativeHits.length,
    narrativeHits,
    questionCount: questions.length,
    agentMode: String(outcome?.agent?.mode || ''),
  }
}

export function evaluateAnswerCase(testCase, bundle, outcome) {
  const evaluation = outcome?.evaluation || {}
  const validRefs = new Set(bundle.validEvidenceRefs)
  const verdict = String(evaluation.verdict || '')
  const verdictOk = testCase.expected.verdicts.includes(verdict)
  const citations = Array.isArray(evaluation.evidenceRefs) ? evaluation.evidenceRefs : []
  const invalidCitations = citations.filter((ref) => !validRefs.has(ref))
  const citedVerifiedRun = citations.some((ref) =>
    ref.startsWith('run:') && bundle.runs.some((run) => run.ref === ref && run.trusted && run.verified))
  const unsupportedPass = verdict === 'passed'
    && testCase.question.requiresRunEvidence === true
    && !citedVerifiedRun
  const missingPoints = Array.isArray(evaluation.missingPoints) ? evaluation.missingPoints : []
  const missingEvidence = Array.isArray(evaluation.missingEvidence) ? evaluation.missingEvidence : []
  // 反馈可操作：未通过时必须指出缺什么并给参考解释，不能只下结论。
  const actionableFeedback = verdict === 'passed'
    || ((missingPoints.length > 0 || missingEvidence.length > 0)
      && Boolean(String(evaluation.correctiveExplanation || '').trim()))
  return {
    id: testCase.id,
    type: 'answer',
    tags: testCase.tags || [],
    verdict,
    expectedVerdicts: testCase.expected.verdicts,
    verdictOk,
    citationCount: citations.length,
    invalidCitations,
    unsupportedPass,
    actionableFeedback,
    agentMode: String(outcome?.agent?.mode || ''),
  }
}

export function summarizeAssessmentHarness(results, thresholds = ASSESSMENT_HARNESS_THRESHOLDS) {
  const planResults = results.filter((item) => item.type === 'plan')
  const answerResults = results.filter((item) => item.type === 'answer')
  const citationTotal = answerResults.reduce((sum, item) => sum + item.citationCount, 0)
  const invalidCitationTotal = answerResults.reduce((sum, item) => sum + item.invalidCitations.length, 0)
  const metrics = {
    cases: results.length,
    planValidityRate: ratio(planResults.filter((item) => item.planValid).length, planResults.length),
    planNoveltyRate: ratio(planResults.filter((item) => item.novel).length, planResults.length),
    narrativeNeutralityRate: ratio(planResults.filter((item) => item.narrativeNeutral).length, planResults.length),
    verdictAccuracy: ratio(answerResults.filter((item) => item.verdictOk).length, answerResults.length),
    invalidCitationRate: ratio(invalidCitationTotal, citationTotal, 0),
    unsupportedPassRate: ratio(answerResults.filter((item) => item.unsupportedPass).length, answerResults.length, 0),
    actionableFeedbackRate: ratio(answerResults.filter((item) => item.actionableFeedback).length, answerResults.length),
  }
  const checks = {
    planValidityRate: metrics.planValidityRate >= thresholds.planValidityRate,
    planNoveltyRate: metrics.planNoveltyRate >= thresholds.planNoveltyRate,
    narrativeNeutralityRate: metrics.narrativeNeutralityRate >= thresholds.narrativeNeutralityRate,
    verdictAccuracy: metrics.verdictAccuracy >= thresholds.verdictAccuracy,
    invalidCitationRate: metrics.invalidCitationRate <= thresholds.invalidCitationRate,
    unsupportedPassRate: metrics.unsupportedPassRate <= thresholds.unsupportedPassRate,
    actionableFeedbackRate: metrics.actionableFeedbackRate >= thresholds.actionableFeedbackRate,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    metrics,
    checks,
    failures: results.filter((item) => item.type === 'plan'
      ? !item.planValid || !item.novel || !item.narrativeNeutral
      : !item.verdictOk || item.invalidCitations.length > 0 || item.unsupportedPass || !item.actionableFeedback),
  }
}

export async function runAssessmentHarness(cases, adapter, thresholds = ASSESSMENT_HARNESS_THRESHOLDS) {
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError('assessment harness requires at least one case')
  if (typeof adapter !== 'function') throw new TypeError('assessment harness adapter must be a function')
  const results = []
  for (const testCase of cases) {
    const bundle = buildReviewEvidenceBundle(testCase.bundleInput)
    if (testCase.type === 'plan') {
      let previousQuestions = Array.isArray(testCase.previousQuestions) ? testCase.previousQuestions : []
      if (testCase.rotatePrevious === true) {
        const first = await adapter({ ...testCase, previousQuestions: [] }, bundle)
        previousQuestions = first?.plan?.questions || []
      }
      const outcome = await adapter({ ...testCase, previousQuestions }, bundle)
      results.push(evaluatePlanCase(testCase, bundle, { ...outcome, previousQuestions }))
    } else {
      results.push(evaluateAnswerCase(testCase, bundle, await adapter(testCase, bundle)))
    }
  }
  return summarizeAssessmentHarness(results, thresholds)
}

export async function loadAssessmentHarnessCases(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'))
  const bundles = parsed?.bundles && typeof parsed.bundles === 'object' ? parsed.bundles : {}
  const cases = Array.isArray(parsed?.cases) ? parsed.cases : []
  const resolved = cases.map((testCase) => ({ ...testCase, bundleInput: bundles[testCase.bundle] }))
  if (resolved.some((testCase) => !validateAssessmentHarnessCase(testCase) || !testCase.bundleInput)) {
    throw new TypeError('assessment harness fixture contains an invalid case')
  }
  return resolved
}
