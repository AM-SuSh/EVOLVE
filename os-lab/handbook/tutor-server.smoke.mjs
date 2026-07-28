import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const smokeRoot = mkdtempSync(path.join(tmpdir(), 'os-lab-tutor-smoke-'))
const dbPath = path.join(smokeRoot, 'learning.db')
const dataDir = path.join(smokeRoot, 'sessions')
const port = 18_000 + Math.floor(Math.random() * 1_000)
const endpoint = `http://127.0.0.1:${port}`
let logs = ''

const server = spawn(process.execPath, ['tutor-server.mjs'], {
  cwd: path.dirname(fileURLToPath(import.meta.url)),
  env: {
    ...process.env,
    OS_LAB_DB_PATH: dbPath,
    OS_LAB_TUTOR_DATA_DIR: dataDir,
    OS_LAB_TUTOR_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (chunk) => { logs += chunk.toString('utf8') })
server.stderr.on('data', (chunk) => { logs += chunk.toString('utf8') })

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/auth/me`)
      if (response.status === 401) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`导师服务未就绪\n${logs}`)
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return
  const closed = new Promise((resolve) => server.once('close', resolve))
  server.kill()
  await closed
}

try {
  await waitForServer()
  const registration = await fetch(`${endpoint}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'member-c-smoke', password: 'secret1', className: '计科2301' }),
  }).then((response) => response.json())
  assert.equal(registration.ok, true)

  const response = await fetch(`${endpoint}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${registration.token}`,
    },
    body: JSON.stringify({ labId: 'lab2', sessionId: 'smoke-learning-session' }),
  })
  assert.equal(response.status, 200)
  const stream = await response.text()
  assert.match(stream, /"runId":"[0-9a-f-]{36}"/)
  assert.match(stream, /"verified":true/)

  await stopServer()
  const db = new DatabaseSync(dbPath)
  const counts = {
    runs: db.prepare('SELECT count(*) AS value FROM runs WHERE verified = 1').get().value,
    events: db.prepare("SELECT count(*) AS value FROM events WHERE type IN ('run_started', 'run_finished')").get().value,
    assertions: db.prepare('SELECT count(*) AS value FROM run_assertions WHERE passed = 1').get().value,
  }
  db.close()
  assert.deepEqual(counts, { runs: 1, events: 2, assertions: 5 })
  console.log(`tutor smoke passed: ${JSON.stringify(counts)}`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopServer()
  rmSync(smokeRoot, { recursive: true, force: true })
}
