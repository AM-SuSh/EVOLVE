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

  const unauthenticatedManual = await fetch(`${endpoint}/manual?labId=lab1`)
  assert.equal(unauthenticatedManual.status, 401)

  const studentHeaders = { Authorization: `Bearer ${registration.token}` }
  const initialAccess = await fetch(`${endpoint}/learning/access`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.equal(initialAccess.labs.find((lab) => lab.labId === 'lab1').unlocked, true)
  assert.equal(initialAccess.labs.find((lab) => lab.labId === 'lab2').unlocked, false)

  const lab1Manual = await fetch(`${endpoint}/manual?labId=lab1`, { headers: studentHeaders })
  assert.equal(lab1Manual.status, 200)
  assert.match((await lab1Manual.json()).content, /Lab1/)
  assert.equal((await fetch(`${endpoint}/manual?labId=lab2`, { headers: studentHeaders })).status, 403)

  const teacher = await fetch(`${endpoint}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((response) => response.json())
  assert.equal(teacher.ok, true)
  assert.equal(
    (await fetch(`${endpoint}/manual?labId=lab8`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
    })).status,
    200,
  )

  // 模拟 Lab1 已产生可信验证；复盘仍通过公开事件接口提交。
  const evidenceDb = new DatabaseSync(dbPath)
  const student = evidenceDb.prepare('SELECT id FROM users WHERE username = ?').get('member-c-smoke')
  evidenceDb.prepare(
    `INSERT INTO runs
      (id, user_id, learning_session_id, lab_id, recipe_id, command_json, workspace_version,
       trusted, status, started_at, finished_at, exit_code, verified)
     VALUES (?, ?, ?, 'lab1', 'lab1.verify.v1', '[]', 'smoke-workspace', 1, 'finished', ?, ?, 0, 1)`,
  ).run(
    '22222222-2222-4222-8222-222222222222',
    student.id,
    'smoke-lab1-session',
    '2026-07-28T00:00:00.000Z',
    '2026-07-28T00:00:01.000Z',
  )
  evidenceDb.close()
  const reflection = await fetch(`${endpoint}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({
      event: {
        version: 1,
        id: 'smoke-lab1-reflection',
        sessionId: 'smoke-lab1-session',
        labId: 'lab1',
        timestamp: '2026-07-28T00:00:02.000Z',
        type: 'reflection_submitted',
        stage: 'reflect',
        content: '我用输出断言验证了启动链。',
      },
    }),
  })
  assert.equal(reflection.status, 202)
  const progressedAccess = await fetch(`${endpoint}/learning/access`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.equal(progressedAccess.labs.find((lab) => lab.labId === 'lab2').unlocked, true)
  assert.equal((await fetch(`${endpoint}/manual?labId=lab2`, { headers: studentHeaders })).status, 200)

  const response = await fetch(`${endpoint}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...studentHeaders,
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
  assert.deepEqual(counts, { runs: 2, events: 2, assertions: 6 })
  console.log(`tutor smoke passed: ${JSON.stringify(counts)}`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopServer()
  rmSync(smokeRoot, { recursive: true, force: true })
}
