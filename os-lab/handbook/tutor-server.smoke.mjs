import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
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
const mockChatRequests = []

const mockUpstream = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.method === 'GET' && requestUrl.pathname === '/v1/models') {
    response.end(JSON.stringify({ data: [{ id: 'm0-smoke-model' }] }))
    return
  }
  if (request.method === 'POST' && requestUrl.pathname === '/v1/chat/completions') {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString('utf8')
    mockChatRequests.push(JSON.parse(raw))
    response.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: '你观察到了 task_switch。请结合 from、to 和 reason 解释这次切换为什么发生？',
        },
      }],
    }))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: { message: 'mock endpoint not found' } }))
})
await new Promise((resolve, reject) => {
  mockUpstream.once('error', reject)
  mockUpstream.listen(0, '127.0.0.1', resolve)
})
const mockAddress = mockUpstream.address()
assert.ok(mockAddress && typeof mockAddress === 'object')
const mockBaseUrl = `http://127.0.0.1:${mockAddress.port}/v1`

const server = spawn(process.execPath, ['tutor-server.mjs'], {
  cwd: path.dirname(fileURLToPath(import.meta.url)),
  env: {
    ...process.env,
    OS_LAB_DB_PATH: dbPath,
    OS_LAB_TUTOR_DATA_DIR: dataDir,
    OS_LAB_TUTOR_PORT: String(port),
    OS_LAB_LLM_BASE_URL: mockBaseUrl,
    OS_LAB_LLM_MODEL: 'm0-smoke-model',
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

async function stopMockUpstream() {
  if (!mockUpstream.listening) return
  mockUpstream.closeAllConnections?.()
  await new Promise((resolve) => mockUpstream.close(resolve))
}

function parseSseFrames(stream) {
  return stream
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
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
  const runFrames = parseSseFrames(stream)
  const runFrame = runFrames.find((frame) => frame.type === 'run')
  const exitFrame = runFrames.find((frame) => frame.type === 'exit')
  assert.match(runFrame.runId, /^[0-9a-f-]{36}$/)
  assert.equal(exitFrame.verified, true)
  assert.equal(exitFrame.result.runId, runFrame.runId)
  assert.equal(exitFrame.result.trace.count > 0, true)
  assert.equal(exitFrame.assertions.length, 6)
  assert.equal(exitFrame.assertions.every((item) => item.passed), true)

  const chat = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({
      labId: 'lab2',
      stage: 'reflect',
      message: '我观察到 trace 中发生了 task_switch，这能说明调度器做了什么？',
    }),
  }).then((chatResponse) => chatResponse.json())
  assert.equal(chat.mode, 'remote')
  assert.match(chat.reply, /请结合.*解释/)
  assert.equal(mockChatRequests.length, 1)
  assert.match(mockChatRequests[0].messages[0].content, /Lab2/)

  const runId = runFrame.runId
  const eventCommon = {
    version: 2,
    sessionId: 'smoke-learning-session',
    labId: 'lab2',
    timestamp: '2026-07-29T00:00:00.000Z',
  }
  const learningEvents = [
    {
      ...eventCommon,
      id: 'smoke-lab2-code-open',
      type: 'code_open',
      stage: 'read',
      path: 'kernel/src/task.rs',
      line: 1,
      source: 'workspace',
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-code-save',
      type: 'code_save',
      stage: 'debug',
      path: 'kernel/src/task.rs',
      baseHash: 'c'.repeat(64),
      newHash: 'd'.repeat(64),
      added: 1,
      deleted: 1,
      taskId: 'debug-task-switch',
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-student-message',
      type: 'student_message',
      stage: 'reflect',
      category: 'cause',
      content: '我观察到 task_switch，并尝试用 from、to 和 reason 验证调度原因。',
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-ai-response',
      type: 'ai_response',
      stage: 'reflect',
      category: 'cause',
      content: chat.reply,
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-verification',
      type: 'verification_attempt',
      stage: 'run',
      runId,
      recipeId: runFrame.recipeId,
      assertions: exitFrame.assertions,
      metadata: { passed: true, verified: true, trusted: true },
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-trace-inspected',
      type: 'trace_inspected',
      stage: 'reflect',
      runId,
      view: 'task-switch',
      eventRange: { start: 0, end: exitFrame.result.trace.count - 1 },
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-reflection',
      type: 'reflection_submitted',
      stage: 'reflect',
      content: '我的判断是 yield 让当前任务回到 Ready；AI 提醒我检查切换原因；QEMU 输出和 trace 验证了这个结论。',
    },
    {
      ...eventCommon,
      id: 'smoke-lab2-report-submitted',
      type: 'report_submitted',
      stage: 'reflect',
      reportVersion: 'lab2-report-v1',
      evidenceRefs: [`run:${runId}`, `trace:${runId}`],
    },
  ]
  const eventSync = await fetch(`${endpoint}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ events: learningEvents }),
  })
  assert.equal(eventSync.status, 202)
  assert.equal((await eventSync.json()).accepted, learningEvents.length)

  const reportContent = `# Lab2 报告\n\n可信运行：run:${runId}\n\nTrace：trace:${runId}\n\n${learningEvents[6].content}`
  const reportSubmit = await fetch(`${endpoint}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ labId: 'lab2', content: reportContent }),
  })
  assert.equal(reportSubmit.status, 200)

  const score = await fetch(`${endpoint}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ sessionId: 'smoke-learning-session', labId: 'lab2', events: learningEvents }),
  }).then((scoreResponse) => scoreResponse.json())
  assert.equal(score.labId, 'lab2')
  assert.equal(score.score.counts.verifications, 1)
  assert.equal(score.score.counts.reflections, 1)
  assert.equal(score.score.result, 100)
  assert.match(score.markdown, /学习报告/)

  await stopServer()
  const db = new DatabaseSync(dbPath)
  const counts = {
    runs: db.prepare('SELECT count(*) AS value FROM runs WHERE verified = 1').get().value,
    events: db.prepare("SELECT count(*) AS value FROM events WHERE type IN ('run_started', 'run_finished')").get().value,
    assertions: db.prepare('SELECT count(*) AS value FROM run_assertions WHERE passed = 1').get().value,
    learningChain: db.prepare("SELECT count(*) AS value FROM events WHERE session_id = 'smoke-learning-session'").get().value,
    reports: db.prepare("SELECT count(*) AS value FROM reports WHERE lab_id = 'lab2'").get().value,
  }
  db.close()
  assert.deepEqual(counts, { runs: 2, events: 2, assertions: 6, learningChain: 10, reports: 1 })
  console.log(`tutor smoke passed: ${JSON.stringify(counts)}`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopServer()
  await stopMockUpstream()
  rmSync(smokeRoot, { recursive: true, force: true })
}
