import assert from 'node:assert/strict'
import test from 'node:test'
import { accessForLab, buildLearningAccess } from './access.mjs'

test('students only receive published labs after the previous trusted completion', () => {
  const initial = buildLearningAccess({ role: 'student', openLab: 'lab3' })
  assert.equal(accessForLab(initial, 'lab1').unlocked, true)
  assert.equal(accessForLab(initial, 'lab2').unlocked, false)
  assert.match(accessForLab(initial, 'lab2').reason, /LAB1/)
  assert.equal(accessForLab(initial, 'lab4').state, 'waiting_teacher')

  const progressed = buildLearningAccess({
    role: 'student',
    openLab: 'lab3',
    evidence: [{ labId: 'lab1', verified: true, reflected: true }],
  })
  assert.equal(accessForLab(progressed, 'lab2').unlocked, true)
  assert.equal(accessForLab(progressed, 'lab3').unlocked, false)
})

test('trusted evidence alone does not unlock later labs before the teacher distributes them', () => {
  const notDistributed = buildLearningAccess({
    role: 'student',
    openLab: 'lab1',
    evidence: [{ labId: 'lab1', verified: true, reflected: true }],
  })
  assert.equal(accessForLab(notDistributed, 'lab1').unlocked, true)
  assert.equal(accessForLab(notDistributed, 'lab2').unlocked, false)
  assert.equal(accessForLab(notDistributed, 'lab2').state, 'waiting_teacher')
  assert.match(accessForLab(notDistributed, 'lab2').reason, /分发/)
})

test('already issued labs remain readable and teachers can preview every manual', () => {
  const legacy = buildLearningAccess({ role: 'student', openLab: 'lab2', applied: ['lab1', 'lab2'] })
  assert.equal(accessForLab(legacy, 'lab2').unlocked, true)
  assert.equal(accessForLab(legacy, 'lab3').unlocked, false)

  const teacher = buildLearningAccess({ role: 'teacher', openLab: 'lab1' })
  assert.equal(teacher.labs.every((item) => item.unlocked), true)
  assert.equal(accessForLab(teacher, 'lab8').published, false)
})
