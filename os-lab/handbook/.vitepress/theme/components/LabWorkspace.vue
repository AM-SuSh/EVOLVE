<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useData, useRoute, useRouter, withBase } from 'vitepress'
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, CircleSlash, Clock, Code2, LockKeyhole, Maximize2, MessageSquarePlus, MessagesSquare, Minimize2, PanelLeftClose, Play, Rocket, RotateCcw, TableOfContents, XCircle } from 'lucide-vue-next'
import ManualPane from './ManualPane.vue'
import FinalProjectPane from './FinalProjectPane.vue'
import TutorPane from './TutorPane.vue'
import TerminalPanel from './TerminalPanel.vue'
import ReportPanel from './ReportPanel.vue'
import AssessmentPane from './AssessmentPane.vue'
import CodePanel from './CodePanel.vue'
import ProblemsPanel from './ProblemsPanel.vue'
import TeacherDocPanel from './TeacherDocPanel.vue'
import TeacherPublishPanel from './TeacherPublishPanel.vue'
import {
  WORKSPACE_OPEN_LLM_SETTINGS_EVENT,
  clearWorkspaceNav,
  updateWorkspaceNav,
} from '../workspace-nav'
import { DEFAULT_REPORT_TEMPLATE, cloneTemplate, type ReportTemplate } from '../report-template'
import {
  createWorkspaceContext,
  provideWorkspaceContext,
  type WorkspaceContext,
} from '../composables/useWorkspaceContext'
import {
  CHAT_ATTACHMENT_MAX_COUNT,
  chatEvidenceRefs,
  chatSourceLabels,
  clampChatBody,
  formatChatWithAttachments,
  type ChatAttachment,
  type ChatAttachmentOrigin,
  type ChatAttachmentSource,
} from '../chat-attachments'
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
  isTutorRefused,
  loadAuth,
  loadEvents,
  loadLlmConfig,
  offlineTutorReply,
  saveAuth,
  saveLlmConfig,
  tutorStages,
  type LearningEvent,
  type LearningAccessItem,
  type FinalProjectAccess,
  type LlmConfig,
  type TutorLabId,
  type TutorMessage,
  type TutorKnowledgeChunk,
  type TutorRetrievalDiagnostics,
  type TutorPrompt,
  type TutorStageId,
  type TutorState,
} from '../tutor-model'

const props = defineProps<{ labId: TutorLabId }>()

const workspaceContext: WorkspaceContext = createWorkspaceContext()
provideWorkspaceContext(workspaceContext)

/** 代码区 ref：手册「源码引用」与 Problems 诊断点击都通过它跳转。 */
const codePanelRef = ref<InstanceType<typeof CodePanel> | null>(null)
const manualPaneRef = ref<InstanceType<typeof ManualPane> | null>(null)
const manualTocOpen = ref(false)
const problemsPanelRef = ref<InstanceType<typeof ProblemsPanel> | null>(null)
const tutorPaneRef = ref<InstanceType<typeof TutorPane> | null>(null)
/** 各面板「添加到对话」累积的附件，发送时一并交给导师。 */
const chatAttachments = ref<ChatAttachment[]>([])

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
const classNames = ref<string[]>([])
const classNamesLoading = ref(false)
const authBusy = ref(false)
const authError = ref('')
const manualKey = ref(0)

function apiUrl(pathname: string) {
  return `${endpoint}${pathname}`
}

async function loadClassNames() {
  classNamesLoading.value = true
  try {
    const response = await fetch(apiUrl('/auth/classes'))
    const payload = await response.json().catch(() => ({}))
    classNames.value = response.ok && Array.isArray(payload.classes) ? payload.classes : []
  } catch {
    classNames.value = []
  } finally {
    classNamesLoading.value = false
  }
}

function switchAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login'
  authError.value = ''
  authForm.value.className = ''
  if (authMode.value === 'register') void loadClassNames()
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
  finalProjectAccess.value = null
  manualKey.value += 1
  showIdentity.value = true
  toast('已退出登录，请重新登录后再使用工作台。')
}

const { isDark } = useData()
const router = useRouter()
const route = useRoute()
const FINAL_MODE_KEY = 'os-lab-final-mode'
const finalMode = ref(
  route.query?.final === '1' ||
    (typeof window !== 'undefined' && window.sessionStorage.getItem(FINAL_MODE_KEY) === '1'),
)

watch(
  () => route.query?.final,
  (value) => {
    finalMode.value = value === '1'
  },
)

const sessionId = ref('')
const activeStage = ref<TutorStageId>('orient')
/** 最近一次 chat 回传的导师门控状态；未对话前为 null（证据条走可信空态）。 */
const lastTutorState = ref<TutorState | null>(null)
const events = ref<LearningEvent[]>([])
const messages = ref<TutorMessage[]>([])
const tutorOpen = ref(false)
const sending = ref(false)
const streamingId = ref('')
const connection = ref<'checking' | 'remote' | 'offline'>('checking')
const modelName = ref('')
const notice = ref('')
const currentSection = ref({ h2: '', h3: '' })
const teacherManualLocation = ref<{ h2: string; h3: string; offset: number } | null>(null)
const mobileView = ref<'manual' | 'practice'>('manual')
function routeParam(name: string) {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name) || ''
}

const teachingVariantHint = computed(() => routeParam('variant'))
/** 右栏学习支持页签；AI 导师通过悬浮入口打开。 */
const rightTab = ref<'report' | 'assessment'>('report')

const TUTOR_CONVERSATION_STORAGE_KEY = 'os-lab-tutor-conversations-v2'
const MAX_STORED_TUTOR_MESSAGES = 120

interface StoredTutorConversation {
  sessionId: string
  stage: TutorStageId
  messages: TutorMessage[]
  tutorState: TutorState | null
  updatedAt: string
}

function tutorConversationKey() {
  const user = studentId.value || 'local'
  return `${user}:${props.labId}`
}

function loadTutorConversation() {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(TUTOR_CONVERSATION_STORAGE_KEY)
    if (!raw) return false
    const all = JSON.parse(raw) as Record<string, StoredTutorConversation>
    const stored = all[tutorConversationKey()]
    if (!stored || typeof stored.sessionId !== 'string' || !Array.isArray(stored.messages) || stored.messages.length === 0) {
      return false
    }
    const restored = stored.messages.filter((message) =>
      message &&
      (message.role === 'student' || message.role === 'assistant') &&
      typeof message.content === 'string',
    )
    if (restored.length === 0) return false
    const stage = tutorStages.some((item) => item.id === stored.stage) ? stored.stage : 'orient'
    sessionId.value = stored.sessionId
    activeStage.value = stage
    messages.value = restored.slice(-MAX_STORED_TUTOR_MESSAGES)
    lastTutorState.value = stored.tutorState || null
    return true
  } catch {
    return false
  }
}

function persistTutorConversation() {
  if (typeof localStorage !== 'undefined' && sessionId.value && messages.value.length) {
    try {
      const raw = localStorage.getItem(TUTOR_CONVERSATION_STORAGE_KEY)
      const all = raw ? (JSON.parse(raw) as Record<string, StoredTutorConversation>) : {}
      all[tutorConversationKey()] = {
        sessionId: sessionId.value,
        stage: activeStage.value,
        messages: messages.value.slice(-MAX_STORED_TUTOR_MESSAGES),
        tutorState: lastTutorState.value,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(TUTOR_CONVERSATION_STORAGE_KEY, JSON.stringify(all))
    } catch {
      // Storage failures must not interrupt the active conversation.
    }
  }
  if (auth.value && sessionId.value && messages.value.length) {
    void fetch(`${endpoint}/conversations/mine`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        conversation: {
          sessionId: sessionId.value,
          labId: props.labId,
          stage: activeStage.value,
          messages: messages.value.slice(-MAX_STORED_TUTOR_MESSAGES),
          tutorState: lastTutorState.value,
          updatedAt: new Date().toISOString(),
        },
      }),
    }).catch(() => {
      /* local storage remains the offline buffer */
    })
  }
}

async function loadServerTutorConversation() {
  if (!auth.value) return false
  try {
    const response = await fetch(`${endpoint}/conversations/mine?labId=${encodeURIComponent(props.labId)}`, {
      headers: authHeaders(),
    })
    if (!response.ok) return false
    const payload = await response.json()
    const stored = payload?.conversation as StoredTutorConversation | null
    if (!stored || !Array.isArray(stored.messages) || !stored.messages.length) return false
    const restored = stored.messages.filter((message) =>
      message &&
      (message.role === 'student' || message.role === 'assistant') &&
      typeof message.content === 'string',
    )
    if (!restored.length) return false
    sessionId.value = stored.sessionId
    activeStage.value = tutorStages.some((item) => item.id === stored.stage) ? stored.stage : 'orient'
    messages.value = restored.slice(-MAX_STORED_TUTOR_MESSAGES)
    lastTutorState.value = stored.tutorState || null
    persistTutorConversation()
    return true
  } catch {
    return false
  }
}

const bottomTab = ref<'terminal' | 'problems' | 'tests'>('terminal')
type RunAssertionItem = {
  id: string
  label: string
  passed: boolean
  expected: string
  observed: string
  hint?: string
}
type StoredRunResult = {
  runId: string
  verified: boolean
  trusted: boolean
  stopped?: string
  at: string
  assertions: RunAssertionItem[]
}

interface ServerRunHistoryItem {
  runId: string
  labId: string
  recipeId: string | null
  trusted: boolean
  verified: boolean
  status: string
  startedAt: string
  finishedAt: string | null
  exitCode: number | null
  assertions: RunAssertionItem[]
}

/** 测试结果本地缓存：按 lab + 学生隔离，默认保留 24 小时（刷新不丢）。 */
const RUN_RESULTS_STORAGE_KEY = 'os-lab-run-results-v2'
const RUN_RESULTS_TTL_MS = 24 * 60 * 60 * 1000
const RUN_RESULTS_HISTORY_CAP = 8

type PersistedRunResults = {
  version: 1
  labId: string
  student: string
  savedAt: number
  lastRunId: string
  lastAssertionsRunId: string
  lastAssertions: RunAssertionItem[]
  history: StoredRunResult[]
}

function emptyRunResults() {
  return {
    lastRunId: '',
    lastAssertionsRunId: '',
    lastAssertions: [] as RunAssertionItem[],
    history: [] as StoredRunResult[],
  }
}

function isFreshTimestamp(value: string | number, now = Date.now()) {
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) && now - ms <= RUN_RESULTS_TTL_MS
}

function loadPersistedRunResults(labId: string, student: string) {
  const empty = emptyRunResults()
  if (typeof localStorage === 'undefined') return empty
  try {
    const raw = localStorage.getItem(RUN_RESULTS_STORAGE_KEY)
    if (!raw) return empty
    const all = JSON.parse(raw) as Record<string, PersistedRunResults>
    const key = `${labId}::${student || 'anon'}`
    const bundle = all?.[key]
    if (!bundle || bundle.version !== 1 || bundle.labId !== labId) return empty
    if (!isFreshTimestamp(bundle.savedAt)) return empty
    const history = (Array.isArray(bundle.history) ? bundle.history : [])
      .filter((item) => item?.runId && isFreshTimestamp(item.at))
      .slice(0, RUN_RESULTS_HISTORY_CAP)
    const cachedAssertions = Array.isArray(bundle.lastAssertions) ? bundle.lastAssertions : []
    const cachedAssertionsRunId =
      typeof bundle.lastAssertionsRunId === 'string' ? bundle.lastAssertionsRunId : ''
    const historyHit = history.find((item) => item.runId === cachedAssertionsRunId && item.assertions?.length)
    const fallbackHit = history.find((item) => item.assertions?.length)
    const lastAssertionsRunId = historyHit?.runId || (cachedAssertions.length ? cachedAssertionsRunId : '') || fallbackHit?.runId || ''
    const lastAssertions =
      (historyHit?.assertions?.length ? historyHit.assertions : null) ||
      (cachedAssertionsRunId === lastAssertionsRunId && cachedAssertions.length ? cachedAssertions : null) ||
      fallbackHit?.assertions ||
      []
    return {
      lastRunId: typeof bundle.lastRunId === 'string' ? bundle.lastRunId : '',
      lastAssertionsRunId,
      lastAssertions,
      history,
    }
  } catch {
    return empty
  }
}

function persistRunResults(
  labId: string,
  student: string,
  snapshot: {
    lastRunId: string
    lastAssertionsRunId: string
    lastAssertions: RunAssertionItem[]
    history: StoredRunResult[]
  },
) {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(RUN_RESULTS_STORAGE_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, PersistedRunResults>
    const key = `${labId}::${student || 'anon'}`
    const now = Date.now()
    // 清掉过期条目，避免 localStorage 无限膨胀。
    for (const [entryKey, bundle] of Object.entries(all)) {
      if (!bundle?.savedAt || !isFreshTimestamp(bundle.savedAt, now)) delete all[entryKey]
    }
    all[key] = {
      version: 1,
      labId,
      student: student || 'anon',
      savedAt: now,
      lastRunId: snapshot.lastRunId,
      lastAssertionsRunId: snapshot.lastAssertionsRunId,
      lastAssertions: snapshot.lastAssertions,
      history: snapshot.history.slice(0, RUN_RESULTS_HISTORY_CAP),
    }
    localStorage.setItem(RUN_RESULTS_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* quota / 隐私模式：忽略，不影响主流程 */
  }
}

function saveCurrentRunResults() {
  persistRunResults(props.labId, studentId.value, {
    lastRunId: lastRunId.value,
    lastAssertionsRunId: lastAssertionsRunId.value,
    lastAssertions: lastAssertions.value,
    history: runResultHistory.value,
  })
}

function restoreRunResultsForScope() {
  const loaded = loadPersistedRunResults(props.labId, studentId.value)
  lastRunId.value = loaded.lastRunId
  lastAssertionsRunId.value = loaded.lastAssertionsRunId
  lastAssertions.value = loaded.lastAssertions
  runResultHistory.value = loaded.history
  if (workspaceContext && loaded.lastRunId) {
    workspaceContext.lastRunId = loaded.lastRunId
  }
  void loadServerRunHistory()
}

async function loadServerRunHistory() {
  if (!studentId.value) return
  try {
    const response = await fetch(
      `${endpoint}/runs/history?labId=${encodeURIComponent(props.labId)}&limit=100`,
      { headers: authHeaders() },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(payload.runs)) return
    const history: StoredRunResult[] = payload.runs.map((run: ServerRunHistoryItem) => ({
      runId: run.runId,
      verified: run.verified,
      trusted: run.trusted,
      stopped: run.status === 'stopped' ? 'stopped' : undefined,
      at: run.finishedAt || run.startedAt,
      assertions: run.assertions || [],
    }))
    const latestWithAssertions = history.find((item) => item.assertions.length)
    runResultHistory.value = history
    if (history.length) lastRunId.value = history[0].runId
    if (latestWithAssertions) {
      lastAssertions.value = latestWithAssertions.assertions
      lastAssertionsRunId.value = latestWithAssertions.runId
    } else {
      lastAssertions.value = []
      lastAssertionsRunId.value = ''
    }
    saveCurrentRunResults()
  } catch {
    // keep the local cache when the server is temporarily unavailable
  }
}

/** 最近一次运行的 runId，供 Trace/Problems 查询对应产物。 */
const lastRunId = ref('')
/** 最近一次「带断言」的运行结果；空断言 / 停止不会冲掉上一份。 */
const lastAssertions = ref<RunAssertionItem[]>([])
/** 与 lastAssertions 对应的 runId（可与 lastRunId 不同：后者可能是刚停止、无断言的 run）。 */
const lastAssertionsRunId = ref('')
/** 近期测试结果历史（新→旧），供「测试结果」页签回顾。 */
const runResultHistory = ref<StoredRunResult[]>([])
/** 最近一次诊断条数，用于 Problems 页签角标。 */
const lastDiagnosticCount = ref(0)

watch(
  () => [props.labId, studentId.value] as const,
  () => restoreRunResultsForScope(),
  { immediate: true },
)

/** 右上工作区、右下学习支持区或底部面板可铺满顶栏以下的整个页面。 */
const maximized = ref<'none' | 'workspace' | 'assistant' | 'dock'>('none')

function toggleMaximized(target: 'workspace' | 'assistant' | 'dock') {
  if (target === 'dock') terminalDockOpen.value = true
  maximized.value = maximized.value === target ? 'none' : target
}

/* -- 三栏开关与纵向比例（手册 / 工作区 / 学习支持） ------------------------ */

const PANEL_STORAGE_KEY = 'os-lab-panels-v1'
const PRACTICE_SPLIT_KEY = 'os-lab-workspace-support-split-v1'
const PRACTICE_SPLIT_MIN = 40
const PRACTICE_SPLIT_MAX = 78
const DEFAULT_PRACTICE_SPLIT = 64
const WORKSPACE_CODE_SPLIT_KEY = 'os-lab-code-terminal-split-v1'
const WORKSPACE_CODE_SPLIT_MIN = 35
const WORKSPACE_CODE_SPLIT_MAX = 80
const DEFAULT_WORKSPACE_CODE_SPLIT = WORKSPACE_CODE_SPLIT_MAX

type PanelKey = 'manual' | 'practice' | 'terminal'

function loadPanelState(): Record<PanelKey, boolean> {
  const defaults = { manual: true, practice: true, terminal: true }
  if (typeof localStorage === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    if (!raw) return defaults
    const merged = { ...defaults, ...JSON.parse(raw) } as Record<PanelKey, boolean>
    return merged
  } catch {
    return defaults
  }
}

function loadPracticeSplit() {
  if (typeof localStorage === 'undefined') return DEFAULT_PRACTICE_SPLIT
  const stored = Number(localStorage.getItem(PRACTICE_SPLIT_KEY))
  return Number.isFinite(stored)
    ? clamp(stored, PRACTICE_SPLIT_MIN, PRACTICE_SPLIT_MAX)
    : DEFAULT_PRACTICE_SPLIT
}

function loadWorkspaceCodeSplit() {
  if (typeof localStorage === 'undefined') return DEFAULT_WORKSPACE_CODE_SPLIT
  const stored = Number(localStorage.getItem(WORKSPACE_CODE_SPLIT_KEY))
  return Number.isFinite(stored)
    ? clamp(stored, WORKSPACE_CODE_SPLIT_MIN, WORKSPACE_CODE_SPLIT_MAX)
    : DEFAULT_WORKSPACE_CODE_SPLIT
}

const panelOpen = ref(loadPanelState())
const practiceSplit = ref(loadPracticeSplit())
const workspaceCodeSplit = ref(loadWorkspaceCodeSplit())
/** xterm 终端面板是否展开（独立于「学习支持」区，不持久化）。 */
const terminalDockOpen = ref(true)
watch(terminalDockOpen, (open) => {
  if (!open && maximized.value === 'dock') maximized.value = 'none'
})
const rightElement = ref<HTMLElement | null>(null)
const workspaceBodyElement = ref<HTMLElement | null>(null)
const rowResizing = ref(false)
const workspaceRowResizing = ref(false)

/** 窄屏走 Tab 切换，手册折叠状态不应让正文从 DOM 中消失。 */
const isMobileLayout = ref(false)

function syncMobileLayout() {
  if (typeof window === 'undefined') return
  isMobileLayout.value = window.matchMedia('(max-width: 900px)').matches
}

const showManualPane = computed(() => {
  if (isTeacherRole.value) return !isMobileLayout.value || mobileView.value === 'manual'
  if (isMobileLayout.value) return mobileView.value === 'manual'
  return panelOpen.value.manual
})

const showPracticePane = computed(() => {
  if (isMobileLayout.value && mobileView.value === 'practice') return true
  return panelOpen.value.practice
})

const showTerminalPane = computed(() => {
  if (isMobileLayout.value && mobileView.value === 'practice') return true
  return panelOpen.value.terminal
})

/** xterm 运行终端是否展开：仅当工作区可见且用户未收起终端时为真。 */
const showTerminalDock = computed(() => showPracticePane.value && terminalDockOpen.value)

/** 右栏（实践 + 终端）是否有任一可见。 */
const showRightPane = computed(() => {
  if (isTeacherRole.value) return true
  if (isMobileLayout.value) return mobileView.value === 'practice'
  return showPracticePane.value || showTerminalPane.value
})

watch(mobileView, (view) => {
  if (!isMobileLayout.value) return
  if (view === 'manual' && !panelOpen.value.manual) {
    panelOpen.value.manual = true
    persistPanels()
  }
  if (view === 'practice' && (!panelOpen.value.practice || !panelOpen.value.terminal)) {
    panelOpen.value.practice = true
    panelOpen.value.terminal = true
    persistPanels()
  }
})

function persistPanels() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelOpen.value))
}

function togglePanel(key: PanelKey) {
  if (
    (key === 'practice' && (maximized.value === 'workspace' || maximized.value === 'dock')) ||
    (key === 'terminal' && maximized.value === 'assistant')
  ) {
    maximized.value = 'none'
  }
  panelOpen.value[key] = !panelOpen.value[key]
  persistPanels()
}

function closeMaximizedOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (tutorOpen.value) {
    tutorOpen.value = false
    return
  }
  if (maximized.value !== 'none') maximized.value = 'none'
}

function startRowResize(event: PointerEvent) {
  if (event.button !== 0) return
  rowResizing.value = true
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-row-resizing')
}

function moveRowResize(event: PointerEvent) {
  if (!rowResizing.value) return
  const rect = rightElement.value?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return
  const percent = ((event.clientY - rect.top) / rect.height) * 100
  practiceSplit.value = clamp(percent, PRACTICE_SPLIT_MIN, PRACTICE_SPLIT_MAX)
}

function finishRowResize(event?: PointerEvent) {
  if (!rowResizing.value) return
  rowResizing.value = false
  document.documentElement.classList.remove('ws-row-resizing')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PRACTICE_SPLIT_KEY, String(practiceSplit.value))
  }
}

function persistWorkspaceCodeSplit() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(WORKSPACE_CODE_SPLIT_KEY, String(workspaceCodeSplit.value))
}

function startWorkspaceRowResize(event: PointerEvent) {
  if (event.button !== 0) return
  workspaceRowResizing.value = true
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-row-resizing')
}

function moveWorkspaceRowResize(event: PointerEvent) {
  if (!workspaceRowResizing.value) return
  const rect = workspaceBodyElement.value?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return
  const percent = ((event.clientY - rect.top) / rect.height) * 100
  workspaceCodeSplit.value = clamp(
    percent,
    WORKSPACE_CODE_SPLIT_MIN,
    WORKSPACE_CODE_SPLIT_MAX,
  )
}

function finishWorkspaceRowResize(event?: PointerEvent) {
  if (!workspaceRowResizing.value) return
  workspaceRowResizing.value = false
  document.documentElement.classList.remove('ws-row-resizing')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  persistWorkspaceCodeSplit()
}

function resetWorkspaceCodeSplit() {
  workspaceCodeSplit.value = DEFAULT_WORKSPACE_CODE_SPLIT
  persistWorkspaceCodeSplit()
}

function resizeWorkspaceByKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const delta = event.key === 'ArrowUp' ? -2 : 2
  workspaceCodeSplit.value = clamp(
    workspaceCodeSplit.value + delta,
    WORKSPACE_CODE_SPLIT_MIN,
    WORKSPACE_CODE_SPLIT_MAX,
  )
  persistWorkspaceCodeSplit()
}

const workspaceGridStyle = computed<Record<string, string>>(() => {
  if (!showTerminalDock.value) return { gridTemplateRows: '1fr' }
  const terminal = 100 - workspaceCodeSplit.value
  return {
    gridTemplateRows: `minmax(140px, ${workspaceCodeSplit.value}fr) 6px minmax(100px, ${terminal}fr)`,
  }
})

const rightGridStyle = computed<Record<string, string>>(() => {
  if (!showPracticePane.value || !showTerminalPane.value) return {}
  const terminal = 100 - practiceSplit.value
  return {
    gridTemplateRows: `minmax(120px, ${practiceSplit.value}fr) 6px minmax(100px, ${terminal}fr)`,
  }
})

const rightPaneClass = computed(() => {
  if (showPracticePane.value && showTerminalPane.value) return 'ws-right-split'
  return showPracticePane.value
    ? 'ws-right-single ws-right-workspace-only'
    : 'ws-right-single ws-right-assistant-only'
})

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

const TUTOR_PANEL_WIDTH_KEY = 'os-lab-tutor-panel-width-v1'
const TUTOR_PANEL_MIN_WIDTH = 360
const TUTOR_PANEL_MAX_WIDTH = 840
const TUTOR_PANEL_DEFAULT_WIDTH = 520
const TUTOR_PANEL_VIEWPORT_GUTTER = 24
const TUTOR_PANEL_POSITION_KEY = 'os-lab-tutor-panel-position-v1'
const TUTOR_PANEL_FLOAT_MAX_HEIGHT = 720
const TUTOR_PANEL_MIN_HEIGHT = 360
const TUTOR_PANEL_HEIGHT_KEY = 'os-lab-tutor-panel-height-v1'
const TUTOR_FAB_POSITION_KEY = 'os-lab-tutor-fab-position-v1'
const TUTOR_FAB_SIZE = 48
const TUTOR_POSITION_GUTTER = 8

interface TutorPosition {
  x: number
  y: number
}

interface StoredTutorPanelPlacement extends TutorPosition {
  floating: boolean
}

interface TutorPanelResizeOrigin {
  pointerX: number
  pointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  anchorRight: boolean
  anchorBottom: boolean
  resizeWidth: boolean
  resizeHeight: boolean
}

function tutorPanelMaxWidth() {
  if (typeof window === 'undefined') return TUTOR_PANEL_MAX_WIDTH
  return Math.min(TUTOR_PANEL_MAX_WIDTH, window.innerWidth - TUTOR_PANEL_VIEWPORT_GUTTER)
}

function loadTutorPanelWidth() {
  if (typeof localStorage === 'undefined') return TUTOR_PANEL_DEFAULT_WIDTH
  try {
    const raw = localStorage.getItem(TUTOR_PANEL_WIDTH_KEY)
    if (raw === null) return TUTOR_PANEL_DEFAULT_WIDTH
    const stored = Number(raw)
    return Number.isFinite(stored)
      ? clamp(stored, TUTOR_PANEL_MIN_WIDTH, TUTOR_PANEL_MAX_WIDTH)
      : TUTOR_PANEL_DEFAULT_WIDTH
  } catch {
    return TUTOR_PANEL_DEFAULT_WIDTH
  }
}

const tutorPanelWidth = ref(loadTutorPanelWidth())
const tutorResizing = ref(false)
const tutorHeightResizing = ref(false)

function loadTutorPanelPlacement(): StoredTutorPanelPlacement {
  if (typeof localStorage === 'undefined') return { x: 0, y: 0, floating: false }
  try {
    const raw = localStorage.getItem(TUTOR_PANEL_POSITION_KEY)
    if (!raw) return { x: 0, y: 0, floating: false }
    const stored = JSON.parse(raw) as Partial<StoredTutorPanelPlacement>
    if (!Number.isFinite(stored.x) || !Number.isFinite(stored.y)) {
      return { x: 0, y: 0, floating: false }
    }
    return { x: stored.x as number, y: stored.y as number, floating: stored.floating === true }
  } catch {
    return { x: 0, y: 0, floating: false }
  }
}

function loadTutorFabPosition(): TutorPosition | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(TUTOR_FAB_POSITION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<TutorPosition>
    return Number.isFinite(stored.x) && Number.isFinite(stored.y)
      ? { x: stored.x as number, y: stored.y as number }
      : null
  } catch {
    return null
  }
}

const storedTutorPanelPlacement = loadTutorPanelPlacement()
const tutorPanelFloating = ref(storedTutorPanelPlacement.floating)
const tutorPanelPosition = ref<TutorPosition>({
  x: storedTutorPanelPlacement.x,
  y: storedTutorPanelPlacement.y,
})
const tutorPanelDragging = ref(false)
const tutorFabPosition = ref<TutorPosition | null>(loadTutorFabPosition())
const tutorFabDragging = ref(false)
const tutorFabMoved = ref(false)
let tutorPanelDragOrigin: (TutorPosition & { pointerX: number; pointerY: number }) | null = null
let tutorFabDragOrigin: (TutorPosition & { pointerX: number; pointerY: number }) | null = null
let tutorPanelResizeOrigin: TutorPanelResizeOrigin | null = null

function tutorTopbarHeight() {
  if (typeof window === 'undefined') return 56
  const stored = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vp-nav-height'))
  return Number.isFinite(stored) ? stored : 56
}

function tutorPanelHeightMax() {
  if (typeof window === 'undefined') return TUTOR_PANEL_FLOAT_MAX_HEIGHT
  return Math.max(240, Math.min(
    TUTOR_PANEL_FLOAT_MAX_HEIGHT,
    window.innerHeight - tutorTopbarHeight() - 2 * TUTOR_POSITION_GUTTER,
  ))
}

function tutorPanelHeightMin() {
  return Math.min(TUTOR_PANEL_MIN_HEIGHT, tutorPanelHeightMax())
}

function defaultTutorPanelHeight() {
  return clamp(TUTOR_PANEL_FLOAT_MAX_HEIGHT, tutorPanelHeightMin(), tutorPanelHeightMax())
}

function loadTutorPanelHeight() {
  if (typeof localStorage === 'undefined') return TUTOR_PANEL_FLOAT_MAX_HEIGHT
  try {
    const raw = localStorage.getItem(TUTOR_PANEL_HEIGHT_KEY)
    if (raw === null) return TUTOR_PANEL_FLOAT_MAX_HEIGHT
    const stored = Number(raw)
    return Number.isFinite(stored)
      ? clamp(stored, TUTOR_PANEL_MIN_HEIGHT, TUTOR_PANEL_FLOAT_MAX_HEIGHT)
      : TUTOR_PANEL_FLOAT_MAX_HEIGHT
  } catch {
    return TUTOR_PANEL_FLOAT_MAX_HEIGHT
  }
}

const tutorPanelHeight = ref(loadTutorPanelHeight())

function setTutorPanelHeight(value: number, persist = false) {
  tutorPanelHeight.value = clamp(value, tutorPanelHeightMin(), tutorPanelHeightMax())
  if (!persist || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TUTOR_PANEL_HEIGHT_KEY, String(Math.round(tutorPanelHeight.value)))
  } catch {
    // Height persistence is optional; resizing the window must remain available.
  }
}

function tutorPanelPositionBounds() {
  if (typeof window === 'undefined') {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  const minX = TUTOR_POSITION_GUTTER
  const minY = tutorTopbarHeight() + TUTOR_POSITION_GUTTER
  return {
    minX,
    maxX: Math.max(minX, window.innerWidth - tutorPanelWidth.value - TUTOR_POSITION_GUTTER),
    minY,
    maxY: Math.max(minY, window.innerHeight - tutorPanelHeight.value - TUTOR_POSITION_GUTTER),
  }
}

function setTutorPanelPosition(x: number, y: number) {
  const bounds = tutorPanelPositionBounds()
  tutorPanelPosition.value = {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  }
}

function persistTutorPanelPlacement() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TUTOR_PANEL_POSITION_KEY, JSON.stringify({
      ...tutorPanelPosition.value,
      floating: tutorPanelFloating.value,
    }))
  } catch {
    // Position persistence is optional; moving the window must remain available.
  }
}

function tutorFabPositionBounds() {
  if (typeof window === 'undefined') {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  const min = TUTOR_POSITION_GUTTER
  return {
    minX: min,
    maxX: Math.max(min, window.innerWidth - TUTOR_FAB_SIZE - min),
    minY: min,
    maxY: Math.max(min, window.innerHeight - TUTOR_FAB_SIZE - min),
  }
}

function defaultTutorFabPosition(): TutorPosition {
  const bounds = tutorFabPositionBounds()
  return { x: bounds.maxX, y: bounds.maxY }
}

function setTutorFabPosition(x: number, y: number, persist = false) {
  const bounds = tutorFabPositionBounds()
  tutorFabPosition.value = {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  }
  if (!persist || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TUTOR_FAB_POSITION_KEY, JSON.stringify(tutorFabPosition.value))
  } catch {
    // Position persistence is optional; dragging the entry point must remain available.
  }
}

function clampTutorFabToViewport() {
  const position = tutorFabPosition.value || defaultTutorFabPosition()
  setTutorFabPosition(position.x, position.y)
}

function dockedTutorPanelLeft() {
  if (typeof window === 'undefined') return 0
  return Math.max(0, window.innerWidth - tutorPanelWidth.value)
}

const tutorPanelStyle = computed<Record<string, string>>(() => ({
  '--ws-tutor-panel-width': `${tutorPanelWidth.value}px`,
  '--ws-tutor-panel-min-width': `${Math.min(TUTOR_PANEL_MIN_WIDTH, tutorPanelMaxWidth())}px`,
  '--ws-tutor-panel-max-width': `${tutorPanelMaxWidth()}px`,
  '--ws-tutor-panel-left': `${tutorPanelPosition.value.x}px`,
  '--ws-tutor-panel-top': `${tutorPanelPosition.value.y}px`,
  '--ws-tutor-panel-height': `${tutorPanelHeight.value}px`,
  '--ws-tutor-panel-min-height': `${tutorPanelHeightMin()}px`,
  '--ws-tutor-panel-max-height': `${tutorPanelHeightMax()}px`,
}))

const tutorFloatStyle = computed<Record<string, string>>(() => {
  if (!tutorFabPosition.value) return {}
  return {
    left: `${tutorFabPosition.value.x}px`,
    top: `${tutorFabPosition.value.y}px`,
    right: 'auto',
    bottom: 'auto',
  }
})

function setTutorPanelWidth(value: number, persist = false) {
  const max = tutorPanelMaxWidth()
  const min = Math.min(TUTOR_PANEL_MIN_WIDTH, max)
  tutorPanelWidth.value = clamp(value, min, max)
  if (!persist || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TUTOR_PANEL_WIDTH_KEY, String(Math.round(tutorPanelWidth.value)))
  } catch {
    // Width persistence is optional; resizing should still work when storage is unavailable.
  }
}

function startTutorPanelResize(
  event: PointerEvent,
  options: Pick<TutorPanelResizeOrigin, 'anchorRight' | 'anchorBottom' | 'resizeWidth' | 'resizeHeight'>,
) {
  if (event.button !== 0 || isMobileLayout.value) return
  const target = event.currentTarget as HTMLElement
  const panel = target.closest('.ws-tutor-popover') as HTMLElement | null
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  if (!tutorPanelFloating.value) {
    setTutorPanelHeight(rect.height)
    tutorPanelFloating.value = true
    setTutorPanelPosition(rect.left, rect.top)
  }
  tutorResizing.value = options.resizeWidth
  tutorHeightResizing.value = options.resizeHeight
  tutorPanelResizeOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    startX: tutorPanelPosition.value.x,
    startY: tutorPanelPosition.value.y,
    startWidth: tutorPanelWidth.value,
    startHeight: tutorPanelHeight.value,
    ...options,
  }
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-tutor-resizing', 'ws-tutor-height-resizing')
}

function moveTutorPanelResize(event: PointerEvent) {
  const origin = tutorPanelResizeOrigin
  if (!origin || (!tutorResizing.value && !tutorHeightResizing.value)) return
  const dx = event.clientX - origin.pointerX
  const dy = event.clientY - origin.pointerY
  if (origin.resizeWidth) {
    const nextWidth = origin.anchorRight ? origin.startWidth - dx : origin.startWidth + dx
    setTutorPanelWidth(nextWidth)
  }
  if (origin.resizeHeight) {
    const nextHeight = origin.anchorBottom ? origin.startHeight - dy : origin.startHeight + dy
    setTutorPanelHeight(nextHeight)
  }
  let nextX = tutorPanelPosition.value.x
  let nextY = tutorPanelPosition.value.y
  if (origin.resizeWidth && origin.anchorRight) nextX = origin.startX + dx
  if (origin.resizeHeight && origin.anchorBottom) nextY = origin.startY + dy
  setTutorPanelPosition(nextX, nextY)
}

function finishTutorPanelResize(event?: PointerEvent) {
  if (!tutorResizing.value && !tutorHeightResizing.value) return
  tutorResizing.value = false
  tutorHeightResizing.value = false
  tutorPanelResizeOrigin = null
  document.documentElement.classList.remove('ws-tutor-resizing', 'ws-tutor-height-resizing')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  setTutorPanelWidth(tutorPanelWidth.value, true)
  setTutorPanelHeight(tutorPanelHeight.value, true)
  persistTutorPanelPlacement()
}

function startTutorLeftResize(event: PointerEvent) {
  startTutorPanelResize(event, { anchorRight: true, anchorBottom: false, resizeWidth: true, resizeHeight: false })
}

function startTutorRightResize(event: PointerEvent) {
  startTutorPanelResize(event, { anchorRight: false, anchorBottom: false, resizeWidth: true, resizeHeight: false })
}

function startTutorTopResize(event: PointerEvent) {
  startTutorPanelResize(event, { anchorRight: false, anchorBottom: true, resizeWidth: false, resizeHeight: true })
}

function startTutorBottomResize(event: PointerEvent) {
  startTutorPanelResize(event, { anchorRight: false, anchorBottom: false, resizeWidth: false, resizeHeight: true })
}

function startTutorCornerResize(event: PointerEvent) {
  startTutorPanelResize(event, { anchorRight: true, anchorBottom: false, resizeWidth: true, resizeHeight: true })
}

function resetTutorPanelWidth() {
  setTutorPanelWidth(TUTOR_PANEL_DEFAULT_WIDTH, true)
  if (tutorPanelFloating.value) {
    setTutorPanelPosition(tutorPanelPosition.value.x, tutorPanelPosition.value.y)
    persistTutorPanelPlacement()
  }
}

function resetTutorPanelHeight() {
  setTutorPanelHeight(defaultTutorPanelHeight(), true)
  if (tutorPanelFloating.value) {
    setTutorPanelPosition(tutorPanelPosition.value.x, tutorPanelPosition.value.y)
    persistTutorPanelPlacement()
  }
}

function resetTutorPanelSize() {
  setTutorPanelWidth(TUTOR_PANEL_DEFAULT_WIDTH, true)
  setTutorPanelHeight(defaultTutorPanelHeight(), true)
  tutorPanelFloating.value = false
  persistTutorPanelPlacement()
}

function resizeTutorHeightByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 24
  if (event.key === 'ArrowUp') setTutorPanelHeight(tutorPanelHeight.value - step, true)
  else if (event.key === 'ArrowDown') setTutorPanelHeight(tutorPanelHeight.value + step, true)
  else if (event.key === 'Home') setTutorPanelHeight(tutorPanelHeightMin(), true)
  else if (event.key === 'End') setTutorPanelHeight(tutorPanelHeightMax(), true)
  else return

  if (!tutorPanelFloating.value) {
    tutorPanelFloating.value = true
    setTutorPanelPosition(dockedTutorPanelLeft(), tutorTopbarHeight())
  } else {
    setTutorPanelPosition(tutorPanelPosition.value.x, tutorPanelPosition.value.y)
  }
  persistTutorPanelPlacement()
  event.preventDefault()
}

function startTutorPanelDrag(event: PointerEvent) {
  if (event.button !== 0 || isMobileLayout.value) return
  const source = event.target as HTMLElement | null
  if (source?.closest('button, input, textarea, a')) return
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const panel = target.closest('.ws-tutor-popover') as HTMLElement | null
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  if (!tutorPanelFloating.value) setTutorPanelHeight(defaultTutorPanelHeight())
  tutorPanelFloating.value = true
  setTutorPanelPosition(rect.left, rect.top)
  tutorPanelDragOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    ...tutorPanelPosition.value,
  }
  tutorPanelDragging.value = true
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-tutor-moving')
}

function moveTutorPanel(event: PointerEvent) {
  if (!tutorPanelDragging.value || !tutorPanelDragOrigin) return
  setTutorPanelPosition(
    tutorPanelDragOrigin.x + event.clientX - tutorPanelDragOrigin.pointerX,
    tutorPanelDragOrigin.y + event.clientY - tutorPanelDragOrigin.pointerY,
  )
}

function finishTutorPanelDrag(event?: PointerEvent) {
  if (!tutorPanelDragging.value) return
  tutorPanelDragging.value = false
  tutorPanelDragOrigin = null
  document.documentElement.classList.remove('ws-tutor-moving')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  persistTutorPanelPlacement()
}

function startTutorFabDrag(event: PointerEvent) {
  if (event.button !== 0 || tutorOpen.value) return
  const position = tutorFabPosition.value || defaultTutorFabPosition()
  tutorFabDragOrigin = { pointerX: event.clientX, pointerY: event.clientY, ...position }
  tutorFabDragging.value = true
  tutorFabMoved.value = false
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-tutor-fab-moving')
}

function moveTutorFab(event: PointerEvent) {
  if (!tutorFabDragging.value || !tutorFabDragOrigin) return
  const deltaX = event.clientX - tutorFabDragOrigin.pointerX
  const deltaY = event.clientY - tutorFabDragOrigin.pointerY
  if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) tutorFabMoved.value = true
  if (!tutorFabMoved.value) return
  setTutorFabPosition(tutorFabDragOrigin.x + deltaX, tutorFabDragOrigin.y + deltaY)
}

function finishTutorFabDrag(event?: PointerEvent) {
  if (!tutorFabDragging.value) return
  tutorFabDragging.value = false
  tutorFabDragOrigin = null
  document.documentElement.classList.remove('ws-tutor-fab-moving')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  if (tutorFabMoved.value && tutorFabPosition.value) {
    setTutorFabPosition(tutorFabPosition.value.x, tutorFabPosition.value.y, true)
  }
  if (event?.type === 'pointercancel') tutorFabMoved.value = false
}

function moveTutorFabByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 24
  const position = tutorFabPosition.value || defaultTutorFabPosition()
  if (event.key === 'ArrowLeft') setTutorFabPosition(position.x - step, position.y, true)
  else if (event.key === 'ArrowRight') setTutorFabPosition(position.x + step, position.y, true)
  else if (event.key === 'ArrowUp') setTutorFabPosition(position.x, position.y - step, true)
  else if (event.key === 'ArrowDown') setTutorFabPosition(position.x, position.y + step, true)
  else return
  event.preventDefault()
}

function toggleTutor() {
  if (!tutorOpen.value && tutorFabMoved.value) {
    tutorFabMoved.value = false
    return
  }
  tutorOpen.value = !tutorOpen.value
}

function resizeTutorByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 40 : 16
  if (event.key === 'ArrowLeft') setTutorPanelWidth(tutorPanelWidth.value + step, true)
  else if (event.key === 'ArrowRight') setTutorPanelWidth(tutorPanelWidth.value - step, true)
  else if (event.key === 'Home') setTutorPanelWidth(TUTOR_PANEL_MIN_WIDTH, true)
  else if (event.key === 'End') setTutorPanelWidth(tutorPanelMaxWidth(), true)
  else return
  if (tutorPanelFloating.value) {
    setTutorPanelPosition(tutorPanelPosition.value.x, tutorPanelPosition.value.y)
    persistTutorPanelPlacement()
  }
  event.preventDefault()
}

function clampTutorPanelToViewport() {
  setTutorPanelWidth(tutorPanelWidth.value)
  setTutorPanelHeight(tutorPanelHeight.value)
  if (tutorPanelFloating.value) {
    setTutorPanelPosition(tutorPanelPosition.value.x, tutorPanelPosition.value.y)
  }
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
const paneGridStyle = computed<Record<string, string>>(() => {
  if (isMobileLayout.value) return {}

  if (isTeacherRole.value) {
    return { gridTemplateColumns: `minmax(0, ${paneSplit.value}%) 10px minmax(0, 1fr)` }
  }

  const manual = showManualPane.value
  const right = showRightPane.value

  if (manual && right) {
    return { gridTemplateColumns: `minmax(0, ${paneSplit.value}%) 10px minmax(0, 1fr)` }
  }
  if (manual && !right) {
    return { gridTemplateColumns: 'minmax(0, 1fr)' }
  }
  if (!manual && right) {
    return { gridTemplateColumns: 'minmax(0, 1fr)' }
  }
  return { gridTemplateColumns: 'minmax(0, 1fr)' }
})

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
  openLab: string
  extraBins: string[]
  variants: Record<string, string>
  defaults?: Record<string, string>
}

const scaffold = ref<ScaffoldStatus | null>(null)
const showScaffold = ref(false)
const scaffoldBusy = ref(false)
const scaffoldLog = ref<string[]>([])
const newBinName = ref('')
const learningAccess = ref<LearningAccessItem[]>([])
const finalProjectAccess = ref<FinalProjectAccess | null>(null)
const accessLoading = ref(true)

async function refreshLearningAccess() {
  if (!auth.value) {
    learningAccess.value = []
    finalProjectAccess.value = null
    accessLoading.value = false
    return
  }
  accessLoading.value = true
  try {
    const response = await fetch(apiUrl('/learning/access'), { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    learningAccess.value = response.ok && Array.isArray(payload.labs) ? payload.labs : []
    finalProjectAccess.value = response.ok && payload.finalProject ? payload.finalProject : null
  } catch {
    learningAccess.value = []
    finalProjectAccess.value = null
  } finally {
    accessLoading.value = false
  }
}

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
  // 已有工作区时，下一层只允许从「系统构建路径」领取，避免与路径进度脱节。
  if (scaffold.value?.exists && scaffold.value.next) {
    toast('请打开「系统构建路径」，在已解锁的下一层点击「领取并开始」。')
    return
  }
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

/** 进入某 Lab 前：把「我的系统」按序补发到该层（须学习侧已解锁）。 */
async function ensureScaffoldIssued(labId: TutorLabId): Promise<boolean> {
  if (!studentId.value || isTeacherRole.value) return true
  await refreshScaffold()
  const order = ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8'] as const
  const targetIndex = order.indexOf(labId)
  if (targetIndex < 0) return true

  for (let step = 0; step < 8; step += 1) {
    const status = scaffold.value
    if (!status?.ok) {
      toast('无法同步我的系统，请确认导师服务已启动。')
      return false
    }
    const currentIndex = status.current ? order.indexOf(status.current as (typeof order)[number]) : -1
    if (currentIndex >= targetIndex) return true

    if (!status.exists || status.next) {
      if (status.exists && !status.nextAllowed) {
        toast((status as { nextBlockedReason?: string }).nextBlockedReason || '下一层代码尚未解锁。')
        return false
      }
      const ok = await requestScaffoldUpgrade()
      if (!ok) return false
      continue
    }

    toast('代码层已全部发放。')
    return true
  }
  toast('同步我的系统超时，请稍后重试。')
  return false
}

async function requestScaffoldUpgrade(): Promise<boolean> {
  if (scaffoldBusy.value) return false
  scaffoldBusy.value = true
  try {
    const response = await fetch(apiUrl('/scaffold/upgrade'), {
      method: 'POST',
      headers: authHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    if (payload.status) scaffold.value = { ...scaffold.value, ...payload.status }
    if (!response.ok) {
      toast(payload.error || (payload.log && payload.log[0]) || '领取下一层代码失败')
      return false
    }
    if (payload.lab) toast(`我的系统已同步到 ${payload.lab}`)
    return true
  } catch {
    toast('无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor')
    return false
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
/** 教师布置的报告版式与填写提示。 */
const reportTemplate = ref<ReportTemplate>(cloneTemplate(DEFAULT_REPORT_TEMPLATE))

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

async function loadReportTemplate() {
  try {
    const response = await fetch(apiUrl(`/report-template?labId=${encodeURIComponent(props.labId)}`))
    if (!response.ok) {
      reportTemplate.value = cloneTemplate(DEFAULT_REPORT_TEMPLATE)
      return
    }
    const payload = await response.json()
    reportTemplate.value = cloneTemplate(payload.template || DEFAULT_REPORT_TEMPLATE)
  } catch {
    reportTemplate.value = cloneTemplate(DEFAULT_REPORT_TEMPLATE)
  }
}

/** 报告面板「提交给老师」：正文 + 附件入库，教师端可见。 */
async function submitReportToTeacher(payload: {
  content: string
  attachments: Array<{ name: string; mime: string; dataBase64: string }>
}) {
  if (!auth.value) {
    toast('先登录再提交报告。')
    showIdentity.value = true
    return
  }
  try {
    const response = await fetch(apiUrl('/reports'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        labId: props.labId,
        sessionId: sessionId.value,
        content: payload.content,
        attachments: payload.attachments,
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result?.error || `服务返回 ${response.status}`)
    const n = payload.attachments?.length || 0
    toast(n ? `报告已提交给老师（含 ${n} 个附件）。` : '报告已提交给老师（重复提交会覆盖旧版本）。')
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

/** 本 Lab 的关键断言（如 Lab2 的 Yield round ×5），用于测试结果页防“只看退出码”。 */
const keyAssertion = computed(() => lab.value?.keyAssertion || null)
const keyAssertionPassed = computed(() => {
  const key = keyAssertion.value
  if (!key) return null
  const item = lastAssertions.value.find((assertion) => assertion.id === key.id)
  return item ? item.passed : null
})
const failedCurrentCount = computed(() => lastAssertions.value.filter((item) => !item.passed).length)
function orderedAssertions(assertions: RunAssertionItem[]) {
  const key = keyAssertion.value
  if (!key) return assertions
  return [...assertions].sort((left, right) => Number(left.id !== key.id) - Number(right.id !== key.id))
}
const passedHistoryCount = computed(
  () => runResultHistory.value.filter((entry) => entry.verified && !entry.stopped && entry.assertions.length).length,
)
const failedHistoryCount = computed(
  () => runResultHistory.value.filter((entry) => !entry.verified && !entry.stopped && entry.assertions.length).length,
)
const stoppedHistoryCount = computed(
  () => runResultHistory.value.filter((entry) => entry.stopped).length,
)
const emptyHistoryCount = computed(
  () => runResultHistory.value.filter((entry) => !entry.assertions.length && !entry.stopped).length,
)

type TestResultsView = 'time' | 'tag'
const testsView = ref<TestResultsView>('time')
const expandedRunId = ref('')

const runStateLabels: Record<'ok' | 'fail' | 'stopped' | 'empty', string> = {
  ok: '已通过',
  fail: '未通过',
  stopped: '已停止',
  empty: '未验证',
}

function runStateKey(entry: StoredRunResult): 'ok' | 'fail' | 'stopped' | 'empty' {
  if (entry.stopped) return 'stopped'
  if (entry.verified) return 'ok'
  return entry.assertions.length ? 'fail' : 'empty'
}

function runTimeMs(entry: StoredRunResult) {
  const ms = entry.at ? Date.parse(entry.at) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/** 按时间倒序展示全部运行；时间缺失或无效时保留原插入顺序。 */
const orderedRunResults = computed(() => {
  const indexed = runResultHistory.value.map((entry, index) => ({ entry, index }))
  indexed.sort((left, right) => {
    const diff = runTimeMs(right.entry) - runTimeMs(left.entry)
    return diff !== 0 ? diff : left.index - right.index
  })
  return indexed.map((item) => item.entry)
})

const taggedRunGroups = computed(() => {
  const order: Array<'fail' | 'ok' | 'stopped' | 'empty'> = ['fail', 'ok', 'stopped', 'empty']
  return order
    .map((key) => ({
      key,
      label: runStateLabels[key],
      entries: orderedRunResults.value.filter((entry) => runStateKey(entry) === key),
    }))
    .filter((group) => group.entries.length)
})

function onRunToggle(runId: string, event: Event) {
  const details = event.target as HTMLDetailsElement | null
  expandedRunId.value = details?.open ? runId : ''
}

function groupPassSummary(entries: StoredRunResult[]) {
  const total = entries.reduce((sum, entry) => sum + entry.assertions.length, 0)
  const passed = entries.reduce((sum, entry) => sum + entry.assertions.filter((a) => a.passed).length, 0)
  return total ? `${passed}/${total} 通过` : '无断言'
}

const testsConclusion = computed(() => {
  if (!lastAssertionsRunId.value && !runResultHistory.value.length) {
    return {
      state: 'idle',
      title: '等待可信验证',
      note: '运行工作台里的可信验证命令后，这里会显示通过结论与断言明细。',
    }
  }
  if (lastAssertions.value.length) {
    const total = lastAssertions.value.length
    const passed = lastAssertions.value.filter((item) => item.passed).length
    const ok = passed === total
    const current = runResultHistory.value.find((entry) => entry.runId === lastAssertionsRunId.value)
    return {
      state: ok ? 'ok' : 'fail',
      title: ok ? '可信验证通过' : `未通过 ${total - passed} 项`,
      note: ok
        ? '断言全部通过，本次运行可作为实验通过证据。'
        : `仍有 ${total - passed} 条断言未通过：按修改建议修复后重新运行可信验证。`,
      passed,
      total,
      runId: lastAssertionsRunId.value,
      at: current?.at || '',
      keyPassed: keyAssertionPassed.value,
    }
  }
  const current = runResultHistory.value.find((entry) => entry.runId === lastAssertionsRunId.value)
  if (current) {
    return {
      state: current.stopped ? 'stopped' : 'empty',
      title: current.stopped ? '验证已停止' : '未返回可展示断言',
      note: current.stopped
        ? '运行被停止，尚未得出可信结论。'
        : '运行未返回可展示断言，不表示验证已通过。',
      runId: current.runId,
      at: current.at,
    }
  }
  return {
    state: 'idle',
    title: '等待可信验证',
    note: '运行工作台里的可信验证命令后，这里会显示通过结论与断言明细。',
  }
})

function formatRunTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

watch(activeStage, (stage) => {
  if (workspaceContext) workspaceContext.currentStage = stage
})
watch(currentSection, (section) => {
  if (workspaceContext) workspaceContext.currentSection = { ...section }
})
// 后台刷新解锁状态时保留当前已解锁工作区，避免卸载终端并丢失本次运行结果。
const workspaceRestricted = computed(
  () => !isTeacherRole.value && (!auth.value || !currentAccess.value?.unlocked),
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
  options: Pick<LearningEvent, 'category' | 'content' | 'metadata' | 'runId' | 'recipeId' | 'assertions' | 'file' | 'line' | 'code' | 'view' | 'eventRange'> = {},
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
    if (response.ok && event.type === 'verification_attempt') {
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

function finishTeacherEditing(location: { h2: string; h3: string; offset: number }) {
  teacherManualLocation.value = location
  teacherEditing.value = false
  manualKey.value += 1
}

function startTeacherEditing(location: { h2: string; h3: string; offset: number }) {
  teacherManualLocation.value = location
  panelOpen.value.manual = true
  mobileView.value = 'manual'
  maximized.value = 'none'
  teacherEditing.value = true
  persistPanels()
}

/* -- 会话 ------------------------------------------------------------------- */

function openingMessage() {
  const previous = journey.value[(journeyItem.value?.index ?? 0) - 1]
  if (!previous) return lab.value.initialQuestion
  return `这一层承接 ${previous.lab.label} · ${previous.lab.systemLayer}：${lab.value.bridge}\n\n${lab.value.initialQuestion}`
}

function startSession() {
  activeStage.value = 'orient'
  lastTutorState.value = null
  chatAttachments.value = []
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
  persistTutorConversation()
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
  tutorState?: TutorState
  knowledge?: TutorKnowledgeChunk[]
  retrieval?: TutorRetrievalDiagnostics
}

function chatPayload(message: string, evidenceRefs: string[] = []) {
  return {
    sessionId: sessionId.value,
    labId: props.labId,
    stage: activeStage.value,
    message,
    evidenceRefs,
    // 前端配置的模型接入随请求下发；全空时服务端使用默认上游。
    ...(hasCustomLlmConfig(llmConfig.value) ? { llm: llmConfig.value } : {}),
    // 学生正在读哪一节 —— 导师据此说「你刚读到 sscratch 那节」。
    reading: currentSection.value,
    // 学生正在编辑哪个文件、光标在哪一行、当前选区 —— 导师据此引用真实代码位置。
    codeContext: {
      file: workspaceContext.currentFile,
      line: workspaceContext.currentLine,
      selection: workspaceContext.currentSelection,
    },
    history: messages.value
      .slice(0, -1)
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.content })),
  }
}

/** 逐 delta 回调；返回完整回复。服务端不支持 SSE 时自动回退到整段 JSON。 */
async function requestReply(
  message: string,
  evidenceRefs: string[],
  onDelta: (text: string) => void,
): Promise<ReplyOutcome | null> {
  const response = await fetch(`${endpoint}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
    body: JSON.stringify(chatPayload(message, evidenceRefs)),
  })
  if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const payload = (await response.json()) as {
      reply?: string
      error?: string
      guardrail?: { triggered?: boolean; rule?: string }
      tutorState?: ReplyOutcome['tutorState']
      knowledge?: TutorKnowledgeChunk[]
      retrieval?: TutorRetrievalDiagnostics
    }
    if (!payload.reply) throw new Error(payload.error || '导师服务没有返回 reply')
    return {
      reply: payload.reply,
      guardrail: Boolean(payload.guardrail?.triggered),
      rule: payload.guardrail?.rule,
      tutorState: payload.tutorState,
      knowledge: payload.knowledge,
      retrieval: payload.retrieval,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''
  let guardrail = false
  let rule: string | undefined
  let tutorState: ReplyOutcome['tutorState']
  let knowledge: TutorKnowledgeChunk[] | undefined
  let retrieval: TutorRetrievalDiagnostics | undefined

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((item) => item.startsWith('data:'))
      if (!line) continue
      let frame: {
        type?: string
        text?: string
        reply?: string
        error?: string
        rule?: string
        triggered?: boolean
        tutorState?: ReplyOutcome['tutorState']
        knowledge?: TutorKnowledgeChunk[]
        retrieval?: TutorRetrievalDiagnostics
      }
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
      if (frame.tutorState) tutorState = frame.tutorState
      if (Array.isArray(frame.knowledge)) knowledge = frame.knowledge
      if (frame.retrieval) retrieval = frame.retrieval
      if (frame.type === 'delta' && frame.text) {
        reply += frame.text
        onDelta(reply)
      }
      if (frame.type === 'done' && frame.reply) reply = frame.reply
    }
  }

  if (!reply.trim()) throw new Error('导师服务没有返回文本')
  return { reply, guardrail, rule, tutorState, knowledge, retrieval }
}

/** 工作台内容添加到 AI 导师对话（不立刻发送；与输入框内容一并提交）。 */
function addToChat(payload: {
  source: ChatAttachmentSource
  title: string
  body: string
  origin?: ChatAttachmentOrigin
}) {
  const body = clampChatBody(payload.body)
  if (!body) {
    toast('没有可添加的内容')
    return
  }
  if (chatAttachments.value.length >= CHAT_ATTACHMENT_MAX_COUNT) {
    toast(`最多附带 ${CHAT_ATTACHMENT_MAX_COUNT} 段内容，请先移除再添加`)
    return
  }
  const title = String(payload.title || chatSourceLabels[payload.source] || '附件').slice(0, 120)
  chatAttachments.value = [
    ...chatAttachments.value,
    { id: createId('chat'), source: payload.source, title, body, origin: payload.origin },
  ]
  // AI 导师是独立悬浮窗，不改变“学习支持”面板或移动端视图。
  tutorOpen.value = true
  toast(`已添加到对话：${chatSourceLabels[payload.source]} · ${title}`)
  void nextTick(() => tutorPaneRef.value?.focusComposer?.())
}

function removeChatAttachment(id: string) {
  chatAttachments.value = chatAttachments.value.filter((item) => item.id !== id)
}

/** 点击附件 chip：跳回对应面板/源码/章节。 */
async function openChatAttachment(item: {
  source: ChatAttachmentSource
  title?: string
  origin?: ChatAttachmentOrigin
}) {
  const source = item.source
  const origin = item.origin || {}
  panelOpen.value.terminal = true
  persistPanels()

  if (source === 'code') {
    mobileView.value = 'practice'
    if (origin.path) {
      await codePanelRef.value?.openAtLine(origin.path, origin.line || 1)
      toast(`已溯源到工作区 ${origin.path}${origin.line ? `:${origin.line}` : ''}`)
    } else {
      toast('已打开工作区')
    }
    return
  }

  if (source === 'terminal') {
    mobileView.value = 'practice'
    bottomTab.value = 'terminal'
    terminalDockOpen.value = true
    toast(origin.scope === 'selection' ? '已打开终端（附件来自选区）' : '已打开终端')
    return
  }

  if (source === 'problems') {
    mobileView.value = 'practice'
    bottomTab.value = 'problems'
    terminalDockOpen.value = true
    if (origin.runId) lastRunId.value = origin.runId
    if (origin.path) {
      await codePanelRef.value?.openAtLine(origin.path, origin.line || 1)
      toast(`已溯源到诊断 ${origin.path}${origin.line ? `:${origin.line}` : ''}`)
    } else {
      toast('已打开 Problems')
    }
    return
  }

  if (source === 'tests') {
    mobileView.value = 'practice'
    bottomTab.value = 'tests'
    terminalDockOpen.value = true
    const targetEntry = origin.runId
      ? runResultHistory.value.find(
          (row) => row.runId === origin.runId || row.runId.startsWith(String(origin.runId)),
        )
      : null
    if (origin.runId) {
      lastRunId.value = origin.runId
      if (targetEntry?.assertions.length) {
        lastAssertions.value = targetEntry.assertions
        lastAssertionsRunId.value = targetEntry.runId
      }
    }
    testsView.value = 'time'
    expandedRunId.value = targetEntry?.runId || ''
    toast(
      origin.assertionId
        ? `已打开测试结果 · ${origin.assertionId}`
        : '已打开测试结果',
    )
    return
  }

  if (source === 'manual') {
    mobileView.value = 'manual'
    panelOpen.value.manual = true
    persistPanels()
    await nextTick()
    manualPaneRef.value?.jumpToTitles?.(origin.h2, origin.h3)
    toast(origin.h2 || origin.h3 ? `已溯源到手册「${[origin.h2, origin.h3].filter(Boolean).join(' / ')}」` : '已打开手册')
    return
  }

  if (source === 'trace') {
    if (origin.runId) {
      await navigateEvidenceRef(`run:${origin.runId}`)
      return
    }
    mobileView.value = 'practice'
    terminalDockOpen.value = true
    bottomTab.value = 'terminal'
    toast('已打开终端')
    return
  }
}

function formatAssertionsForChat(
  assertions: RunAssertionItem[],
  meta?: { runId?: string; verified?: boolean; stopped?: string },
) {
  const head = [
    meta?.runId ? `run:${meta.runId}` : '',
    meta?.stopped
      ? `状态：已停止（${meta.stopped}）`
      : meta?.verified != null
        ? `状态：${meta.verified ? '已通过' : '未通过'}`
        : '',
  ].filter(Boolean)
  const lines = assertions.map((item) =>
    [
      `${item.passed ? '✓' : '✗'} ${item.label || item.id}`,
      `  期望：${item.expected}`,
      `  实际：${item.observed}`,
      ...(!item.passed && item.hint ? [`  修改建议：${item.hint}`] : []),
    ].join('\n'),
  )
  return [...head, '', ...lines].join('\n').trim()
}

function formatOneAssertionForChat(item: RunAssertionItem, runId?: string) {
  return [
    runId ? `run:${runId}` : '',
    `${item.passed ? '✓' : '✗'} ${item.label || item.id}`,
    `期望：${item.expected}`,
    `实际：${item.observed}`,
    ...(!item.passed && item.hint ? [`修改建议：${item.hint}`] : []),
  ]
    .filter(Boolean)
    .join('\n')
}

function addCurrentTestsToChat() {
  if (!lastAssertions.value.length) {
    toast('当前没有可添加的断言结果')
    return
  }
  addToChat({
    source: 'tests',
    title: lastAssertionsRunId.value
      ? `全部 · run:${lastAssertionsRunId.value.slice(0, 8)}`
      : '当前全部断言',
    body: formatAssertionsForChat(lastAssertions.value, { runId: lastAssertionsRunId.value }),
    origin: { runId: lastAssertionsRunId.value || undefined, scope: 'all' },
  })
}

function addHistoryTestsToChat(entry: StoredRunResult) {
  if (!entry.assertions.length) {
    toast('该次运行没有断言列表')
    return
  }
  addToChat({
    source: 'tests',
    title: `全部 · run:${entry.runId.slice(0, 8)}`,
    body: formatAssertionsForChat(entry.assertions, {
      runId: entry.runId,
      verified: entry.verified,
      stopped: entry.stopped,
    }),
    origin: { runId: entry.runId, scope: 'all' },
  })
}

function addOneAssertionToChat(item: RunAssertionItem, runId?: string) {
  addToChat({
    source: 'tests',
    title: `${item.passed ? '✓' : '✗'} ${item.label || item.id}`,
    body: formatOneAssertionForChat(item, runId),
    origin: { runId: runId || undefined, assertionId: item.id, scope: 'single' },
  })
}

function sendTutorMessage(text: string) {
  const pending = [...chatAttachments.value]
  const full = formatChatWithAttachments(text, pending)
  if (!full.trim()) return
  chatAttachments.value = []
  void sendMessage(full, pending)
}

async function sendMessage(text: string, attached: ChatAttachment[] = []) {
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
    chatAttachments: attached.length
      ? attached.map((item) => ({
          id: item.id,
          source: item.source,
          title: item.title,
          body: item.body,
          origin: item.origin,
        }))
      : undefined,
  })
  record('student_message', { category, content: text })
  persistTutorConversation()
  if (guarded) record('guardrail_triggered', { category, content: text })

  sending.value = true
  const replyId = createId('message')

  try {
    const outcome = await requestReply(text, chatEvidenceRefs(attached), (partial) => {
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
    if (outcome?.tutorState) lastTutorState.value = outcome.tutorState
    const serverStage = outcome?.tutorState?.stage
    if (serverStage && tutorStages.some((stage) => stage.id === serverStage)) {
      activeStage.value = serverStage
    }
    if (serverGuardrail && !guarded) {
      record('guardrail_triggered', { metadata: { rule: outcome?.rule } })
    }
    const reply =
      outcome?.reply ?? offlineTutorReply(text, activeStage.value, guarded, lab.value)
    const tutorState = outcome?.tutorState
    const refused =
      guarded || serverGuardrail || isTutorRefused(tutorState)
    const messageMeta = {
      hintLevel: tutorState?.hintLevel,
      gate: tutorState?.gate,
      evidenceRefs: tutorState?.evidenceRefs,
      refused,
      knowledge: outcome?.knowledge,
      retrieval: outcome?.retrieval,
    }

    const existing = messages.value.find((item) => item.id === replyId)
    if (existing) {
      existing.content = reply
      existing.guardrail = guarded || serverGuardrail
      existing.hintLevel = messageMeta.hintLevel
      existing.gate = messageMeta.gate
      existing.evidenceRefs = messageMeta.evidenceRefs
      existing.refused = messageMeta.refused
      existing.knowledge = messageMeta.knowledge
      existing.retrieval = messageMeta.retrieval
    } else {
      messages.value.push({
        id: replyId,
        role: 'assistant',
        stage: activeStage.value,
        content: reply,
        timestamp: new Date().toISOString(),
        category,
        guardrail: guarded || serverGuardrail,
        ...messageMeta,
      })
    }
    record('ai_response', {
      category,
      content: reply,
      metadata: { guarded: guarded || serverGuardrail, mode: connection.value },
    })
    persistTutorConversation()
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
    persistTutorConversation()
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
    !next
      ? '全部系统层已经构建完成。'
      : next.unlocked
        ? `${lab.value.systemLayer}已构建，${next.lab.label} · ${next.lab.systemLayer} 已解锁。`
        : `${lab.value.systemLayer}已构建，等待老师按范围分发 ${next.lab.label} · ${next.lab.systemLayer}。`,
    5000,
  )
}

/** 终端每次运行结束：更新 run 指针；有断言才刷新测试结果，停止/空断言不冲掉上一份。 */
function onRunFinished(payload: {
  content: string
  passed: boolean
  verified: boolean
  runId: string
  recipeId: string | null
  trusted: boolean
  assertions: Array<{ id: string; label: string; passed: boolean; expected: string; observed: string }>
  stopped?: string
}) {
  const wasCompleted = Boolean(journeyItem.value?.completed)
  if (payload.runId) lastRunId.value = payload.runId
  if (workspaceContext) {
    workspaceContext.lastRunId = payload.runId
    workspaceContext.lastRecipeId = payload.recipeId || ''
  }

  const assertions = Array.isArray(payload.assertions) ? payload.assertions : []
  if (payload.runId) {
    runResultHistory.value = [
      {
        runId: payload.runId,
        verified: payload.verified,
        trusted: payload.trusted,
        stopped: payload.stopped,
        at: new Date().toISOString(),
        assertions,
      },
      ...runResultHistory.value.filter((item) => item.runId !== payload.runId),
    ].slice(0, RUN_RESULTS_HISTORY_CAP)
  }

  // 仅非停止的完整结束写入验证事件；有断言时才替换「当前测试结果」展示。
  if (!payload.stopped) {
    record('verification_attempt', {
      content: payload.content,
      runId: payload.runId,
      ...(payload.recipeId ? { recipeId: payload.recipeId } : {}),
      assertions,
      metadata: {
        passed: payload.verified,
        verified: payload.verified,
        trusted: payload.trusted,
        source: 'terminal',
      },
    })
    announceUnlock(wasCompleted)
  }
  if (assertions.length > 0) {
    lastAssertions.value = assertions
    lastAssertionsRunId.value = payload.runId
  }
  saveCurrentRunResults()
}

function onRunExit(runId: string) {
  if (runId) lastRunId.value = runId
  saveCurrentRunResults()
}

/** Problems 诊断加载完成：有条目时自动展开底部面板并切到 Problems。 */
function onDiagnosticsLoaded(payload: { runId: string; count: number }) {
  lastDiagnosticCount.value = payload.count
  if (payload.count <= 0 || !payload.runId) {
    if (bottomTab.value === 'problems') {
      bottomTab.value = lastAssertions.value.length ? 'tests' : 'terminal'
    }
    return
  }
  terminalDockOpen.value = true
  bottomTab.value = 'problems'
}

/** 终端 exit 帧直接带回诊断时，立即切换，不依赖二次拉取。 */
function onRunDiagnostics(payload: { runId: string; diagnostics: unknown[] }) {
  if (payload.runId) lastRunId.value = payload.runId
  lastDiagnosticCount.value = payload.diagnostics.length
  if (payload.diagnostics.length <= 0) {
    if (bottomTab.value === 'problems') {
      bottomTab.value = lastAssertions.value.length ? 'tests' : 'terminal'
    }
    return
  }
  terminalDockOpen.value = true
  bottomTab.value = 'problems'
}

/** 手册「源码引用」点击：跳到工作区对应文件与行，并切到实践视图。 */
function onSourceJump(payload: { path: string; line: number }) {
  mobileView.value = 'practice'
  panelOpen.value.practice = true
  persistPanels()
  void codePanelRef.value?.openAtLine(payload.path, payload.line)
}

/** Problems 诊断点击：跳到对应文件与行，并确保底部 Problems 可见。 */
function onProblemJump(payload: { path: string; line: number; code: string }) {
  mobileView.value = 'practice'
  panelOpen.value.practice = true
  terminalDockOpen.value = true
  bottomTab.value = 'problems'
  persistPanels()
  void codePanelRef.value?.openAtLine(payload.path, payload.line)
  record('diagnostic_opened', {
    runId: lastRunId.value,
    file: payload.path,
    line: payload.line,
    code: payload.code,
  })
}

/**
 * 导师消息 / 证据条中的 run: / trace: / 诊断引用跳转。
 * 无真实数据时只切面板并走可信空态，不造假事件或诊断行。
 */
async function navigateEvidenceRef(refValue: string) {
  const raw = String(refValue || '').trim()
  if (!raw) return
  mobileView.value = 'practice'
  panelOpen.value.practice = true
  panelOpen.value.terminal = true
  persistPanels()

  if (raw.startsWith('event:')) {
    rightTab.value = 'report'
    toast(`已打开实验报告 · ${raw.slice(0, 18)}${raw.length > 18 ? '…' : ''}（事件证据落点）`)
    return
  }

  if (raw.startsWith('run:')) {
    const runId = raw.slice(4).trim()
    let hasAssertions = false
    if (runId) {
      lastRunId.value = runId
      const entry = runResultHistory.value.find(
        (item) => item.runId === runId || item.runId.startsWith(runId),
      )
      if (entry?.assertions.length) {
        lastAssertions.value = entry.assertions
        lastAssertionsRunId.value = entry.runId
        hasAssertions = true
      } else if (
        lastAssertionsRunId.value &&
        (lastAssertionsRunId.value === runId || lastAssertionsRunId.value.startsWith(runId)) &&
        lastAssertions.value.length > 0
      ) {
        hasAssertions = true
      }
    }
    terminalDockOpen.value = true
    maximized.value = 'none'
    // 有断言 → 测试结果；无断言的失败/停止 run → 终端（并 toast，避免「点了没反应」）。
    bottomTab.value = hasAssertions ? 'tests' : 'terminal'
    toast(
      hasAssertions
        ? `已打开测试结果 · run:${(runId || '').slice(0, 8)}…`
        : `已打开终端 · run:${(runId || '').slice(0, 8)}…（本次无断言/诊断，请看终端输出）`,
      4200,
    )
    return
  }

  if (raw.startsWith('trace:')) {
    const runId = raw.slice(6).trim()
    if (runId) await navigateEvidenceRef(`run:${runId}`)
    return
  }

  if (raw.startsWith('diag:') || raw.startsWith('diagnostic:') || raw === 'diag:latest') {
    terminalDockOpen.value = true
    bottomTab.value = 'problems'
    await nextTick()
    const diagnostic = problemsPanelRef.value?.firstDiagnostic?.() as
      | { file?: string; line?: number; code?: string }
      | null
      | undefined
    if (diagnostic?.file && Number.isFinite(Number(diagnostic.line)) && Number(diagnostic.line) > 0) {
      void codePanelRef.value?.openAtLine(diagnostic.file, Number(diagnostic.line))
      record('diagnostic_opened', {
        runId: lastRunId.value,
        file: diagnostic.file,
        line: Number(diagnostic.line),
        code: diagnostic.code || '',
      })
      toast(`已打开 Problems · ${diagnostic.file}:${diagnostic.line}`)
    } else {
      toast('已打开 Problems（当前无可用诊断行）')
    }
  }
}

/** 报告面板请 AI 点评：打开对话并把报告作为提问发送。 */
function reviewReport(content: string) {
  tutorOpen.value = true
  if (sending.value) {
    toast('AI 正在回复上一条消息，稍后再试。')
    return
  }
  void sendMessage(`这是我目前的实验报告，请你作为 AI 助教指出记录不完整或理解有偏差的地方，并追问我一个能检验理解的问题：\n\n${content}`)
}

async function onSocraticReviewCompleted() {
  const wasCompleted = Boolean(journeyItem.value?.completed)
  activeStage.value = 'reflect'
  await refreshLearningAccess()
  toast('苏格拉底复盘已完成，并已写入实验报告。')
  announceUnlock(wasCompleted)
}

/* -- 导航与导出 ------------------------------------------------------------- */

function enterLab(labId: TutorLabId) {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(FINAL_MODE_KEY)
  void (async () => {
    const issued = await ensureScaffoldIssued(labId)
    if (!issued) return
    if (labId === props.labId) {
      await refreshScaffold()
      return
    }
    router.go(withBase(`/learn/${labId}`))
  })()
}

function enterFinal() {
  void (async () => {
    if (!finalProjectAccess.value?.unlocked) {
      toast(finalProjectAccess.value?.reason || '期末探索任务尚未解锁。')
      return
    }
    const issued = await ensureScaffoldIssued('lab8')
    if (!issued) return
    if (typeof window !== 'undefined') window.sessionStorage.setItem(FINAL_MODE_KEY, '1')
    const target = withBase('/learn/lab8?final=1')
    const current = `${window.location.pathname}${window.location.search}`
    if (current !== target) window.location.assign(target)
  })()
}

function exportGrowth() {
  exportEventsAsJsonl(
    events.value,
    `EVOLVE-growth-record-${new Date().toISOString().slice(0, 10)}.jsonl`,
  )
  toast('成长档案已导出为 JSONL。')
}

function syncWorkspaceNavState() {
  updateWorkspaceNav({
    teacher: isTeacherRole.value,
    panels: panelOpen.value,
    journey: journey.value,
    appliedLabs: (scaffold.value?.applied || []) as TutorLabId[],
    finalProject: finalProjectAccess.value,
    togglePanel,
    enterLab,
    enterFinal,
    exportGrowth,
  })
}

function handleWorkspaceLlmSettings() {
  openLlmSettings()
}

watchEffect(syncWorkspaceNavState)

watch(studentId, (next, previous) => {
  if (next === previous) return
  if (next) {
    void loadServerTutorConversation().then((restored) => {
      if (!restored && !loadTutorConversation()) startSession()
    })
    return
  }
  tutorOpen.value = false
  messages.value = []
  sessionId.value = ''
  activeStage.value = 'orient'
  lastTutorState.value = null
})
onBeforeMount(() => {
  syncMobileLayout()
})

onMounted(async () => {
  document.documentElement.classList.add('ws-lock')
  syncMobileLayout()
  if (routeParam('view') === 'teaching' && isTeacherRole.value) {
    mobileView.value = 'practice'
  }
  window.addEventListener('resize', syncMobileLayout)
  window.addEventListener('resize', clampPaneSplitToViewport)
  window.addEventListener('resize', clampTutorPanelToViewport)
  window.addEventListener('resize', clampTutorFabToViewport)
  window.addEventListener('keydown', closeMaximizedOnEscape)
  window.addEventListener(WORKSPACE_OPEN_LLM_SETTINGS_EVENT, handleWorkspaceLlmSettings)
  clampPaneSplitToViewport()
  clampTutorPanelToViewport()
  clampTutorFabToViewport()
  events.value = loadEvents()
  if (!studentId.value) showIdentity.value = true
  void loadClassNames()
  await checkConnection()
  await refreshLearningAccess()
  if (!(await loadServerTutorConversation()) && !loadTutorConversation()) startSession()
  void refreshScaffold()
  void loadMyFeedback()
  void loadReportTemplate()
})

watch(
  () => props.labId,
  () => {
    manualTocOpen.value = false
    void loadMyFeedback()
    void loadReportTemplate()
    void loadServerTutorConversation().then((restored) => {
      if (!restored && !loadTutorConversation()) startSession()
    })
  },
)

onBeforeUnmount(() => {
  document.documentElement.classList.remove('ws-lock')
  document.documentElement.classList.remove('ws-pane-resizing')
  document.documentElement.classList.remove('ws-row-resizing')
  document.documentElement.classList.remove('ws-tutor-resizing')
  document.documentElement.classList.remove('ws-tutor-height-resizing')
  document.documentElement.classList.remove('ws-tutor-moving')
  document.documentElement.classList.remove('ws-tutor-fab-moving')
  window.removeEventListener('resize', syncMobileLayout)
  window.removeEventListener('resize', clampPaneSplitToViewport)
  window.removeEventListener('resize', clampTutorPanelToViewport)
  window.removeEventListener('resize', clampTutorFabToViewport)
  window.removeEventListener('keydown', closeMaximizedOnEscape)
  window.removeEventListener(WORKSPACE_OPEN_LLM_SETTINGS_EVENT, handleWorkspaceLlmSettings)
  clearWorkspaceNav()
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="ws-workspace">
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
      <button
        v-if="!isTeacherRole"
        type="button"
        role="tab"
        :aria-selected="mobileView === 'practice'"
        :class="{ active: mobileView === 'practice' }"
        @click="mobileView = 'practice'"
      >
        <MessagesSquare :size="15" aria-hidden="true" />实践
      </button>
      <button
        v-else
        type="button"
        role="tab"
        :aria-selected="mobileView === 'practice'"
        :class="{ active: mobileView === 'practice' }"
        @click="mobileView = 'practice'"
      >
        <MessagesSquare :size="15" aria-hidden="true" />教学
      </button>
    </div>

    <main
      ref="panesElement"
      class="ws-panes"
      :style="paneGridStyle"
    >
      <!-- 左栏：指导书 -->
      <div
        v-if="showManualPane && !teacherEditing"
        class="ws-zone ws-zone-manual ws-left-pane"
        :class="{ 'ws-mobile-hidden': isMobileLayout && mobileView !== 'manual' }"
      >
        <header class="ws-zone-head">
          <span class="ws-zone-title"><BookOpen :size="14" aria-hidden="true" />{{ finalMode ? '期末探索任务' : '实验手册' }}</span>
          <button
            v-if="!finalMode"
            type="button"
            class="ws-zone-toggle"
            :class="{ active: manualTocOpen }"
            :title="manualTocOpen ? '收起目录' : '展开目录'"
            :aria-label="manualTocOpen ? '收起实验手册目录' : '展开实验手册目录'"
            :aria-expanded="manualTocOpen"
            aria-controls="ws-manual-toc"
            @click="manualTocOpen = !manualTocOpen"
          >
            <TableOfContents :size="14" aria-hidden="true" />
          </button>
          <button
            v-if="!isTeacherRole && !isMobileLayout"
            type="button"
            class="ws-zone-toggle ws-zone-collapse"
            title="收起手册"
            aria-label="收起手册"
            @click="togglePanel('manual')"
          >
            <PanelLeftClose :size="14" aria-hidden="true" />
          </button>
        </header>
        <div class="ws-zone-body">
          <FinalProjectPane
            v-if="finalMode && !isTeacherRole"
            :endpoint="endpoint"
            :project="finalProjectAccess"
          />
          <ManualPane
            v-else
            ref="manualPaneRef"
            :key="manualKey"
            :lab="lab"
            :editable="isTeacherRole"
            :restore-location="teacherManualLocation"
            v-model:toc-open="manualTocOpen"
            @edit="startTeacherEditing"
            @section-change="currentSection = $event"
            @source-jump="onSourceJump"
            @add-to-chat="addToChat"
          >
            <slot />
          </ManualPane>
        </div>
      </div>
      <div
        v-if="isTeacherRole && teacherEditing"
        class="ws-zone ws-zone-manual ws-left-pane"
      >
        <header class="ws-zone-head">
          <span class="ws-zone-title"><BookOpen :size="14" aria-hidden="true" />编辑手册</span>
        </header>
        <div class="ws-zone-body">
          <TeacherDocPanel
            :lab="lab"
            :endpoint="endpoint"
            :location="teacherManualLocation"
            @notice="toast"
            @close="finishTeacherEditing"
          />
        </div>
      </div>

      <div
        v-if="showManualPane && showRightPane && !isMobileLayout"
        class="ws-pane-resizer"
        :class="{ active: paneResizing }"
        role="separator"
        aria-label="调整左右栏宽度"
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
        :class="{ 'ws-mobile-hidden': isMobileLayout && mobileView !== 'practice' }"
      >
        <TeacherPublishPanel
          :lab="lab"
          :endpoint="endpoint"
          :variant-hint="teachingVariantHint"
          @notice="toast"
        />
      </div>

      <div
        v-else-if="workspaceRestricted"
        class="ws-right ws-access-blocked"
        :class="{ 'ws-mobile-hidden': isMobileLayout && mobileView !== 'practice' }"
      >
        <LockKeyhole :size="28" aria-hidden="true" />
        <strong>{{ accessLoading ? '正在确认学习进度' : '当前实验尚未解锁' }}</strong>
        <p>{{ currentAccess?.reason || (auth ? '请从学习路径确认教师分发范围和前置任务。' : '登录后才能进入实验工作台。') }}</p>
        <a :href="withBase('/guide/ai-tutor')">返回学习路径</a>
      </div>

      <!-- 右栏（学生）：右上完整工作区，右下学习支持与诊断。 -->
      <div
        v-else-if="showRightPane"
        ref="rightElement"
        class="ws-right"
        :class="[
          rightPaneClass,
          { 'ws-mobile-hidden': isMobileLayout && mobileView !== 'practice' },
        ]"
        :style="rightGridStyle"
      >
        <section
          v-show="showPracticePane"
          class="ws-zone ws-zone-practice ws-zone-workspace"
          :class="{ 'ws-zone-maximized': maximized === 'workspace' }"
        >
          <header class="ws-zone-head">
            <span class="ws-zone-title"><Code2 :size="14" aria-hidden="true" />工作区</span>
            <small class="ws-zone-context">代码编辑与运行共用当前账号目录</small>
            <button
              type="button"
              class="ws-zone-toggle"
              :title="maximized === 'workspace' ? '恢复布局' : '铺满页面'"
              :aria-label="maximized === 'workspace' ? '恢复工作区布局' : '将工作区铺满页面'"
              @click="toggleMaximized('workspace')"
            >
              <Minimize2 v-if="maximized === 'workspace'" :size="14" aria-hidden="true" />
              <Maximize2 v-else :size="14" aria-hidden="true" />
            </button>
            <button
              v-if="!isMobileLayout"
              type="button"
              class="ws-zone-toggle ws-zone-collapse"
              title="收起工作区"
              aria-label="收起工作区"
              @click="togglePanel('practice')"
            >
              <ChevronUp :size="14" aria-hidden="true" />
            </button>
          </header>
          <div
            ref="workspaceBodyElement"
            class="ws-zone-body ws-workspace-body"
            :style="workspaceGridStyle"
          >
            <CodePanel
              ref="codePanelRef"
              class="ws-workspace-code"
              :key="`code-${studentId}`"
              :lab="lab"
              :endpoint="endpoint"
              :student="studentId"
              :dark="isDark"
              :terminal-open="terminalDockOpen"
              @toggle-terminal="terminalDockOpen = !terminalDockOpen"
              @add-to-chat="addToChat"
            />
                <div
                  v-show="showTerminalDock"
                  class="ws-workspace-row-resizer"
                  :class="{ active: workspaceRowResizing }"
                  role="separator"
                  aria-label="调整代码编辑器与终端高度"
                  aria-orientation="horizontal"
                  :aria-valuemin="100 - WORKSPACE_CODE_SPLIT_MAX"
                  :aria-valuemax="100 - WORKSPACE_CODE_SPLIT_MIN"
                  :aria-valuenow="Math.round(100 - workspaceCodeSplit)"
                  tabindex="0"
                  title="拖动调整终端高度；双击恢复默认"
                  @pointerdown="startWorkspaceRowResize"
                  @pointermove="moveWorkspaceRowResize"
                  @pointerup="finishWorkspaceRowResize"
                  @pointercancel="finishWorkspaceRowResize"
                  @lostpointercapture="finishWorkspaceRowResize"
                  @dblclick="resetWorkspaceCodeSplit"
                  @keydown="resizeWorkspaceByKeyboard"
                >
                  <span aria-hidden="true" />
                </div>
                <div
                  v-show="showTerminalDock"
                  class="ws-workspace-terminal"
                  :class="{ 'ws-dock-maximized': maximized === 'dock' }"
                >
                  <header class="ws-bottom-dock-head">
                    <div class="ws-bottom-tabs" role="tablist" aria-label="底部面板：终端、Problems、测试结果">
                      <button
                        type="button"
                        role="tab"
                        :aria-selected="bottomTab === 'terminal'"
                        :class="{ active: bottomTab === 'terminal' }"
                        @click="bottomTab = 'terminal'"
                      >终端</button>
                      <button
                        v-if="lastDiagnosticCount > 0"
                        type="button"
                        role="tab"
                        :aria-selected="bottomTab === 'problems'"
                        :class="{ active: bottomTab === 'problems' }"
                        :title="'编译错误与警告列表；点击可跳到源码'"
                        @click="bottomTab = 'problems'"
                      >
                        Problems
                        <span v-if="lastDiagnosticCount > 0" class="ws-bottom-tab-badge" aria-label="诊断条数">{{ lastDiagnosticCount }}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        :aria-selected="bottomTab === 'tests'"
                        :class="{ active: bottomTab === 'tests' }"
                        title="可信验证命令的断言汇总"
                        @click="bottomTab = 'tests'"
                      >测试结果</button>
                    </div>
                    <div class="ws-bottom-dock-actions">
                      <button
                        type="button"
                        class="ws-zone-toggle"
                        :title="maximized === 'dock' ? '恢复布局' : '将底部面板铺满页面'"
                        :aria-label="maximized === 'dock' ? '恢复底部面板布局' : '将底部面板铺满页面'"
                        @click="toggleMaximized('dock')"
                      >
                        <Minimize2 v-if="maximized === 'dock'" :size="14" aria-hidden="true" />
                        <Maximize2 v-else :size="14" aria-hidden="true" />
                      </button>
                    </div>
                  </header>
                  <div class="ws-bottom-dock-body">
                    <TerminalPanel
                      v-show="bottomTab === 'terminal'"
                      :key="`terminal-${studentId}`"
                      :lab="lab"
                      :endpoint="endpoint"
                      :student="studentId"
                      :session-id="sessionId"
                      :dark="isDark"
                      @run-finished="onRunFinished"
                      @run-exit="onRunExit"
                      @run-diagnostics="onRunDiagnostics"
                    />
                    <ProblemsPanel
                      ref="problemsPanelRef"
                      v-show="bottomTab === 'problems'"
                      :run-id="lastRunId"
                      :endpoint="endpoint"
                      @jump="onProblemJump"
                      @diagnostics-loaded="onDiagnosticsLoaded"
                      @add-to-chat="addToChat"
                    />
                    <div v-show="bottomTab === 'tests'" class="ws-tests-panel">
                      <header class="ws-tests-intro">
                        <div class="ws-tests-intro-row">
                          <strong>测试结果</strong>
                          <button
                            v-if="lastAssertions.length"
                            type="button"
                            class="ws-tests-add-chat"
                            title="把当前断言结果添加到 AI 导师对话"
                            @click="addCurrentTestsToChat"
                          >
                            <MessageSquarePlus :size="13" aria-hidden="true" />添加到对话
                          </button>
                        </div>
                        <div v-if="runResultHistory.length" class="ws-tests-view" role="group" aria-label="测试结果视图">
                          <button
                            type="button"
                            :class="{ active: testsView === 'time' }"
                            :aria-pressed="testsView === 'time'"
                            @click="testsView = 'time'"
                          >按时间</button>
                          <button
                            type="button"
                            :class="{ active: testsView === 'tag' }"
                            :aria-pressed="testsView === 'tag'"
                            @click="testsView = 'tag'"
                          >按标签</button>
                        </div>
                      </header>
                      <div class="ws-tests-body">
                        <div class="ws-tests-conclusion" :data-state="testsConclusion.state">
                          <span class="ws-tests-conclusion-icon" aria-hidden="true">
                            <CheckCircle2 v-if="testsConclusion.state === 'ok'" :size="18" />
                            <XCircle v-else-if="testsConclusion.state === 'fail'" :size="18" />
                            <CircleSlash v-else-if="testsConclusion.state === 'stopped'" :size="18" />
                            <Clock v-else :size="18" />
                          </span>
                          <div class="ws-tests-conclusion-main">
                            <div class="ws-tests-conclusion-head">
                              <strong>{{ testsConclusion.title }}</strong>
                              <span v-if="typeof testsConclusion.passed === 'number'" class="ws-tests-conclusion-count">
                                {{ testsConclusion.passed }}/{{ testsConclusion.total }} 断言通过
                              </span>
                            </div>
                            <p>{{ testsConclusion.note }}</p>
                            <div v-if="keyAssertion && lastAssertions.length" class="ws-tests-conclusion-key">
                              <span class="ws-tests-conclusion-key-label">关键断言</span>
                              <span>{{ keyAssertion.label }} · {{ keyAssertionPassed === null ? '尚未验证' : keyAssertionPassed ? '已通过' : '未通过' }}</span>
                            </div>
                            <div v-if="testsConclusion.runId || runResultHistory.length" class="ws-tests-conclusion-meta">
                              <code v-if="testsConclusion.runId" class="ws-tests-run-id">run:{{ testsConclusion.runId.slice(0, 8) }}…</code>
                              <time v-if="testsConclusion.at" class="ws-tests-history-time">{{ formatRunTime(testsConclusion.at) }}</time>
                              <span class="ws-tests-conclusion-stats">
                                共 {{ runResultHistory.length }} 次 · 通过 {{ passedHistoryCount }} · 未通过 {{ failedHistoryCount }} · 停止 {{ stoppedHistoryCount }} · 未验证 {{ emptyHistoryCount }}
                              </span>
                            </div>
                          </div>
                        </div>
                        <template v-if="runResultHistory.length">
                          <header class="ws-tests-list-head">
                            <strong>运行记录</strong>
                            <span>{{ testsView === 'time' ? '按时间' : '按标签' }} · {{ testsView === 'time' ? orderedRunResults.length : taggedRunGroups.length }} 项</span>
                          </header>

                          <section v-if="testsView === 'time'" class="ws-tests-history" aria-label="按时间查看测试结果">
                            <template v-for="entry in orderedRunResults" :key="entry.runId">
                              <details
                                v-if="entry.assertions.length"
                                class="ws-tests-history-item"
                                :class="{ current: entry.runId === lastAssertionsRunId }"
                                :open="expandedRunId === entry.runId"
                                @toggle="onRunToggle(entry.runId, $event)"
                              >
                                <summary>
                                  <code class="ws-tests-run-id">run:{{ entry.runId.slice(0, 8) }}…</code>
                                  <span class="ws-tests-history-badge" :data-state="runStateKey(entry)">
                                    {{ runStateLabels[runStateKey(entry)] }}
                                  </span>
                                  <span v-if="entry.runId === lastAssertionsRunId" class="ws-tests-current-tag">当前</span>
                                  <span class="ws-tests-history-count">
                                    {{ entry.assertions.filter((a) => a.passed).length }}/{{ entry.assertions.length }}
                                  </span>
                                  <time v-if="entry.at" class="ws-tests-history-time">{{ formatRunTime(entry.at) }}</time>
                                  <button
                                    type="button"
                                    class="ws-tests-add-chat ws-tests-history-add"
                                    title="添加到对话"
                                    @click.prevent.stop="addHistoryTestsToChat(entry)"
                                  >
                                    <MessageSquarePlus :size="12" aria-hidden="true" />
                                  </button>
                                </summary>
                                <ul class="ws-tests-assertions">
                                  <li
                                    v-for="item in orderedAssertions(entry.assertions)"
                                    :key="`${entry.runId}:${item.id}`"
                                    :class="[
                                      'ws-test-assertion',
                                      { passed: item.passed, failed: !item.passed, 'has-hint': !item.passed && item.hint },
                                    ]"
                                  >
                                    <span class="ws-test-mark" :aria-label="item.passed ? '通过' : '未通过'">{{ item.passed ? '✓' : '✗' }}</span>
                                    <span class="ws-test-label">{{ item.label || item.id }}</span>
                                    <span class="ws-test-expected">期望：{{ item.expected }}</span>
                                    <span class="ws-test-observed">实际：{{ item.observed }}</span>
                                    <span v-if="!item.passed && item.hint" class="ws-test-hint">修改建议：{{ item.hint }}</span>
                                    <button
                                      type="button"
                                      class="ws-tests-add-chat ws-test-assertion-add"
                                      title="只把这一条断言添加到对话"
                                      @click="addOneAssertionToChat(item, entry.runId)"
                                    >
                                      <MessageSquarePlus :size="12" aria-hidden="true" />
                                    </button>
                                  </li>
                                </ul>
                              </details>
                              <div v-else class="ws-tests-history-item ws-tests-history-plain">
                                <code class="ws-tests-run-id">run:{{ entry.runId.slice(0, 8) }}…</code>
                                <span class="ws-tests-history-badge" :data-state="runStateKey(entry)">
                                  {{ runStateLabels[runStateKey(entry)] }}
                                </span>
                                <time v-if="entry.at" class="ws-tests-history-time">{{ formatRunTime(entry.at) }}</time>
                              </div>
                            </template>
                          </section>

                          <section v-else class="ws-tests-history" aria-label="按标签分类查看测试结果">
                            <details v-for="group in taggedRunGroups" :key="group.key" class="ws-tests-tag-group">
                              <summary>
                                <span class="ws-tests-tag-badge" :data-state="group.key">{{ group.label }}</span>
                                <span class="ws-tests-history-count">{{ group.entries.length }} 次</span>
                                <span class="ws-tests-group-stats">{{ groupPassSummary(group.entries) }}</span>
                              </summary>
                              <div class="ws-tests-group-body">
                                <template v-for="entry in group.entries" :key="entry.runId">
                                  <details
                                    v-if="entry.assertions.length"
                                    class="ws-tests-history-item"
                                    :class="{ current: entry.runId === lastAssertionsRunId }"
                                    :open="expandedRunId === entry.runId"
                                    @toggle="onRunToggle(entry.runId, $event)"
                                  >
                                    <summary>
                                      <code class="ws-tests-run-id">run:{{ entry.runId.slice(0, 8) }}…</code>
                                      <span class="ws-tests-history-badge" :data-state="runStateKey(entry)">
                                        {{ runStateLabels[runStateKey(entry)] }}
                                      </span>
                                      <span v-if="entry.runId === lastAssertionsRunId" class="ws-tests-current-tag">当前</span>
                                      <span class="ws-tests-history-count">
                                        {{ entry.assertions.filter((a) => a.passed).length }}/{{ entry.assertions.length }}
                                      </span>
                                      <time v-if="entry.at" class="ws-tests-history-time">{{ formatRunTime(entry.at) }}</time>
                                      <button
                                        type="button"
                                        class="ws-tests-add-chat ws-tests-history-add"
                                        title="添加到对话"
                                        @click.prevent.stop="addHistoryTestsToChat(entry)"
                                      >
                                        <MessageSquarePlus :size="12" aria-hidden="true" />
                                      </button>
                                    </summary>
                                    <ul class="ws-tests-assertions">
                                      <li
                                        v-for="item in orderedAssertions(entry.assertions)"
                                        :key="`${entry.runId}:${item.id}`"
                                        :class="[
                                          'ws-test-assertion',
                                          { passed: item.passed, failed: !item.passed, 'has-hint': !item.passed && item.hint },
                                        ]"
                                      >
                                        <span class="ws-test-mark" :aria-label="item.passed ? '通过' : '未通过'">{{ item.passed ? '✓' : '✗' }}</span>
                                        <span class="ws-test-label">{{ item.label || item.id }}</span>
                                        <span class="ws-test-expected">期望：{{ item.expected }}</span>
                                        <span class="ws-test-observed">实际：{{ item.observed }}</span>
                                        <span v-if="!item.passed && item.hint" class="ws-test-hint">修改建议：{{ item.hint }}</span>
                                        <button
                                          type="button"
                                          class="ws-tests-add-chat ws-test-assertion-add"
                                          title="只把这一条断言添加到对话"
                                          @click="addOneAssertionToChat(item, entry.runId)"
                                        >
                                          <MessageSquarePlus :size="12" aria-hidden="true" />
                                        </button>
                                      </li>
                                    </ul>
                                  </details>
                                  <div v-else class="ws-tests-history-item ws-tests-history-plain">
                                    <code class="ws-tests-run-id">run:{{ entry.runId.slice(0, 8) }}…</code>
                                    <span class="ws-tests-history-badge" :data-state="runStateKey(entry)">
                                      {{ runStateLabels[runStateKey(entry)] }}
                                    </span>
                                    <time v-if="entry.at" class="ws-tests-history-time">{{ formatRunTime(entry.at) }}</time>
                                  </div>
                                </template>
                              </div>
                            </details>
                          </section>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
          </div>
        </section>

        <div
          v-show="showPracticePane && showTerminalPane"
          class="ws-row-resizer"
          :class="{ active: rowResizing }"
          role="separator"
          aria-label="调整工作区与学习支持区高度"
          aria-orientation="horizontal"
          tabindex="0"
          title="拖动调整上下高度"
          @pointerdown="startRowResize"
          @pointermove="moveRowResize"
          @pointerup="finishRowResize"
          @pointercancel="finishRowResize"
          @lostpointercapture="finishRowResize"
        >
          <span aria-hidden="true" />
        </div>

        <section
          v-show="showTerminalPane"
          class="ws-zone ws-zone-terminal ws-zone-assistant"
          :class="{ 'ws-zone-maximized': maximized === 'assistant' }"
        >
          <header class="ws-zone-head ws-zone-head--tabs">
            <span class="ws-zone-title"><MessagesSquare :size="14" aria-hidden="true" />学习支持</span>
            <div class="ws-right-tabs" role="tablist" aria-label="学习支持视图">
              <button
                type="button"
                role="tab"
                :aria-selected="rightTab === 'report'"
                :class="{ active: rightTab === 'report' }"
                @click="rightTab = 'report'"
              >实验报告</button>
              <button
                type="button"
                role="tab"
                :aria-selected="rightTab === 'assessment'"
                :class="{ active: rightTab === 'assessment' }"
                title="量规 v2 学习评价与证据链"
                @click="rightTab = 'assessment'"
              >学习评价</button>
            </div>
            <button
              type="button"
              class="ws-zone-toggle"
              :title="maximized === 'assistant' ? '恢复布局' : '铺满页面'"
              :aria-label="maximized === 'assistant' ? '恢复学习支持区布局' : '将学习支持区铺满页面'"
              @click="toggleMaximized('assistant')"
            >
              <Minimize2 v-if="maximized === 'assistant'" :size="14" aria-hidden="true" />
              <Maximize2 v-else :size="14" aria-hidden="true" />
            </button>
            <button
              v-if="!isMobileLayout"
              type="button"
              class="ws-zone-toggle ws-zone-collapse"
              title="收起学习支持区"
              aria-label="收起学习支持区"
              @click="togglePanel('terminal')"
            >
              <ChevronDown :size="14" aria-hidden="true" />
            </button>
          </header>
          <div class="ws-zone-body ws-assistant-body">
            <ReportPanel
              v-show="rightTab === 'report'"
              :key="`report-${studentId || 'anonymous'}-${lab.id}`"
              :lab="lab"
              :teacher-feedback="teacherFeedback"
              :report-template="reportTemplate"
              :endpoint="endpoint"
              :authenticated="Boolean(auth && !isTeacherRole)"
              :session-id="sessionId"
              :verified="runResultHistory.some((entry) => entry.trusted && entry.verified)"
              :llm-config="llmConfig"
              @review-completed="onSocraticReviewCompleted"
              @review="reviewReport"
              @submit-teacher="submitReportToTeacher"
              @notice="toast"
            />
            <AssessmentPane
              v-show="rightTab === 'assessment'"
              :lab="lab"
              :endpoint="endpoint"
              :session-id="sessionId"
              :can-assess="Boolean(auth && !isTeacherRole)"
              @notice="toast"
              @open-evidence="navigateEvidenceRef"
            />
          </div>
        </section>
      </div>
    </main>

    <div
      v-if="!isTeacherRole"
      class="ws-tutor-float"
      :class="{ 'is-open': tutorOpen }"
      :style="tutorFloatStyle"
    >
      <div
        v-if="tutorOpen && isMobileLayout"
        class="ws-tutor-float-backdrop"
        aria-hidden="true"
        @click="tutorOpen = false"
      />
      <aside
        v-if="tutorOpen"
        class="ws-tutor-popover"
        :class="{ 'is-floating': tutorPanelFloating, 'is-moving': tutorPanelDragging }"
        :style="tutorPanelStyle"
        role="dialog"
        aria-label="AI 导师对话"
        @click.stop
      >
        <div
          v-if="!isMobileLayout && tutorPanelFloating"
          class="ws-tutor-top-resizer"
          :class="{ active: tutorHeightResizing }"
          role="separator"
          aria-label="调整 AI 导师顶部高度"
          aria-orientation="horizontal"
          tabindex="0"
          title="拖动顶部调整高度"
          @pointerdown="startTutorTopResize"
          @pointermove="moveTutorPanelResize"
          @pointerup="finishTutorPanelResize"
          @pointercancel="finishTutorPanelResize"
          @lostpointercapture="finishTutorPanelResize"
          @keydown="resizeTutorHeightByKeyboard"
        >
          <span aria-hidden="true" />
        </div>
        <div
          v-if="!isMobileLayout"
          class="ws-tutor-resizer"
          :class="{ active: tutorResizing }"
          role="separator"
          aria-label="调整 AI 导师宽度"
          aria-orientation="vertical"
          :aria-valuemin="TUTOR_PANEL_MIN_WIDTH"
          :aria-valuemax="Math.round(tutorPanelMaxWidth())"
          :aria-valuenow="Math.round(tutorPanelWidth)"
          tabindex="0"
          title="拖动调整宽度；双击恢复默认宽度"
          @pointerdown="startTutorLeftResize"
          @pointermove="moveTutorPanelResize"
          @pointerup="finishTutorPanelResize"
          @pointercancel="finishTutorPanelResize"
          @lostpointercapture="finishTutorPanelResize"
          @keydown="resizeTutorByKeyboard"
          @dblclick="resetTutorPanelWidth"
        >
          <span aria-hidden="true" />
        </div>
        <div
          v-if="!isMobileLayout && tutorPanelFloating"
          class="ws-tutor-right-resizer"
          :class="{ active: tutorResizing }"
          role="separator"
          aria-label="调整 AI 导师宽度"
          aria-orientation="vertical"
          tabindex="0"
          title="拖动右侧调整宽度"
          @pointerdown="startTutorRightResize"
          @pointermove="moveTutorPanelResize"
          @pointerup="finishTutorPanelResize"
          @pointercancel="finishTutorPanelResize"
          @lostpointercapture="finishTutorPanelResize"
          @keydown="resizeTutorByKeyboard"
        >
          <span aria-hidden="true" />
        </div>
        <div
          v-if="!isMobileLayout"
          class="ws-tutor-height-resizer"
          :class="{ active: tutorHeightResizing }"
          role="separator"
          aria-label="调整 AI 导师高度"
          aria-orientation="horizontal"
          :aria-valuemin="Math.round(tutorPanelHeightMin())"
          :aria-valuemax="Math.round(tutorPanelHeightMax())"
          :aria-valuenow="Math.round(tutorPanelHeight)"
          tabindex="0"
          title="上下拖动调整高度；双击恢复默认高度"
          @pointerdown="startTutorBottomResize"
          @pointermove="moveTutorPanelResize"
          @pointerup="finishTutorPanelResize"
          @pointercancel="finishTutorPanelResize"
          @lostpointercapture="finishTutorPanelResize"
          @keydown="resizeTutorHeightByKeyboard"
          @dblclick="resetTutorPanelHeight"
        >
          <span aria-hidden="true" />
        </div>
        <div
          v-if="!isMobileLayout"
          class="ws-tutor-corner-resizer"
          :class="{ active: tutorResizing || tutorHeightResizing }"
          role="separator"
          aria-label="同时调整 AI 导师宽度和高度"
          tabindex="0"
          title="拖动角落同时调整宽度和高度"
          @pointerdown="startTutorCornerResize"
          @pointermove="moveTutorPanelResize"
          @pointerup="finishTutorPanelResize"
          @pointercancel="finishTutorPanelResize"
          @lostpointercapture="finishTutorPanelResize"
        >
          <span aria-hidden="true" />
        </div>
        <TutorPane
          ref="tutorPaneRef"
          :lab="lab"
          :messages="messages"
          :sending="sending"
          :streaming-id="streamingId"
          :connection="connection"
          :connection-label="connectionLabel"
          :attachments="chatAttachments"
          @send="sendTutorMessage"
          @new-session="startSession"
          @check-connection="checkConnection"
          @close="tutorOpen = false"
          @use-prompt="usePrompt"
          @open-evidence="navigateEvidenceRef"
          @remove-attachment="removeChatAttachment"
          @open-attachment="openChatAttachment"
          @drag-start="startTutorPanelDrag"
          @drag-move="moveTutorPanel"
          @drag-end="finishTutorPanelDrag"
        >
          <template #reset>
            <button
              v-if="!isMobileLayout"
              type="button"
              class="ws-tutor-reset-size"
              aria-label="重置 AI 导师大小"
              title="恢复默认大小和位置"
              @click="resetTutorPanelSize"
            >
              <RotateCcw :size="16" aria-hidden="true" />
            </button>
          </template>
        </TutorPane>
      </aside>
      <button
        v-if="!tutorOpen"
        type="button"
        class="ws-tutor-fab"
        :class="{ 'is-moving': tutorFabDragging }"
        :aria-expanded="tutorOpen"
        aria-label="打开 AI 导师"
        title="点击打开；拖动调整位置"
        @pointerdown="startTutorFabDrag"
        @pointermove="moveTutorFab"
        @pointerup="finishTutorFabDrag"
        @pointercancel="finishTutorFabDrag"
        @lostpointercapture="finishTutorFabDrag"
        @keydown="moveTutorFabByKeyboard"
        @click="toggleTutor"
      >
        <MessagesSquare :size="20" aria-hidden="true" />
        <span v-if="messages.length > 1" class="ws-tutor-fab-dot" aria-hidden="true" />
      </button>
    </div>
    <p v-if="notice" class="ws-toast" role="status">{{ notice }}</p>

    <div v-if="teacherNotice && !noticeDismissed" class="ws-teacher-notice" role="status">
      <span>📢 老师公告：{{ teacherNotice }}</span>
      <button type="button" aria-label="关闭公告" @click="noticeDismissed = true">×</button>
    </div>

    <div
      v-if="!isTeacherRole && !finalMode && finalProjectAccess?.unlocked && props.labId === 'lab8'"
      class="ws-final-banner"
    >
      <span><Rocket :size="15" aria-hidden="true" />期末任务已解锁</span>
      <p>{{ finalProjectAccess.title }}</p>
      <button type="button" @click="enterFinal">进入期末任务</button>
    </div>

    <Teleport to="body">
    <div
      v-if="showIdentity"
      class="ws-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="账号"
      @click.self="auth ? showIdentity = false : undefined"
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
            账号保存在本机导师服务的数据库里；你的系统、进度与报告都绑定账号，登录后才能使用工作台。
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
            <span>班级</span>
            <select v-model="authForm.className" required :disabled="!classNames.length">
              <option value="" disabled>{{ classNamesLoading ? '正在加载班级…' : classNames.length ? '请选择班级' : '老师尚未创建班级' }}</option>
              <option v-for="c in classNames" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <p v-if="authMode === 'register' && !classNamesLoading && !classNames.length" class="ws-modal-status" data-state="offline">
            请先联系老师创建班级后再注册。
          </p>
          <p v-if="authError" class="ws-modal-status" data-state="offline">{{ authError }}</p>
          <div class="ws-modal-actions">
            <button
              type="button"
              class="ws-modal-secondary"
              @click="switchAuthMode"
            >
              {{ authMode === 'login' ? '没有账号？注册' : '已有账号？登录' }}
            </button>
            <span class="ws-modal-spacer" aria-hidden="true"></span>
            <button
              type="button"
              class="ws-modal-primary"
              :disabled="authBusy || (authMode === 'register' && !authForm.className)"
              @click="submitAuth"
            >
              {{ authBusy ? '请稍候…' : authMode === 'login' ? '登录' : '注册并进入' }}
            </button>
          </div>
        </template>
      </div>
    </div>
    </Teleport>

    <Teleport to="body">
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
              <template v-if="!scaffold.nextAllowed">——老师当前分发到 {{ scaffold.openLab }}，{{ scaffold.next }} 尚未分发。</template>
              <template v-else>——请到顶栏「系统构建路径」中点击 {{ scaffold.next }} 的「领取并开始」，代码才会发到本机，「我的系统」也会同步显示。</template>
            </template>
            <template v-else>八个 Lab 已全部发放，继续自由完善你的系统吧。</template>
          </p>

          <div class="ws-modal-actions">
            <button
              v-if="!scaffold.exists"
              type="button"
              class="ws-modal-primary"
              :disabled="scaffoldBusy"
              @click="scaffoldUpgrade"
            >
              {{ scaffoldBusy ? '发放中…' : '初始化我的系统（Lab1）' }}
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
    </Teleport>

    <Teleport to="body">
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
          有疑问找老师在教师工作台调整。
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
    </Teleport>
  </div>
</template>

<style scoped>
.ws-workspace {
  display: grid;
  /* 隐式的 auto 列会以子项 min-content 为下限，窄屏下会把整个外壳顶宽
     （grid blowout）。显式 minmax(0, 1fr) 把下限压到 0。 */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  position: relative;
  top: var(--vp-nav-height);
  height: calc(100dvh - var(--vp-nav-height));
  min-height: 520px;
  color: var(--ws-ink);
  background: var(--ws-surface-alt);
}

/* -- 双栏 ------------------------------------------------------------------ */
.ws-panes {
  display: grid;
  /* 单行占满可用高度，避免手册内容撑开行高、右侧百分比高度失效 */
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 57.5%) 10px minmax(0, 1fr);
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ws-panes > .ws-left-pane {
  grid-row: 1;
  grid-column: 1;
  min-width: 0;
  min-height: 0;
  border-right: 0;
}

.ws-panes > .ws-pane-resizer {
  grid-row: 1;
  grid-column: 2;
  min-height: 0;
}

.ws-panes > .ws-right {
  grid-row: 1;
  grid-column: -2 / -1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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

:global(html.ws-row-resizing),
:global(html.ws-row-resizing *) {
  cursor: row-resize !important;
  user-select: none !important;
}

/* -- 三栏分区：拖动 / 内部滚动 ------------------------------------------- */

.ws-zone {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.ws-zone-manual {
  border-right: 0;
  border-radius: 0;
}

.ws-zone-practice,
.ws-zone-terminal {
  min-height: 0;
  overflow: hidden;
}

.ws-zone-practice .ws-zone-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.ws-zone-terminal {
  min-height: 0;
}

.ws-zone-solo {
  min-height: 0;
}

.ws-zone-head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-zone-head--tabs {
  flex-wrap: nowrap;
  padding-bottom: 0;
}

.ws-zone-title {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-zone-context {
  overflow: hidden;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-zone-toggle {
  display: grid;
  flex: 0 0 auto;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  margin-left: auto;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-zone-toggle:hover,
.ws-zone-toggle:focus-visible,
.ws-zone-toggle.active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-zone-collapse {
  margin-left: 0;
}

.ws-zone-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.ws-zone-manual .ws-zone-body {
  overflow: hidden;
}

.ws-zone-manual .ws-zone-body :deep(.ws-manual-pane) {
  height: 100%;
  min-height: 0;
}

.ws-zone-workspace .ws-workspace-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-rows: minmax(180px, 1.25fr) minmax(130px, 0.75fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ws-workspace-code,
.ws-workspace-terminal,
.ws-workspace-terminal :deep(.ws-terminal-shell),
.ws-workspace-terminal :deep(.ws-problems),
.ws-workspace-terminal .ws-tests-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.ws-workspace-terminal {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ws-surface-soft, var(--ws-surface));
}

.ws-workspace-terminal.ws-dock-maximized {
  position: fixed;
  top: var(--vp-nav-height);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 41;
  width: auto;
  height: auto;
  border: 0;
  border-radius: 0;
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-bottom-dock-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ws-space-2);
  min-height: 32px;
  padding: 0 var(--ws-space-2);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-bottom-dock-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  align-self: center;
  gap: var(--ws-space-1);
}

.ws-bottom-tabs {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.ws-bottom-tabs button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: 30px;
  padding: 0 var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  white-space: nowrap;
}

.ws-bottom-tabs button:hover {
  color: var(--ws-ink);
}

.ws-bottom-tabs button.active {
  color: var(--ws-accent);
  border-bottom-color: var(--ws-accent);
}

.ws-bottom-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: var(--ws-radius-full);
  background: var(--ws-danger, #c0392b);
  color: #fff;
  font-size: 10px;
  font-weight: var(--ws-weight-semibold);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.ws-bottom-dock-body {
  position: relative;
  flex: 1 1 auto;
  display: grid;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.ws-bottom-dock-body > :deep(.ws-terminal-shell) {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.ws-bottom-dock-body > :deep(.ws-problems),
.ws-bottom-dock-body > .ws-tests-panel {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.ws-tests-panel {
  display: flex;
  flex-direction: column;
  background: var(--ws-surface);
}

.ws-tests-intro {
  flex: 0 0 auto;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-tests-intro-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
}

.ws-tests-intro strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-tests-title-block {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ws-space-2);
  min-width: 0;
}

.ws-tests-summary {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-variant-numeric: tabular-nums;
}

.ws-tests-add-chat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  color: var(--ws-ink-muted);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-tests-add-chat:hover,
.ws-tests-add-chat:focus-visible {
  color: var(--ws-ink);
  border-color: var(--ws-accent, #3b82f6);
  background: var(--ws-surface-alt);
}

.ws-tests-key-note {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-tests-fail-note {
  margin: var(--ws-space-2) 0 0 !important;
  color: var(--ws-danger, #c0392b);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-tests-focus {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0 0 var(--ws-space-3);
  padding: 8px 10px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-left: 3px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-tests-focus strong {
  color: var(--ws-accent);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-focus-state {
  color: var(--ws-ink-muted);
  font-weight: 500;
}

.ws-tests-focus[data-state='ok'] {
  border-left-color: var(--ws-ok, #1a7f37);
  background: var(--ws-ok-soft, color-mix(in srgb, var(--ws-ok, #1a7f37) 12%, transparent));
}

.ws-tests-focus[data-state='fail'] {
  border-left-color: var(--ws-danger, #c0392b);
  background: var(--ws-danger-soft, color-mix(in srgb, var(--ws-danger, #c0392b) 12%, transparent));
}

.ws-tests-history-add {
  margin-left: auto;
  width: 24px;
  height: 24px;
  padding: 0;
  justify-content: center;
}

.ws-tests-intro p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-tests-view {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: var(--ws-space-2);
  padding: 2px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
}

.ws-tests-view button {
  min-height: 24px;
  padding: 2px 10px;
  border: 0;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  color: var(--ws-ink-muted);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-tests-view button:hover,
.ws-tests-view button:focus-visible {
  color: var(--ws-ink);
}

.ws-tests-view button.active {
  background: var(--ws-surface-alt);
  color: var(--ws-ink);
  box-shadow: inset 0 0 0 1px var(--ws-line);
}

.ws-tests-conclusion {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 12px;
  margin-bottom: var(--ws-space-3);
  padding: 12px 14px;
  border: 1px solid var(--ws-line);
  border-left: 3px solid var(--ws-ink-muted);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  color: var(--ws-ink);
}

.ws-tests-conclusion[data-state='ok'] {
  border-left-color: var(--ws-ok, #1a7f37);
  background: var(--ws-ok-soft, color-mix(in srgb, var(--ws-ok, #1a7f37) 10%, transparent));
}

.ws-tests-conclusion[data-state='fail'] {
  border-left-color: var(--ws-danger, #c0392b);
  background: var(--ws-danger-soft, color-mix(in srgb, var(--ws-danger, #c0392b) 10%, transparent));
}

.ws-tests-conclusion[data-state='stopped'] {
  border-left-color: var(--ws-warn, #b7791f);
  background: var(--ws-warn-soft, color-mix(in srgb, var(--ws-warn, #b7791f) 10%, transparent));
}

.ws-tests-conclusion-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--ws-line);
  border-radius: 50%;
  background: var(--ws-surface);
  color: var(--ws-ink-muted);
}

.ws-tests-conclusion[data-state='ok'] .ws-tests-conclusion-icon {
  color: var(--ws-ok, #1a7f37);
  border-color: color-mix(in srgb, var(--ws-ok, #1a7f37) 40%, var(--ws-line));
}

.ws-tests-conclusion[data-state='fail'] .ws-tests-conclusion-icon {
  color: var(--ws-danger, #c0392b);
  border-color: color-mix(in srgb, var(--ws-danger, #c0392b) 40%, var(--ws-line));
}

.ws-tests-conclusion[data-state='stopped'] .ws-tests-conclusion-icon {
  color: var(--ws-warn, #b7791f);
  border-color: color-mix(in srgb, var(--ws-warn, #b7791f) 40%, var(--ws-line));
}

.ws-tests-conclusion-main {
  min-width: 0;
}

.ws-tests-conclusion-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.ws-tests-conclusion-head strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-conclusion-count {
  margin-left: auto;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-variant-numeric: tabular-nums;
}

.ws-tests-conclusion p {
  margin: 4px 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-tests-conclusion-key {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px dashed var(--ws-line);
  border-radius: var(--ws-radius-sm);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-tests-conclusion-key-label {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ws-accent-soft);
  color: var(--ws-accent);
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-conclusion-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 8px;
  color: var(--ws-ink-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ws-tests-conclusion-stats {
  margin-left: auto;
}

.ws-tests-list-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ws-space-2);
  margin: var(--ws-space-1) 0 var(--ws-space-2);
  color: var(--ws-ink);
  font-size: var(--ws-text-xs);
}

.ws-tests-list-head span {
  color: var(--ws-ink-faint);
}

.ws-tests-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  -webkit-overflow-scrolling: touch;
}

.ws-tests-body p {
  margin: 0;
}

.ws-tests-body code {
  font-family: var(--ws-font-mono);
}

.ws-tests-history {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-4);
}

.ws-tests-run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  color: var(--ws-ink);
  font-size: var(--ws-text-xs);
}

.ws-tests-run-head span {
  color: var(--ws-ink-faint);
}

.ws-tests-run-id {
  color: var(--ws-ink-muted);
  font-family: var(--ws-font-mono);
}

.ws-tests-pass-summary {
  margin-left: auto;
  color: var(--ws-ink-muted);
  font-variant-numeric: tabular-nums;
}

.ws-tests-history-time {
  color: var(--ws-ink-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ws-tests-note {
  margin: 0 0 var(--ws-space-3) !important;
  color: var(--ws-ink-muted);
  line-height: var(--ws-leading-normal);
}

.ws-tests-history-item {
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  padding: 0 var(--ws-space-1) var(--ws-space-1);
}

.ws-tests-history-item.current {
  border-color: var(--ws-accent, #3b82f6);
  box-shadow: inset 2px 0 0 var(--ws-accent, #3b82f6);
}

.ws-tests-history-item summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 28px;
  cursor: pointer;
  list-style: none;
  color: var(--ws-ink);
}

.ws-tests-history-item summary::-webkit-details-marker {
  display: none;
}

.ws-tests-history-item summary::before {
  content: '';
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  opacity: 0.55;
  transition: transform 0.15s ease;
}

.ws-tests-history-item[open] summary::before {
  transform: rotate(45deg);
}

.ws-tests-history-badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-history-badge[data-state='ok'] {
  color: var(--ws-ok);
  background: var(--ws-ok-soft);
}

.ws-tests-history-badge[data-state='fail'] {
  color: var(--ws-danger);
  background: var(--ws-danger-soft);
}

.ws-tests-history-badge[data-state='stopped'] {
  color: var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-tests-history-badge[data-state='empty'] {
  color: var(--ws-ink-muted);
  background: var(--ws-surface);
}

.ws-tests-current-tag {
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--ws-accent);
  background: var(--ws-accent-soft);
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-history-count {
  color: var(--ws-ink-faint);
  font-variant-numeric: tabular-nums;
}

.ws-tests-history-plain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 28px;
  color: var(--ws-ink-muted);
}

.ws-tests-tag-group {
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.ws-tests-tag-group > summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 30px;
  padding: 0 var(--ws-space-2);
  cursor: pointer;
  list-style: none;
  color: var(--ws-ink);
}

.ws-tests-tag-group > summary::-webkit-details-marker {
  display: none;
}

.ws-tests-tag-badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-tests-tag-badge[data-state='fail'] {
  color: var(--ws-danger);
  background: var(--ws-danger-soft);
}

.ws-tests-tag-badge[data-state='ok'] {
  color: var(--ws-ok);
  background: var(--ws-ok-soft);
}

.ws-tests-tag-badge[data-state='stopped'] {
  color: var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-tests-tag-badge[data-state='empty'] {
  color: var(--ws-ink-muted);
  background: var(--ws-surface-alt);
}

.ws-tests-group-stats {
  margin-left: auto;
  color: var(--ws-ink-faint);
  font-variant-numeric: tabular-nums;
}

.ws-tests-group-body {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-1);
  padding: 0 var(--ws-space-2) var(--ws-space-2);
}

.ws-zone-assistant .ws-zone-body {
  overflow: hidden;
}


.ws-tutor-float {
  position: fixed;
  right: var(--ws-space-5);
  bottom: var(--ws-space-5);
  z-index: var(--ws-z-tutor);
  display: grid;
  justify-items: end;
  gap: var(--ws-space-2);
  pointer-events: none;
}

.ws-tutor-float > * {
  pointer-events: auto;
}

.ws-tutor-fab {
  position: relative;
  display: grid;
  width: 48px;
  height: 48px;
  padding: 0;
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
  box-shadow: var(--ws-shadow-3);
  place-items: center;
  cursor: grab;
  touch-action: none;
  transition: transform 0.15s ease, background 0.15s ease;
}

.ws-tutor-fab.is-moving {
  cursor: grabbing;
  transform: scale(1.04);
}

.ws-tutor-fab:hover,
.ws-tutor-fab:focus-visible,
.ws-tutor-fab.active {
  background: var(--ws-accent-strong, var(--ws-accent));
  transform: translateY(-2px);
}

.ws-tutor-fab.is-moving:hover {
  transform: scale(1.04);
}

.ws-tutor-fab:focus-visible {
  outline: 2px solid var(--ws-accent);
  outline-offset: 3px;
}

.ws-tutor-fab-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 9px;
  height: 9px;
  border: 2px solid var(--ws-surface);
  border-radius: var(--ws-radius-full);
  background: var(--ws-ok, #1a7f37);
}

.ws-tutor-popover {
  position: fixed;
  top: var(--vp-nav-height);
  right: 0;
  bottom: 0;
  z-index: calc(var(--ws-z-tutor) + 1);
  display: flex;
  width: var(--ws-tutor-panel-width, 520px);
  max-width: var(--ws-tutor-panel-max-width, calc(100vw - 24px));
  min-width: var(--ws-tutor-panel-min-width, 0);
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--ws-line-strong, var(--ws-line));
  border-right: 0;
  border-radius: var(--ws-radius-md) 0 0 var(--ws-radius-md);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-tutor-popover.is-floating {
  top: var(--ws-tutor-panel-top);
  right: auto;
  bottom: auto;
  left: var(--ws-tutor-panel-left);
  height: var(--ws-tutor-panel-height);
  max-height: min(var(--ws-tutor-panel-max-height, 720px), calc(100dvh - var(--ws-tutor-panel-top) - 8px));
  min-height: var(--ws-tutor-panel-min-height, 0);
  border-right: 1px solid var(--ws-line-strong, var(--ws-line));
  border-radius: var(--ws-radius-md);
}

.ws-tutor-popover.is-moving {
  box-shadow: 0 18px 52px rgba(15, 23, 42, 0.24);
}

.ws-tutor-popover :deep(.ws-tutor-pane) {
  width: 100%;
  height: 100%;
}

.ws-tutor-popover :deep(.ws-tutor-head) {
  padding-right: var(--ws-space-4);
  padding-left: var(--ws-space-4);
}

.ws-tutor-reset-size {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  place-items: center;
  cursor: pointer;
}

.ws-tutor-reset-size:hover,
.ws-tutor-reset-size:focus-visible {
  color: var(--ws-accent);
  border-color: var(--ws-line);
  background: var(--ws-surface-hover, var(--ws-surface));
}

.ws-tutor-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 12px;
  border: 0;
  outline: 0;
  cursor: col-resize;
  touch-action: none;
}

.ws-tutor-resizer span {
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 64px;
  border-radius: 0 var(--ws-radius-full) var(--ws-radius-full) 0;
  background: var(--ws-line-strong, var(--ws-line));
  transform: translateY(-50%);
  transition: width 0.15s ease, background 0.15s ease;
}

.ws-tutor-resizer:hover span,
.ws-tutor-resizer:focus-visible span,
.ws-tutor-resizer.active span {
  width: 5px;
  background: var(--ws-accent);
}

.ws-tutor-right-resizer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 12px;
  border: 0;
  outline: 0;
  cursor: col-resize;
  touch-action: none;
}

.ws-tutor-right-resizer span {
  position: absolute;
  top: 50%;
  right: 0;
  width: 3px;
  height: 64px;
  border-radius: var(--ws-radius-full) 0 0 var(--ws-radius-full);
  background: var(--ws-line-strong, var(--ws-line));
  transform: translateY(-50%);
  transition: width 0.15s ease, background 0.15s ease;
}

.ws-tutor-right-resizer:hover span,
.ws-tutor-right-resizer:focus-visible span,
.ws-tutor-right-resizer.active span {
  width: 5px;
  background: var(--ws-accent);
}

.ws-tutor-top-resizer {
  position: absolute;
  top: 0;
  left: 52px;
  right: 52px;
  z-index: 2;
  height: 12px;
  border: 0;
  outline: 0;
  cursor: row-resize;
  touch-action: none;
}

.ws-tutor-top-resizer span {
  position: absolute;
  top: 0;
  left: 50%;
  width: 64px;
  height: 3px;
  border-radius: 0 0 var(--ws-radius-full) var(--ws-radius-full);
  background: var(--ws-line-strong, var(--ws-line));
  transform: translateX(-50%);
  transition: height 0.15s ease, background 0.15s ease;
}

.ws-tutor-top-resizer:hover span,
.ws-tutor-top-resizer:focus-visible span,
.ws-tutor-top-resizer.active span {
  height: 5px;
  background: var(--ws-accent);
}

.ws-tutor-height-resizer {
  position: absolute;
  right: 16px;
  bottom: 0;
  left: 16px;
  z-index: 3;
  height: 12px;
  border: 0;
  outline: 0;
  cursor: row-resize;
  touch-action: none;
}

.ws-tutor-height-resizer span {
  position: absolute;
  right: 50%;
  bottom: 0;
  left: 50%;
  width: 64px;
  height: 3px;
  border-radius: var(--ws-radius-full) var(--ws-radius-full) 0 0;
  background: var(--ws-line-strong, var(--ws-line));
  transform: translateX(-50%);
  transition: height 0.15s ease, background 0.15s ease;
}

.ws-tutor-height-resizer:hover span,
.ws-tutor-height-resizer:focus-visible span,
.ws-tutor-height-resizer.active span {
  height: 5px;
  background: var(--ws-accent);
}

.ws-tutor-corner-resizer {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 4;
  width: 20px;
  height: 20px;
  border: 0;
  outline: 0;
  cursor: nesw-resize;
  touch-action: none;
}

.ws-tutor-corner-resizer span {
  position: absolute;
  left: 4px;
  bottom: 4px;
  width: 10px;
  height: 10px;
  border-bottom: 2px solid var(--ws-line-strong, var(--ws-line));
  border-left: 2px solid var(--ws-line-strong, var(--ws-line));
  border-radius: 0 0 0 4px;
  transition: width 0.15s ease, height 0.15s ease, border-color 0.15s ease;
}

.ws-tutor-corner-resizer:hover span,
.ws-tutor-corner-resizer:focus-visible span,
.ws-tutor-corner-resizer.active span {
  width: 12px;
  height: 12px;
  border-color: var(--ws-accent);
}

.ws-tutor-float-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: rgba(15, 23, 42, 0.22);
}
.ws-zone-maximized {
  position: fixed;
  top: var(--vp-nav-height);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  border: 0;
  border-radius: 0;
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-row-resizer,
.ws-workspace-row-resizer {
  height: 6px;
  min-height: 6px;
  display: grid;
  cursor: row-resize;
  touch-action: none;
  place-items: center;
  background: var(--ws-surface-alt);
}

.ws-row-resizer span,
.ws-workspace-row-resizer span {
  width: 52px;
  height: 3px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-line-strong, var(--ws-line));
}

.ws-row-resizer:hover span,
.ws-row-resizer.active span,
.ws-workspace-row-resizer:hover span,
.ws-workspace-row-resizer.active span,
.ws-workspace-row-resizer:focus-visible span {
  background: var(--ws-accent);
}

.ws-workspace-row-resizer:focus-visible {
  outline: 2px solid var(--ws-accent);
  outline-offset: -2px;
}

/* 右栏：工作区 + 学习支持纵向 grid */
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

.ws-right {
  display: grid;
  gap: var(--ws-space-1);
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: var(--ws-space-1);
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
  overflow: hidden;
}

.ws-right-split {
  /* 行比例由 rightGridStyle 内联 gridTemplateRows 控制 */
}

.ws-right-single {
  grid-template-rows: minmax(0, 1fr);
}

.ws-right-single > .ws-zone {
  min-height: 0;
}

.ws-right .ws-zone {
  min-height: 0;
}

.ws-assistant-body {
  display: grid;
  flex: 1 1 auto;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ws-assistant-body > :deep(.ws-report),
.ws-assistant-body > :deep(.ws-tutor-pane) {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.ws-tests-empty {
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-tests-empty p {
  margin: 0;
}

.ws-tests-empty code {
  font-family: var(--ws-font-mono);
}

.ws-tests-assertions {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-test-assertion {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'mark label add'
    'mark expected add'
    'mark observed add';
  gap: 2px var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
  min-width: 0;
}

.ws-test-assertion.has-hint {
  grid-template-areas:
    'mark label add'
    'mark expected add'
    'mark observed add'
    'mark hint add';
}

.ws-test-assertion-add {
  grid-area: add;
  align-self: center;
  width: 26px;
  height: 26px;
  padding: 0;
  justify-content: center;
}

.ws-test-assertion.passed {
  border-color: color-mix(in srgb, var(--ws-ok, #1a7f37) 40%, var(--ws-line));
}

.ws-test-assertion.failed {
  border-color: color-mix(in srgb, var(--ws-danger, #c0392b) 40%, var(--ws-line));
}

.ws-test-assertion.focus {
  border-color: var(--ws-accent);
  background: color-mix(in srgb, var(--ws-accent) 7%, var(--ws-surface-alt));
  box-shadow: inset 3px 0 0 var(--ws-accent);
}

.ws-test-mark {
  grid-area: mark;
  align-self: center;
  font-weight: var(--ws-weight-bold);
  font-size: var(--ws-text-sm);
}

.ws-test-assertion.passed .ws-test-mark {
  color: var(--ws-ok, #1a7f37);
}

.ws-test-assertion.failed .ws-test-mark {
  color: var(--ws-danger, #c0392b);
}

.ws-test-label {
  grid-area: label;
  min-width: 0;
  color: var(--ws-ink);
  font-weight: var(--ws-weight-semibold);
}

.ws-test-expected,
.ws-test-observed {
  min-width: 0;
  color: var(--ws-ink-muted);
  font-family: var(--ws-font-mono);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ws-test-hint {
  grid-area: hint;
  min-width: 0;
  margin-top: 4px;
  padding: 6px 8px;
  color: var(--ws-danger, #c0392b);
  background: var(--ws-danger-soft, color-mix(in srgb, var(--ws-danger, #c0392b) 12%, transparent));
  border: 1px solid color-mix(in srgb, var(--ws-danger, #c0392b) 28%, var(--ws-line));
  border-radius: var(--ws-radius-sm);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
  overflow-wrap: anywhere;
}

/* 教师右栏：整栏一个作业发布面板。 */
.ws-right-teacher {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  padding: 0;
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-right-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--ws-space-1);
  min-width: 0;
  margin-left: var(--ws-space-2);
  overflow-x: auto;
  scrollbar-width: thin;
}

.ws-right-tabs button {
  flex: 0 0 auto;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  white-space: nowrap;
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
  top: calc(var(--vp-nav-height) + var(--ws-space-2));
  left: 50%;
  z-index: var(--ws-z-notice);
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

/* -- 期末任务解锁横幅 ------------------------------------------------------- */
.ws-final-banner {
  position: fixed;
  top: calc(var(--vp-nav-height) + var(--ws-space-8));
  left: 50%;
  z-index: var(--ws-z-notice);
  display: flex;
  align-items: center;
  gap: var(--ws-space-3);
  max-width: min(760px, calc(100vw - 2 * var(--ws-space-4)));
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-ink);
  border: 1px solid var(--ws-ok);
  border-radius: var(--ws-radius-md);
  background: color-mix(in srgb, var(--ws-ok) 12%, var(--ws-surface));
  box-shadow: var(--ws-shadow-2);
  font-size: var(--ws-text-sm);
  transform: translateX(-50%);
}

.ws-final-banner > span {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  color: var(--ws-ok);
  font-weight: var(--ws-weight-semibold);
}

.ws-final-banner p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-final-banner button {
  flex: 0 0 auto;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-ok);
  border-radius: var(--ws-radius-md);
  background: var(--ws-ok);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-final-banner button:hover {
  filter: brightness(1.05);
}

/* -- 模型设置弹窗 ---------------------------------------------------------- */
.ws-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-modal);
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

.ws-modal-field input,
.ws-modal-field select {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.ws-modal-field input:focus,
.ws-modal-field select:focus {
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


@media (max-width: 900px) {
  .ws-tutor-float {
    right: var(--ws-space-3);
    bottom: var(--ws-space-3);
  }

  .ws-tutor-popover {
    top: var(--vp-nav-height);
    right: 0;
    bottom: 0;
    left: 0;
    height: auto;
    max-height: none;
    min-height: 0;
    width: 100%;
    max-width: none;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
  }

  .ws-tutor-popover.is-floating {
    top: var(--vp-nav-height);
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: auto;
    max-height: none;
    border-radius: 0;
  }

  .ws-tutor-popover :deep(.ws-tutor-head) {
    padding-left: var(--ws-space-4);
  }
}

.ws-tutor-resizing,
.ws-tutor-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

.ws-tutor-height-resizing,
.ws-tutor-height-resizing * {
  cursor: row-resize !important;
  user-select: none !important;
}

.ws-tutor-moving,
.ws-tutor-moving * {
  cursor: grabbing !important;
  user-select: none !important;
}

.ws-tutor-fab-moving,
.ws-tutor-fab-moving * {
  cursor: grabbing !important;
  user-select: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .ws-pane-resizer span {
    transition: none;
  }

  .ws-tutor-resizer span {
    transition: none;
  }

  .ws-tutor-height-resizer span {
    transition: none;
  }
}

@media (max-width: 959px) {
  .ws-workspace {
    top: 0;
  }
}

@media (max-width: 900px) {
  .ws-workspace {
    grid-template-rows: auto minmax(0, 1fr);
    top: 0;
  }

  .ws-mobile-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
    grid-row: 2;
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
