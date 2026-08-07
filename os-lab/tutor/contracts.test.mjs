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

test('trace-v1 parser ignores malformed frames and accepts Lab2 events', () => {
  const trap = { v: 1, seq: 1, ts: 10, cpu: 0, pid: 0, tid: 0, type: 'trap_enter', cause: 'user_ecall' }
  const task = { v: 1, seq: 2, ts: 20, cpu: 0, pid: 1, tid: 1, type: 'task_switch', from: 'Ready', to: 'Running', reason: 'scheduler' }
  assert.equal(validateTraceEvent(trap), true)
  assert.equal(validateTraceEvent(task), true)
  assert.deepEqual(collectTraceEvents(`noise\nTRACE_V1 ${JSON.stringify(trap)}\nTRACE_V1 nope\nTRACE_V1 ${JSON.stringify(task)}\n`), [trap, task])
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
