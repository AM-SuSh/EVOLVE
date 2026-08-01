<script setup lang="ts">
import { computed, ref } from 'vue'
import { ShieldAlert } from 'lucide-vue-next'
import {
  categoryLabels,
  describeTutorHintLevel,
  navigableEvidenceRefs,
  shortRef,
  tutorHintDetail,
  type TutorMessage,
} from '../tutor-model'
import { renderTutorMarkdown } from '../markdown'

const props = defineProps<{ message: TutorMessage; streaming?: boolean }>()

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
}>()

const copied = ref(false)
const isAssistant = computed(() => props.message.role === 'assistant')
const html = computed(() => renderTutorMarkdown(props.message.content))
const hintLabel = computed(() => describeTutorHintLevel(props.message.hintLevel))
const hintTitle = computed(() => tutorHintDetail(props.message.hintLevel))
const refused = computed(() => Boolean(props.message.refused || props.message.guardrail))
const chips = computed(() =>
  navigableEvidenceRefs(props.message.evidenceRefs).map((ref) => ({
    ref,
    label: shortRef(ref),
  })),
)

// 代码块复制 + 证据引用：事件委托，避免往 v-html 里塞 Vue 监听器。
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
    await navigator.clipboard.writeText(code)
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
  <article class="ws-message" :class="[message.role, { refused }]">
    <div v-if="isAssistant" class="ws-message-avatar" aria-hidden="true">OS</div>
    <div class="ws-message-body">
      <div class="ws-message-meta">
        <strong>{{ isAssistant ? '引导导师' : '你' }}</strong>
        <span v-if="message.category" class="ws-message-tag">
          {{ categoryLabels[message.category] }}
        </span>
        <span v-if="hintLabel" class="ws-message-tag hint" :title="hintTitle">{{ hintLabel }}</span>
        <span v-if="refused" class="ws-message-tag guarded" title="本轮拒答完整实现，改为引导判断或观察">
          <ShieldAlert :size="13" aria-hidden="true" />已拒答完整实现
        </span>
        <span v-else-if="message.guardrail" class="ws-message-tag guarded">
          <ShieldAlert :size="13" aria-hidden="true" />学习护栏
        </span>
      </div>
      <div class="ws-message-content" :class="{ streaming }" @click="onBodyClick" v-html="html" />
      <div v-if="chips.length" class="ws-message-refs" aria-label="证据引用">
        <button
          v-for="chip in chips"
          :key="chip.ref"
          type="button"
          class="ws-message-ref"
          :title="`打开 ${chip.ref}`"
          @click="emit('open-evidence', chip.ref)"
        >
          {{ chip.label }}
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
  margin-bottom: var(--ws-space-6);
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
  max-width: calc(100% - 42px);
}

.ws-message.student .ws-message-body {
  max-width: min(560px, 88%);
  padding: var(--ws-space-3) var(--ws-space-4);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
}

.ws-message-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-1);
  font-size: var(--ws-text-xs);
}

.ws-message-meta strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-message-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: 1px var(--ws-space-2);
  color: var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
}

.ws-message-tag.hint {
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono, ui-monospace, monospace);
}

.ws-message-tag.guarded {
  color: var(--ws-warn);
  border: 1px solid var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-message-content {
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
  line-height: var(--ws-leading-relaxed);
  overflow-wrap: anywhere;
}

.ws-message-refs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-2);
}

.ws-message-ref {
  min-height: var(--ws-control-sm, 28px);
  padding: 2px var(--ws-space-2);
  color: var(--ws-accent);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  font: inherit;
  font-family: var(--ws-font-mono, ui-monospace, monospace);
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-message-ref:hover {
  background: var(--ws-surface);
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
