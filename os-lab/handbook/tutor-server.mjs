import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { scoreLearningEvents } from '../learning/rubric.mjs'
import {
  EXERCISES,
  LAB_ORDER,
  addUserBin,
  applyNext,
  effectiveConfigFor,
  listStudents,
  readTeacherConfig,
  sanitizeUser,
  scaffoldStatus,
  studentRootFor,
  writeAssignment,
  writeTeacherConfig,
} from '../scripts/scaffold.mjs'
import {
  changePassword,
  listAllReports,
  listMyReports,
  listUsers,
  login,
  logout,
  register,
  resolveSession,
  setReportFeedback,
  submitReport,
} from '../learning/db.mjs'

const handbookRoot = path.dirname(fileURLToPath(import.meta.url))
const promptRoot = path.resolve(handbookRoot, '..', 'tutor', 'prompts')
const osLabRoot = path.resolve(handbookRoot, '..')

/** 该学生的生效教学配置（学生覆盖 > 班级覆盖 > 全局）。 */
async function effectiveFor(session) {
  const config = await readTeacherConfig()
  return effectiveConfigFor(config, session?.username || '', session?.className || '')
}

/** 从请求头解析登录会话（Authorization: Bearer <token> 或 X-Auth-Token）。 */
function sessionOf(request) {
  const auth = String(request.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(request.headers['x-auth-token'] || '')
  return resolveSession(token)
}

/**
 * 账号制工作区：带 user（学号/昵称）且该生已初始化时，终端与代码读写都指向
 * student-labs/<user>/；否则回落参考实现 os-lab（教师/游客视角，只读）。
 */
async function resolveWorkRoot(user) {
  const safe = sanitizeUser(user)
  if (safe) {
    const status = await scaffoldStatus(safe)
    if (status.ok && status.exists) {
      return { root: studentRootFor(safe), name: `student-labs/${safe}`, user: safe }
    }
  }
  return { root: osLabRoot, name: 'os-lab', user: null }
}

/**
 * 模型接入（baseUrl/model/apiKey）由前端工作台的设置界面按请求传入（body.llm）；
 * 这里的默认值只在前端未配置时兜底。环境变量属于服务端运维项（端口、数据目录、CORS）。
 */
const port = Number(process.env.OS_LAB_TUTOR_PORT || 8787)
const defaultUpstream = (process.env.OS_LAB_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, '')
const defaultModel = process.env.OS_LAB_LLM_MODEL || 'qwen2.5:7b'
const defaultApiKey = process.env.OS_LAB_LLM_API_KEY || ''
// 学习事件默认落在仓库内（gitignore），而不是系统临时目录——临时目录会被清理，
// 真实学生实验的数据不能放在那里。
const dataDir =
  process.env.OS_LAB_TUTOR_DATA_DIR || path.resolve(handbookRoot, '..', 'learning', 'sessions')
const allowedOrigins = new Set(
  (process.env.OS_LAB_TUTOR_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

/**
 * 模型接入的三层解析：学生自配（教师允许时）> 教师统一配置（teacher.json）> 环境默认。
 * 教师在控制台关闭「允许学生自配」后，学生传来的 llm 被忽略，全班统一走教师配置。
 */
async function resolveLlm(studentLlm) {
  const clean = (value, max) =>
    typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
  const pickUrl = (llm) => {
    const baseUrl = clean(llm?.baseUrl, 200)
    return /^https?:\/\//.test(baseUrl) ? baseUrl.replace(/\/$/, '') : ''
  }
  const teacher = await readTeacherConfig()
  const student = teacher.allowStudentLlm ? studentLlm : null
  return {
    upstream: pickUrl(student) || pickUrl(teacher.llm) || defaultUpstream,
    model: clean(student?.model, 200) || clean(teacher.llm?.model, 200) || defaultModel,
    apiKey: clean(student?.apiKey, 500) || clean(teacher.llm?.apiKey, 500) || defaultApiKey,
    studentLlmAllowed: teacher.allowStudentLlm,
  }
}

const stageIds = new Set(['orient', 'read', 'run', 'debug', 'reflect'])
const labIds = new Set(['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8'])
const labLabels = {
  lab1: 'Lab1 裸机启动与 SBI',
  lab2: 'Lab2 Trap 与任务切换',
  lab3: 'Lab3 内存与虚拟内存',
  lab4: 'Lab4 进程管理',
  lab5: 'Lab5 文件系统与并发',
  lab6: 'Lab6 磁盘文件系统',
  lab7: 'Lab7 IPC 与信号',
  lab8: 'Lab8 线程与同步',
}
const promptFiles = {
  system: path.join(promptRoot, 'system.md'),
  guardrails: path.join(promptRoot, 'guardrails.yaml'),
}

async function readPrompt(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

const [systemPrompt, guardrailSource] = await Promise.all([
  readPrompt(promptFiles.system),
  readPrompt(promptFiles.guardrails),
])
const labPrompts = Object.fromEntries(
  await Promise.all(
    [...labIds].map(async (labId) => [
      labId,
      await readPrompt(path.join(promptRoot, labId, 'context.md')),
    ]),
  ),
)
const sharedStagePrompts = Object.fromEntries(
  await Promise.all(
    [...stageIds].map(async (stage) => [stage, await readPrompt(path.join(promptRoot, 'stages', `stage-${stage}.md`))]),
  ),
)
const lab2StagePrompts = Object.fromEntries(
  await Promise.all(
    [...stageIds].map(async (stage) => [stage, await readPrompt(path.join(promptRoot, 'lab2', `stage-${stage}.md`))]),
  ),
)
const guardrails = parseYaml(guardrailSource)?.rules || []

function json(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || Array.from(allowedOrigins)[0] || '*',
    // Authorization 必须在预检白名单里，否则浏览器直接拦截带登录态的请求。
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  })
  response.end(status === 204 ? undefined : JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 256_000) {
        reject(new Error('请求内容超过 256 KiB'))
        request.destroy()
      }
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('请求不是合法 JSON'))
      }
    })
    request.on('error', reject)
  })
}

function resolveOrigin(origin) {
  if (!origin) return Array.from(allowedOrigins)[0]
  if (allowedOrigins.has(origin)) return origin
  // 本机开发端口不固定（vite 端口被占用会自动 5173 → 5174…），默认放行所有本机来源。
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null
}

function matchGuardrail(message) {
  const normalized = message.toLowerCase().replace(/\s+/g, '')
  return guardrails.find((rule) =>
    rule.patterns?.some((pattern) => normalized.includes(String(pattern).toLowerCase().replace(/\s+/g, ''))),
  )
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .slice(-10)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().slice(0, 2_000),
    }))
    .filter((item) => item.content)
}

/**
 * 学生当前正在读哪一节。工作台左栏会随每次提问上报，
 * 导师因此能说「你刚读到 sscratch 那节」，而不是泛泛地讲 trap。
 */
function readingLayer(reading) {
  const h2 = String(reading?.h2 || '').trim().slice(0, 120)
  const h3 = String(reading?.h3 || '').trim().slice(0, 120)
  if (!h2) return ''
  const where = h3 ? `《${h2}》的「${h3}」` : `《${h2}》`
  return `学生此刻正在实验手册中阅读 ${where}。请优先围绕这一节的内容追问，必要时才引导他前后翻。`
}

function frameworkFor(labId, stage, reading) {
  const safeLabId = labIds.has(labId) ? labId : 'lab2'
  const safeStage = stageIds.has(stage) ? stage : 'orient'
  const hasLabOverride = safeLabId === 'lab2' && lab2StagePrompts[safeStage]
  const stagePrompt = hasLabOverride ? lab2StagePrompts[safeStage] : sharedStagePrompts[safeStage]
  const stageSource = hasLabOverride
    ? `tutor/prompts/lab2/stage-${safeStage}.md`
    : `tutor/prompts/stages/stage-${safeStage}.md`
  const reading_ = readingLayer(reading)
  const layers = [
    { id: 'system', label: '教学边界', source: 'tutor/prompts/system.md' },
    { id: 'lab', label: `${labLabels[safeLabId]} 上下文`, source: `tutor/prompts/${safeLabId}/context.md` },
    { id: 'stage', label: `阶段策略 · ${safeStage}`, source: stageSource },
  ]
  if (reading_) layers.push({ id: 'reading', label: '当前阅读位置', source: 'runtime' })
  return {
    version: 'multi-lab-v2.1',
    labId: safeLabId,
    stage: safeStage,
    layers,
    prompt: [systemPrompt, labPrompts[safeLabId], stagePrompt, reading_]
      .filter(Boolean)
      .join('\n\n---\n\n'),
  }
}

/** 探测上游，返回 { connected, detail }——detail 给前端设置弹窗解释连不上的原因。 */
async function checkUpstream(llm) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6_000)
  try {
    const response = await fetch(`${llm.upstream}/models`, {
      headers: llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {},
      signal: controller.signal,
    })
    if (response.ok) return { connected: true, detail: '' }
    const hint =
      response.status === 401 || response.status === 403
        ? 'API Key 可能不正确'
        : response.status === 404
          ? '接口地址可能不完整（OpenAI 兼容地址一般以 /v1 结尾）'
          : ''
    return {
      connected: false,
      detail: `上游返回 ${response.status}${hint ? `：${hint}` : ''}`,
    }
  } catch (error) {
    const aborted = error?.name === 'AbortError' || String(error?.message || '').includes('abort')
    return {
      connected: false,
      detail: aborted ? '连接上游超时（6 秒），检查网络或地址' : '无法连接上游地址（服务未启动或地址写错）',
    }
  } finally {
    clearTimeout(timer)
  }
}

function validateEvent(event) {
  return Boolean(
    event &&
      event.version === 1 &&
      typeof event.id === 'string' &&
      typeof event.sessionId === 'string' &&
      labIds.has(event.labId) &&
      stageIds.has(event.stage) &&
      typeof event.type === 'string' &&
      !Number.isNaN(Date.parse(event.timestamp)),
  )
}

async function persistEvents(events) {
  await mkdir(dataDir, { recursive: true })
  const groups = new Map()
  for (const event of events) {
    const key = event.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
    groups.set(key, [...(groups.get(key) || []), JSON.stringify(event)])
  }
  await Promise.all(
    [...groups].map(([sessionId, lines]) =>
      appendFile(path.join(dataDir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`, 'utf8'),
    ),
  )
}

function markdownReport(sessionId, score, labId) {
  return `## ${labLabels[labId] || labLabels.lab2} 学习报告（session: ${sessionId}）\n\n- 过程分 ${score.process}/100 | 结果分 ${score.result}/100 | 反思分 ${score.reflection}/100 -> **总分 ${score.total}**\n- 交互 ${score.counts.messages} 次 | 验证 ${score.counts.verifications} 次 | 护栏 ${score.counts.guardrails} 次\n- 建议：${score.summary}`
}

function openEventStream(response, origin) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Access-Control-Allow-Origin': origin || Array.from(allowedOrigins)[0] || '*',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    Vary: 'Origin',
    'X-Accel-Buffering': 'no',
  })
}

function sendFrame(response, frame) {
  response.write(`data: ${JSON.stringify(frame)}\n\n`)
}

/**
 * 把上游的 OpenAI 兼容流转成前端的 SSE 帧。
 * 本地 7B 模型出一段引导要十几秒，不流式的话学生只能盯着三个跳点，
 * 观感和「坏了」没区别。
 */
async function pipeUpstreamStream(upstreamResponse, response) {
  const reader = upstreamResponse.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n')
    buffer = chunks.pop() || ''
    for (const line of chunks) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let payload
      try {
        payload = JSON.parse(data)
      } catch {
        continue
      }
      const delta = payload?.choices?.[0]?.delta?.content
      if (!delta) continue
      reply += delta
      sendFrame(response, { type: 'delta', text: delta })
    }
  }
  return reply
}

async function handleChat(body, request, response, origin) {
  const labId = String(body.labId || '')
  if (!labIds.has(labId)) {
    json(response, 400, { error: 'labId 必须是 lab1 到 lab8 之一' }, origin)
    return
  }
  const stage = stageIds.has(String(body.stage)) ? String(body.stage) : 'orient'
  const message = String(body.message || '').trim()
  if (!message || message.length > 4_000) {
    json(response, 400, { error: 'message 必须为 1-4000 字符' }, origin)
    return
  }

  const framework = frameworkFor(labId, stage, body.reading)
  const guardrail = matchGuardrail(message)

  // 护栏命中是规则判定，没有上游调用，直接整段返回。
  if (guardrail) {
    const responseText = String(guardrail.response || '').replaceAll('Lab2', labLabels[labId].split(' ')[0])
    json(response, 200, {
      reply: responseText,
      mode: 'guardrail',
      framework: { ...framework, prompt: undefined },
      guardrail: { triggered: true, rule: guardrail.id, event: guardrail.event },
    }, origin)
    return
  }

  const llm = await resolveLlm(body.llm)
  const wantsStream = String(request.headers.accept || '').includes('text/event-stream')
  const controller = new AbortController()
  // 超时只用于「连不上上游」；连上后即解除——本地 7B 模型生成长回复
  // 可能远超一分钟，不能把正常的慢当成故障掐断。
  const timer = setTimeout(() => controller.abort(), 30_000)
  // 学生关页/断开时同步终止上游请求（response close 在连接断开或响应结束后触发，
  // 结束后 abort 是无害的空操作）。
  response.on('close', () => controller.abort())

  const upstreamBody = JSON.stringify({
    model: llm.model,
    temperature: 0.3,
    max_tokens: 900,
    stream: wantsStream,
    messages: [
      { role: 'system', content: framework.prompt },
      ...normalizeHistory(body.history),
      { role: 'user', content: message },
    ],
  })

  try {
    const upstreamResponse = await fetch(`${llm.upstream}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {}),
      },
      signal: controller.signal,
      body: upstreamBody,
    })

    // 连接已建立：解除超时，让长回复完整生成。
    clearTimeout(timer)

    if (!upstreamResponse.ok) {
      const payload = await upstreamResponse.json().catch(() => ({}))
      const hint =
        upstreamResponse.status === 429
          ? '（请求太频繁，被上游限流，稍等再发）'
          : upstreamResponse.status === 401 || upstreamResponse.status === 403
            ? '（API Key 可能失效）'
            : ''
      const error = (payload?.error?.message || `上游模型返回 ${upstreamResponse.status}`) + hint
      if (wantsStream) {
        openEventStream(response, origin)
        sendFrame(response, { type: 'error', error })
        response.end()
      } else {
        json(response, 502, { error }, origin)
      }
      return
    }

    if (!wantsStream || !upstreamResponse.body) {
      const payload = await upstreamResponse.json().catch(() => ({}))
      const reply = payload?.choices?.[0]?.message?.content?.trim()
      if (!reply) {
        json(response, 502, { error: '上游模型没有返回文本' }, origin)
        return
      }
      json(response, 200, {
        reply,
        mode: 'remote',
        model: llm.model,
        framework: { ...framework, prompt: undefined },
        guardrail: { triggered: false },
      }, origin)
      return
    }

    openEventStream(response, origin)
    sendFrame(response, { type: 'meta', model: llm.model, triggered: false, framework: framework.version })
    const reply = await pipeUpstreamStream(upstreamResponse, response)
    if (!reply.trim()) sendFrame(response, { type: 'error', error: '上游模型没有返回文本' })
    else sendFrame(response, { type: 'done', reply })
    response.end()
  } catch (error) {
    const raw = error instanceof Error ? error.message : '导师服务发生未知错误'
    const aborted = raw.toLowerCase().includes('abort')
    const detail = aborted ? '连接上游超时（30 秒内未建立连接），检查网络或接口地址' : raw
    if (response.headersSent) {
      sendFrame(response, { type: 'error', error: detail })
      response.end()
      return
    }
    json(response, aborted ? 504 : 502, { error: detail }, origin)
  } finally {
    clearTimeout(timer)
  }
}

/* -- 本机终端：代跑各 Lab 的验证命令 ---------------------------------------- */

/**
 * 前端只传 labId，命令由服务端预置——不接受任意命令串，避免把本机变成
 * 任意命令执行入口。QEMU 的 lab6-8 挂盘参数与 Makefile 保持一致。
 */
function runRecipe(labId) {
  const kernelElf = 'target/riscv64gc-unknown-none-elf/release/kernel'
  const fsImg = 'target/riscv64gc-unknown-none-elf/release/fs.img'
  if (labId === 'lab6' || labId === 'lab7' || labId === 'lab8') {
    return [
      {
        title: `cargo build -p kernel --features ${labId} --release`,
        cmd: 'cargo',
        args: ['build', '-p', 'kernel', '--features', labId, '--release'],
      },
      {
        title: 'qemu-system-riscv64（VirtIO 磁盘）',
        cmd: 'qemu-system-riscv64',
        args: [
          '-machine', 'virt', '-nographic', '-bios', 'default',
          '-drive', `file=${fsImg},if=none,format=raw,id=x0`,
          '-device', 'virtio-blk-device,drive=x0,bus=virtio-mmio-bus.0',
          '-kernel', kernelElf,
        ],
      },
    ]
  }
  return [
    {
      title: `cargo run -p kernel --features ${labId} --release`,
      cmd: 'cargo',
      args: ['run', '-p', 'kernel', '--features', labId, '--release'],
    },
  ]
}

/**
 * 学生可以在终端输入/粘贴自定义命令，但仍不给 shell：
 * 只允许白名单内的可执行程序，禁止链式、重定向、子 shell 与引号，
 * 用 spawn(argv) 直接执行。多行粘贴按行作为多个步骤顺序执行。
 */
const RUN_ALLOWED_BINS = new Set([
  'cargo',
  'make',
  'qemu-system-riscv64',
  'rustc',
  'rustup',
  'rust-objcopy',
])

function parseCommandLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (/[;&|<>`$'"]/.test(trimmed)) {
    return { error: `不支持 shell 语法（; & | < > \` $ 引号）：${trimmed}` }
  }
  const tokens = trimmed.split(/\s+/)
  if (!RUN_ALLOWED_BINS.has(tokens[0])) {
    return { error: `仅允许运行：${[...RUN_ALLOWED_BINS].join(' / ')}（收到 ${tokens[0]}）` }
  }
  return { title: trimmed, cmd: tokens[0], args: tokens.slice(1) }
}

function parseCommandInput(command) {
  const steps = []
  for (const line of String(command).split(/\r?\n/)) {
    const parsed = parseCommandLine(line)
    if (!parsed) continue
    if (parsed.error) return { error: parsed.error }
    steps.push(parsed)
  }
  return steps.length ? { steps } : { error: '命令为空' }
}

/** 同一时间只允许一个运行中的命令；QEMU 卡死由整体超时兜底。 */
let activeRun = null
const RUN_TIMEOUT_MS = 300_000
const RUN_OUTPUT_CAP = 262_144

function killActiveRun(reason) {
  const run = activeRun
  if (!run) return false
  run.stopped = reason || 'stopped'
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(run.child.pid)])
    } else {
      run.child.kill('SIGKILL')
    }
  } catch {
    // 进程可能已经退出。
  }
  return true
}

function runStep(step, response, run, cwd) {
  return new Promise((resolve) => {
    sendFrame(response, { type: 'step', title: step.title })
    const child = spawn(step.cmd, step.args, { cwd, env: process.env })
    run.child = child
    let emitted = 0
    const forward = (chunk) => {
      if (emitted >= RUN_OUTPUT_CAP) return
      const text = chunk.toString('utf8')
      emitted += text.length
      sendFrame(response, { type: 'output', text })
      if (emitted >= RUN_OUTPUT_CAP) {
        sendFrame(response, { type: 'output', text: '\n[输出过长，已截断……]\n' })
      }
    }
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.on('error', (error) => {
      sendFrame(response, { type: 'output', text: `无法启动 ${step.cmd}：${error.message}\n` })
      resolve(-1)
    })
    child.on('close', (code) => resolve(code ?? -1))
  })
}

async function handleRun(body, request, response, origin, reqUser) {
  const labId = String(body.labId || '')
  if (!labIds.has(labId)) {
    json(response, 400, { error: 'labId 必须是 lab1 到 lab8 之一' }, origin)
    return
  }
  // 自定义命令优先；为空则退回该 Lab 预置的验证命令序列。
  let steps = runRecipe(labId)
  if (typeof body.command === 'string' && body.command.trim()) {
    const parsed = parseCommandInput(body.command)
    if (parsed.error) {
      json(response, 400, { error: parsed.error }, origin)
      return
    }
    steps = parsed.steps
  }
  if (activeRun) {
    json(response, 409, { error: '已有命令在运行，先停止它或等它结束' }, origin)
    return
  }

  const workRoot = await resolveWorkRoot(reqUser)
  const run = { child: null, stopped: '' }
  activeRun = run
  openEventStream(response, origin)
  sendFrame(response, { type: 'output', text: `# 工作目录：${workRoot.name}/\n` })
  const timer = setTimeout(() => {
    sendFrame(response, { type: 'output', text: `\n[超过 ${RUN_TIMEOUT_MS / 1000} 秒，已终止]\n` })
    killActiveRun('timeout')
  }, RUN_TIMEOUT_MS)
  // 学生关掉页面时终止子进程，不留孤儿 QEMU。
  request.on('close', () => {
    if (activeRun === run && !run.done) killActiveRun('client-closed')
  })

  try {
    let code = 0
    for (const step of steps) {
      code = await runStep(step, response, run, workRoot.root)
      if (run.stopped || code !== 0) break
    }
    run.done = true
    sendFrame(response, {
      type: 'exit',
      code,
      ok: !run.stopped && code === 0,
      stopped: run.stopped || undefined,
    })
  } finally {
    clearTimeout(timer)
    if (activeRun === run) activeRun = null
    response.end()
  }
}

/* -- 只读代码浏览：让学生在工作台里看自己系统的源码 -------------------------- */

/** 只展示学生系统的代码本体；构建产物、站点与教学基建不属于「他的系统」。 */
const FS_EXCLUDED = new Set([
  'target',
  'node_modules',
  '.git',
  'handbook',
  'tutor',
  'learning',
  'docs',
  'labs',
  'tests',
  'scripts',
])
const FS_TEXT_EXT = new Set(['.rs', '.toml', '.md', '.asm', '.ld', '.json', '.yaml', '.lock'])
const FS_TEXT_NAMES = new Set(['Makefile', 'Dockerfile', '.gitignore'])
const FS_MAX_ENTRIES = 2000
const FS_MAX_FILE_BYTES = 262_144

function isViewableFile(name) {
  return FS_TEXT_NAMES.has(name) || FS_TEXT_EXT.has(path.extname(name).toLowerCase())
}

async function buildFsTree(dir, relative, depth, counter) {
  if (depth > 6 || counter.count > FS_MAX_ENTRIES) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nodes = []
  for (const entry of entries) {
    if (counter.count > FS_MAX_ENTRIES) break
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue
    if (relative === '' && FS_EXCLUDED.has(entry.name)) continue
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      counter.count += 1
      nodes.push({
        name: entry.name,
        path: childRelative,
        type: 'dir',
        children: await buildFsTree(path.join(dir, entry.name), childRelative, depth + 1, counter),
      })
    } else if (entry.isFile() && isViewableFile(entry.name)) {
      counter.count += 1
      nodes.push({ name: entry.name, path: childRelative, type: 'file' })
    }
  }
  // 目录在前、文件在后，各自按名称排序，浏览起来接近 IDE 习惯。
  nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
  )
  return nodes
}

/** 把用户传来的相对路径钉死在工作区根内，拒绝任何逃逸。 */
function resolveFsPath(rootDir, relative) {
  const normalized = String(relative || '').replace(/\\/g, '/')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) return null
  const top = normalized.split('/')[0]
  if (FS_EXCLUDED.has(top)) return null
  const full = path.resolve(rootDir, normalized)
  if (!full.startsWith(rootDir + path.sep)) return null
  return full
}

async function handleFsFile(rootDir, relative, response, origin) {
  const full = resolveFsPath(rootDir, relative)
  if (!full || !isViewableFile(path.basename(full))) {
    json(response, 400, { error: '路径不可用' }, origin)
    return
  }
  try {
    const info = await stat(full)
    if (!info.isFile()) throw new Error('not a file')
    const truncated = info.size > FS_MAX_FILE_BYTES
    const content = await readFile(full, 'utf8')
    json(response, 200, {
      path: String(relative).replace(/\\/g, '/'),
      size: info.size,
      truncated,
      content: truncated ? content.slice(0, FS_MAX_FILE_BYTES) : content,
    }, origin)
  } catch {
    json(response, 404, { error: '文件不存在或不可读' }, origin)
  }
}

const server = http.createServer(async (request, response) => {
  const origin = resolveOrigin(request.headers.origin)
  if (!origin) {
    json(response, 403, { error: '请求来源不在允许列表中' })
    return
  }
  if (request.method === 'OPTIONS') {
    json(response, 204, {}, origin)
    return
  }

  const requestUrl = new URL(request.url || '/', 'http://localhost')
  const pathname = requestUrl.pathname
  // 身份只来自登录会话（不再信任 ?user=，防止冒名）；未登录 = 游客只读。
  const session = sessionOf(request)
  const reqUser = session?.username || ''
  try {
    /* -- 账号 --------------------------------------------------------------- */

    if (request.method === 'POST' && pathname === '/auth/register') {
      const body = await readBody(request)
      const result = register(body.username, body.password, body.className)
      json(response, result.ok ? 200 : 400, result, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/auth/password') {
      if (!session) {
        json(response, 401, { error: '未登录' }, origin)
        return
      }
      const body = await readBody(request)
      const result = changePassword(session.id, body.oldPassword, body.newPassword)
      json(response, result.ok ? 200 : 400, result, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/auth/login') {
      const body = await readBody(request)
      const result = login(body.username, body.password)
      json(response, result.ok ? 200 : 401, result, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/auth/logout') {
      const auth = String(request.headers.authorization || '')
      logout(auth.startsWith('Bearer ') ? auth.slice(7) : request.headers['x-auth-token'])
      json(response, 200, { ok: true }, origin)
      return
    }

    if (request.method === 'GET' && pathname === '/auth/me') {
      if (!session) {
        json(response, 401, { error: '未登录' }, origin)
        return
      }
      json(response, 200, { ok: true, username: session.username, role: session.role, className: session.className }, origin)
      return
    }

    /* -- 学生报告提交 -------------------------------------------------------- */

    if (request.method === 'POST' && pathname === '/reports') {
      if (!session) {
        json(response, 401, { error: '请先登录再提交报告' }, origin)
        return
      }
      const body = await readBody(request)
      const labId = String(body.labId || '')
      const content = typeof body.content === 'string' ? body.content : ''
      if (!labIds.has(labId) || !content.trim() || content.length > 262_144) {
        json(response, 400, { error: '报告内容为空或过大（上限 256 KiB）' }, origin)
        return
      }
      submitReport(session.id, labId, content)
      json(response, 200, { ok: true, mine: listMyReports(session.id) }, origin)
      return
    }

    if (request.method === 'GET' && pathname === '/reports/mine') {
      if (!session) {
        json(response, 401, { error: '未登录' }, origin)
        return
      }
      json(response, 200, { ok: true, mine: listMyReports(session.id) }, origin)
      return
    }

    // GET 探测默认上游；POST 带 body.llm 时探测前端设置界面指定的上游。
    if (pathname === '/health' && (request.method === 'GET' || request.method === 'POST')) {
      const llm = await resolveLlm(request.method === 'POST' ? (await readBody(request)).llm : undefined)
      const { connected, detail } = await checkUpstream(llm)
      json(response, 200, {
        ok: true,
        connected,
        detail,
        mode: connected ? 'remote' : 'offline',
        model: llm.model,
        studentLlmAllowed: llm.studentLlmAllowed,
        frameworkVersion: 'multi-lab-v2.1',
      }, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/chat') {
      await handleChat(await readBody(request), request, response, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/run') {
      await handleRun(await readBody(request), request, response, origin, reqUser)
      return
    }

    if (request.method === 'POST' && pathname === '/run/stop') {
      json(response, 200, { stopped: killActiveRun('user-stop') }, origin)
      return
    }

    if (request.method === 'GET' && pathname === '/fs/tree') {
      const workRoot = await resolveWorkRoot(reqUser)
      const counter = { count: 0 }
      const tree = await buildFsTree(workRoot.root, '', 0, counter)
      json(response, 200, { root: workRoot.name, tree, truncated: counter.count > FS_MAX_ENTRIES }, origin)
      return
    }

    if (request.method === 'GET' && pathname === '/fs/file') {
      const workRoot = await resolveWorkRoot(reqUser)
      const relative = requestUrl.searchParams.get('path')
      await handleFsFile(workRoot.root, relative, response, origin)
      return
    }

    // 只允许写学生自己的工作区；参考实现 os-lab 永远只读。
    if (request.method === 'POST' && pathname === '/fs/save') {
      const workRoot = await resolveWorkRoot(reqUser)
      if (!workRoot.user) {
        json(response, 403, { error: '参考实现是只读的；填写学号并初始化「我的系统」后可编辑自己的代码' }, origin)
        return
      }
      const body = await readBody(request)
      const full = resolveFsPath(workRoot.root, body.path)
      const content = typeof body.content === 'string' ? body.content : null
      if (!full || !isViewableFile(path.basename(full)) || content === null || content.length > 524_288) {
        json(response, 400, { error: '路径或内容不可用（单文件上限 512 KiB）' }, origin)
        return
      }
      await writeFile(full, content, 'utf8')
      json(response, 200, { saved: true, path: String(body.path).replace(/\\/g, '/') }, origin)
      return
    }

    if (request.method === 'GET' && pathname === '/scaffold/status') {
      if (!session) {
        json(response, 401, { error: '请先登录' }, origin)
        return
      }
      const effective = await effectiveFor(session)
      json(response, 200, { ...(await scaffoldStatus(reqUser, effective)), notice: effective.notice || '' }, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/scaffold/upgrade') {
      if (!session) {
        json(response, 401, { error: '请先登录' }, origin)
        return
      }
      if (activeRun) {
        json(response, 409, { error: '有命令正在运行，先停止再升级' }, origin)
        return
      }
      const body = await readBody(request)
      const effective = await effectiveFor(session)
      const result = await applyNext(reqUser, body.variant, effective)
      json(response, result.ok ? 200 : 400, { ...result, status: await scaffoldStatus(reqUser, effective) }, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/scaffold/add-bin') {
      if (!session) {
        json(response, 401, { error: '请先登录' }, origin)
        return
      }
      const body = await readBody(request)
      const result = await addUserBin(reqUser, String(body.name || ''))
      json(response, result.ok ? 200 : 400, { ...result, status: await scaffoldStatus(reqUser) }, origin)
      return
    }

    /* -- 教师端（需教师账号登录） ------------------------------------------- */

    if (pathname.startsWith('/teacher/')) {
      if (session?.role !== 'teacher') {
        json(response, 401, { error: '需要教师账号登录（注册时填写教师码即为教师）' }, origin)
        return
      }

      if (request.method === 'GET' && pathname === '/teacher/reports') {
        json(response, 200, { ok: true, reports: listAllReports() }, origin)
        return
      }

      if (request.method === 'POST' && pathname === '/teacher/report-feedback') {
        const body = await readBody(request)
        const result = setReportFeedback(body.user, body.labId, body.feedback)
        json(response, result.ok ? 200 : 400, result, origin)
        return
      }
      if (request.method === 'GET' && pathname === '/teacher/overview') {
        const config = await readTeacherConfig()
        const workspaces = await listStudents()
        // 合并注册账号与已建工作区：注册了还没初始化的学生也要能看到。
        const registered = listUsers().filter((u) => u.role === 'student')
        const byUser = new Map(workspaces.map((w) => [w.user, w]))
        const students = registered.map((u) => ({
          className: u.className || '',
          ...(byUser.get(u.username) || { user: u.username, applied: [], current: null, variants: {}, extraBins: [] }),
        }))
        for (const w of workspaces) if (!students.some((s) => s.user === w.user)) students.push({ className: '', ...w })
        json(response, 200, {
          config: { ...config, llm: { ...config.llm, apiKey: config.llm?.apiKey ? '（已设置）' : '' } },
          students,
          labs: LAB_ORDER,
          exercises: Object.fromEntries(
            Object.entries(EXERCISES).map(([labId, exercise]) => [
              labId,
              {
                default: exercise.default,
                variants: Object.entries(exercise.variants).map(([name, v]) => ({ name, label: v.label })),
              },
            ]),
          ),
        }, origin)
        return
      }
      if (request.method === 'POST' && pathname === '/teacher/config') {
        const body = await readBody(request)
        const scopeType = body.scope?.type === 'class' || body.scope?.type === 'student' ? body.scope.type : 'global'
        const scopeId = String(body.scope?.id || '').trim()

        // 变体校验（各级通用）
        if (body.assignment && typeof body.assignment === 'object') {
          const labId = String(body.assignment.labId || '')
          const variant = String(body.assignment.variant || '')
          const exercise = EXERCISES[labId]
          if (!exercise || (variant !== 'random' && !exercise.variants[variant])) {
            json(response, 400, { error: `无效的任务分配（${labId} / ${variant}）` }, origin)
            return
          }
        }

        if (scopeType === 'global') {
          const patch = {}
          if (LAB_ORDER.includes(body.openLab)) patch.openLab = body.openLab
          if (typeof body.allowStudentLlm === 'boolean') patch.allowStudentLlm = body.allowStudentLlm
          if (typeof body.notice === 'string') patch.notice = body.notice.trim().slice(0, 2000)
          if (body.llm && typeof body.llm === 'object') {
            const current = (await readTeacherConfig()).llm || {}
            patch.llm = {
              baseUrl: typeof body.llm.baseUrl === 'string' ? body.llm.baseUrl.trim() : current.baseUrl || '',
              model: typeof body.llm.model === 'string' ? body.llm.model.trim() : current.model || '',
              // 前端传「（已设置）」占位或空表示不修改 Key。
              apiKey:
                typeof body.llm.apiKey === 'string' && body.llm.apiKey && body.llm.apiKey !== '（已设置）'
                  ? body.llm.apiKey.trim()
                  : current.apiKey || '',
            }
          }
          if (body.assignment) {
            await writeAssignment(String(body.assignment.labId), String(body.assignment.variant))
          }
          const config = await writeTeacherConfig(patch)
          json(response, 200, { ok: true, config: { ...config, llm: { ...config.llm, apiKey: config.llm?.apiKey ? '（已设置）' : '' } } }, origin)
          return
        }

        // 班级 / 学生 级覆盖
        if (!scopeId) {
          json(response, 400, { error: '缺少班级名/学生名' }, origin)
          return
        }
        const config = await readTeacherConfig()
        const bucket = scopeType === 'class' ? config.classes : config.students
        const entry = bucket[scopeId] || { assignments: {} }
        if (LAB_ORDER.includes(body.openLab)) entry.openLab = body.openLab
        if (body.openLab === '') delete entry.openLab // 清除覆盖，回落上一级
        if (typeof body.notice === 'string') entry.notice = body.notice.trim().slice(0, 2000)
        if (body.assignment) {
          entry.assignments = entry.assignments || {}
          entry.assignments[String(body.assignment.labId)] = String(body.assignment.variant)
        }
        bucket[scopeId] = entry
        const next = await writeTeacherConfig(
          scopeType === 'class' ? { classes: config.classes } : { students: config.students },
        )
        json(response, 200, { ok: true, config: { ...next, llm: { ...next.llm, apiKey: next.llm?.apiKey ? '（已设置）' : '' } } }, origin)
        return
      }

      /* -- 实验指导文档在线编辑（与时俱进补充知识） ------------------------- */

      if (request.method === 'GET' && pathname === '/teacher/docs') {
        const labsDir = path.join(osLabRoot, 'labs')
        const files = (await readdir(labsDir)).filter((f) => f.endsWith('.md'))
        const answers = (await readdir(path.join(labsDir, 'answers')).catch(() => []))
          .filter((f) => f.endsWith('.md'))
          .map((f) => `answers/${f}`)
        json(response, 200, { ok: true, docs: [...files, ...answers] }, origin)
        return
      }

      if (pathname === '/teacher/doc') {
        const rel = String(
          request.method === 'GET' ? requestUrl.searchParams.get('path') : '',
        )
        const readTarget = (relative) => {
          const normalized = String(relative || '').replace(/\\/g, '/')
          if (!normalized.endsWith('.md') || normalized.includes('..')) return null
          const full = path.resolve(osLabRoot, 'labs', normalized)
          if (!full.startsWith(path.join(osLabRoot, 'labs') + path.sep)) return null
          return full
        }
        if (request.method === 'GET') {
          const full = readTarget(rel)
          if (!full) {
            json(response, 400, { error: '路径不可用' }, origin)
            return
          }
          try {
            json(response, 200, { ok: true, path: rel, content: await readFile(full, 'utf8') }, origin)
          } catch {
            json(response, 404, { error: '文档不存在' }, origin)
          }
          return
        }
        if (request.method === 'POST') {
          const body = await readBody(request)
          const full = readTarget(body.path)
          const content = typeof body.content === 'string' ? body.content : null
          if (!full || content === null || content.length > 524_288) {
            json(response, 400, { error: '路径或内容不可用（上限 512 KiB）' }, origin)
            return
          }
          await writeFile(full, content, 'utf8')
          // 保存后自动同步到站点（dev 模式热更新即可见；静态部署需重新 build）。
          const synced = await new Promise((resolve) => {
            const child = spawn('node', ['scripts/sync-content.mjs'], { cwd: handbookRoot })
            child.on('close', (code) => resolve(code === 0))
            child.on('error', () => resolve(false))
          })
          json(response, 200, { ok: true, synced }, origin)
          return
        }
      }
    }

    if (request.method === 'POST' && pathname === '/events') {
      const body = await readBody(request)
      const events = Array.isArray(body.events) ? body.events : [body.event]
      if (!events.length || events.some((event) => !validateEvent(event))) {
        json(response, 400, { error: '事件不符合 interaction-event v1 契约' }, origin)
        return
      }
      await persistEvents(events)
      json(response, 202, { accepted: events.length }, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/report') {
      const body = await readBody(request)
      const events = Array.isArray(body.events) ? body.events : []
      if (events.some((event) => !validateEvent(event))) {
        json(response, 400, { error: '报告包含无效事件' }, origin)
        return
      }
      const score = scoreLearningEvents(events)
      const labId = labIds.has(String(body.labId || events[0]?.labId))
        ? String(body.labId || events[0]?.labId)
        : 'lab2'
      json(response, 200, {
        sessionId: String(body.sessionId || events[0]?.sessionId || 'unknown'),
        labId,
        score,
        markdown: markdownReport(String(body.sessionId || events[0]?.sessionId || 'unknown'), score, labId),
      }, origin)
      return
    }

    json(response, 404, { error: '可用接口：GET|POST /health，POST /chat、/run、/run/stop、/events、/report' }, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : '导师服务发生未知错误'
    json(response, message.includes('aborted') ? 504 : 500, { error: message }, origin)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`os-lab tutor proxy: http://127.0.0.1:${port}`)
  console.log(`framework: multi-lab-v2.1 · 默认上游: ${defaultUpstream} · 默认模型: ${defaultModel}`)
  console.log('账号体系: 注册（学生+班级）/登录 · 预置管理员 admin/admin123（请尽快改密码）· 教师入口 /guide/ai-tutor')
  console.log(`events: ${dataDir}`)
})
