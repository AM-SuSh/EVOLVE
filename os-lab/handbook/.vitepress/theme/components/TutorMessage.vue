<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { BookOpen, Bot, Check, Copy } from 'lucide-vue-next'
import { chatSourceLabels, studentQuestionFromChat, type ChatAttachment } from '../chat-attachments'
import {
  type TutorKnowledgeChunk,
  type TutorRetrievalDiagnostics,
  type TutorMessage,
} from '../tutor-model'
import { renderTutorMarkdown } from '../markdown'

const props = defineProps<{ message: TutorMessage; streaming?: boolean }>()

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
  (event: 'open-attachment', item: ChatAttachment): void
}>()

const copied = ref(false)
const messageCopyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
let messageCopyTimer = 0
const isAssistant = computed(() => props.message.role === 'assistant')
const attached = computed(() => props.message.chatAttachments || [])
/** 学生消息若带附件，气泡只显示原问题；完整拼装正文仍在 content 里发给导师。 */
const displayContent = computed(() => {
  if (isAssistant.value || !attached.value.length) return props.message.content
  return studentQuestionFromChat(props.message.content) || '（已附带工作台内容）'
})
// 引用数据仍随消息持久化并参与服务端校验，学生端只隐藏来源展示。
const html = computed(() => renderTutorMarkdown(displayContent.value, { showKnowledgeCitations: false }))
const messageCopyText = computed(() => displayContent.value.trim() || props.message.content.trim())
const messageCopyTitle = computed(() => {
  if (messageCopyStatus.value === 'copied') return '已复制这条消息'
  if (messageCopyStatus.value === 'failed') return '复制失败，请重试'
  return '复制这条消息'
})
const knowledge = computed<TutorKnowledgeChunk[]>(() => props.message.knowledge || [])
const retrieval = computed<TutorRetrievalDiagnostics | undefined>(() => props.message.retrieval)
const knowledgeSummary = computed(() => {
  if (!knowledge.value.length) return ''
  return `本轮参考 ${knowledge.value.length} 条已发布知识`
})
const retrievalSummary = computed(() => {
  const diagnostics = retrieval.value
  if (!diagnostics) return ''
  if (diagnostics.fallbackReason) {
    const reason = diagnostics.fallbackReason.toLowerCase()
    if (reason.includes('embedding') || reason.includes('vector') || reason.includes('dimension')) {
      return '语义向量暂不可用，本轮已降级为关键词检索'
    }
    if (reason.includes('guardrail')) return ''
    return '知识检索部分降级，本轮使用可用候选继续引导'
  }
  if (!knowledge.value.length) return ''
  const lexical = Number(diagnostics.lexicalCandidates || 0)
  const vector = Number(diagnostics.vectorCandidates || 0)
  return `词面候选 ${lexical} · 向量候选 ${vector}`
})

const knowledgeTitle = computed(() => {
  if (!knowledge.value.length) return ''
  const sources = knowledge.value.map((chunk) => {
    const section = knowledgeSection(chunk)
    return [chunk.sourceTitle || chunk.sourceId, section].filter(Boolean).join(' / ')
  })
  return [knowledgeSummary.value, ...sources, retrievalSummary.value].filter(Boolean).join('\n')
})

function knowledgeSection(chunk: TutorKnowledgeChunk) {
  return (chunk.sectionPath || []).filter(Boolean).join(' / ')
}

async function writeClipboard(text: string) {
  if (!text) return
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back when clipboard permission is blocked by the browser.
    }
  }
  if (typeof document === 'undefined') throw new Error('Clipboard API is unavailable')
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const copiedText = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copiedText) throw new Error('Copy command failed')
}

function setMessageCopyStatus(status: 'copied' | 'failed') {
  if (messageCopyTimer) window.clearTimeout(messageCopyTimer)
  messageCopyStatus.value = status
  messageCopyTimer = window.setTimeout(() => {
    messageCopyStatus.value = 'idle'
    messageCopyTimer = 0
  }, 1600)
}

async function copyMessage() {
  if (!messageCopyText.value) return
  try {
    await writeClipboard(messageCopyText.value)
    setMessageCopyStatus('copied')
  } catch {
    setMessageCopyStatus('failed')
  }
}

onBeforeUnmount(() => {
  if (messageCopyTimer) window.clearTimeout(messageCopyTimer)
})

async function onBodyClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const evidence = target?.closest('.ws-evidence-link') as HTMLElement | null
  if (evidence) {
    const ref = evidence.getAttribute('data-ref')
    if (ref) emit('open-evidence', ref)
    return
  }
  const button = target?.closest('.ws-code-copy')
  if (!button) return
  const code = button.closest('.ws-code')?.querySelector('code')?.textContent
  if (!code) return
  try {
    await writeClipboard(code)
    button.textContent = '已复制'
    copied.value = true
    window.setTimeout(() => {
      button.textContent = '复制'
      copied.value = false
    }, 1600)
  } catch {
    button.textContent = '复制失败'
    window.setTimeout(() => (button.textContent = '复制'), 1600)
  }
}
</script>

<template>
  <article class="ws-message" :class="message.role">
    <div v-if="isAssistant" class="ws-message-avatar" aria-hidden="true"><Bot :size="16" /></div>
    <div class="ws-message-body">
      <div v-if="isAssistant" class="ws-message-meta">
        <strong>AI 导师</strong>
      </div>
      <div class="ws-message-content" :class="{ streaming }" @click="onBodyClick" v-html="html" />
      <div v-if="messageCopyText || (isAssistant && knowledge.length)" class="ws-message-actions">
        <button
          v-if="messageCopyText"
          type="button"
          class="ws-message-copy"
          :class="{ copied: messageCopyStatus === 'copied', failed: messageCopyStatus === 'failed' }"
          :aria-label="messageCopyTitle"
          :title="messageCopyTitle"
          @click="copyMessage"
        >
          <Check v-if="messageCopyStatus === 'copied'" :size="13" aria-hidden="true" />
          <Copy v-else :size="13" aria-hidden="true" />
        </button>
        <span
          v-if="isAssistant && knowledge.length"
          class="ws-message-source"
          :aria-label="knowledgeTitle"
          :title="knowledgeTitle"
        >
          <BookOpen :size="14" aria-hidden="true" />
        </span>
      </div>
      <div v-if="attached.length" class="ws-message-attachments" aria-label="已附带的工作台内容">
        <button
          v-for="item in attached"
          :key="item.id"
          type="button"
          class="ws-message-attachment"
          :title="`点击溯源：${chatSourceLabels[item.source]} · ${item.title}`"
          @click="emit('open-attachment', item as ChatAttachment)"
        >
          <span>{{ chatSourceLabels[item.source] }}</span>
          <strong>{{ item.title }}</strong>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.ws-message {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-3);
  margin-bottom: var(--ws-space-5);
}

.ws-message:last-child {
  margin-bottom: 0;
}

.ws-message.student {
  justify-content: flex-end;
}

.ws-message-avatar {
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

.ws-message-body {
  min-width: 0;
  max-width: min(680px, calc(100% - 42px));
}

.ws-message.student .ws-message-body {
  max-width: min(560px, 86%);
  padding: var(--ws-space-3) var(--ws-space-4);
  border: 1px solid color-mix(in srgb, var(--ws-accent) 24%, var(--ws-line));
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
}

.ws-message-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-2);
  margin-bottom: 6px;
  font-size: var(--ws-text-xs);
}

.ws-message-meta strong {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.ws-message-content {
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
  line-height: var(--ws-leading-relaxed);
  overflow-wrap: anywhere;
}

.ws-message-actions {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-2);
}

.ws-message.student .ws-message-actions {
  justify-content: flex-end;
}

.ws-message-copy {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--ws-ink-faint);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  place-items: center;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.ws-message-copy:hover {
  color: var(--ws-accent);
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.ws-message-copy:focus-visible {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  outline: 2px solid var(--ws-accent);
  outline-offset: 2px;
  background: var(--ws-surface);
}

.ws-message-copy.copied {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-message-copy.failed {
  color: var(--ws-warn);
  border-color: var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-message-source {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--ws-ink-faint);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  place-items: center;
  cursor: help;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.ws-message-source:hover {
  color: var(--ws-accent);
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

@media (max-width: 480px) {
  .ws-message {
    gap: var(--ws-space-2);
  }

  .ws-message-avatar {
    width: 28px;
    height: 28px;
  }

  .ws-message-body {
    max-width: calc(100% - 36px);
  }

  .ws-message.student .ws-message-body {
    max-width: 90%;
  }
}

.ws-message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
  margin-top: var(--ws-space-2);
}

.ws-message-attachment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 24px;
  padding: 2px 8px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-message-attachment span {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
}

.ws-message-attachment strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ws-ink);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-message-attachment:hover,
.ws-message-attachment:focus-visible {
  color: var(--ws-ink);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

/* 流式输出时在末尾跟一个光标，让学生看出还在写。 */
.ws-message-content.streaming :last-child::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--ws-accent);
  vertical-align: text-bottom;
  animation: ws-caret 1s step-end infinite;
}

@keyframes ws-caret {
  50% {
    opacity: 0;
  }
}

.ws-message-content :deep(> *:first-child) {
  margin-top: 0;
}

.ws-message-content :deep(> *:last-child) {
  margin-bottom: 0;
}

.ws-message-content :deep(p) {
  margin: 0 0 var(--ws-space-3);
}

.ws-message-content :deep(ul),
.ws-message-content :deep(ol) {
  margin: 0 0 var(--ws-space-3);
  padding-left: var(--ws-space-5);
}

.ws-message-content :deep(li) {
  margin: var(--ws-space-1) 0;
}

.ws-message-content :deep(h1),
.ws-message-content :deep(h2),
.ws-message-content :deep(h3),
.ws-message-content :deep(h4) {
  margin: var(--ws-space-4) 0 var(--ws-space-2);
  font-size: var(--ws-text-lg);
  line-height: var(--ws-leading-tight);
}

.ws-message-content :deep(blockquote) {
  margin: 0 0 var(--ws-space-3);
  padding-left: var(--ws-space-3);
  color: var(--ws-ink-muted);
  border-left: 3px solid var(--ws-line-strong);
}

.ws-message-content :deep(a) {
  color: var(--ws-accent);
}

.ws-message-content :deep(.ws-evidence-link) {
  display: inline;
  margin: 0;
  padding: 0 2px;
  color: var(--ws-accent);
  border: none;
  border-bottom: 1px dashed var(--ws-accent);
  border-radius: 0;
  background: transparent;
  font: inherit;
  font-family: var(--ws-font-mono, ui-monospace, monospace);
  font-size: 0.95em;
  cursor: pointer;
}

.ws-message-content :deep(.ws-evidence-link:hover) {
  background: var(--ws-accent-soft);
}

/* 行内寄存器名、指令名：sepc / sscratch / csrrw / cargo run … */
.ws-message-content :deep(code) {
  padding: 1px 5px;
  color: var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  font-family: var(--ws-font-mono);
  font-size: 0.9em;
}

.ws-message-content :deep(.ws-code) {
  margin: 0 0 var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
  overflow: hidden;
}

.ws-message-content :deep(.ws-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  padding: var(--ws-space-1) var(--ws-space-2) var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-faint);
  border-bottom: 1px solid var(--ws-line);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
}

.ws-message-content :deep(.ws-code-copy) {
  min-height: var(--ws-control-sm);
  padding: 2px var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-message-content :deep(.ws-code-copy:hover) {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-message-content :deep(.ws-code pre) {
  margin: 0;
  padding: var(--ws-space-3);
  overflow-x: auto;
}

.ws-message-content :deep(.ws-code code) {
  padding: 0;
  color: var(--ws-ink);
  background: transparent;
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-message-content :deep(table) {
  display: block;
  margin: 0 0 var(--ws-space-3);
  border-collapse: collapse;
  overflow-x: auto;
  font-size: var(--ws-text-sm);
}

.ws-message-content :deep(th),
.ws-message-content :deep(td) {
  padding: var(--ws-space-1) var(--ws-space-3);
  border: 1px solid var(--ws-line);
}
</style>
