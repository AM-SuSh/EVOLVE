<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useData, useRouter, withBase } from 'vitepress'
import { BookOpen, Home, Moon, MessagesSquare, Settings, Sun } from 'lucide-vue-next'
import ManualPane from './ManualPane.vue'
import TutorPane from './TutorPane.vue'
import JourneyRail from './JourneyRail.vue'
import {
  appendEvent,
  buildLabJourney,
  createId,
  exportEventsAsJsonl,
  getTutorLab,
  hasCustomLlmConfig,
  inferCategory,
  isDirectAnswerRequest,
  loadEvents,
  loadLlmConfig,
  offlineTutorReply,
  saveLlmConfig,
  tutorStages,
  type LearningEvent,
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
const mobileView = ref<'manual' | 'tutor'>('manual')

/* 模型接入配置：前端填写、存浏览器本地，按请求发给 tutor-server。 */
const llmConfig = ref<LlmConfig>(loadLlmConfig())
const llmDraft = ref<LlmConfig>({ ...llmConfig.value })
const showLlmSettings = ref(false)

let noticeTimer = 0

const lab = computed(() => getTutorLab(props.labId))
const journey = computed(() => buildLabJourney(events.value, props.labId))
const journeyItem = computed(() => journey.value.find((item) => item.lab.id === props.labId))
const sessionEvents = computed(() =>
  events.value.filter((event) => event.sessionId === sessionId.value),
)
const completedStages = computed(
  () =>
    new Set(
      sessionEvents.value
        .filter((event) => event.type === 'stage_enter')
        .map((event) => event.stage),
    ),
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
  options: Pick<LearningEvent, 'category' | 'content' | 'metadata'> = {},
) {
  const result = appendEvent(events.value, {
    sessionId: sessionId.value,
    labId: props.labId,
    stage: activeStage.value,
    type,
    ...options,
  })
  events.value = result.next
  if (connection.value === 'remote') void syncEvent(result.event)
}

async function syncEvent(event: LearningEvent) {
  try {
    await fetch(`${endpoint}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
    })
  } catch {
    // 浏览器本地存储是权威副本，代理服务缺席不影响学习。
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
    const payload = (await response.json()) as { connected?: boolean; model?: string }
    connection.value = payload.connected ? 'remote' : 'offline'
    modelName.value = payload.model || ''
  } catch {
    connection.value = 'offline'
    modelName.value = ''
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
  showLlmSettings.value = false
  toast('模型设置已保存，正在重新探测连接…')
  await checkConnection()
  toast(connection.value === 'remote' ? `已连接：${modelName.value}` : '未连上模型，导师将使用离线引导。')
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
  } catch {
    connection.value = 'offline'
    const reply = `模型连接中断，已切换到离线引导。\n\n${offlineTutorReply(text, activeStage.value, guarded, lab.value)}`
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
    record('ai_response', { category, content: reply, metadata: { mode: 'fallback' } })
  } finally {
    sending.value = false
    streamingId.value = ''
  }
}

/* -- 阶段 ------------------------------------------------------------------- */

async function chooseStage(stage: TutorStageId) {
  if (stage === activeStage.value) return
  activeStage.value = stage
  record('stage_enter', { metadata: { title: activeStageData.value.title } })

  const hasIntro = messages.value.some(
    (message) =>
      message.role === 'assistant' && message.stage === stage && message.kind === 'stage_intro',
  )
  if (hasIntro) return

  const introId = createId('message')
  let content = offlineTutorReply('', stage, false, lab.value)
  if (connection.value === 'remote') {
    const request = `进入阶段：${activeStageData.value.title}。${activeStageData.value.description}`
    try {
      const outcome = await requestReply(request, (partial) => {
        const existing = messages.value.find((item) => item.id === introId)
        if (existing) {
          existing.content = partial
          return
        }
        streamingId.value = introId
        messages.value.push({
          id: introId,
          role: 'assistant',
          stage,
          kind: 'stage_intro',
          content: partial,
          timestamp: new Date().toISOString(),
        })
      })
      if (outcome?.reply) content = outcome.reply
    } catch {
      // 保留本地阶段引导。
    } finally {
      streamingId.value = ''
    }
  }

  const existing = messages.value.find((item) => item.id === introId)
  if (existing) existing.content = content
  else {
    messages.value.push({
      id: introId,
      role: 'assistant',
      stage,
      kind: 'stage_intro',
      content,
      timestamp: new Date().toISOString(),
    })
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

function recordVerification({ content, passed }: { content: string; passed: boolean }) {
  const wasCompleted = Boolean(journeyItem.value?.completed)
  record('verification_attempt', {
    content,
    metadata: { passed, command: lab.value.verificationCommand },
  })
  toast(passed ? '验证结果已记录。' : '失败现象已记录，带着它进入排错阶段。')
  announceUnlock(wasCompleted)
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

function exportGrowth() {
  exportEventsAsJsonl(
    events.value,
    `os-lab-growth-record-${new Date().toISOString().slice(0, 10)}.jsonl`,
  )
  toast('成长档案已导出为 JSONL。')
}

onMounted(async () => {
  document.documentElement.classList.add('ws-lock')
  events.value = loadEvents()
  await checkConnection()
  startSession()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('ws-lock')
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="ws-workspace">
    <header class="ws-topbar">
      <a class="ws-brand" :href="withBase('/')">
        <span class="ws-brand-mark" aria-hidden="true">OS</span>
        <span class="ws-brand-text">
          <strong>os-lab 学习工作台</strong>
          <small>{{ lab.label }} · {{ lab.systemLayer }}</small>
        </span>
      </a>

      <div class="ws-topbar-actions">
        <JourneyRail :journey="journey" @enter-lab="enterLab" @export-growth="exportGrowth" />
        <a class="ws-topbar-link" :href="withBase('/labs/overview')">
          <Home :size="15" aria-hidden="true" /><span>返回手册</span>
        </a>
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
        <BookOpen :size="15" aria-hidden="true" />实验手册
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="mobileView === 'tutor'"
        :class="{ active: mobileView === 'tutor' }"
        @click="mobileView = 'tutor'"
      >
        <MessagesSquare :size="15" aria-hidden="true" />AI 导师
      </button>
    </div>

    <main class="ws-panes">
      <ManualPane
        :class="{ 'ws-mobile-hidden': mobileView !== 'manual' }"
        :lab="lab"
        :active-stage="activeStage"
        :journey-item="journeyItem"
        @section-change="currentSection = $event"
        @record-verification="recordVerification"
        @submit-reflection="submitReflection"
      >
        <slot />
      </ManualPane>

      <TutorPane
        :class="{ 'ws-mobile-hidden': mobileView !== 'tutor' }"
        :lab="lab"
        :active-stage="activeStage"
        :messages="messages"
        :completed-stages="completedStages"
        :sending="sending"
        :streaming-id="streamingId"
        :connection="connection"
        :connection-label="connectionLabel"
        :current-section="currentSection"
        @send="sendMessage"
        @choose-stage="chooseStage"
        @new-session="startSession"
        @check-connection="checkConnection"
        @use-prompt="usePrompt"
      />
    </main>

    <p v-if="notice" class="ws-toast" role="status">{{ notice }}</p>

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
        <p class="ws-modal-hint">
          配置只保存在本机浏览器，随每次提问发给本地导师服务；全部留空表示使用默认的本机
          Ollama（qwen2.5:7b）。换设备需要重新填写。
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
  grid-template-columns: minmax(0, 1.15fr) minmax(400px, 0.85fr);
  min-height: 0;
}

.ws-mobile-switch {
  display: none;
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

.ws-modal-field {
  display: block;
  margin-bottom: var(--ws-space-3);
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

@media (max-width: 1180px) {
  .ws-panes {
    grid-template-columns: minmax(0, 1fr) minmax(360px, 0.8fr);
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
    grid-template-columns: 1fr 1fr;
    gap: var(--ws-space-1);
    padding: var(--ws-space-2) var(--ws-space-3);
    border-bottom: 1px solid var(--ws-line);
    background: var(--ws-surface-alt);
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
