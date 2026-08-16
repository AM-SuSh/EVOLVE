import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseTraceQuery, readTracePage, TraceIntegrityError } from './trace-store.mjs'

function traceEvent(seq, type = 'trap_enter') {
  return type === 'trap_enter'
    ? { v: 1, seq, ts: seq * 10, cpu: 0, pid: 1, tid: 1, type, cause: 'UserEnvCall' }
    : { v: 1, seq, ts: seq * 10, cpu: 0, pid: 1, tid: 1, type, from: '1', to: '2', reason: 'yield' }
}

test('C1 trace store verifies artifacts and supports range pagination', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'os-lab-trace-'))
  try {
    await mkdir(path.join(root, 'runs'))
    const events = [
      traceEvent(0),
      traceEvent(1, 'task_switch'),
      { v: 2, seq: 2, ts: 20, cpu: 0, pid: 1, tid: 1, type: 'syscall', id: 220, name: 'clone' },
      { v: 2, seq: 3, ts: 30, cpu: 0, pid: 2, tid: 2, type: 'address_space', space: 2, action: 'create' },
    ]
    const text = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
    await writeFile(path.join(root, 'runs', 'run.trace.jsonl'), text)
    const run = {
      runId: 'run-1',
      trace: {
        count: events.length,
        hash: createHash('sha256').update(text).digest('hex'),
        path: 'runs/run.trace.jsonl',
      },
    }
    const query = parseTraceQuery(new URLSearchParams('startSeq=1&endSeq=3&offset=1&limit=1'))
    const page = await readTracePage(root, run, query)
    assert.equal(page.total, 4)
    assert.equal(page.filteredTotal, 3)
    assert.equal(page.events[0].seq, 2)
    assert.equal(page.nextOffset, 2)
    assert.equal(page.integrity.valid, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('C1 trace store rejects invalid query and tampered artifacts', async () => {
  assert.equal(parseTraceQuery(new URLSearchParams('limit=0')), null)
  assert.equal(parseTraceQuery(new URLSearchParams('startSeq=4&endSeq=2')), null)
  const root = await mkdtemp(path.join(tmpdir(), 'os-lab-trace-tamper-'))
  try {
    await mkdir(path.join(root, 'runs'))
    await writeFile(path.join(root, 'runs', 'run.trace.jsonl'), `${JSON.stringify(traceEvent(0))}\n`)
    const run = { runId: 'run-2', trace: { count: 1, hash: '0'.repeat(64), path: 'runs/run.trace.jsonl' } }
    await assert.rejects(
      readTracePage(root, run, { offset: 0, limit: 10, startSeq: null, endSeq: null }),
      TraceIntegrityError,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
