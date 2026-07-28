<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRouter, withBase } from 'vitepress'
import { Blocks, BookOpen, ClipboardCheck, Code2, Home, LockKeyhole, MessagesSquare, Moon, Play, Settings, Sun, UserRound } from 'lucide-vue-next'
import ManualPane from './ManualPane.vue'
import TutorPane from './TutorPane.vue'
import TerminalPanel from './TerminalPanel.vue'
import ReportPanel from './ReportPanel.vue'
import CodePanel from './CodePanel.vue'
import BottomDock, { type DockTab } from './BottomDock.vue'
import JourneyRail from './JourneyRail.vue'
import TeacherDocPanel from './TeacherDocPanel.vue'
import TeacherPublishPanel from './TeacherPublishPanel.vue'
import {
  appendEvent,
  buildLabJourney,
  createId,
  exportEventsAsJsonl,
  getTutorLab,
  authHeaders,
  hasCustomLlmConfig,
  inferCategory,
  isDirectAnswerRequest,
  loadAuth,
  loadEvents,
  loadLlmConfig,
  offlineTutorReply,
  saveAuth,
  saveLlmConfig,
  tutorStages,
  type LearningEvent,
  type LearningAccessItem,
  type LlmConfig,
  type TutorLabId,
  type TutorMessage,
  type TutorPrompt,
  type TutorStageId,
} from '../tutor-model'

const props = defineProps<{ labId: TutorLabId }>()

const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

/* -- 账号：注册/登录，工作区、终端、代码、报告提交都凭会话鉴权 --------------- */
const auth = ref(loadAuth())
const studentId = computed(() => auth.value?.username || '')
/**
 * 教师进工作台=备课模式：左栏是指导书渲染效果（点「编辑手册」整栏切换为
 * Markdown 编辑器增补知识点）；右栏整栏是作业发布面板（任务类型 × 目标班级）。
 * 教师不运行代码，因此没有终端/代码/AI 导师区。
 */
const isTeacherRole = computed(() => auth.value?.role === 'teacher')
/** 教师左栏是否处于「编辑手册」模式。 */
const teacherEditing = ref(false)
const showIdentity = ref(false)
const authMode = ref<'login' | 'register'>('login')
const authForm = ref({ username: '', password: '', className: '' })
const authBusy = ref(false)
const authError = ref('')
const manualKey = ref(0)

function apiUrl(pathname: string) {
  return `${endpoint}${pathname}`
}

async function submitAuth() {
  if (authBusy.value) return
  authBusy.value = true
  authError.value = ''
  try {
    const response = await fetch(
      `${endpoint}/auth/${authMode.value === 'login' ? 'login' : 'register'}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm.value),
      },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.token) throw new Error(payload?.error || `服务返回 ${response.status}`)
    auth.value = { token: payload.token, username: payload.username, role: payload.role }
    saveAuth(auth.value)
    showIdentity.value = false
    authForm.value = { username: '', password: '', className: '' }
    toast(`欢迎，${payload.username}${payload.role === 'teacher' ? '（教师）' : ''}。`)
    manualKey.value += 1
    void refreshLearningAccess()
    void refreshScaffold()
  } catch (err) {
    authError.value =
      err instanceof Error && err.message
        ? err.message
        : '无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor'
  } finally {
    authBusy.value = false
  }
}

const pwForm = ref({ oldPassword: '', newPassword: '' })

async function changeMyPassword() {
  if (authBusy.value) return
  authBusy.value = true
  authError.value = ''
  try {
    const response = await fetch(`${endpoint}/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(pwForm.value),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    pwForm.value = { oldPassword: '', newPassword: '' }
    toast('密码已修改。')
  } catch (err) {
    authError.value = err instanceof Error ? err.message : '修改失败'
  } finally {
    authBusy.value = false
  }
}

async function doLogout() {
  try {
    await fetch(`${endpoint}/auth/logout`, { method: 'POST', headers: authHeaders() })
  } catch {
    /* 服务不在也允许本地退出 */
  }
  auth.value = null
  saveAuth(null)
  scaffold.value = null
  learningAccess.value = []
  manualKey.value += 1
  showIdentity.value = false
  toast('已退出登录（游客只读）。')
}

const { isDark } = useData()
const router = useRouter()

const sessionId = ref('')
const activeStage = ref<TutorStageId>('orient')
const events = ref<LearningEvent[]>([])
const messages = ref<TutorMessage[]>([])
const sending = ref(false)
const streamingId = ref('')
const connection = ref<'checking' | 'remote' | 'offline'>('checking')
const modelName = ref('')
const notice = ref('')
const currentSection = ref({ h2: '', h3: '' })
const mobileView = ref<'manual' | 'code' | 'tutor' | 'run'>('manual')
/** 右上栏页签（仅学生）：实验报告 / AI 导师。 */
const sideTab = ref<'report' | 'tutor'>('tutor')
/** 底部 Dock 页签。 */
const dockTab = ref<DockTab>('terminal')
/** 最近一次可信运行的 runId，供 Trace/Problems 占位关联。 */
const lastRunId = ref('')
/** 代码区首次访问后保持挂载。 */
const codeVisited = ref(true)
/** 底部面板高度占工作台比例。 */
function loadDockHeight() {
  if (typeof localStorage === 'undefined') return 28
  const raw = localStorage.getItem('os-lab-dock-height')
  const stored = Number(raw)
  return Number.isFinite(stored) ? stored : 28
}
const dockHeight = ref(loadDockHeight())
/** 终端 → 报告「过程记录」的插入载荷（id 递增触发）。 */
const reportInsert = ref<{ id: number; text: string } | null>(null)
/** 面板最大化：底部 Dock 可放大到整个工作台。 */
const maximized = ref<'none' | 'dock'>('none')
function toggleMaxDock() {
  maximized.value = maximized.value === 'dock' ? 'none' : 'dock'
}

/* -- 左右栏宽度 ------------------------------------------------------------- */

const PANE_SPLIT_STORAGE_KEY = 'os-lab-workspace-pane-split'
const DEFAULT_PANE_SPLIT = 57.5
const MIN_PANE_SPLIT = 28
const MAX_PANE_SPLIT = 72
const MIN_LEFT_PANE = 320
const MIN_RIGHT_PANE = 360
const PANE_RESIZER_WIDTH = 10

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function loadPaneSplit() {
  if (typeof localStorage === 'undefined') return DEFAULT_PANE_SPLIT
  const raw = localStorage.getItem(PANE_SPLIT_STORAGE_KEY)
  if (raw === null) return DEFAULT_PANE_SPLIT
  const stored = Number(raw)
  return Number.isFinite(stored)
    ? clamp(stored, MIN_PANE_SPLIT, MAX_PANE_SPLIT)
    : DEFAULT_PANE_SPLIT
}

const panesElement = ref<HTMLElement | null>(null)
const paneSplit = ref(loadPaneSplit())
const paneResizing = ref(false)
const paneGridStyle = computed<Record<string, string>>(() => ({
  '--ws-left-pane-width': `${paneSplit.value}%`,
  '--ws-dock-height': `${dockHeight.value}%`,
}))

function paneLimits() {
  const width = panesElement.value?.getBoundingClientRect().width || 0
  if (width <= 900) return { min: MIN_PANE_SPLIT, max: MAX_PANE_SPLIT }
  return {
    min: Math.max(MIN_PANE_SPLIT, (MIN_LEFT_PANE / width) * 100),
    max: Math.min(MAX_PANE_SPLIT, ((width - PANE_RESIZER_WIDTH - MIN_RIGHT_PANE) / width) * 100),
  }
}

function setPaneSplit(value: number, persist = false) {
  const limits = paneLimits()
  paneSplit.value = limits.min <= limits.max
    ? clamp(value, limits.min, limits.max)
    : DEFAULT_PANE_SPLIT
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem(PANE_SPLIT_STORAGE_KEY, paneSplit.value.toFixed(2))
  }
}

function updatePaneSplit(clientX: number) {
  const rect = panesElement.value?.getBoundingClientRect()
  if (!rect || rect.width <= 900) return
  setPaneSplit(((clientX - rect.left) / rect.width) * 100)
}

function startPaneResize(event: PointerEvent) {
  if (event.button !== 0) return
  paneResizing.value = true
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-pane-resizing')
  updatePaneSplit(event.clientX)
}

function movePaneResize(event: PointerEvent) {
  if (!paneResizing.value) return
  updatePaneSplit(event.clientX)
}

function finishPaneResize(event?: PointerEvent) {
  if (!paneResizing.value) return
  paneResizing.value = false
  document.documentElement.classList.remove('ws-pane-resizing')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  setPaneSplit(paneSplit.value, true)
}

function resetPaneSplit() {
  setPaneSplit(DEFAULT_PANE_SPLIT, true)
}

function resizePaneByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 5 : 2
  if (event.key === 'ArrowLeft') setPaneSplit(paneSplit.value - step, true)
  else if (event.key === 'ArrowRight') setPaneSplit(paneSplit.value + step, true)
  else if (event.key === 'Home') setPaneSplit(paneLimits().min, true)
  else if (event.key === 'End') setPaneSplit(paneLimits().max, true)
  else return
  event.preventDefault()
}

function clampPaneSplitToViewport() {
  setPaneSplit(paneSplit.value)
}

/* -- 我的系统（渐进式脚手架） ------------------------------------------------ */

interface ScaffoldStatus {
  ok: boolean
  error?: string
  user?: string
  exists: boolean
  applied: string[]
  current: string | null
  next: string | null
  nextSummary: string | null
  nextAllowed: boolean
  nextBlockedReason?: string
  openLab: string
  extraBins: string[]
  variants: Record<string, string>
}

const scaffold = ref<ScaffoldStatus | null>(null)
const showScaffold = ref(false)
const scaffoldBusy = ref(false)
const scaffoldLog = ref<string[]>([])
const newBinName = ref('')
const learningAccess = ref<LearningAccessItem[]>([])
const accessLoading = ref(true)

async function refreshLearningAccess() {
  if (!auth.value) {
    learningAccess.value = []
    accessLoading.value = false
    return
  }
  accessLoading.value = true
  try {
    const response = await fetch(apiUrl('/learning/access'), { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    learningAccess.value = response.ok && Array.isArray(payload.labs) ? payload.labs : []
  } catch {
    learningAccess.value = []
  } finally {
    accessLoading.value = false
  }
}

const scaffoldLabel = computed(() => {
  if (!studentId.value) return '我的系统 · 未登录'
  if (!scaffold.value?.ok) return `我的系统 · ${studentId.value}`
  if (!scaffold.value.exists) return `我的系统 · 未初始化`
  return `我的系统 · ${scaffold.value.current}`
})

/** 老师在教师端发布的作业/公告，展示在工作台横幅。 */
const teacherNotice = computed(() => (scaffold.value as { notice?: string } | null)?.notice || '')
const noticeDismissed = ref(false)

async function refreshScaffold() {
  if (!studentId.value) {
    scaffold.value = null
    return
  }
  try {
    const response = await fetch(apiUrl('/scaffold/status'), { headers: authHeaders() })
    if (response.status === 401) {
      // 会话过期：清掉本地登录态，引导重新登录。
      auth.value = null
      saveAuth(null)
      scaffold.value = null
      showIdentity.value = true
      return
    }
    if (response.ok) scaffold.value = await response.json()
  } catch {
    scaffold.value = null
  }
}

async function scaffoldUpgrade() {
  if (scaffoldBusy.value) return
  scaffoldBusy.value = true
  try {
    const response = await fetch(apiUrl('/scaffold/upgrade'), {
      method: 'POST',
      headers: authHeaders(),
    })
    const payload = await response.json()
    scaffoldLog.value = payload.log || [payload.error || '操作失败']
    if (payload.status) scaffold.value = { ...scaffold.value, ...payload.status }
    if (response.ok) toast(`已发放 ${payload.lab}，去终端跑一跑它。`)
  } catch {
    scaffoldLog.value = ['无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor']
  } finally {
    scaffoldBusy.value = false
  }
}

async function scaffoldAddBin() {
  const name = newBinName.value.trim()
  if (!name || scaffoldBusy.value) return
  scaffoldBusy.value = true
  try {
    const response = await fetch(apiUrl('/scaffold/add-bin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    })
    const payload = await response.json()
    scaffoldLog.value = payload.log || [payload.error || '操作失败']
    if (payload.status) scaffold.value = { ...scaffold.value, ...payload.status }
    if (response.ok) newBinName.value = ''
  } catch {
    scaffoldLog.value = ['无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor']
  } finally {
    scaffoldBusy.value = false
  }
}

/** 老师对本 Lab 报告的批语（学生在报告面板看到）。 */
const teacherFeedback = ref('')

async function loadMyFeedback() {
  if (!auth.value || isTeacherRole.value) return
  try {
    const response = await fetch(apiUrl('/reports/mine'), { headers: authHeaders() })
    if (!response.ok) return
    const payload = await response.json()
    const mine = (payload.mine || []).find((r: { labId: string }) => r.labId === props.labId)
    teacherFeedback.value = mine?.feedback || ''
  } catch {
    /* 静默 */
  }
}

/** 报告面板「提交给老师」：入库，教师端可见。 */
async function submitReportToTeacher(content: string) {
  if (!auth.value) {
    toast('先登录再提交报告。')
    showIdentity.value = true
    return
  }
  try {
    const response = await fetch(apiUrl('/reports'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ labId: props.labId, content }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    toast('报告已提交给老师（重复提交会覆盖旧版本）。')
  } catch (err) {
    toast(err instanceof Error ? err.message : '提交失败，稍后再试。')
  }
}

/* 模型接入配置：前端填写、存浏览器本地，按请求发给 tutor-server。 */
const llmConfig = ref<LlmConfig>(loadLlmConfig())
const llmDraft = ref<LlmConfig>({ ...llmConfig.value })
const showLlmSettings = ref(false)
/** 教师可在控制台统一配模型并关闭学生自配；此标志来自 /health。 */
const studentLlmAllowed = ref(true)
/** 连不上时的具体原因：区分「导师服务没启动」和「上游模型连不通」。 */
const connectionDetail = ref('')

let noticeTimer = 0

const lab = computed(() => getTutorLab(props.labId))
const journey = computed(() => buildLabJourney(events.value, props.labId, learningAccess.value))
const journeyItem = computed(() => journey.value.find((item) => item.lab.id === props.labId))
const currentAccess = computed(() => learningAccess.value.find((item) => item.labId === props.labId))
const workspaceRestricted = computed(
  () => !isTeacherRole.value && (!auth.value || accessLoading.value || !currentAccess.value?.unlocked),
)
const sessionEvents = computed(() =>
  events.value.filter((event) => event.sessionId === sessionId.value),
)
const activeStageData = computed(
  () => tutorStages.find((stage) => stage.id === activeStage.value) || tutorStages[0],
)
const connectionLabel = computed(() => {
  if (connection.value === 'checking') return '连接中'
  if (connection.value === 'remote') return modelName.value || '模型已连接'
  return '离线引导'
})

/* -- 事件记录 --------------------------------------------------------------- */

function record(
  type: LearningEvent['type'],
  options: Pick<LearningEvent, 'category' | 'content' | 'metadata' | 'runId' | 'recipeId' | 'assertions'> = {},
) {
  const result = appendEvent(events.value, {
    sessionId: sessionId.value,
    labId: props.labId,
    stage: activeStage.value,
    type,
    ...options,
  })
  events.value = result.next
  // 解锁证据属于导师服务，不应依赖上游大模型是否在线。
  if (auth.value) void syncEvent(result.event)
}

async function syncEvent(event: LearningEvent) {
  try {
    const wasCompleted = Boolean(journeyItem.value?.completed)
    const response = await fetch(`${endpoint}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ event }),
      keepalive: true,
    })
    if (response.ok && ['verification_attempt', 'reflection_submitted'].includes(event.type)) {
      await refreshLearningAccess()
      announceUnlock(wasCompleted)
    }
  } catch {
    // 本地档案仍保留；服务恢复后可继续学习，但服务端解锁必须等待证据同步成功。
  }
}

function toast(text: string, duration = 3200) {
  notice.value = text
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), duration)
}

/* -- 会话 ------------------------------------------------------------------- */

function openingMessage() {
  const previous = journey.value[(journeyItem.value?.index ?? 0) - 1]
  if (!previous) return lab.value.initialQuestion
  return `这一层承接 ${previous.lab.label} · ${previous.lab.systemLayer}：${lab.value.bridge}\n\n${lab.value.initialQuestion}`
}

function startSession() {
  activeStage.value = 'orient'
  sessionId.value = createId(props.labId)
  messages.value = [
    {
      id: createId('message'),
      role: 'assistant',
      stage: 'orient',
      kind: 'stage_intro',
      content: openingMessage(),
      timestamp: new Date().toISOString(),
    },
  ]
  record('session_start', {
    metadata: {
      mode: connection.value,
      labTitle: lab.value.title,
      systemLayer: lab.value.systemLayer,
    },
  })
  record('stage_enter', { metadata: { title: activeStageData.value.title } })
}

async function checkConnection() {
  connection.value = 'checking'
  try {
    // 有自定义模型配置时用 POST 探测该上游，否则 GET 探测服务端默认上游。
    const response = hasCustomLlmConfig(llmConfig.value)
      ? await fetch(`${endpoint}/health`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ llm: llmConfig.value }),
        })
      : await fetch(`${endpoint}/health`)
    if (!response.ok) throw new Error(`health ${response.status}`)
    const payload = (await response.json()) as {
      connected?: boolean
      model?: string
      detail?: string
      studentLlmAllowed?: boolean
    }
    connection.value = payload.connected ? 'remote' : 'offline'
    modelName.value = payload.model || ''
    studentLlmAllowed.value = payload.studentLlmAllowed !== false
    connectionDetail.value = payload.connected ? '' : payload.detail || '上游模型未连接'
  } catch {
    connection.value = 'offline'
    modelName.value = ''
    connectionDetail.value =
      '导师服务未启动：先在 os-lab/handbook 目录运行 npm run tutor，再重新探测。'
  }
}

/* -- 模型设置 --------------------------------------------------------------- */

function openLlmSettings() {
  llmDraft.value = { ...llmConfig.value }
  showLlmSettings.value = true
}

async function saveLlmSettings() {
  llmConfig.value = { ...llmDraft.value }
  saveLlmConfig(llmConfig.value)
  toast('模型设置已保存，正在重新探测连接…')
  await checkConnection()
  if (connection.value === 'remote') {
    showLlmSettings.value = false
    toast(`已连接：${modelName.value}`)
  } else {
    // 保持弹窗打开，让学生看到具体原因后就地修改。
    toast(`未连上模型：${connectionDetail.value}`, 6000)
  }
}

async function resetLlmSettings() {
  llmDraft.value = { baseUrl: '', model: '', apiKey: '' }
  await saveLlmSettings()
}

/* -- 与导师服务通信 --------------------------------------------------------- */

interface ReplyOutcome {
  reply: string
  guardrail: boolean
  rule?: string
}

function chatPayload(message: string) {
  return {
    sessionId: sessionId.value,
    labId: props.labId,
    stage: activeStage.value,
    message,
    // 前端配置的模型接入随请求下发；全空时服务端使用默认上游。
    ...(hasCustomLlmConfig(llmConfig.value) ? { llm: llmConfig.value } : {}),
    // 学生正在读哪一节 —— 导师据此说「你刚读到 sscratch 那节」。
    reading: currentSection.value,
    history: messages.value
      .slice(0, -1)
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.content })),
  }
}

/** 逐 delta 回调；返回完整回复。服务端不支持 SSE 时自动回退到整段 JSON。 */
async function requestReply(
  message: string,
  onDelta: (text: string) => void,
): Promise<ReplyOutcome | null> {
  if (connection.value !== 'remote') return null

  const response = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(chatPayload(message)),
  })
  if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const payload = (await response.json()) as {
      reply?: string
      error?: string
      guardrail?: { triggered?: boolean; rule?: string }
    }
    if (!payload.reply) throw new Error(payload.error || '导师服务没有返回 reply')
    return {
      reply: payload.reply,
      guardrail: Boolean(payload.guardrail?.triggered),
      rule: payload.guardrail?.rule,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''
  let guardrail = false
  let rule: string | undefined

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((item) => item.startsWith('data:'))
      if (!line) continue
      let frame: { type?: string; text?: string; reply?: string; error?: string; rule?: string; triggered?: boolean }
      try {
        frame = JSON.parse(line.slice(5).trim())
      } catch {
        continue
      }
      if (frame.type === 'error') throw new Error(frame.error || '导师服务返回错误')
      if (frame.type === 'meta' && frame.triggered) {
        guardrail = true
        rule = frame.rule
      }
      if (frame.type === 'delta' && frame.text) {
        reply += frame.text
        onDelta(reply)
      }
      if (frame.type === 'done' && frame.reply) reply = frame.reply
    }
  }

  if (!reply.trim()) throw new Error('导师服务没有返回文本')
  return { reply, guardrail, rule }
}

async function sendMessage(text: string) {
  if (sending.value) return
  const guarded = isDirectAnswerRequest(text)
  const category = inferCategory(text)

  messages.value.push({
    id: createId('message'),
    role: 'student',
    stage: activeStage.value,
    content: text,
    timestamp: new Date().toISOString(),
    category,
    guardrail: guarded,
  })
  record('student_message', { category, content: text })
  if (guarded) record('guardrail_triggered', { category, content: text })

  sending.value = true
  const replyId = createId('message')

  try {
    const outcome = await requestReply(text, (partial) => {
      const existing = messages.value.find((item) => item.id === replyId)
      if (existing) {
        existing.content = partial
        return
      }
      streamingId.value = replyId
      messages.value.push({
        id: replyId,
        role: 'assistant',
        stage: activeStage.value,
        content: partial,
        timestamp: new Date().toISOString(),
        category,
      })
    })

    const serverGuardrail = outcome?.guardrail ?? false
    if (serverGuardrail && !guarded) {
      record('guardrail_triggered', { metadata: { rule: outcome?.rule } })
    }
    const reply =
      outcome?.reply ?? offlineTutorReply(text, activeStage.value, guarded, lab.value)

    const existing = messages.value.find((item) => item.id === replyId)
    if (existing) {
      existing.content = reply
      existing.guardrail = guarded || serverGuardrail
    } else {
      messages.value.push({
        id: replyId,
        role: 'assistant',
        stage: activeStage.value,
        content: reply,
        timestamp: new Date().toISOString(),
        category,
        guardrail: guarded || serverGuardrail,
      })
    }
    record('ai_response', {
      category,
      content: reply,
      metadata: { guarded: guarded || serverGuardrail, mode: connection.value },
    })
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : '未知错误'
    // 单次失败（超时/限流/网络抖动）不该把整个会话打成离线：
    // 重探一次连接，还活着就提示重发，确实断了才降级到离线引导。
    await checkConnection()
    const invalidCompletion = /没有返回文本|生成正文前|工具调用|内容过滤/.test(detail)
    const reply =
      connection.value === 'remote'
        ? invalidCompletion
          ? `这条回复失败了：${detail}\n\n模型接口可以访问，但这次生成没有可显示的正文。服务已经自动重试，请检查所选模型是否支持 Chat Completions 文本对话。`
          : `这条回复失败了：${detail}\n\n模型接口仍可访问，可以稍后重试。`
        : `模型连接中断（${detail}），已切换到离线引导。\n\n${offlineTutorReply(text, activeStage.value, guarded, lab.value)}`
    const existing = messages.value.find((item) => item.id === replyId)
    if (existing) existing.content = reply
    else {
      messages.value.push({
        id: replyId,
        role: 'assistant',
        stage: activeStage.value,
        content: reply,
        timestamp: new Date().toISOString(),
      })
    }
    record('ai_response', { category, content: reply, metadata: { mode: 'fallback', error: detail } })
  } finally {
    sending.value = false
    streamingId.value = ''
  }
}

function usePrompt(prompt: TutorPrompt) {
  record('template_used', {
    category: prompt.category,
    content: prompt.text,
    metadata: { templateId: prompt.id, label: prompt.label },
  })
}

/* -- 学习证据 --------------------------------------------------------------- */

function announceUnlock(wasCompleted: boolean) {
  if (wasCompleted || !journeyItem.value?.completed) return
  const next = journey.value[journeyItem.value.index + 1]
  toast(
    next
      ? `${lab.value.systemLayer}已构建，${next.lab.label} · ${next.lab.systemLayer} 已解锁。`
      : '全部系统层已经构建完成。',
    5000,
  )
}

/** 终端每次运行结束自动记录为验证证据（真实输出，不再靠学生自报）。 */
function onRunFinished(payload: {
  content: string
  passed: boolean
  verified: boolean
  runId: string
  recipeId: string | null
  trusted: boolean
  assertions: Array<{ id: string; label: string; passed: boolean; expected: string; observed: string }>
}) {
  const wasCompleted = Boolean(journeyItem.value?.completed)
  record('verification_attempt', {
    content: payload.content,
    runId: payload.runId,
    ...(payload.recipeId ? { recipeId: payload.recipeId } : {}),
    assertions: payload.assertions,
    metadata: {
      passed: payload.verified,
      verified: payload.verified,
      trusted: payload.trusted,
      source: 'terminal',
    },
  })
  if (payload.runId) lastRunId.value = payload.runId
  announceUnlock(wasCompleted)
}

/** 终端输出插入实验报告的「过程记录」。 */
function onInsertReport(text: string) {
  reportInsert.value = { id: (reportInsert.value?.id ?? 0) + 1, text }
  sideTab.value = 'report'
  mobileView.value = 'tutor'
  toast('输出已插入实验报告。')
}

/** 报告面板请导师点评：切到对话页签并把报告作为提问发送。 */
function reviewReport(content: string) {
  sideTab.value = 'tutor'
  mobileView.value = 'tutor'
  if (sending.value) {
    toast('导师正在回复上一条消息，稍后再试。')
    return
  }
  void sendMessage(`这是我目前的实验报告，请指出记录不完整或理解有偏差的地方，并追问我一个能检验理解的问题：\n\n${content}`)
}

function submitReflection(content: string) {
  const wasCompleted = Boolean(journeyItem.value?.completed)
  activeStage.value = 'reflect'
  record('reflection_submitted', { content })
  messages.value.push({
    id: createId('message'),
    role: 'assistant',
    stage: 'reflect',
    content:
      '复盘已经保存。再检查一次：你分别写清了**自己的判断**、**AI 的提醒**和**实际验证证据**吗？',
    timestamp: new Date().toISOString(),
  })
  toast('复盘已保存。')
  announceUnlock(wasCompleted)
}

/* -- 导航与导出 ------------------------------------------------------------- */

function enterLab(labId: TutorLabId) {
  if (labId === props.labId) return
  router.go(withBase(`/learn/${labId}`))
}

function finishTeacherEditing() {
  teacherEditing.value = false
  manualKey.value += 1
}

function exportGrowth() {
  exportEventsAsJsonl(
    events.value,
    `os-lab-growth-record-${new Date().toISOString().slice(0, 10)}.jsonl`,
  )
  toast('成长档案已导出为 JSONL。')
}

onMounted(async () => {
  document.documentElement.classList.add('ws-lock')
  window.addEventListener('resize', clampPaneSplitToViewport)
  clampPaneSplitToViewport()
  events.value = loadEvents()
  if (!studentId.value) showIdentity.value = true
  await checkConnection()
  await refreshLearningAccess()
  startSession()
  void refreshScaffold()
  void loadMyFeedback()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('ws-lock')
  document.documentElement.classList.remove('ws-pane-resizing')
  window.removeEventListener('resize', clampPaneSplitToViewport)
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="ws-workspace">
    <header class="ws-topbar">
      <a class="ws-brand" :href="withBase('/')">
        <span class="ws-brand-mark" aria-hidden="true">OS</span>
        <span class="ws-brand-text">
          <strong>os-lab 引导式学习</strong>
          <small>{{ lab.label }} · {{ lab.systemLayer }}</small>
        </span>
      </a>

      <div class="ws-topbar-actions">
        <button
          class="ws-topbar-link"
          type="button"
          :title="studentId ? '账号与退出' : '注册/登录，开始维护你自己的系统'"
          @click="authError = ''; showIdentity = true"
        >
          <UserRound :size="15" aria-hidden="true" /><span>{{ studentId || '登录' }}</span>
        </button>
        <template v-if="isTeacherRole">
          <a class="ws-topbar-link" :href="withBase('/teacher-review')">
            <ClipboardCheck :size="15" aria-hidden="true" /><span>实验验收</span>
          </a>
        </template>
        <button
          v-else
          class="ws-topbar-link ws-scaffold-chip"
          type="button"
          :title="scaffold?.exists ? '查看/升级我的系统' : '初始化属于你自己的系统代码'"
          @click="showScaffold = true; scaffoldLog = []; void refreshScaffold()"
        >
          <Blocks :size="15" aria-hidden="true" /><span>{{ scaffoldLabel }}</span>
        </button>
        <JourneyRail :journey="journey" @enter-lab="enterLab" @export-growth="exportGrowth" />
        <button
          class="ws-topbar-icon"
          type="button"
          aria-label="模型设置"
          title="模型设置"
          @click="openLlmSettings"
        >
          <Settings :size="16" aria-hidden="true" />
        </button>
        <button
          class="ws-topbar-icon"
          type="button"
          :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
          :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
          @click="isDark = !isDark"
        >
          <Sun v-if="isDark" :size="16" aria-hidden="true" />
          <Moon v-else :size="16" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="ws-mobile-switch" role="tablist" aria-label="学习视图">
      <button
        type="button"
        role="tab"
        :aria-selected="mobileView === 'manual'"
        :class="{ active: mobileView === 'manual' }"
        @click="mobileView = 'manual'"
      >
        <BookOpen :size="15" aria-hidden="true" />手册
      </button>
      <template v-if="!isTeacherRole">
        <button
          type="button"
          role="tab"
          :aria-selected="mobileView === 'code'"
          :class="{ active: mobileView === 'code' }"
          @click="mobileView = 'code'"
        >
          <Code2 :size="15" aria-hidden="true" />代码
        </button>
      </template>
      <button
        type="button"
        role="tab"
        :aria-selected="mobileView === 'tutor'"
        :class="{ active: mobileView === 'tutor' }"
        @click="mobileView = 'tutor'"
      >
        <MessagesSquare :size="15" aria-hidden="true" />{{ isTeacherRole ? '教学' : '导师' }}
      </button>
      <button
        v-if="!isTeacherRole"
        type="button"
        role="tab"
        :aria-selected="mobileView === 'run'"
        :class="{ active: mobileView === 'run' }"
        @click="mobileView = 'run'"
      >
        <Play :size="15" aria-hidden="true" />运行
      </button>
    </div>

    <main
      ref="panesElement"
      class="ws-panes"
      :class="{ 'ws-ide-student': !isTeacherRole }"
      :style="paneGridStyle"
    >
      <!-- 左栏：指导书渲染效果；教师点「编辑手册」后整栏切换为 Markdown 编辑器 -->
      <ManualPane
        :key="manualKey"
        v-show="!(isTeacherRole && teacherEditing)"
        class="ws-left-pane"
        :class="{ 'ws-mobile-hidden': mobileView !== 'manual' }"
        :lab="lab"
        :editable="isTeacherRole"
        @edit="teacherEditing = true"
        @section-change="currentSection = $event"
      />
      <TeacherDocPanel
        v-if="isTeacherRole && teacherEditing"
        class="ws-left-pane"
        :class="{ 'ws-mobile-hidden': mobileView !== 'manual' }"
        :lab="lab"
        :endpoint="endpoint"
        @notice="toast"
        @close="finishTeacherEditing"
      />

      <div
        class="ws-pane-resizer"
        :class="{ active: paneResizing }"
        role="separator"
        aria-label="调整实验手册与实践区宽度"
        aria-orientation="vertical"
        :aria-valuemin="MIN_PANE_SPLIT"
        :aria-valuemax="MAX_PANE_SPLIT"
        :aria-valuenow="Math.round(paneSplit)"
        tabindex="0"
        title="拖动调整左右宽度；双击恢复默认"
        @pointerdown="startPaneResize"
        @pointermove="movePaneResize"
        @pointerup="finishPaneResize"
        @pointercancel="finishPaneResize"
        @lostpointercapture="finishPaneResize"
        @dblclick="resetPaneSplit"
        @keydown="resizePaneByKeyboard"
      >
        <span aria-hidden="true"></span>
      </div>

      <!-- 右栏（教师）：整栏就是作业发布面板，没有终端/代码 -->
      <div
        v-if="isTeacherRole"
        class="ws-right ws-right-teacher"
        :class="{ 'ws-mobile-hidden': mobileView !== 'tutor' }"
      >
        <TeacherPublishPanel :lab="lab" :endpoint="endpoint" @notice="toast" />
      </div>

      <div
        v-else-if="workspaceRestricted"
        class="ws-right ws-access-blocked"
        :class="{ 'ws-mobile-hidden': mobileView !== 'tutor' }"
      >
        <LockKeyhole :size="28" aria-hidden="true" />
        <strong>{{ accessLoading ? '正在确认学习进度' : '当前实验尚未解锁' }}</strong>
        <p>{{ currentAccess?.reason || (auth ? '请从学习路径确认教师开放范围和前置任务。' : '登录后才能进入实验工作台。') }}</p>
        <a :href="withBase('/guide/ai-tutor')">返回学习路径</a>
      </div>

      <!-- 右栏（学生）：IDE 四区 — 右上导师/报告、中部代码、底部 Dock -->
      <template v-else>
        <div
          class="ws-ide-side"
          :class="{ 'ws-mobile-hidden': mobileView !== 'tutor', 'ws-max': maximized === 'dock' && mobileView === 'tutor' }"
        >
          <div class="ws-side-tabs" role="tablist" aria-label="导师与报告">
            <button
              type="button"
              role="tab"
              :aria-selected="sideTab === 'report'"
              :class="{ active: sideTab === 'report' }"
              @click="sideTab = 'report'"
            >
              实验报告
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="sideTab === 'tutor'"
              :class="{ active: sideTab === 'tutor' }"
              @click="sideTab = 'tutor'"
            >
              AI 导师
            </button>
          </div>
          <ReportPanel
            v-show="sideTab === 'report'"
            :lab="lab"
            :insert-payload="reportInsert"
            :teacher-feedback="teacherFeedback"
            @reflect="submitReflection"
            @review="reviewReport"
            @submit-teacher="submitReportToTeacher"
            @notice="toast"
          />
          <TutorPane
            v-show="sideTab === 'tutor'"
            :lab="lab"
            :messages="messages"
            :sending="sending"
            :streaming-id="streamingId"
            :connection="connection"
            :connection-label="connectionLabel"
            @send="sendMessage"
            @new-session="startSession"
            @check-connection="checkConnection"
            @use-prompt="usePrompt"
          />
        </div>

        <CodePanel
          v-if="codeVisited"
          class="ws-ide-code"
          :class="{ 'ws-mobile-hidden': mobileView !== 'code' }"
          :key="`code-${studentId}`"
          :lab="lab"
          :endpoint="endpoint"
          :student="studentId"
          :dark="isDark"
        />

        <BottomDock
          class="ws-ide-dock"
          :class="{ 'ws-mobile-hidden': mobileView !== 'run', 'ws-max': maximized === 'dock' }"
          v-model:active-tab="dockTab"
          v-model:height-percent="dockHeight"
          :run-id="lastRunId"
          :lab-id="lab.id"
          :maximized="maximized === 'dock'"
          @toggle-max="toggleMaxDock"
        >
          <template #terminal>
            <TerminalPanel
              :key="`terminal-${studentId}`"
              :lab="lab"
              :endpoint="endpoint"
              :student="studentId"
              :session-id="sessionId"
              :dark="isDark"
              @run-finished="onRunFinished"
              @run-exit="lastRunId = $event"
              @insert-report="onInsertReport"
            />
          </template>
        </BottomDock>
      </template>
    </main>

    <p v-if="notice" class="ws-toast" role="status">{{ notice }}</p>

    <div v-if="teacherNotice && !noticeDismissed" class="ws-teacher-notice" role="status">
      <span>📢 老师公告：{{ teacherNotice }}</span>
      <button type="button" aria-label="关闭公告" @click="noticeDismissed = true">×</button>
    </div>

    <div
      v-if="showIdentity"
      class="ws-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="账号"
      @click.self="showIdentity = false"
    >
      <div class="ws-modal">
        <template v-if="auth">
          <h2>账号</h2>
          <p class="ws-modal-status" data-state="remote">
            已登录：{{ auth.username }}{{ auth.role === 'teacher' ? '（教师）' : '' }}
          </p>
          <p class="ws-modal-hint">你的系统代码、学习进度与提交的报告都绑定这个账号。</p>
          <label class="ws-modal-field">
            <span>修改密码：原密码</span>
            <input v-model="pwForm.oldPassword" type="password" autocomplete="current-password" />
          </label>
          <label class="ws-modal-field">
            <span>新密码（至少 6 位）</span>
            <input v-model="pwForm.newPassword" type="password" autocomplete="new-password" />
          </label>
          <p v-if="authError" class="ws-modal-status" data-state="offline">{{ authError }}</p>
          <div class="ws-modal-actions">
            <button type="button" class="ws-modal-secondary" @click="doLogout">退出登录</button>
            <button
              type="button"
              class="ws-modal-secondary"
              :disabled="authBusy || !pwForm.oldPassword || !pwForm.newPassword"
              @click="changeMyPassword"
            >
              修改密码
            </button>
            <span class="ws-modal-spacer" aria-hidden="true"></span>
            <button type="button" class="ws-modal-primary" @click="showIdentity = false">关闭</button>
          </div>
        </template>
        <template v-else>
          <h2>{{ authMode === 'login' ? '登录' : '注册' }}</h2>
          <p class="ws-modal-hint">
            账号保存在本机导师服务的数据库里；你的系统、进度与报告都绑定账号。
            只想看参考实现可以直接关闭（游客只读）。
          </p>
          <label class="ws-modal-field">
            <span>用户名（学号或昵称）</span>
            <input v-model="authForm.username" type="text" spellcheck="false" autocomplete="username" />
          </label>
          <label class="ws-modal-field">
            <span>密码（至少 6 位）</span>
            <input
              v-model="authForm.password"
              type="password"
              autocomplete="current-password"
              @keydown.enter.prevent="submitAuth"
            />
          </label>
          <label v-if="authMode === 'register'" class="ws-modal-field">
            <span>班级（如 计科2301）</span>
            <input v-model="authForm.className" type="text" spellcheck="false" autocomplete="off" />
          </label>
          <p v-if="authError" class="ws-modal-status" data-state="offline">{{ authError }}</p>
          <div class="ws-modal-actions">
            <button
              type="button"
              class="ws-modal-secondary"
              @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''"
            >
              {{ authMode === 'login' ? '没有账号？注册' : '已有账号？登录' }}
            </button>
            <span class="ws-modal-spacer" aria-hidden="true"></span>
            <button type="button" class="ws-modal-secondary" @click="showIdentity = false">游客浏览</button>
            <button type="button" class="ws-modal-primary" :disabled="authBusy" @click="submitAuth">
              {{ authBusy ? '请稍候…' : authMode === 'login' ? '登录' : '注册并进入' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="showScaffold"
      class="ws-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="我的系统"
      @click.self="showScaffold = false"
    >
      <div class="ws-modal">
        <h2>我的系统</h2>
        <p class="ws-modal-hint">
          你的操作系统从 Lab1 的最小骨架开始，随每个 Lab「升级」长出新能力——升级只补必需的新文件，
          <strong>你已有的代码和自建程序永远不会被覆盖</strong>，每个人的系统都是自己的。
        </p>

        <p v-if="!studentId" class="ws-modal-status" data-state="offline">
          先点击顶栏「登录」填写学号/昵称——你的系统按身份保存，每个人都是自己的一份。
        </p>
        <p v-else-if="!scaffold?.ok" class="ws-modal-status" data-state="offline">
          无法获取状态：确认导师服务已启动（npm run tutor）。
        </p>
        <template v-else>
          <p class="ws-modal-status" :data-state="scaffold.exists ? 'remote' : undefined">
            <template v-if="!scaffold.exists">{{ scaffold.user }}，尚未初始化。点击下方按钮领取 Lab1 起步代码。</template>
            <template v-else-if="scaffold.next">
              当前进度：{{ scaffold.applied.join(' → ') }}；下一步 {{ scaffold.next }}（{{ scaffold.nextSummary }}）
              <template v-if="!scaffold.nextAllowed">——{{ scaffold.nextBlockedReason || `教师当前开放到 ${scaffold.openLab}` }}。</template>
            </template>
            <template v-else>八个 Lab 已全部发放，继续自由完善你的系统吧。</template>
          </p>

          <div class="ws-modal-actions">
            <button
              v-if="scaffold.next"
              type="button"
              class="ws-modal-primary"
              :disabled="scaffoldBusy || (scaffold.exists && !scaffold.nextAllowed)"
              @click="scaffoldUpgrade"
            >
              {{ scaffoldBusy ? '发放中…' : scaffold.exists ? (scaffold.nextAllowed ? `升级到 ${scaffold.next}` : `${scaffold.next} 暂不可领取`) : '初始化我的系统（Lab1）' }}
            </button>
          </div>

          <div v-if="scaffold.exists" class="ws-modal-field ws-scaffold-bin">
            <span>登记一个自己的用户程序（个性化扩展：小游戏、工具随你）</span>
            <div>
              <input
                v-model="newBinName"
                type="text"
                placeholder="例如 my_snake"
                spellcheck="false"
                @keydown.enter.prevent="scaffoldAddBin"
              />
              <button type="button" class="ws-modal-secondary" :disabled="scaffoldBusy" @click="scaffoldAddBin">
                创建
              </button>
            </div>
          </div>
        </template>

        <pre v-if="scaffoldLog.length" class="ws-scaffold-log">{{ scaffoldLog.join('\n') }}</pre>

        <div class="ws-modal-actions">
          <span class="ws-modal-spacer" aria-hidden="true"></span>
          <button type="button" class="ws-modal-secondary" @click="showScaffold = false">关闭</button>
        </div>
      </div>
    </div>

    <div
      v-if="showLlmSettings"
      class="ws-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="模型设置"
      @click.self="showLlmSettings = false"
    >
      <div class="ws-modal">
        <h2>模型设置</h2>
        <p v-if="!studentLlmAllowed" class="ws-modal-hint">
          <strong>当前班级由老师统一配置模型</strong>，学生自配不生效——直接关闭本窗口即可使用；
          有疑问找老师在引导式学习工作台调整。
        </p>
        <p v-else class="ws-modal-hint">
          配置只保存在本机浏览器，随每次提问发给本地导师服务；全部留空表示使用老师统一配置
          或默认的本机 Ollama。换设备需要重新填写。
        </p>
        <p class="ws-modal-status" :data-state="connection">
          <template v-if="connection === 'checking'">正在探测连接…</template>
          <template v-else-if="connection === 'remote'">已连接：{{ modelName }}</template>
          <template v-else>未连接{{ connectionDetail ? `：${connectionDetail}` : '' }}</template>
        </p>
        <label class="ws-modal-field">
          <span>接口地址（OpenAI 兼容 base URL）</span>
          <input
            v-model="llmDraft.baseUrl"
            type="url"
            placeholder="http://127.0.0.1:11434/v1"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="ws-modal-field">
          <span>模型名</span>
          <input
            v-model="llmDraft.model"
            type="text"
            placeholder="qwen2.5:7b"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="ws-modal-field">
          <span>API Key（本机 Ollama 留空即可）</span>
          <input v-model="llmDraft.apiKey" type="password" placeholder="sk-…" autocomplete="off" />
        </label>
        <div class="ws-modal-actions">
          <button type="button" class="ws-modal-secondary" @click="resetLlmSettings">
            恢复默认
          </button>
          <span class="ws-modal-spacer" aria-hidden="true"></span>
          <button type="button" class="ws-modal-secondary" @click="showLlmSettings = false">
            取消
          </button>
          <button type="button" class="ws-modal-primary" @click="saveLlmSettings">
            保存并重连
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ws-access-blocked {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-6);
  color: var(--ws-ink-muted);
  background: var(--ws-surface-alt);
  text-align: center;
}

.ws-access-blocked > svg {
  color: var(--ws-warn);
}

.ws-access-blocked strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
}

.ws-access-blocked p {
  max-width: 420px;
  margin: 0;
  font-size: var(--ws-text-sm);
}

.ws-access-blocked a {
  margin-top: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-accent);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
}

.ws-workspace {
  display: grid;
  /* 隐式的 auto 列会以子项 min-content 为下限，窄屏下会把整个外壳顶宽
     （grid blowout）。显式 minmax(0, 1fr) 把下限压到 0。 */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: var(--ws-topbar-height) minmax(0, 1fr);
  height: 100dvh;
  min-height: 520px;
  color: var(--ws-ink);
  background: var(--ws-surface-alt);
}

/* -- 顶栏 ------------------------------------------------------------------ */
.ws-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-4);
  padding: 0 var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-brand {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.ws-brand-mark {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  place-items: center;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-brand-text {
  min-width: 0;
}

.ws-brand-text strong,
.ws-brand-text small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-brand-text strong {
  font-size: var(--ws-text-base);
  font-weight: var(--ws-weight-semibold);
}

.ws-brand-text small {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-topbar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-topbar-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  font-size: var(--ws-text-sm);
  text-decoration: none;
}

.ws-topbar-link:hover,
.ws-topbar-icon:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-topbar-icon {
  display: grid;
  width: var(--ws-control-md);
  height: var(--ws-control-md);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

/* -- 双栏 ------------------------------------------------------------------ */
.ws-panes {
  display: grid;
  grid-template-columns:
    minmax(320px, var(--ws-left-pane-width, 57.5%))
    10px
    minmax(360px, 1fr);
  min-height: 0;
}

.ws-panes > .ws-left-pane {
  min-width: 0;
  border-right: 0;
}

.ws-pane-resizer {
  position: relative;
  z-index: 2;
  display: grid;
  width: 10px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: var(--ws-surface-alt);
  cursor: col-resize;
  touch-action: none;
  place-items: center;
}

.ws-pane-resizer::before {
  position: absolute;
  inset: 0 auto;
  width: 1px;
  background: var(--ws-line);
  content: '';
}

.ws-pane-resizer span {
  position: relative;
  width: 3px;
  height: 52px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-line-strong, var(--ws-line));
  transform: scaleY(0.73);
  transition: background-color 160ms ease, transform 160ms ease;
}

.ws-pane-resizer:hover span,
.ws-pane-resizer:focus-visible span,
.ws-pane-resizer.active span {
  background: var(--ws-accent);
  transform: scaleY(1);
}

.ws-pane-resizer:focus-visible {
  outline: 2px solid var(--ws-accent);
  outline-offset: -2px;
}

:global(html.ws-pane-resizing),
:global(html.ws-pane-resizing *) {
  cursor: col-resize !important;
  user-select: none !important;
}

/* 学生 IDE 右上：导师与报告 */
.ws-ide-side {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-side-tabs {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-side-tabs button {
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-4);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-side-tabs button:hover,
.ws-side-tabs button.active {
  color: var(--ws-accent);
}

.ws-side-tabs button.active {
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.ws-ide-side > :deep(.ws-report),
.ws-ide-side > :deep(.ws-tutor-pane) {
  min-height: 0;
  overflow: hidden;
}

/* 右栏：终端在上，下半区在「实验报告 / 代码 / AI 导师」间切换。 */
.ws-right {
  display: grid;
  grid-template-rows: minmax(0, 0.85fr) minmax(0, 1.15fr);
  min-width: 0;
  min-height: 0;
  border-left: 0;
}

/* 教师右栏：整栏一个作业发布面板。 */
.ws-right-teacher {
  grid-template-rows: minmax(0, 1fr);
}

.ws-panel-wrap {
  display: grid;
  min-width: 0;
  min-height: 0;
}

.ws-bottom {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

/* 最大化：铺满顶栏以下的整个工作台。 */
.ws-max {
  position: fixed;
  top: var(--ws-topbar-height);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-right-tabs {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-tab-max {
  display: grid;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  margin-left: auto;
  margin-bottom: var(--ws-space-1);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-tab-max:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-right-tabs button {
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-4);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-right-tabs button:hover {
  color: var(--ws-accent);
}

.ws-right-tabs button.active {
  color: var(--ws-accent);
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.ws-mobile-switch {
  display: none;
}

/* -- 老师公告横幅 ----------------------------------------------------------- */
.ws-teacher-notice {
  position: fixed;
  top: calc(var(--ws-topbar-height) + var(--ws-space-2));
  left: 50%;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--ws-space-3);
  max-width: min(720px, calc(100vw - 2 * var(--ws-space-4)));
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-ink);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent-soft);
  box-shadow: var(--ws-shadow-2);
  font-size: var(--ws-text-sm);
  transform: translateX(-50%);
}

.ws-teacher-notice button {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  color: var(--ws-ink-muted);
  border: 0;
  border-radius: var(--ws-radius-full);
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.ws-teacher-notice button:hover {
  color: var(--ws-accent);
  background: var(--ws-surface);
}

/* -- 模型设置弹窗 ---------------------------------------------------------- */
.ws-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-toast);
  display: grid;
  place-items: center;
  padding: var(--ws-space-4);
  background: color-mix(in srgb, var(--ws-ink) 40%, transparent);
}

.ws-modal {
  width: min(460px, 100%);
  padding: var(--ws-space-5);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg, var(--ws-radius-md));
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-modal h2 {
  margin: 0 0 var(--ws-space-2);
  font-size: var(--ws-text-lg, 1.1rem);
  font-weight: var(--ws-weight-semibold);
}

.ws-modal-hint {
  margin: 0 0 var(--ws-space-4);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-modal-status {
  margin: 0 0 var(--ws-space-4);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-modal-status[data-state='remote'] {
  color: var(--ws-accent);
}

.ws-modal-status[data-state='offline'] {
  color: var(--ws-danger, #c0392b);
}

.ws-modal-field {
  display: block;
  margin-bottom: var(--ws-space-3);
}

.ws-scaffold-chip span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-scaffold-bin > div {
  display: flex;
  gap: var(--ws-space-2);
}

.ws-scaffold-bin input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
}

.ws-scaffold-log {
  max-height: 180px;
  margin: 0 0 var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-3);
  overflow: auto;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  line-height: 1.6;
  white-space: pre-wrap;
}

.ws-modal-field span {
  display: block;
  margin-bottom: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-medium);
}

.ws-modal-field input {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-modal-field input:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-modal-actions {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-4);
}

.ws-modal-spacer {
  flex: 1;
}

.ws-modal-primary,
.ws-modal-secondary {
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-medium);
  cursor: pointer;
}

.ws-modal-primary {
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  background: var(--ws-accent);
}

.ws-modal-secondary {
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-modal-secondary:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

/* -- 提示 ------------------------------------------------------------------ */
.ws-toast {
  position: fixed;
  right: var(--ws-space-5);
  bottom: var(--ws-space-5);
  z-index: var(--ws-z-toast);
  max-width: min(420px, calc(100vw - 2 * var(--ws-space-5)));
  margin: 0;
  padding: var(--ws-space-3) var(--ws-space-4);
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  box-shadow: var(--ws-shadow-3);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-medium);
  line-height: var(--ws-leading-normal);
}

@media (prefers-reduced-motion: reduce) {
  .ws-pane-resizer span {
    transition: none;
  }
}

@media (max-width: 900px) {
  .ws-workspace {
    grid-template-rows: var(--ws-topbar-height) auto minmax(0, 1fr);
  }

  .ws-brand-text small {
    display: none;
  }

  .ws-topbar-link span {
    display: none;
  }

  .ws-mobile-switch {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--ws-space-1);
    padding: var(--ws-space-2) var(--ws-space-3);
    border-bottom: 1px solid var(--ws-line);
    background: var(--ws-surface-alt);
  }

  .ws-mobile-switch:has(button:nth-child(2):last-child),
  .ws-workspace:has(.ws-right-teacher) .ws-mobile-switch {
    grid-template-columns: 1fr 1fr;
  }

  .ws-mobile-switch button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ws-space-1);
    min-height: var(--ws-control-md);
    color: var(--ws-ink-muted);
    border: 1px solid transparent;
    border-radius: var(--ws-radius-md);
    background: transparent;
    font: inherit;
    font-size: var(--ws-text-sm);
    font-weight: var(--ws-weight-semibold);
    cursor: pointer;
  }

  .ws-mobile-switch button.active {
    color: var(--ws-accent-contrast);
    border-color: var(--ws-accent);
    background: var(--ws-accent);
  }

  .ws-panes {
    grid-template-columns: minmax(0, 1fr);
  }

  .ws-pane-resizer {
    display: none;
  }

  .ws-panes > .ws-mobile-hidden {
    display: none;
  }

  .ws-toast {
    right: var(--ws-space-3);
    left: var(--ws-space-3);
    bottom: var(--ws-space-3);
    max-width: none;
  }
}
</style>
