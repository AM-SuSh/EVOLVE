<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Bot, MessageSquarePlus, RefreshCw, Send, X } from 'lucide-vue-next'
import TutorMessage from './TutorMessage.vue'
import { chatSourceLabels, type ChatAttachment } from '../chat-attachments'
import {
  tutorPromptsFor,
  type TutorLab,
  type TutorMessage as TutorMessageType,
  type TutorPrompt,
} from '../tutor-model'

/**
 * AI 导师对话栏。阶段、证据门控和提示等级保留在数据层，
 * 学生端只展示对话与可执行操作，不暴露内部教学状态。
 */
const props = defineProps<{
  lab: TutorLab
  messages: TutorMessageType[]
  sending: boolean
  streamingId: string
  connection: 'checking' | 'remote' | 'offline'
  connectionLabel: string
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
  (event: 'drag-start', event: PointerEvent): void
  (event: 'drag-move', event: PointerEvent): void
  (event: 'drag-end', event: PointerEvent): void
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
  nextTick(resizeComposer)
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
  nextTick(() => {
    resizeComposer()
    composer.value?.focus()
  })
}

function resizeComposer() {
  const input = composer.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden'
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
    <header
      class="ws-tutor-head"
      @pointerdown="emit('drag-start', $event)"
      @pointermove="emit('drag-move', $event)"
      @pointerup="emit('drag-end', $event)"
      @pointercancel="emit('drag-end', $event)"
      @lostpointercapture="emit('drag-end', $event)"
    >
      <div class="ws-tutor-identity">
        <span class="ws-tutor-mark" aria-hidden="true"><Bot :size="18" /></span>
        <span class="ws-tutor-title">
          <strong>AI 导师</strong>
          <small><i :class="connection" aria-hidden="true" />{{ connectionLabel }}</small>
        </span>
      </div>
      <div class="ws-tutor-actions">
        <button
          class="ws-connection"
          :class="connection"
          type="button"
          :aria-label="`重新检查模型连接，当前：${connectionLabel}`"
          :title="`重新检查模型连接（当前：${connectionLabel}）`"
          @click="emit('check-connection')"
        >
          <RefreshCw :size="15" aria-hidden="true" />
        </button>
        <button
          class="ws-new-session"
          type="button"
          aria-label="新对话"
          title="开始一次新的学习对话"
          @click="emit('new-session')"
        >
          <MessageSquarePlus :size="16" aria-hidden="true" />
        </button>
      </div>
    </header>

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
          <div class="ws-thinking-avatar" aria-hidden="true"><Bot :size="16" /></div>
          <div class="ws-thinking-dots" aria-hidden="true"><span /><span /><span /></div>
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
          rows="2"
          :placeholder="
            attachments.length
              ? '补充你的判断或问题…'
              : '描述你观察到的现象或卡住的地方…'
          "
          @input="resizeComposer"
          @keydown="onKeydown"
        />
        <div class="ws-composer-foot">
          <span>{{ attachments.length ? `已附带 ${attachments.length} 项内容` : 'Ctrl + Enter 发送' }}</span>
          <button type="submit" :disabled="!canSend" aria-label="发送消息" title="发送消息">
            <Send :size="17" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.ws-tutor-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
  min-height: 52px;
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-raised);
  cursor: grab;
  touch-action: none;
}

.ws-tutor-head:active {
  cursor: grabbing;
}

.ws-tutor-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-tutor-mark {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  place-items: center;
}

.ws-tutor-title {
  display: grid;
  min-width: 0;
  line-height: 1.25;
}

.ws-tutor-title strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-tutor-title small {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-tutor-title i {
  width: 6px;
  height: 6px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-ink-faint);
}

.ws-tutor-title i.remote {
  background: var(--ws-ok);
}

.ws-tutor-title i.offline {
  background: var(--ws-warn);
}

.ws-tutor-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-connection,
.ws-new-session {
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  place-items: center;
  cursor: pointer;
}

.ws-connection.checking svg {
  animation: ws-spin 0.9s linear infinite;
}

.ws-connection:hover,
.ws-connection:focus-visible,
.ws-new-session:hover,
.ws-new-session:focus-visible {
  color: var(--ws-accent);
  border-color: var(--ws-line);
  background: var(--ws-accent-soft);
}

@keyframes ws-spin {
  to {
    transform: rotate(360deg);
  }
}

/* -- 消息 ------------------------------------------------------------------ */
.ws-message-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scroll-behavior: smooth;
}

.ws-message-inner {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: var(--ws-space-5);
}

.ws-thinking {
  display: flex;
  align-items: center;
  gap: var(--ws-space-3);
}

.ws-thinking-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  place-items: center;
}

.ws-thinking-dots {
  display: flex;
  gap: 5px;
  padding: var(--ws-space-2) var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface-raised);
}

.ws-thinking-dots > span {
  width: 6px;
  height: 6px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
  animation: ws-thinking 1s ease-in-out infinite;
}

.ws-thinking-dots > span:nth-of-type(2) {
  animation-delay: 120ms;
}

.ws-thinking-dots > span:nth-of-type(3) {
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
  position: relative;
  z-index: 1;
  padding: var(--ws-space-2) var(--ws-space-5) var(--ws-space-4);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-raised);
  box-shadow: 0 -8px 20px rgba(16, 28, 32, 0.04);
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
  margin-bottom: var(--ws-space-1);
  padding-bottom: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.ws-prompt-row::-webkit-scrollbar {
  display: none;
}

.ws-prompt-row button {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 2px var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-xs);
  white-space: nowrap;
  cursor: pointer;
}

.ws-prompt-row button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-composer {
  padding: var(--ws-space-2) var(--ws-space-2) var(--ws-space-2) var(--ws-space-3);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-1);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.ws-composer:focus-within {
  border-color: var(--ws-accent);
  box-shadow: 0 0 0 2px var(--ws-accent-soft);
}

.ws-composer textarea {
  display: block;
  width: 100%;
  min-height: 44px;
  max-height: 120px;
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
  margin-top: var(--ws-space-1);
}

.ws-composer-foot > span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-composer-foot button {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--ws-accent-contrast);
  border: 0;
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  font: inherit;
  place-items: center;
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

  .ws-composer-foot > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 480px) {
  .ws-message-inner,
  .ws-composer-dock {
    padding-inline: var(--ws-space-3);
  }

  .ws-tutor-title small {
    max-width: 150px;
  }
}
</style>
