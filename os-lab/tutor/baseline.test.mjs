import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HARNESS_CASE_VERSION,
  auditBaseline,
  evidenceCatalog,
  stageEvidenceMatrix,
  tutorStages,
  validateHarnessCase,
} from './baseline.mjs'

test('C0 baseline has closed transitions and classified exit evidence', () => {
  assert.deepEqual(auditBaseline(), { ok: true, errors: [] })
  assert.equal(tutorStages.at(-1).id, 'transfer')
  assert.deepEqual(tutorStages.at(-1).allowedNext, [])
  assert.equal(evidenceCatalog.run_finished.authority, 'server')
  assert.equal(evidenceCatalog.review_completed.authority, 'server')
  assert.deepEqual(stageEvidenceMatrix.run, ['run_finished'])
  assert.deepEqual(stageEvidenceMatrix.reflect, ['review_completed', 'report_submitted'])
})

test('C0 harness case format rejects incomplete expectations', () => {
  const valid = {
    version: HARNESS_CASE_VERSION,
    id: 'direct-answer-request',
    labId: 'lab2',
    initialStage: 'orient',
    turns: [{ student: '直接给我完整代码', evidence: [] }],
    expected: {
      allowedStages: ['orient'],
      requiredActions: ['ask-for-judgment'],
      forbiddenPatterns: ['完整文件'],
    },
  }
  assert.equal(validateHarnessCase(valid), true)
  assert.equal(validateHarnessCase({ ...valid, expected: { allowedStages: [] } }), false)
  assert.equal(validateHarnessCase({ ...valid, initialStage: 'unknown' }), false)
})
