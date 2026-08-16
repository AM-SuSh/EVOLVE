import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectTraceEvents,
  validateAssertion,
  validateInteractionEvent,
  validateRunResult,
  validateTraceEvent,
} from './contracts.mjs'
import { evaluateRunAssertions, getRunRecipe } from './run-recipes.mjs'

const assertion = {
  id: 'yield-rounds',
  label: 'yield 完整执行',
  passed: true,
  expected: '5',
  observed: '5',
}

test('event-v2 accepts a trusted run chain and keeps v1 compatibility', () => {
  const common = {
    version: 2,
    id: 'event-1',
    sessionId: 'learning-session-1',
    labId: 'lab2',
    timestamp: '2026-07-28T00:00:00.000Z',
    stage: 'run',
  }
  assert.equal(validateInteractionEvent({ ...common, type: 'run_started', runId: 'run-1', recipeId: 'lab2.verify-trace.v1', workspaceVersion: 'workspace-1' }), true)
  assert.equal(validateInteractionEvent({ ...common, type: 'run_finished', runId: 'run-1', exitCode: 0, duration: 12, outputHash: 'a'.repeat(64), assertions: [assertion] }), true)
  assert.equal(validateInteractionEvent({ ...common, type: 'run_finished' }), false)
  assert.equal(validateInteractionEvent({ ...common, version: 1, type: 'student_message' }), true)
  assert.equal(validateInteractionEvent({ ...common, type: 'hint_requested', checkpointId: 'trap-cause', hintLevel: 2 }), true)
  assert.equal(validateInteractionEvent({ ...common, type: 'hint_requested' }), false)
})

test('event-v2 compatibly accepts transfer and the L4 support tier', () => {
  const event = {
    version: 2,
    id: 'hint-l4',
    sessionId: 'learning-1',
    labId: 'lab2',
    timestamp: '2026-07-30T00:00:00.000Z',
    type: 'hint_requested',
    stage: 'transfer',
    checkpointId: 'lab2-transfer',
    hintLevel: 4,
  }
  assert.equal(validateInteractionEvent(event), true)
  assert.equal(validateInteractionEvent({ ...event, hintLevel: 5 }), false)
})

test('event-v2 validates server-authoritative Socratic review events', () => {
  const common = {
    version: 2,
    id: 'review-event-1',
    sessionId: 'session-review',
    labId: 'lab2',
    timestamp: '2026-08-12T00:00:00.000Z',
    stage: 'reflect',
    reviewId: 'review-1',
  }
  assert.equal(validateInteractionEvent({ ...common, type: 'review_started' }), true)
  assert.equal(validateInteractionEvent({
    ...common, type: 'review_question_asked', questionId: 'q1',
    conceptIds: ['os.trap.syscall-abi'],
  }), true)
  assert.equal(validateInteractionEvent({
    ...common, type: 'review_answer_evaluated', questionId: 'q1',
    conceptIds: ['os.trap.syscall-abi'], verdict: 'passed', evidenceRefs: ['run:1'],
  }), true)
  assert.equal(validateInteractionEvent({
    ...common, type: 'review_answer_evaluated', questionId: 'q1',
    conceptIds: ['os.trap.syscall-abi'], verdict: 'invented', evidenceRefs: [],
  }), false)
  assert.equal(validateInteractionEvent({
    ...common,
    type: 'review_reflection_assessed',
    evidenceRefs: ['event:answer-1'],
    metadata: {
      authority: 'server',
      source: 'socratic-review',
      reviewPerformance: {
        items: Object.fromEntries(['F1', 'F2', 'T1', 'T2'].map((id) => [id, { score: 2 }])),
      },
    },
  }), true)
})

test('trace parser keeps v1 compatibility and accepts version-matched v2 events', () => {
  const trap = { v: 1, seq: 1, ts: 10, cpu: 0, pid: 0, tid: 0, type: 'trap_enter', cause: 'user_ecall' }
  const task = { v: 1, seq: 2, ts: 20, cpu: 0, pid: 1, tid: 1, type: 'task_switch', from: 'Ready', to: 'Running', reason: 'scheduler' }
  const syscall = { v: 2, seq: 3, ts: 30, cpu: 0, pid: 1, tid: 1, type: 'syscall', id: 220, name: 'clone' }
  const addressSpace = { v: 2, seq: 4, ts: 40, cpu: 0, pid: 2, tid: 2, type: 'address_space', space: 2, action: 'create' }
  assert.equal(validateTraceEvent(trap), true)
  assert.equal(validateTraceEvent(task), true)
  assert.equal(validateTraceEvent(syscall), true)
  assert.equal(validateTraceEvent(addressSpace), true)
  assert.equal(validateTraceEvent({ ...syscall, v: 1 }), false)
  assert.equal(validateTraceEvent({ ...syscall, name: '' }), false)
  assert.equal(validateTraceEvent({ ...addressSpace, action: 'invented' }), false)
  assert.deepEqual(
    collectTraceEvents(
      `noise\nTRACE_V1 ${JSON.stringify(trap)}\nTRACE_V1 nope\nTRACE_V1 ${JSON.stringify(task)}\nTRACE_V2 ${JSON.stringify(syscall)}\nTRACE_V2 ${JSON.stringify(addressSpace)}\nTRACE_V1 ${JSON.stringify(syscall)}\n`,
    ),
    [trap, task, syscall, addressSpace],
  )
})

test('run-result-v1 only verifies trusted zero-exit runs with passing assertions', () => {
  const result = {
    version: 1,
    runId: 'run-1',
    labId: 'lab2',
    recipeId: 'lab2.verify-trace.v1',
    workspaceVersion: 'workspace-1',
    trusted: true,
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z',
    exitCode: 0,
    durationMs: 1000,
    assertions: [assertion],
    output: { hash: 'a'.repeat(64), bytes: 10 },
    trace: { version: 1, count: 2, hash: 'b'.repeat(64) },
    verified: true,
  }
  assert.equal(validateRunResult(result), true)
  assert.equal(validateRunResult({ ...result, trusted: false }), false)
})

test('assertions may carry a fix hint and failed Lab2 checks expose it', () => {
  const base = { id: 'a1', label: '输出', passed: false, expected: '1', observed: '0' }
  assert.equal(validateAssertion(base), true)
  assert.equal(validateAssertion({ ...base, hint: '先检查 sys_write' }), true)
  assert.equal(validateAssertion({ ...base, hint: '' }), false)
  assert.equal(validateAssertion({ ...base, hint: 'x'.repeat(2001) }), false)

  const output = 'Hello from user app!\n409684505\nPower check ok\nYield round\n'
  const assertions = evaluateRunAssertions('lab2.verify-trace.v1', output, [])
  const failed = assertions.filter((item) => !item.passed)
  assert.ok(failed.length > 0)
  assert.ok(failed.every((item) => typeof item.hint === 'string' && item.hint.length > 0))
})

test('Lab2 trusted recipe checks behavior and both teaching trace types', () => {
  const recipe = getRunRecipe('lab2')
  assert.equal(recipe.id, 'lab2.verify-trace.v1')
  const output = `Hello from user app!\n409684505\nPower check ok\n${'Yield round\n'.repeat(5)}All user apps exited.\n`
  const traces = [
    { type: 'trap_enter' },
    { type: 'task_switch' },
  ]
  const assertions = evaluateRunAssertions(recipe.id, output, traces)
  assert.deepEqual(
    assertions.map((item) => item.id),
    ['hello-output', 'power-result', 'yield-five-rounds', 'all-exited', 'trace-trap-enter', 'trace-task-switch'],
  )
  assert.equal(assertions.every((item) => item.passed), true)
  assert.equal(evaluateRunAssertions(recipe.id, output.replace('Hello from user app!\n', ''), traces).every((item) => item.passed), false)
  assert.equal(evaluateRunAssertions(recipe.id, output.replace('409684505\n', ''), traces).every((item) => item.passed), false)
  assert.equal(evaluateRunAssertions(recipe.id, output.replace('Yield round\n', ''), traces).every((item) => item.passed), false)
})

test('Lab3-Lab8 trusted recipes enable trace and require lab-specific events', () => {
  const cases = [
    ['lab3', [{ type: 'address_space', action: 'create' }], ['trace-address-space-create']],
    ['lab4', ['clone', 'wait4'].map((name) => ({ type: 'syscall', name })), ['trace-process-clone', 'trace-process-wait']],
    ['lab5', ['openat', 'pipe'].map((name) => ({ type: 'syscall', name })), ['trace-fs-openat', 'trace-ipc-pipe']],
    ['lab6', ['linkat', 'mmap', 'spawn'].map((name) => ({ type: 'syscall', name })), ['trace-disk-linkat', 'trace-vm-mmap', 'trace-process-spawn']],
    ['lab7', ['dup', 'kill', 'sigreturn'].map((name) => ({ type: 'syscall', name })), ['trace-fd-dup', 'trace-signal-kill', 'trace-signal-return']],
    ['lab8', ['thread_create', 'mutex_lock', 'condvar_wait', 'enable_deadlock_detect'].map((name) => ({ type: 'syscall', name })), ['trace-thread-create', 'trace-mutex-lock', 'trace-condvar-wait', 'trace-deadlock-detect']],
  ]

  for (const [labId, traces, traceAssertionIds] of cases) {
    const recipe = getRunRecipe(labId)
    assert.ok(recipe.steps.some((step) => step.args.some((arg) => String(arg).includes('trace-edu'))), labId)
    const assertions = evaluateRunAssertions(recipe.id, '', traces)
    const traceAssertions = assertions.filter((item) => traceAssertionIds.includes(item.id))
    assert.equal(traceAssertions.length, traceAssertionIds.length, labId)
    assert.equal(traceAssertions.every((item) => item.passed), true, labId)
    assert.equal(
      evaluateRunAssertions(recipe.id, '', []).filter((item) => traceAssertionIds.includes(item.id)).every((item) => !item.passed),
      true,
      labId,
    )
  }
})
