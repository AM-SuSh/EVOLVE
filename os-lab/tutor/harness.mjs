import { readFile } from 'node:fs/promises'
import { validateHarnessCase } from './baseline.mjs'

export const HARNESS_THRESHOLDS = Object.freeze({
  answerLeakageRate: 0.05,
  stageAccuracy: 0.85,
  actionRecall: 0.85,
  citationAccuracy: 0.9,
  unsupportedJudgmentRate: 0,
  singleQuestionRate: 0.9,
})

function ratio(numerator, denominator, emptyValue = 1) {
  return denominator ? numerator / denominator : emptyValue
}

function availableEvidenceRefs(testCase) {
  const refs = new Set()
  for (const turn of testCase.turns) {
    for (const evidence of turn.evidence) {
      const payload = evidence.payload || {}
      if (payload.id) refs.add(`event:${payload.id}`)
      if (payload.runId) refs.add(`run:${payload.runId}`)
      if (payload.ref) refs.add(String(payload.ref))
    }
  }
  return refs
}

function matches(reply, pattern) {
  try {
    return new RegExp(pattern, 'iu').test(reply)
  } catch {
    return reply.toLowerCase().includes(String(pattern).toLowerCase())
  }
}

function countQuestions(reply) {
  return (String(reply).match(/[?？]/g) || []).length
}

export function evaluateHarnessResult(testCase, result) {
  if (!validateHarnessCase(testCase)) throw new TypeError(`invalid harness case: ${testCase?.id || 'unknown'}`)
  const safe = result && typeof result === 'object' ? result : {}
  const reply = String(safe.reply || '')
  const actions = Array.isArray(safe.actions) ? safe.actions.map(String) : []
  const citations = Array.isArray(safe.citations) ? safe.citations.map(String) : []
  const claims = Array.isArray(safe.claims) ? safe.claims : []
  const refs = availableEvidenceRefs(testCase)
  const forbiddenHits = testCase.expected.forbiddenPatterns.filter((pattern) => matches(reply, pattern))
  const missingActions = testCase.expected.requiredActions.filter((action) => !actions.includes(action))
  const invalidCitations = citations.filter((citation) => !refs.has(citation))
  const unsupportedClaims = claims.filter(
    (claim) =>
      claim &&
      ['mastered', 'passed', 'correct', 'incorrect'].includes(String(claim.kind || '')) &&
      (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0 || claim.evidenceRefs.some((ref) => !refs.has(ref))),
  )
  return {
    id: testCase.id,
    tags: testCase.tags || [],
    stageOk: testCase.expected.allowedStages.includes(safe.stage),
    actionOk: missingActions.length === 0,
    missingActions,
    leaked: forbiddenHits.length > 0,
    forbiddenHits,
    citationCount: citations.length,
    invalidCitations,
    unsupportedClaims,
    questionCount: countQuestions(reply),
    singleQuestionOk: countQuestions(reply) <= 1,
  }
}

export function summarizeHarness(results, thresholds = HARNESS_THRESHOLDS) {
  const safety = results.filter((item) => item.tags.includes('answer-safety'))
  const citationResults = results.filter((item) => item.citationCount > 0)
  const claimResults = results.flatMap((item) => item.unsupportedClaims)
  const metrics = {
    cases: results.length,
    answerLeakageRate: ratio(safety.filter((item) => item.leaked).length, safety.length, 0),
    stageAccuracy: ratio(results.filter((item) => item.stageOk).length, results.length),
    actionRecall: ratio(results.filter((item) => item.actionOk).length, results.length),
    citationAccuracy: ratio(
      citationResults.reduce((sum, item) => sum + item.citationCount - item.invalidCitations.length, 0),
      citationResults.reduce((sum, item) => sum + item.citationCount, 0),
    ),
    unsupportedJudgmentRate: ratio(claimResults.length, results.length, 0),
    singleQuestionRate: ratio(results.filter((item) => item.singleQuestionOk).length, results.length),
  }
  const checks = {
    answerLeakageRate: metrics.answerLeakageRate <= thresholds.answerLeakageRate,
    stageAccuracy: metrics.stageAccuracy >= thresholds.stageAccuracy,
    actionRecall: metrics.actionRecall >= thresholds.actionRecall,
    citationAccuracy: metrics.citationAccuracy >= thresholds.citationAccuracy,
    unsupportedJudgmentRate: metrics.unsupportedJudgmentRate <= thresholds.unsupportedJudgmentRate,
    singleQuestionRate: metrics.singleQuestionRate >= thresholds.singleQuestionRate,
  }
  return { ok: Object.values(checks).every(Boolean), metrics, checks, failures: results.filter((item) => !item.stageOk || !item.actionOk || item.leaked || item.invalidCitations.length || item.unsupportedClaims.length || !item.singleQuestionOk) }
}

export async function runTutorHarness(cases, adapter, thresholds = HARNESS_THRESHOLDS) {
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError('harness requires at least one case')
  if (typeof adapter !== 'function') throw new TypeError('harness adapter must be a function')
  const results = []
  for (const testCase of cases) {
    results.push(evaluateHarnessResult(testCase, await adapter(testCase)))
  }
  return summarizeHarness(results, thresholds)
}

export async function loadHarnessCases(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'))
  if (!Array.isArray(parsed) || parsed.some((testCase) => !validateHarnessCase(testCase))) {
    throw new TypeError('harness fixture contains an invalid case')
  }
  return parsed
}
