import assert from 'node:assert/strict'
import test from 'node:test'

import { createCargoJsonCollector, parseCargoMessageLine } from './cargo-diagnostics.mjs'

function cargoDiagnostic(overrides = {}) {
  return JSON.stringify({
    reason: 'compiler-message',
    message: {
      level: 'error',
      message: 'cannot find value `missing` in this scope',
      code: { code: 'E0425' },
      rendered: 'error[E0425]: cannot find value `missing` in this scope\n',
      spans: [{
        file_name: 'kernel\\src\\main.rs',
        line_start: 12,
        line_end: 12,
        column_start: 5,
        column_end: 12,
        is_primary: true,
      }],
      ...overrides,
    },
  })
}

test('Cargo JSON diagnostics normalize Rust spans for the workspace', () => {
  const parsed = parseCargoMessageLine(cargoDiagnostic(), 'C:\\student-workspace')
  assert.equal(parsed.handled, true)
  assert.deepEqual(parsed.diagnostic, {
    level: 'error',
    code: 'E0425',
    message: 'cannot find value `missing` in this scope',
    file: 'kernel/src/main.rs',
    line: 12,
    column: 5,
    endLine: 12,
    endColumn: 12,
    rendered: 'error[E0425]: cannot find value `missing` in this scope\n',
  })
})

test('Cargo JSON collector handles fragmented messages and preserves program output', () => {
  const output = []
  const diagnostics = []
  const collector = createCargoJsonCollector('C:\\student-workspace', (text) => output.push(text), (item) => diagnostics.push(item))
  const line = cargoDiagnostic()
  collector.push(line.slice(0, 40))
  collector.push(`${line.slice(40)}\nHello from user app!\n`)
  collector.flush()

  assert.equal(diagnostics.length, 1)
  assert.match(output.join(''), /error\[E0425\]/)
  assert.match(output.join(''), /Hello from user app!/)
})

test('Cargo diagnostics recover workspace paths across Windows short and long temp roots', () => {
  const parsed = parseCargoMessageLine(cargoDiagnostic({
    spans: [{
      file_name: 'C:\\Users\\Student Name\\Temp\\workspace\\kernel\\src\\task.rs',
      line_start: 9,
      line_end: 9,
      column_start: 1,
      column_end: 5,
      is_primary: true,
    }],
  }), 'C:\\Users\\STUDEN~1\\Temp\\workspace')
  assert.equal(parsed.diagnostic.file, 'kernel/src/task.rs')
})
