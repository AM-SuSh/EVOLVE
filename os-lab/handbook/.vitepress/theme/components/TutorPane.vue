<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, RefreshCw, Send, Server, X } from 'lucide-vue-next'
import TutorMessage from './TutorMessage.vue'
import TutorEvidenceBar from './TutorEvidenceBar.vue'
import { chatSourceLabels, type ChatAttachment } from '../chat-attachments'
import {
  tutorPromptsFor,
  type TutorLab,
  type TutorMessage as TutorMessageType,
  type TutorPrompt,
  type TutorStageId,
  type TutorState,
} from '../tutor-model'

/**
 * AI 导师对话栏。阶段机制退到数据层（事件仍带 stage 字段），
 * 顶栏下挂 TutorEvidenceBar 展示门控阶段 / 证据 / 下一步。
 */
const props = defineProps<{
  lab: TutorLab
  messages: TutorMessageType[]
  sending: boolean
  streamingId: string
  connection: 'checking' | 'remote' | 'offline'
  connectionLabel: string
  tutorState: TutorState | null
  activeStage: TutorStageId
  attachments?: ChatAttachment[]
}>()

const emit = defineEmits<{
  (event: 'send', text: string): void
  (event: 'new-session'): void
  (event: 'check-connection'): void
  (event: 'use-prompt', prompt: TutorPrompt): void
  (event: 'open-evidence', ref: string): void
  (event: 'remove-attachment', id: string): void
  (event: 'open-attachment', item: ChatAttachment): void
}>()

const draft = ref('')
const composer = ref<HTMLTextAreaElement>()
const messageList = ref<HTMLElement>()
const attachments = computed(() => props.attachments || [])
const canSend = computed(
  () => Boolean(draft.value.trim() || attachments.value.length) && !props.sending,
)

/** 快捷提问取自不同学习环节的代表性模板：判断 / 排错 / 复盘。 */
const quickPrompts = computed(() => [
  tutorPromptsFor(props.lab, 'orient')[0],
  tutorPromptsFor(props.lab, 'debug')[0],
  tutorPromptsFor(props.lab, 'debug')[1],
  tutorPromptsFor(props.lab, 'reflect')[0],
])

function submit() {
  if (!canSend.value) return
  emit('send', draft.value.trim())
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}

function usePrompt(prompt: TutorPrompt) {
  draft.value = prompt.text
  emit('use-prompt', prompt)
  nextTick(() => composer.value?.focus())
}

async function scrollToLatest() {
  await nextTick()
  const list = messageList.value
  if (list) list.scrollTop = list.scrollHeight
}

async function focusComposer() {
  await nextTick()
  composer.value?.focus()
}

watch(() => props.messages.length, scrollToLatest)
watch(
  () => props.messages[props.messages.length - 1]?.content,
  () => {
    // 流式输出时贴着底部跟随；学生往上翻看历史时不打断。
    const list = messageList.value
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    if (nearBottom) scrollToLatest()
  },
)

defineExpose({ scrollToLatest, focusComposer })
</script>

<template>
  <section class="ws-tutor-pane" aria-label="AI 引导导师">
    <header class="ws-tutor-head">
      <strong>AI 导师</strong>
      <div class="ws-tutor-actions">
        <button
          class="ws-connection"
          :class="connection"
          type="button"
          :title="`重新检查模型连接（当前：${connectionLabel}）`"
          @click="emit('check-connection')"
        >
          <Server :size="14" aria-hidden="true" />
          <span>{{ connectionLabel }}</span>
          <RefreshCw :size="12" aria-hidden="true" />
        </button>
        <button
          class="ws-new-session"
          type="button"
          title="开始一次新的学习对话"
          @click="emit('new-session')"
        >
          <Plus :size="15" aria-hidden="true" /><span>新对话</span>
        </button>
      </div>
    </header>

    <TutorEvidenceBar
      :tutor-state="tutorState"
      :fallback-stage="activeStage"
      @open-evidence="emit('open-evidence', $event)"
    />

    <div ref="messageList" class="ws-message-list" aria-live="polite">
      <div class="ws-message-inner">
        <TutorMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :streaming="message.id === streamingId"
          @open-evidence="emit('open-evidence', $event)"
          @open-attachment="emit('open-attachment', $event)"
        />
        <div v-if="sending && !streamingId" class="ws-thinking" role="status">
          <div class="ws-thinking-avatar" aria-hidden="true">OS</div>
          <span /><span /><span />
          <em class="ws-visually-hidden">导师正在思考</em>
        </div>
      </div>
    </div>

    <div class="ws-composer-dock">
      <div v-if="attachments.length" class="ws-chat-attachments" aria-label="待发送的工作台附件">
        <div
          v-for="item in attachments"
          :key="item.id"
          class="ws-chat-attachment"
        >
          <button
            type="button"
            class="ws-chat-attachment-open"
            :title="`点击溯源：${chatSourceLabels[item.source]} · ${item.title}`"
            @click="emit('open-attachment', item)"
          >
            <span class="ws-chat-attachment-source">{{ chatSourceLabels[item.source] }}</span>
            <strong class="ws-chat-attachment-title">{{ item.title }}</strong>
          </button>
          <button
            type="button"
            class="ws-chat-attachment-remove"
            :aria-label="`移除附件 ${item.title}`"
            @click="emit('remove-attachment', item.id)"
          >
            <X :size="12" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="ws-prompt-row" aria-label="快捷提问">
        <button v-for="prompt in quickPrompts" :key="prompt.id" type="button" @click="usePrompt(prompt)">
          {{ prompt.label }}
        </button>
      </div>
      <form class="ws-composer" @submit.prevent="submit">
        <label class="ws-visually-hidden" for="ws-tutor-input">向引导导师提问</label>
        <textarea
          id="ws-tutor-input"
          ref="composer"
          v-model="draft"
          rows="3"
          :placeholder="
            attachments.length
              ? '可再写一句你的判断或问题，发送时会连同上方附件一起交给导师…'
              : '写下你的判断、观察到的现象或卡住的地方…（导师只引导，不代写）'
          "
          @keydown="onKeydown"
        />
        <div class="ws-composer-foot">
          <span>
            {{
              attachments.length
                ? `将附带 ${attachments.length} 段工作台内容 · Ctrl+Enter 发送`
                : '匿名会话 · 记录保存在本机 · Ctrl+Enter 发送'
            }}
          </span>
          <button type="submit" :disabled="!canSend">
            <Send :size="16" aria-hidden="true" /><span>发送</span>
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.ws-tutor-pane {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* -- 顶栏 ------------------------------------------------------------------ */
.ws-tutor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-tutor-head > strong {
  font-size: var(--ws-text-sm);
}

.ws-tutor-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-connection,
.ws-new-session {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-connection.remote {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-connection.offline {
  color: var(--ws-warn);
  border-color: var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-connection:hover,
.ws-new-session:hover {
  border-color: var(--ws-accent);
}

/* -- 消息 ------------------------------------------------------------------ */
.ws-message-list {
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.ws-message-inner {
  padding: var(--ws-space-4) var(--ws-space-5) var(--ws-space-4);
}

.ws-thinking {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-thinking-avatar {
  display: grid;
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

.ws-thinking > span {
  width: 6px;
  height: 6px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
  animation: ws-thinking 1s ease-in-out infinite;
}

.ws-thinking > span:nth-of-type(2) {
  animation-delay: 120ms;
}

.ws-thinking > span:nth-of-type(3) {
  animation-delay: 240ms;
}

@keyframes ws-thinking {
  0%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* -- 输入区 ---------------------------------------------------------------- */
.ws-composer-dock {
  padding: var(--ws-space-2) var(--ws-space-5) var(--ws-space-4);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-chat-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
  margin-bottom: var(--ws-space-2);
}

.ws-chat-attachment {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  min-height: var(--ws-control-sm);
  padding: 2px 4px 2px 4px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
}

.ws-chat-attachment-open {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-width: 0;
  max-width: 100%;
  padding: 0 4px;
  border: 0;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ws-chat-attachment-open:hover,
.ws-chat-attachment-open:focus-visible {
  background: var(--ws-surface);
}

.ws-chat-attachment-source {
  flex: 0 0 auto;
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
}

.ws-chat-attachment-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ws-ink);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-chat-attachment-remove {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--ws-ink-faint);
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.ws-chat-attachment-remove:hover {
  color: var(--ws-ink);
  background: var(--ws-surface);
}

.ws-prompt-row {
  display: flex;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-2);
  padding-bottom: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.ws-prompt-row::-webkit-scrollbar {
  display: none;
}

.ws-prompt-row button {
  flex: 0 0 auto;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  white-space: nowrap;
  cursor: pointer;
}

.ws-prompt-row button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-composer {
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-2);
}

.ws-composer:focus-within {
  border-color: var(--ws-accent);
}

.ws-composer textarea {
  display: block;
  width: 100%;
  min-height: 52px;
  color: var(--ws-ink);
  border: 0;
  outline: 0;
  background: transparent;
  resize: none;
  font: inherit;
  font-size: var(--ws-text-base);
  line-height: var(--ws-leading-normal);
}

.ws-composer textarea::placeholder {
  color: var(--ws-ink-faint);
}

.ws-composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  margin-top: var(--ws-space-2);
}

.ws-composer-foot > span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-composer-foot button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-accent-contrast);
  border: 0;
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-composer-foot button:hover:not(:disabled) {
  background: var(--ws-accent-hover);
}

.ws-composer-foot button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 900px) {
  .ws-message-inner,
  .ws-composer-dock {
    padding-inline: var(--ws-space-4);
  }

  .ws-connection span {
    display: none;
  }

  .ws-composer-foot > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
