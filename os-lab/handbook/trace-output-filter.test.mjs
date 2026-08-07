import assert from 'node:assert/strict'
import test from 'node:test'
import { createTraceOutputFilter } from './.vitepress/theme/trace-output-filter.mjs'

const trap = 'TRACE_V1 {"v":1,"seq":1,"type":"trap_enter"}\n'
const task = 'TRACE_V1 {"v":1,"seq":2,"type":"task_switch"}\r\n'

test('passes ordinary terminal output through unchanged', () => {
  const filter = createTraceOutputFilter()
  assert.equal(filter.push('Hello from user app!\n'), 'Hello from user app!\n')
  assert.equal(filter.flush(), '')
})

test('hides complete trace frames without removing adjacent program output', () => {
  const filter = createTraceOutputFilter()
  assert.equal(filter.push(`Yield round${trap}\nAll user apps exited.\n`), 'Yield round\nAll user apps exited.\n')
})

test('hides trace frames split across streamed chunks', () => {
  const filter = createTraceOutputFilter()
  assert.equal(filter.push('Power check okTRA'), 'Power check ok')
  assert.equal(filter.push('CE_V1 {"v":1,'), '')
  assert.equal(filter.push('"seq":3}\n\n'), '\n')
})

test('hides consecutive trace frames and preserves the next line', () => {
  const filter = createTraceOutputFilter()
  assert.equal(filter.push(`${trap}${task}App 2 exited with code 0\n`), 'App 2 exited with code 0\n')
})
