import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { scoreLearningEvents } from '../learning/rubric.mjs'

const handbookRoot = path.dirname(fileURLToPath(import.meta.url))
const promptRoot = path.resolve(handbookRoot, '..', 'tutor', 'prompts')
const port = Number(process.env.OS_LAB_TUTOR_PORT || 8787)
const upstream = (process.env.OS_LAB_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, '')
const model = process.env.OS_LAB_LLM_MODEL || 'qwen2.5:7b'
const apiKey = process.env.OS_LAB_LLM_API_KEY || ''
const dataDir = process.env.OS_LAB_TUTOR_DATA_DIR || path.join(os.tmpdir(), 'os-lab-tutor-sessions')
const allowedOrigins = new Set(
  (process.env.OS_LAB_TUTOR_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

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
    'Access-Control-Allow-Headers': 'Content-Type',
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
  return allowedOrigins.has(origin) ? origin : null
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

async function checkUpstream() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_500)
  try {
    const response = await fetch(`${upstream}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
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
    json(response, 400, { error: 'labId 必须是 lab1、lab2、lab3、lab4 或 lab5' }, origin)
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

  const wantsStream = String(request.headers.accept || '').includes('text/event-stream')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  const upstreamBody = JSON.stringify({
    model,
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
    const upstreamResponse = await fetch(`${upstream}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
      body: upstreamBody,
    })

    if (!upstreamResponse.ok) {
      const payload = await upstreamResponse.json().catch(() => ({}))
      const error = payload?.error?.message || `上游模型返回 ${upstreamResponse.status}`
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
        model,
        framework: { ...framework, prompt: undefined },
        guardrail: { triggered: false },
      }, origin)
      return
    }

    openEventStream(response, origin)
    sendFrame(response, { type: 'meta', model, triggered: false, framework: framework.version })
    const reply = await pipeUpstreamStream(upstreamResponse, response)
    if (!reply.trim()) sendFrame(response, { type: 'error', error: '上游模型没有返回文本' })
    else sendFrame(response, { type: 'done', reply })
    response.end()
  } catch (error) {
    const detail = error instanceof Error ? error.message : '导师服务发生未知错误'
    if (response.headersSent) {
      sendFrame(response, { type: 'error', error: detail })
      response.end()
      return
    }
    json(response, detail.includes('abort') ? 504 : 502, { error: detail }, origin)
  } finally {
    clearTimeout(timer)
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

  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  try {
    if (request.method === 'GET' && pathname === '/health') {
      const connected = await checkUpstream()
      json(response, 200, {
        ok: true,
        connected,
        mode: connected ? 'remote' : 'offline',
        model,
        frameworkVersion: 'multi-lab-v2.1',
      }, origin)
      return
    }

    if (request.method === 'POST' && pathname === '/chat') {
      await handleChat(await readBody(request), request, response, origin)
      return
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

    json(response, 404, { error: '可用接口：GET /health，POST /chat、/events、/report' }, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : '导师服务发生未知错误'
    json(response, message.includes('aborted') ? 504 : 500, { error: message }, origin)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`os-lab tutor proxy: http://127.0.0.1:${port}`)
  console.log(`framework: multi-lab-v2.1 · upstream: ${upstream} · model: ${model}`)
  console.log(`events: ${dataDir}`)
})
