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
    evidence: [{ labId: 'lab1', verified: true, reviewCompleted: true, reportSubmitted: true }],
  })
  assert.equal(accessForLab(progressed, 'lab2').unlocked, true)
  assert.equal(accessForLab(progressed, 'lab3').unlocked, false)
})

test('trusted evidence alone does not unlock later labs before the teacher distributes them', () => {
  const notDistributed = buildLearningAccess({
    role: 'student',
    openLab: 'lab1',
    evidence: [{ labId: 'lab1', verified: true, reviewCompleted: true, reportSubmitted: true }],
  })
  assert.equal(accessForLab(notDistributed, 'lab1').unlocked, true)
  assert.equal(accessForLab(notDistributed, 'lab2').unlocked, false)
  assert.equal(accessForLab(notDistributed, 'lab2').state, 'waiting_teacher')
  assert.match(accessForLab(notDistributed, 'lab2').reason, /分发/)
})

test('new lifecycle ignores a reflected compatibility field unless it is explicitly grandfathered', () => {
  const staleReflection = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    evidence: [{ labId: 'lab1', verified: true, reflected: true }],
  })
  assert.equal(accessForLab(staleReflection, 'lab1').completed, false)
  assert.equal(accessForLab(staleReflection, 'lab2').unlocked, false)

  const grandfathered = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    evidence: [{ labId: 'lab1', verified: true, legacyReflected: true, reportSubmitted: true }],
  })
  assert.equal(accessForLab(grandfathered, 'lab1').completed, true)
  assert.equal(accessForLab(grandfathered, 'lab2').unlocked, true)
})

test('completed review does not unlock the next lab until report and review are submitted', () => {
  const reviewOnly = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    evidence: [{ labId: 'lab1', verified: true, reviewCompleted: true }],
  })
  assert.equal(accessForLab(reviewOnly, 'lab1').completed, false)
  assert.equal(accessForLab(reviewOnly, 'lab2').unlocked, false)
  assert.match(accessForLab(reviewOnly, 'lab2').reason, /提交实验报告与复盘/)

  const submitted = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    evidence: [{ labId: 'lab1', verified: true, reviewCompleted: true, reportSubmitted: true }],
  })
  assert.equal(accessForLab(submitted, 'lab1').completed, true)
  assert.equal(accessForLab(submitted, 'lab2').unlocked, true)
})

test('already issued labs remain readable and teachers can preview every manual', () => {
  const legacy = buildLearningAccess({ role: 'student', openLab: 'lab2', applied: ['lab1', 'lab2'] })
  assert.equal(accessForLab(legacy, 'lab2').unlocked, true)
  assert.equal(accessForLab(legacy, 'lab3').unlocked, false)

  const teacher = buildLearningAccess({ role: 'teacher', openLab: 'lab1' })
  assert.equal(teacher.labs.every((item) => item.unlocked), true)
  assert.equal(accessForLab(teacher, 'lab8').published, false)
})

test('scheduled unlock and lock windows gate student access', () => {
  const schedules = {
    lab2: {
      unlockAt: '2026-08-11T09:00:00.000Z',
      lockAt: '2026-08-11T18:00:00.000Z',
    },
  }
  const beforeOpen = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    applied: ['lab1', 'lab2'],
    schedules,
    now: Date.parse('2026-08-11T08:30:00.000Z'),
  })
  assert.equal(accessForLab(beforeOpen, 'lab2').unlocked, false)
  assert.equal(accessForLab(beforeOpen, 'lab2').state, 'waiting_unlock')
  assert.match(accessForLab(beforeOpen, 'lab2').reason, /解锁时间/)

  const insideWindow = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    applied: ['lab1', 'lab2'],
    schedules,
    now: Date.parse('2026-08-11T12:00:00.000Z'),
  })
  assert.equal(accessForLab(insideWindow, 'lab2').unlocked, true)

  const afterLock = buildLearningAccess({
    role: 'student',
    openLab: 'lab2',
    applied: ['lab1', 'lab2'],
    schedules,
    now: Date.parse('2026-08-11T19:00:00.000Z'),
  })
  assert.equal(accessForLab(afterLock, 'lab2').unlocked, false)
  assert.equal(accessForLab(afterLock, 'lab2').state, 'locked')
  assert.match(accessForLab(afterLock, 'lab2').reason, /截止/)
})

test('teacher preview ignores time windows while still exposing them', () => {
  const access = buildLearningAccess({
    role: 'teacher',
    openLab: 'lab2',
    schedules: {
      lab2: { unlockAt: '2026-08-11T09:00:00.000Z', lockAt: '2026-08-11T18:00:00.000Z' },
    },
    now: Date.parse('2026-08-11T08:30:00.000Z'),
  })
  assert.equal(accessForLab(access, 'lab2').unlocked, true)
  assert.equal(accessForLab(access, 'lab2').unlockAt, '2026-08-11T09:00:00.000Z')
  assert.equal(accessForLab(access, 'lab2').lockAt, '2026-08-11T18:00:00.000Z')
})
