import assert from 'node:assert/strict'
import test from 'node:test'

import { CATALOG_LABS, conceptForLab, loadConceptCatalog } from './concept-catalog.mjs'
import { normalizeReviewEvaluation, normalizeReviewPlan } from './review-contracts.mjs'

test('concept catalog loads Lab1-Lab8 from lab packages', () => {
  const catalog = loadConceptCatalog({ fresh: true })
  assert.deepEqual(Object.keys(catalog.labs), CATALOG_LABS)
  for (const labId of CATALOG_LABS) {
    assert.ok(catalog.labs[labId].concepts.length >= 2, `${labId} should expose concepts`)
    assert.ok(catalog.labs[labId].recipeId, `${labId} should expose a trusted recipe`)
  }
  assert.deepEqual(conceptForLab('lab2', 'os.sched.task-state').assertionIds.sort(), ['all-exited', 'yield-five-rounds'])
  assert.equal(conceptForLab('lab1', 'os.boot.entry').title, '固件到内核入口')
  assert.equal(conceptForLab('lab3', 'os.sched.task-state'), null)
})

test('review plan enforces 2-5 questions and current-lab concepts', () => {
  const knownConceptIds = new Set(loadConceptCatalog().labs.lab2.conceptIds)
  const question = (index, conceptId = 'os.sched.task-state') => ({
    questionId: `q${index}`,
    conceptId,
    kind: 'causal-explanation',
    objective: '确认状态转换理解',
    prompt: `问题 ${index}`,
    reason: '行为证据显示需要复盘',
    passCriteria: ['指出 Ready 与 Exited 的区别'],
    evidenceRefs: [`event:e${index}`],
  })
  const plan = normalizeReviewPlan({
    labId: 'lab2', sessionId: 's1', maxQuestions: 5, questions: [question(1), question(2)],
  }, { knownConceptIds })
  assert.equal(plan.questions.length, 2)
  assert.throws(() => normalizeReviewPlan({ questions: [question(1)] }, { knownConceptIds }), /2-5/)
  assert.throws(() => normalizeReviewPlan({ questions: [question(1), question(2, 'os.mm.sv39-walk')] }, { knownConceptIds }), /conceptId/)
  assert.equal(normalizeReviewEvaluation({ verdict: 'needs-evidence' }).verdict, 'needs-evidence')
})

test('review evaluation normalizes structured feedback fields', () => {
  const evaluation = normalizeReviewEvaluation({
    verdict: 'misconception',
    verdictLabel: '  Needs correction  ',
    rationale: '  The causal chain skips a state transition.  ',
    evidenceRefs: ['run:verified', ' run:verified ', '', 'event:answer'],
    missingEvidence: [' trace output ', '', 'trusted assertion'],
    missingPoints: [
      ' trigger ', 'mechanism', '', 'state change', 'observable result',
      'verification', 'counterexample', 'boundary', 'transfer', 'discarded ninth item',
    ],
    correctReasoning: `  ${'r'.repeat(4_100)}  `,
    correctiveExplanation: `  ${'c'.repeat(4_100)}  `,
    followUpObjective: `  ${'f'.repeat(1_100)}  `,
  })

  assert.equal(evaluation.verdict, 'misconception')
  assert.equal(evaluation.verdictLabel, 'Needs correction')
  assert.equal(evaluation.rationale, 'The causal chain skips a state transition.')
  assert.deepEqual(evaluation.evidenceRefs, ['run:verified', 'event:answer'])
  assert.deepEqual(evaluation.missingEvidence, ['trace output', 'trusted assertion'])
  assert.deepEqual(evaluation.missingPoints, [
    'trigger', 'mechanism', 'state change', 'observable result',
    'verification', 'counterexample', 'boundary', 'transfer',
  ])
  assert.equal(evaluation.correctReasoning.length, 4_000)
  assert.equal(evaluation.correctiveExplanation.length, 4_000)
  assert.equal(evaluation.followUpObjective.length, 1_000)
})
