import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateReviewGates } from './review-gates.mjs'

test('C5 hard gates catch result/process divergence and retain evidence', () => {
  const assessment = {
    dimensions: { result: 100, process: 20, reflection: 0 },
    items: [
      { id: 'R3', status: 'met', score: 2, evidenceRefs: ['run:1'] },
      { id: 'F1', status: 'unobserved', score: null, evidenceRefs: [] },
      { id: 'F2', status: 'unobserved', score: null, evidenceRefs: [] },
    ],
  }
  const result = evaluateReviewGates(assessment)
  assert.equal(result.requiresReview, true)
  assert.equal(result.gates.some((item) => item.code === 'H1'), true)
  assert.equal(result.gates.find((item) => item.code === 'H1').evidenceRefs.includes('run:1'), true)
})

test('C5 soft gates do not force review without a hard condition', () => {
  const assessment = {
    dimensions: { result: 60, process: 60, reflection: 60 },
    items: [
      { id: 'R3', status: 'met', score: 2, evidenceRefs: ['run:1'] },
      { id: 'F1', status: 'partial', score: 1, evidenceRefs: ['event:1'] },
      { id: 'F2', status: 'partial', score: 1, evidenceRefs: ['event:1'] },
    ],
  }
  const result = evaluateReviewGates(assessment, { transferConflict: true })
  assert.equal(result.requiresReview, false)
  assert.deepEqual(result.gates.map((item) => item.code), ['S1'])
})
