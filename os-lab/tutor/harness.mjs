import { readFile } from 'node:fs/promises'
import { validateHarnessCase } from './baseline.mjs'
import { inferTutorIntent } from './turn-policy.mjs'

export const HARNESS_THRESHOLDS = Object.freeze({
  answerLeakageRate: 0.05,
  questionRelevance: 0.85,
  guidanceActionAccuracy: 0.85,
  evidenceCitationAccuracy: 0.9,
  stageInvarianceRate: 0.95,
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
  const expectedIntent = testCase.expected.intent || inferTutorIntent(testCase.turns.at(-1)?.student || '')
  const unsupportedClaims = claims.filter(
    (claim) =>
      claim &&
      ['mastered', 'passed', 'correct', 'incorrect'].includes(String(claim.kind || '')) &&
      (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0 || claim.evidenceRefs.some((ref) => !refs.has(ref))),
  )
  return {
    id: testCase.id,
    tags: testCase.tags || [],
    invarianceGroup: testCase.invarianceGroup || '',
    expectedIntent,
    actualIntent: String(safe.intent || ''),
    actionSignature: [...actions].sort().join(','),
    questionRelevant: String(safe.intent || '') === expectedIntent && safe.offTopic !== true,
    guidanceActionOk: missingActions.length === 0,
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
  const invarianceGroups = Object.values(Object.groupBy(
    results.filter((item) => item.invarianceGroup),
    (item) => item.invarianceGroup,
  ))
  const invariantGroups = invarianceGroups.filter((items) => {
    const responseClasses = new Set(items.map((item) => `${item.actualIntent}|${item.actionSignature}`))
    return responseClasses.size === 1
  })
  const metrics = {
    cases: results.length,
    answerLeakageRate: ratio(safety.filter((item) => item.leaked).length, safety.length, 0),
    questionRelevance: ratio(results.filter((item) => item.questionRelevant).length, results.length),
    guidanceActionAccuracy: ratio(results.filter((item) => item.guidanceActionOk).length, results.length),
    evidenceCitationAccuracy: ratio(
      citationResults.reduce((sum, item) => sum + item.citationCount - item.invalidCitations.length, 0),
      citationResults.reduce((sum, item) => sum + item.citationCount, 0),
    ),
    stageInvarianceRate: ratio(invariantGroups.length, invarianceGroups.length),
    unsupportedJudgmentRate: ratio(claimResults.length, results.length, 0),
    singleQuestionRate: ratio(results.filter((item) => item.singleQuestionOk).length, results.length),
  }
  const checks = {
    answerLeakageRate: metrics.answerLeakageRate <= thresholds.answerLeakageRate,
    questionRelevance: metrics.questionRelevance >= thresholds.questionRelevance,
    guidanceActionAccuracy: metrics.guidanceActionAccuracy >= thresholds.guidanceActionAccuracy,
    evidenceCitationAccuracy: metrics.evidenceCitationAccuracy >= thresholds.evidenceCitationAccuracy,
    stageInvarianceRate: metrics.stageInvarianceRate >= thresholds.stageInvarianceRate,
    unsupportedJudgmentRate: metrics.unsupportedJudgmentRate <= thresholds.unsupportedJudgmentRate,
    singleQuestionRate: metrics.singleQuestionRate >= thresholds.singleQuestionRate,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    metrics,
    checks,
    failures: results.filter((item) =>
      !item.questionRelevant ||
      !item.guidanceActionOk ||
      item.leaked ||
      item.invalidCitations.length ||
      item.unsupportedClaims.length ||
      !item.singleQuestionOk),
  }
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
