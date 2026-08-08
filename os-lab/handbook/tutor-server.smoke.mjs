import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const smokeRoot = mkdtempSync(path.join(tmpdir(), 'os-lab-tutor-smoke-'))
const dbPath = path.join(smokeRoot, 'learning.db')
const knowledgeDbPath = path.join(smokeRoot, 'knowledge.db')
const knowledgeUploadRoot = path.join(smokeRoot, 'knowledge-uploads')
const dataDir = path.join(smokeRoot, 'student-data')
const studentsRoot = path.join(smokeRoot, 'student-labs')
const teacherFile = path.join(smokeRoot, 'teacher.json')
const factoryCatalogPath = path.join(smokeRoot, 'factory-published.json')
const factoryReleaseRoot = path.join(smokeRoot, 'factory-releases')
const factoryRunRoot = path.join(smokeRoot, 'factory-runs')
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
    const payload = JSON.parse(raw)
    mockChatRequests.push(payload)
    if (payload.messages?.some((message) => String(message.content || '').includes('offline fallback check'))) {
      response.statusCode = 503
      response.end(JSON.stringify({ error: { message: 'mock upstream down' } }))
      return
    }
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
    OS_LAB_KNOWLEDGE_DB_PATH: knowledgeDbPath,
    OS_LAB_KNOWLEDGE_UPLOAD_ROOT: knowledgeUploadRoot,
    OS_LAB_STUDENT_DATA_ROOT: dataDir,
    OS_LAB_TUTOR_PORT: String(port),
    OS_LAB_STUDENTS_ROOT: studentsRoot,
    OS_LAB_TEACHER_FILE: teacherFile,
    OS_LAB_BACKUP_ROOT: path.join(smokeRoot, 'backups'),
    OS_LAB_FACTORY_CATALOG_PATH: factoryCatalogPath,
    OS_LAB_FACTORY_RELEASE_ROOT: factoryReleaseRoot,
    OS_LAB_FACTORY_DATA_DIR: factoryRunRoot,
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

async function postJson(pathname, headers, body = {}) {
  return fetch(`${endpoint}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function runLab(headers, sessionId) {
  const response = await postJson('/run', { Accept: 'text/event-stream', ...headers }, {
    labId: 'lab2',
    sessionId,
  })
  assert.equal(response.status, 200)
  return parseSseFrames(await response.text())
}

try {
  await waitForServer()
  const earlyTeacher = await fetch(`${endpoint}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((response) => response.json())
  assert.equal(earlyTeacher.ok, true)
  const earlyTeacherHeaders = { Authorization: `Bearer ${earlyTeacher.token}` }
  const createClass = await postJson('/teacher/config', earlyTeacherHeaders, {
    scope: { type: 'class', id: '计科2301' },
    createClass: true,
  })
  assert.equal(createClass.status, 200)

  const noClassRegistration = await postJson('/auth/register', {}, {
    username: 'member-c-no-class',
    password: 'secret1',
  }).then((response) => response.json())
  assert.equal(noClassRegistration.ok, false)
  assert.match(noClassRegistration.error, /班级/)
  const badClassRegistration = await postJson('/auth/register', {}, {
    username: 'member-c-bad-class',
    password: 'secret1',
    className: '不存在班级',
  }).then((response) => response.json())
  assert.equal(badClassRegistration.ok, false)
  assert.match(badClassRegistration.error, /班级/)
  const registration = await fetch(`${endpoint}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'member-c-smoke', password: 'secret1', className: '计科2301' }),
  }).then((response) => response.json())
  assert.equal(registration.ok, true)
  const otherRegistration = await postJson('/auth/register', {}, {
    username: 'member-c-smoke-2',
    password: 'secret2',
    className: '计科2301',
  }).then((response) => response.json())
  assert.equal(otherRegistration.ok, true)

  const unauthenticatedManual = await fetch(`${endpoint}/manual?labId=lab1`)
  assert.equal(unauthenticatedManual.status, 401)

  const studentHeaders = { Authorization: `Bearer ${registration.token}` }
  const otherStudentHeaders = { Authorization: `Bearer ${otherRegistration.token}` }
  const initialAccess = await fetch(`${endpoint}/learning/access`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.equal(initialAccess.labs.find((lab) => lab.labId === 'lab1').unlocked, true)
  assert.equal(initialAccess.labs.find((lab) => lab.labId === 'lab2').unlocked, false)

  const lab1Manual = await fetch(`${endpoint}/manual?labId=lab1`, { headers: studentHeaders })
  assert.equal(lab1Manual.status, 200)
  assert.match((await lab1Manual.json()).content, /Lab1/)
  assert.equal((await fetch(`${endpoint}/manual?labId=lab2`, { headers: studentHeaders })).status, 403)

  const lab1Upgrade = await postJson('/scaffold/upgrade', studentHeaders)
  assert.equal(lab1Upgrade.status, 200)
  assert.equal((await lab1Upgrade.json()).lab, 'lab1')
  const otherLab1Upgrade = await postJson('/scaffold/upgrade', otherStudentHeaders)
  assert.equal(otherLab1Upgrade.status, 200)
  assert.equal((await otherLab1Upgrade.json()).lab, 'lab1')

  const teacher = await fetch(`${endpoint}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((response) => response.json())
  assert.equal(teacher.ok, true)
  const teacherHeaders = { Authorization: `Bearer ${teacher.token}` }
  assert.equal((await fetch(`${endpoint}/teacher/lab-factory?labId=lab3`, { headers: studentHeaders })).status, 401)
  assert.equal((await fetch(`${endpoint}/teacher/knowledge/tree`, { headers: studentHeaders })).status, 401)

  const knowledgeUpload = await fetch(`${endpoint}/teacher/knowledge/sources`, {
    method: 'POST',
    headers: {
      ...teacherHeaders,
      'Content-Type': 'text/markdown',
      'X-Knowledge-Filename': encodeURIComponent('scheduler-notes.md'),
      'X-Knowledge-Title': encodeURIComponent('调度观察补充讲义'),
    },
    body: '# 调度观察\n\ntask_switch 调度器会记录 from、to 和 reason，学生应先根据 trace 提出因果解释。\n',
  })
  const knowledgeUploadRaw = await knowledgeUpload.text()
  assert.equal(knowledgeUpload.status, 201, knowledgeUploadRaw)
  const uploadedKnowledge = JSON.parse(knowledgeUploadRaw)
  assert.equal(uploadedKnowledge.upload.status, 'pending-review')
  assert.equal(uploadedKnowledge.source.defaultClass, 'teacher-only')
  const uploadedVersion = uploadedKnowledge.source.versions[0]
  assert.equal(uploadedVersion.scopeSuggestions.some((item) => item.labId === 'lab2'), true)
  const uploadedChunksResponse = await fetch(`${endpoint}/teacher/knowledge/chunks?sourceId=${uploadedKnowledge.upload.sourceId}&includeInactive=true`, { headers: teacherHeaders })
  const uploadedChunksPayload = await uploadedChunksResponse.json()
  assert.equal(uploadedChunksPayload.ok, true)
  assert.equal(uploadedChunksPayload.total, uploadedChunksPayload.chunks.length)
  assert.equal(uploadedChunksPayload.limit, 100)
  assert.equal(uploadedChunksPayload.offset, 0)
  const uploadedChunks = uploadedChunksPayload.chunks
  const uploadedChunk = uploadedChunks[0]
  assert.equal(uploadedChunk.active, false)
  const reviewedKnowledge = await postJson('/teacher/knowledge/review', teacherHeaders, {
    sourceId: uploadedKnowledge.upload.sourceId,
    versionId: uploadedVersion.id,
    labScopes: ['lab2'],
    contentClass: 'guided-hint',
    licenseStatus: 'platform-owned',
    answerRiskReviewed: true,
    note: '只用于引导学生解释 trace。',
  })
  assert.equal(reviewedKnowledge.status, 200)
  const publishedKnowledge = await postJson('/teacher/knowledge/publish', teacherHeaders, {
    sourceId: uploadedKnowledge.upload.sourceId,
    versionId: uploadedVersion.id,
  })
  assert.equal(publishedKnowledge.status, 200)
  const teacherHybridSearch = await fetch(`${endpoint}/teacher/knowledge/search?q=scheduler&labId=lab2`, {
    headers: teacherHeaders,
  }).then((response) => response.json())
  assert.equal(teacherHybridSearch.ok, true)
  assert.equal(teacherHybridSearch.chunks.length > 0, true)
  assert.equal(teacherHybridSearch.retrieval.vectorCandidates > 0, true)
  const factoryValidation = await postJson('/teacher/lab-factory/validate', teacherHeaders, {
    labId: 'lab3',
    variant: 'debug',
  })
  assert.equal(factoryValidation.status, 200)
  const factoryPayload = await factoryValidation.json()
  assert.equal(factoryPayload.stage, 'dry-run')
  assert.equal(factoryPayload.variants[0].variant, 'debug')
  for (const variant of ['unknown', 'random']) {
    const rejectedAssignment = await postJson('/teacher/config', teacherHeaders, {
      assignment: { labId: 'lab2', variant },
    })
    assert.equal(rejectedAssignment.status, 400)
  }
  const factoryTest = await postJson('/teacher/lab-factory/test', teacherHeaders, {
    labId: 'lab3',
    variant: 'debug',
  })
  const factoryTestPayload = await factoryTest.json()
  assert.equal(factoryTest.status, 200, JSON.stringify(factoryTestPayload, null, 2))
  assert.equal(factoryTestPayload.ok, true)
  assert.equal(factoryTestPayload.isolated, true)
  const factoryPublish = await postJson('/teacher/lab-factory/publish', teacherHeaders, {
    labId: 'lab3',
    testRunId: factoryTestPayload.runId,
    approved: true,
    approvalNote: 'smoke：隔离测试通过，批准发布到测试账号。',
  })
  assert.equal(factoryPublish.status, 200)
  const factoryPublishPayload = await factoryPublish.json()
  assert.equal(factoryPublishPayload.ok, true)
  assert.equal(factoryPublishPayload.labId, 'lab3')
  assert.equal(
    (await fetch(`${endpoint}/manual?labId=lab8`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
    })).status,
    200,
  )

  // 模拟 Lab1 已产生可信验证；复盘仍通过公开事件接口提交。
  const evidenceDb = new DatabaseSync(dbPath)
  const student = evidenceDb.prepare('SELECT id FROM users WHERE username = ?').get('member-c-smoke')
  const otherStudent = evidenceDb.prepare('SELECT id FROM users WHERE username = ?').get('member-c-smoke-2')
  const insertVerifiedLab1 = evidenceDb.prepare(
    `INSERT INTO runs
      (id, user_id, learning_session_id, lab_id, recipe_id, command_json, workspace_version,
       trusted, status, started_at, finished_at, exit_code, verified)
     VALUES (?, ?, ?, 'lab1', 'lab1.verify.v1', '[]', 'smoke-workspace', 1, 'finished', ?, ?, 0, 1)`,
  )
  insertVerifiedLab1.run(
    '22222222-2222-4222-8222-222222222222',
    student.id,
    'smoke-lab1-session',
    '2026-07-28T00:00:00.000Z',
    '2026-07-28T00:00:01.000Z',
  )
  insertVerifiedLab1.run(
    '33333333-3333-4333-8333-333333333333',
    otherStudent.id,
    'smoke-lab1-session-2',
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
  const otherReflection = await postJson('/events', otherStudentHeaders, {
    event: {
      version: 1,
      id: 'smoke-lab1-reflection-2',
      sessionId: 'smoke-lab1-session-2',
      labId: 'lab1',
      timestamp: '2026-07-28T00:00:02.000Z',
      type: 'reflection_submitted',
      stage: 'reflect',
      content: '我用输出断言验证了启动链。',
    },
  })
  assert.equal(otherReflection.status, 202)
  const progressedAccess = await fetch(`${endpoint}/learning/access`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.equal(progressedAccess.labs.find((lab) => lab.labId === 'lab2').unlocked, false)
  assert.equal(progressedAccess.labs.find((lab) => lab.labId === 'lab2').state, 'waiting_teacher')
  assert.equal((await fetch(`${endpoint}/manual?labId=lab2`, { headers: studentHeaders })).status, 403)

  const distributeLab2 = await postJson('/teacher/config', teacherHeaders, {
    scope: { type: 'global', id: '' },
    openLab: 'lab2',
    assignment: { labId: 'lab2', variant: 'fill' },
  })
  assert.equal(distributeLab2.status, 200)
  const distributedAccess = await fetch(`${endpoint}/learning/access`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.equal(distributedAccess.labs.find((lab) => lab.labId === 'lab2').unlocked, true)
  assert.equal((await fetch(`${endpoint}/manual?labId=lab2`, { headers: studentHeaders })).status, 200)

  const lab2Upgrade = await postJson('/scaffold/upgrade', studentHeaders, { variant: 'fill' })
  assert.equal(lab2Upgrade.status, 200)
  assert.equal((await lab2Upgrade.json()).lab, 'lab2')
  const otherLab2Upgrade = await postJson('/scaffold/upgrade', otherStudentHeaders, { variant: 'fill' })
  assert.equal(otherLab2Upgrade.status, 200)
  assert.equal((await otherLab2Upgrade.json()).lab, 'lab2')

  const fsStatus = await fetch(`${endpoint}/fs/status?labId=lab2`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.match(fsStatus.workspaceVersion, /^sha256:[a-f0-9]{64}$/)
  const taskStatus = fsStatus.files.find((file) => file.path === 'kernel/src/task.rs')
  assert.equal(taskStatus.status, 'todo')
  assert.match(taskStatus.baselineHash, /^[a-f0-9]{64}$/)
  const generatedManifest = await fetch(`${endpoint}/fs/file?path=kernel%2FCargo.toml`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.match(generatedManifest.content, /trace-edu = \[\]/)

  const correctTask = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kernel', 'src', 'task.rs'),
    'utf8',
  )
  const compileMarker = 'm1 smoke diagnostic'
  const brokenSave = await postJson('/fs/save', studentHeaders, {
    path: 'kernel/src/task.rs',
    content: `${correctTask}\ncompile_error!("${compileMarker}");\n`,
  })
  assert.equal(brokenSave.status, 200)

  const brokenFrames = await runLab(studentHeaders, 'smoke-broken-session')
  const brokenRun = brokenFrames.find((frame) => frame.type === 'run')
  const brokenExit = brokenFrames.find((frame) => frame.type === 'exit')
  const brokenOutput = brokenFrames.filter((frame) => frame.type === 'output').map((frame) => frame.text).join('')
  assert.equal(brokenExit.verified, false)
  assert.notEqual(brokenExit.code, 0)
  const diagnosticResponse = await fetch(
    `${endpoint}/run/diagnostics?runId=${encodeURIComponent(brokenRun.runId)}`,
    { headers: studentHeaders },
  )
  assert.equal(diagnosticResponse.status, 200)
  const diagnosticPayload = await diagnosticResponse.json()
  assert.equal(diagnosticPayload.runId, brokenRun.runId)
  assert.equal(
    diagnosticPayload.diagnostics.some((item) => item.message.includes(compileMarker)),
    true,
    `${JSON.stringify(diagnosticPayload.diagnostics)}\n${brokenOutput.slice(-5000)}`,
  )
  assert.equal(
    diagnosticPayload.diagnostics.some((item) => item.file === 'kernel/src/task.rs'),
    true,
    JSON.stringify(diagnosticPayload.diagnostics),
  )
  const openedDiagnostic = diagnosticPayload.diagnostics.find((item) => item.file === 'kernel/src/task.rs')
  const diagnosticOpened = await postJson('/events', studentHeaders, {
    event: {
      version: 2,
      id: 'smoke-diagnostic-opened',
      sessionId: 'smoke-broken-session',
      labId: 'lab2',
      timestamp: '2026-07-29T00:00:03.000Z',
      type: 'diagnostic_opened',
      stage: 'debug',
      runId: brokenRun.runId,
      file: openedDiagnostic.file,
      line: openedDiagnostic.line,
      code: openedDiagnostic.code,
    },
  })
  assert.equal(diagnosticOpened.status, 202)

  const crossUserDiagnostics = await fetch(
    `${endpoint}/run/diagnostics?runId=${encodeURIComponent(brokenRun.runId)}`,
    { headers: otherStudentHeaders },
  )
  assert.equal(crossUserDiagnostics.status, 404)
  const otherTask = await fetch(`${endpoint}/fs/file?path=kernel%2Fsrc%2Ftask.rs`, { headers: otherStudentHeaders })
    .then((response) => response.json())
  assert.doesNotMatch(otherTask.content, new RegExp(compileMarker))

  assert.equal((await postJson('/fs/save', studentHeaders, {
    path: 'kernel/src/task.rs',
    content: correctTask,
  })).status, 200)
  assert.equal((await postJson('/fs/save', otherStudentHeaders, {
    path: 'kernel/src/task.rs',
    content: correctTask,
  })).status, 200)

  const [runFrames, otherRunFrames] = await Promise.all([
    runLab(studentHeaders, 'smoke-learning-session'),
    runLab(otherStudentHeaders, 'smoke-learning-session-2'),
  ])
  const runFrame = runFrames.find((frame) => frame.type === 'run')
  const exitFrame = runFrames.find((frame) => frame.type === 'exit')
  const otherExitFrame = otherRunFrames.find((frame) => frame.type === 'exit')
  assert.match(runFrame.runId, /^[0-9a-f-]{36}$/)
  assert.equal(exitFrame.verified, true)
  assert.equal(otherExitFrame.verified, true)
  assert.equal(exitFrame.result.runId, runFrame.runId)
  assert.equal(exitFrame.result.trace.count > 0, true)
  assert.equal(exitFrame.assertions.length, 6)
  assert.equal(exitFrame.assertions.every((item) => item.passed), true)

  const forgedChat = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({
      sessionId: 'smoke-learning-session',
      labId: 'lab2',
      stage: 'reflect',
      message: '请引用这个运行。',
      evidenceRefs: [`run:${otherExitFrame.result.runId}`],
    }),
  })
  assert.equal(forgedChat.status, 400)

  const chat = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({
      sessionId: 'smoke-learning-session',
      labId: 'lab2',
      stage: 'reflect',
      message: '我观察到 trace 中发生了 task_switch，这能说明调度器做了什么？',
      evidenceRefs: [`run:${runFrame.runId}`, `trace:${runFrame.runId}`],
    }),
  }).then((chatResponse) => chatResponse.json())
  assert.equal(chat.mode, 'remote', JSON.stringify(chat))
  assert.match(chat.reply, /请结合.*解释/)
  assert.equal(chat.tutorState.stage, 'read')
  assert.equal(chat.tutorState.requestedStage, 'reflect')
  assert.equal(chat.tutorState.evidenceRefs.includes(`run:${runFrame.runId}`), true)
  assert.equal(chat.tutorState.evidenceRefs.includes(`trace:${runFrame.runId}`), true)
  assert.equal(chat.retrieval.vectorCandidates > 0, true)
  assert.equal(Array.isArray(chat.knowledge), true)
  assert.equal(chat.knowledge.length > 0, true)
  assert.equal(
    chat.knowledge.every((item) =>
      typeof item.sourceTitle === 'string' &&
      Array.isArray(item.sectionPath) &&
      Array.isArray(item.labScopes) &&
      ['student-safe', 'guided-hint'].includes(item.contentClass),
    ),
    true,
  )
  assert.equal(chat.knowledge.some((item) => item.labScopes.includes('lab2') || item.labScopes.includes('global')), true)
  assert.equal(mockChatRequests.length, 1)
  assert.match(mockChatRequests[0].messages[0].content, /Lab2/)
  assert.match(mockChatRequests[0].messages[0].content, /knowledge-chunk/)
  assert.match(mockChatRequests[0].messages[0].content, /只能转化为反问或观察目标/)

  const savedConversation = await fetch(`${endpoint}/conversations/mine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({
      conversation: {
        sessionId: 'smoke-learning-session',
        labId: 'lab2',
        stage: 'read',
        messages: [{ id: 'saved-message', role: 'student', stage: 'read', content: 'cross-device restore', timestamp: '2026-08-07T00:00:00.000Z' }],
        tutorState: chat.tutorState,
      },
    }),
  })
  assert.equal(savedConversation.status, 200)
  const loadedConversation = await fetch(`${endpoint}/conversations/mine?labId=lab2`, { headers: studentHeaders })
  assert.equal(loadedConversation.status, 200)
  assert.equal((await loadedConversation.json()).conversation.messages[0].content, 'cross-device restore')

  const offlineChatResponse = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...studentHeaders },
    body: JSON.stringify({
      sessionId: 'smoke-learning-session',
      labId: 'lab2',
      stage: 'read',
      message: 'offline fallback check sepc',
      evidenceRefs: [],
    }),
  })
  assert.equal(offlineChatResponse.status, 200)
  const offlineFrames = parseSseFrames(await offlineChatResponse.text())
  const offlineDone = offlineFrames.find((frame) => frame.type === 'done')
  assert.equal(offlineDone.mode, 'offline')
  assert.equal(offlineDone.model, 'offline-tutor')
  assert.match(offlineDone.reply, /sepc|trap/i)
  assert.ok(offlineDone.tutorState?.stage)
  assert.ok(offlineDone.retrieval)
  assert.equal(mockChatRequests.length, 2)

  const removedKnowledge = await fetch(`${endpoint}/teacher/knowledge/chunk?id=${encodeURIComponent(uploadedChunk.id)}`, {
    method: 'DELETE', headers: teacherHeaders,
  })
  assert.equal(removedKnowledge.status, 200)
  assert.equal((await removedKnowledge.json()).chunk.active, false)
  const visibleAfterRemoval = await fetch(`${endpoint}/teacher/knowledge/chunks?sourceId=${uploadedKnowledge.upload.sourceId}&retrievableOnly=true`, {
    headers: teacherHeaders,
  }).then((response) => response.json())
  assert.equal(visibleAfterRemoval.chunks.length, 0)

  const runId = runFrame.runId
  const traceResponse = await fetch(`${endpoint}/runs/${encodeURIComponent(runId)}/trace?offset=0&limit=2`, {
    headers: studentHeaders,
  })
  assert.equal(traceResponse.status, 200)
  const tracePayload = await traceResponse.json()
  assert.equal(tracePayload.integrity.valid, true)
  assert.equal(tracePayload.total, exitFrame.result.trace.count)
  assert.equal(tracePayload.events.length, Math.min(2, tracePayload.total))
  assert.equal(
    (await fetch(`${endpoint}/runs/${encodeURIComponent(runId)}/trace`, { headers: otherStudentHeaders })).status,
    404,
  )

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
  const crossUserTraceEvent = await postJson('/events', otherStudentHeaders, {
    event: { ...learningEvents[5], id: 'smoke-cross-user-trace' },
  })
  assert.equal(crossUserTraceEvent.status, 400)
  const eventSync = await fetch(`${endpoint}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ events: learningEvents }),
  })
  assert.equal(eventSync.status, 202)
  assert.equal((await eventSync.json()).accepted, learningEvents.length)

  const blockedLab3Upgrade = await postJson('/scaffold/upgrade', studentHeaders, { variant: 'debug' })
  assert.equal(blockedLab3Upgrade.status, 403)

  const distributeLab3 = await postJson('/teacher/config', teacherHeaders, {
    scope: { type: 'global', id: '' },
    openLab: 'lab3',
    assignment: { labId: 'lab3', variant: 'debug' },
  })
  assert.equal(distributeLab3.status, 200)

  const lab3Upgrade = await postJson('/scaffold/upgrade', studentHeaders, { variant: 'debug' })
  assert.equal(lab3Upgrade.status, 200)
  const lab3UpgradePayload = await lab3Upgrade.json()
  assert.equal(lab3UpgradePayload.lab, 'lab3')
  assert.equal(lab3UpgradePayload.status.variants.lab3, 'debug')
  const issuedLab3 = await fetch(`${endpoint}/fs/file?path=kernel%2Fsrc%2Fmm.rs`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.match(issuedLab3.content, /PLANTED BUG: preserve R\/W\/X but strip U/)

  const lab3BrokenSave = await postJson('/fs/save', studentHeaders, {
    path: 'kernel/src/mm.rs',
    content: `${issuedLab3.content}\n// smoke reset marker\n`,
  })
  assert.equal(lab3BrokenSave.status, 200)
  const lab3Reset = await postJson('/fs/reset', studentHeaders, { labId: 'lab3' })
  assert.equal(lab3Reset.status, 200)
  const lab3ResetPayload = await lab3Reset.json()
  assert.equal(lab3ResetPayload.ok, true)
  assert.equal(lab3ResetPayload.count > 0, true)
  const resetLab3 = await fetch(`${endpoint}/fs/file?path=kernel%2Fsrc%2Fmm.rs`, { headers: studentHeaders })
    .then((response) => response.json())
  assert.match(resetLab3.content, /PLANTED BUG: preserve R\/W\/X but strip U/)
  assert.doesNotMatch(resetLab3.content, /smoke reset marker/)

  const assessmentResponse = await postJson('/assessment', studentHeaders, {
    sessionId: 'smoke-learning-session',
    labId: 'lab2',
  })
  assert.equal(assessmentResponse.status, 200)
  const assessmentPayload = await assessmentResponse.json()
  assert.equal(assessmentPayload.assessment.version, 'rubric-v2.0.0')
  assert.equal(assessmentPayload.assessment.items.length, 14)
  assert.equal(assessmentPayload.reviewGates.requiresReview, true)
  assert.equal(assessmentPayload.review.status, 'pending')
  assert.equal(
    assessmentPayload.assessment.items.find((item) => item.id === 'R3').evidenceRefs.includes(`run:${runId}`),
    true,
  )
  const masteryPayload = await fetch(`${endpoint}/mastery`, { headers: studentHeaders }).then((response) => response.json())
  assert.equal(masteryPayload.mastery.length, 4)

  assert.equal((await fetch(`${endpoint}/teacher/reviews`, { headers: studentHeaders })).status, 401)
  const reviewPayload = await fetch(`${endpoint}/teacher/reviews?status=pending`, { headers: teacherHeaders })
    .then((response) => response.json())
  assert.equal(reviewPayload.reviews.length, 1)
  assert.equal(reviewPayload.reviews[0].assessmentId, assessmentPayload.assessmentId)
  const teacherReview = await postJson('/teacher/review', teacherHeaders, {
    reviewId: assessmentPayload.review.reviewId,
    decision: 'corrected',
    rationale: '复核运行与 trace 后修正反思维度',
    evidenceRefs: [`run:${runId}`],
    correctedResult: { total: 90, dimensions: { process: 90, result: 100, reflection: 70 } },
  })
  assert.equal(teacherReview.status, 200)
  assert.equal((await teacherReview.json()).revision, 1)
  const reviewed = await fetch(`${endpoint}/teacher/reviews`, { headers: teacherHeaders }).then((response) => response.json())
  assert.equal(reviewed.reviews[0].automaticResult.total, assessmentPayload.assessment.total)
  assert.equal(reviewed.reviews[0].decisions[0].correctedResult.total, 90)

  assert.equal((await fetch(`${endpoint}/teacher/trial/analysis`, { headers: studentHeaders })).status, 401)
  const trialAnalysis = await fetch(`${endpoint}/teacher/trial/analysis?participants=true`, { headers: teacherHeaders })
    .then((response) => response.json())
  assert.equal(trialAnalysis.analysis.cohortSize, 2)
  assert.deepEqual(trialAnalysis.analysis.participants, [])
  assert.equal(trialAnalysis.analysis.privacy.participantRowsIncluded, false)
  assert.equal(trialAnalysis.analysis.labs.lab2.verifiedParticipants, 2)
  const backupResponse = await postJson('/teacher/trial/backup', teacherHeaders)
  assert.equal(backupResponse.status, 200)
  const backupPayload = await backupResponse.json()
  assert.equal(backupPayload.manifest.integrity, 'ok')
  assert.equal(backupPayload.manifest.counts.assessments, 1)

  const reportContent = `# Lab2 报告\n\n可信运行：run:${runId}\n\nTrace：trace:${runId}\n\n${learningEvents[6].content}`
  const reportSubmit = await fetch(`${endpoint}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ labId: 'lab2', content: reportContent }),
  })
  assert.equal(reportSubmit.status, 200)

  const reportDraft = await fetch(`${endpoint}/reports/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...studentHeaders },
    body: JSON.stringify({ labId: 'lab2', draft: { mode: 'markdown', sections: {}, markdownBody: 'server draft' } }),
  })
  assert.equal(reportDraft.status, 200)
  const loadedDraft = await fetch(`${endpoint}/reports/draft?labId=lab2`, { headers: studentHeaders })
  assert.equal(loadedDraft.status, 200)
  assert.equal((await loadedDraft.json()).draft.markdownBody, 'server draft')
  assert.equal(readFileSync(path.join(dataDir, '2', 'reports', 'lab2', 'draft.json'), 'utf8').includes('server draft'), true)
  assert.equal(readFileSync(path.join(dataDir, '2', 'reports', 'lab2', 'submission.md'), 'utf8').includes('Lab2'), true)
  assert.equal(readFileSync(path.join(dataDir, '2', 'conversations', 'smoke-learning-session.json'), 'utf8').includes('cross-device restore'), true)

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
    diagnostics: db.prepare('SELECT count(*) AS value FROM run_diagnostics').get().value,
    diagnosticOpens: db.prepare("SELECT count(*) AS value FROM events WHERE type = 'diagnostic_opened'").get().value,
    learningChain: db.prepare("SELECT count(*) AS value FROM events WHERE session_id = 'smoke-learning-session'").get().value,
    serverStages: db.prepare("SELECT count(*) AS value FROM events WHERE session_id = 'smoke-learning-session' AND type = 'stage_enter'").get().value,
    tutorSessions: db.prepare("SELECT count(*) AS value FROM tutor_sessions WHERE session_id = 'smoke-learning-session'").get().value,
    assessments: db.prepare("SELECT count(*) AS value FROM assessments WHERE session_id = 'smoke-learning-session'").get().value,
    mastery: db.prepare('SELECT count(*) AS value FROM mastery_evidence').get().value,
    reviews: db.prepare('SELECT count(*) AS value FROM review_queue').get().value,
    reviewDecisions: db.prepare('SELECT count(*) AS value FROM review_decisions').get().value,
    teacherReviews: db.prepare("SELECT count(*) AS value FROM events WHERE type = 'teacher_reviewed'").get().value,
    reports: db.prepare("SELECT count(*) AS value FROM reports WHERE lab_id = 'lab2'").get().value,
    factoryPublishes: Object.keys(JSON.parse(readFileSync(factoryCatalogPath, 'utf8')).labs || {}).length,
    issuedLabs: JSON.parse(readFileSync(path.join(studentsRoot, 'member-c-smoke', '.scaffold-state.json'), 'utf8')).applied.length,
  }
  db.close()
  assert.equal(counts.runs, 4)
  assert.equal(counts.events, 6)
  assert.equal(counts.assertions, 12)
  assert.equal(counts.diagnostics > 0, true)
  assert.equal(counts.diagnosticOpens, 1)
  assert.equal(counts.learningChain, 12)
  assert.equal(counts.serverStages, 1)
  assert.equal(counts.tutorSessions, 1)
  assert.equal(counts.assessments, 1)
  assert.equal(counts.mastery, 4)
  assert.equal(counts.reviews, 1)
  assert.equal(counts.reviewDecisions, 1)
  assert.equal(counts.teacherReviews, 1)
  assert.equal(counts.reports, 1)
  assert.equal(counts.factoryPublishes, 1)
  assert.equal(counts.issuedLabs, 3)
  console.log(`tutor smoke passed: ${JSON.stringify(counts)}`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopServer()
  await stopMockUpstream()
  rmSync(smokeRoot, { recursive: true, force: true })
}
