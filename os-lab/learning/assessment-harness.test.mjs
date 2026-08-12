import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createAssessmentReviewPlan, evaluateAssessmentReviewAnswer } from './assessment-agent.mjs'
import {
  loadAssessmentHarnessCases,
  runAssessmentHarness,
  summarizeAssessmentHarness,
  validateAssessmentHarnessCase,
} from './assessment-harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(here, 'fixtures', 'assessment-harness-cases-v1.json')

function deterministicAdapter(testCase, bundle) {
  return testCase.type === 'plan'
    ? createAssessmentReviewPlan(bundle, { previousQuestions: testCase.previousQuestions })
    : evaluateAssessmentReviewAnswer(testCase.question, testCase.answer, bundle)
}

test('fixture loads and every case passes shape validation', async () => {
  const cases = await loadAssessmentHarnessCases(fixtureFile)
  assert.ok(cases.length >= 5)
  assert.ok(cases.every((testCase) => validateAssessmentHarnessCase(testCase)))
  assert.ok(cases.some((testCase) => testCase.type === 'plan'))
  assert.ok(cases.some((testCase) => testCase.type === 'answer'))
})

test('deterministic pipeline passes the assessment harness', async () => {
  const cases = await loadAssessmentHarnessCases(fixtureFile)
  const report = await runAssessmentHarness(cases, deterministicAdapter)
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2))
  assert.equal(report.metrics.narrativeNeutralityRate, 1)
  assert.equal(report.metrics.unsupportedPassRate, 0)
})

test('harness rejects plans that demand a fixed retrospective narrative', async () => {
  const cases = await loadAssessmentHarnessCases(fixtureFile)
  const planCase = cases.find((testCase) => testCase.id === 'plan-baseline-grounded-and-narrative-neutral')
  const report = await runAssessmentHarness([planCase], async (testCase, bundle) => {
    const outcome = await deterministicAdapter(testCase, bundle)
    outcome.plan.questions[0].prompt = '请先复述你最初的错误判断，再按“原假设 -> 证据 -> 修正后结论”还原你的判断过程。'
    return outcome
  })
  assert.equal(report.ok, false)
  assert.equal(report.metrics.narrativeNeutralityRate, 0)
  assert.ok(report.failures[0].narrativeHits.length > 0)
})

test('harness rejects a pass verdict that lacks required trusted run evidence', async () => {
  const cases = await loadAssessmentHarnessCases(fixtureFile)
  const answerCase = cases.find((testCase) => testCase.id === 'answer-verbal-cannot-override-missing-trusted-run')
  const report = await runAssessmentHarness([answerCase], async () => ({
    evaluation: {
      verdict: 'passed',
      evidenceRefs: ['run:run-failed'],
      missingPoints: [],
      missingEvidence: [],
      correctiveExplanation: '',
    },
    agent: { mode: 'remote' },
  }))
  assert.equal(report.ok, false)
  assert.equal(report.metrics.unsupportedPassRate, 1)
  assert.equal(report.failures[0].unsupportedPass, true)
})

test('harness rejects fabricated evidence citations and non-actionable feedback', async () => {
  const cases = await loadAssessmentHarnessCases(fixtureFile)
  const answerCase = cases.find((testCase) => testCase.id === 'answer-shallow-reflection-gets-actionable-feedback')
  const report = await runAssessmentHarness([answerCase], async () => ({
    evaluation: {
      verdict: 'partial',
      evidenceRefs: ['run:fabricated'],
      missingPoints: [],
      missingEvidence: [],
      correctiveExplanation: '',
    },
    agent: { mode: 'remote' },
  }))
  assert.equal(report.ok, false)
  assert.ok(report.metrics.invalidCitationRate > 0)
  assert.equal(report.failures[0].actionableFeedback, false)
})

test('summary aggregates plan and answer metrics separately', () => {
  const summary = summarizeAssessmentHarness([
    {
      id: 'p1', type: 'plan', tags: [], planValid: true, shapeOk: true, invalidRefs: [],
      unknownConcepts: [], ungroundedQuestions: [], novel: true, repeatedPrompts: [],
      narrativeNeutral: true, narrativeHits: [], questionCount: 3, agentMode: 'deterministic',
    },
    {
      id: 'a1', type: 'answer', tags: [], verdict: 'passed', expectedVerdicts: ['passed'],
      verdictOk: true, citationCount: 2, invalidCitations: [], unsupportedPass: false,
      actionableFeedback: true, agentMode: 'deterministic',
    },
  ])
  assert.equal(summary.ok, true)
  assert.equal(summary.metrics.cases, 2)
  assert.equal(summary.metrics.planValidityRate, 1)
  assert.equal(summary.metrics.verdictAccuracy, 1)
})
