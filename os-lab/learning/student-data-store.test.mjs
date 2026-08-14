import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'os-lab-student-data-'))
process.env.OS_LAB_STUDENT_DATA_ROOT = tempRoot
const store = await import(`./student-data-store.mjs?test=${Date.now()}`)

after(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

function snapshot(messages, updatedAt) {
  return {
    sessionId: 'lab1-session-42',
    labId: 'lab1',
    stage: 'read',
    messages,
    tutorState: null,
    updatedAt,
  }
}

test('conversation snapshots write .json once and stop growing .jsonl', async () => {
  const session = 'lab1-session-42'
  const base = snapshot(
    [{ id: 'm1', role: 'student', stage: 'read', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
    '2026-01-01T00:00:00.000Z',
  )
  const jsonPath = path.join(store.studentDataRoot, '42', 'conversations', `${session}.json`)
  const jsonlPath = path.join(store.studentDataRoot, '42', 'conversations', `${session}.jsonl`)

  await store.saveConversationSnapshot(42, base)
  assert.equal(existsSync(jsonPath), true)
  assert.equal(existsSync(jsonlPath), false)
  const first = readFileSync(jsonPath, 'utf8')

  // Same content with only updatedAt/message id differences is a duplicate write.
  await store.saveConversationSnapshot(42, {
    ...base,
    messages: [
      { id: 'client-id', role: 'student', stage: 'read', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
    ],
    updatedAt: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(readFileSync(jsonPath, 'utf8'), first)
  assert.equal(existsSync(jsonlPath), false)

  const next = snapshot(
    [
      { id: 'm1', role: 'student', stage: 'read', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'm2', role: 'assistant', stage: 'read', content: 'hi', timestamp: '2026-01-01T00:00:01.000Z' },
    ],
    '2026-01-01T00:01:00.000Z',
  )
  await store.saveConversationSnapshot(42, next)
  assert.notEqual(readFileSync(jsonPath, 'utf8'), first)
  assert.equal(existsSync(jsonlPath), false)
})

test('learning events still append per session', async () => {
  const event = {
    version: 2,
    id: 'event-1',
    sessionId: 'lab1-session-42',
    labId: 'lab1',
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'student_message',
    stage: 'read',
    content: 'hello',
  }
  await store.appendLearningEventsFile(42, [event])
  const eventsPath = path.join(store.studentDataRoot, '42', 'events', 'lab1-session-42.jsonl')
  assert.equal(existsSync(eventsPath), true)
  assert.match(readFileSync(eventsPath, 'utf8'), /event-1/)
})
