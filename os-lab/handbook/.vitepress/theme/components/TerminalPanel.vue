<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { createId, type TutorLab } from '../tutor-model'
import TerminalSession from './TerminalSession.vue'

defineProps<{
  lab: TutorLab
  endpoint: string
  student?: string
  sessionId?: string
  dark?: boolean
}>()

type RunAssertion = { id: string; label: string; passed: boolean; expected: string; observed: string }

const emit = defineEmits<{
  (event: 'run-finished', payload: {
    content: string
    passed: boolean
    verified: boolean
    runId: string
    recipeId: string | null
    trusted: boolean
    assertions: RunAssertion[]
    stopped?: string
  }): void
  (event: 'run-exit', runId: string): void
  (event: 'run-diagnostics', payload: { runId: string; diagnostics: unknown[] }): void
  (event: 'insert-report', text: string): void
}>()

const MAX_SESSIONS = 4

type TermTab = { id: string; label: string }

let termSeq = 1
function makeTab(): TermTab {
  const n = termSeq++
  return { id: createId('term'), label: n === 1 ? '终端' : `终端 ${n}` }
}

const tabs = ref<TermTab[]>([makeTab()])
const activeId = ref(tabs.value[0].id)

function selectTab(id: string) {
  activeId.value = id
}

function newTerminal() {
  if (tabs.value.length >= MAX_SESSIONS) return
  const tab = makeTab()
  tabs.value.push(tab)
  activeId.value = tab.id
}

function closeTab(id: string) {
  if (tabs.value.length <= 1) return
  const index = tabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) return
  tabs.value.splice(index, 1)
  if (activeId.value === id) {
    const next = tabs.value[Math.max(0, index - 1)] || tabs.value[0]
    activeId.value = next.id
  }
}
</script>

<template>
  <section
    class="ws-terminal-shell"
    :class="{ 'ws-terminal-shell--dark': dark }"
    aria-label="当前实验运行与验证"
  >
    <header class="ws-term-session-bar" aria-label="终端会话">
      <div class="ws-term-session-tabs" role="tablist">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="ws-term-session-tab"
          :class="{ active: tab.id === activeId }"
        >
          <button
            type="button"
            role="tab"
            class="ws-term-session-label"
            :aria-selected="tab.id === activeId"
            @click="selectTab(tab.id)"
          >
            {{ tab.label }}
          </button>
          <button
            v-if="tabs.length > 1"
            type="button"
            class="ws-term-session-close"
            :aria-label="`关闭 ${tab.label}`"
            :title="`关闭 ${tab.label}`"
            @click.stop="closeTab(tab.id)"
          >
            <X :size="12" aria-hidden="true" />
          </button>
        </div>
      </div>
      <button
        type="button"
        class="ws-term-session-new"
        :disabled="tabs.length >= MAX_SESSIONS"
        :title="tabs.length >= MAX_SESSIONS ? `最多 ${MAX_SESSIONS} 个终端` : '新开终端'"
        aria-label="新开终端"
        @click="newTerminal"
      >
        <Plus :size="14" aria-hidden="true" />
      </button>
    </header>

    <div class="ws-term-session-body">
      <TerminalSession
        v-for="tab in tabs"
        v-show="tab.id === activeId"
        :key="tab.id"
        :lab="lab"
        :endpoint="endpoint"
        :student="student"
        :session-id="sessionId"
        :dark="dark"
        @run-finished="emit('run-finished', $event)"
        @run-exit="emit('run-exit', $event)"
        @run-diagnostics="emit('run-diagnostics', $event)"
        @insert-report="emit('insert-report', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.ws-terminal-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface-soft, var(--ws-surface-alt));
  color-scheme: light;
}

.ws-terminal-shell--dark {
  color-scheme: dark;
}

.ws-term-session-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  gap: 2px;
  min-height: 28px;
  padding: 0 var(--ws-space-1) 0 var(--ws-space-2);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-term-session-tabs {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.ws-term-session-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  max-width: 140px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
}

.ws-term-session-tab.active {
  border-bottom-color: var(--ws-accent);
  background: var(--ws-surface-soft);
}

.ws-term-session-label {
  min-width: 0;
  padding: 4px 8px;
  overflow: hidden;
  color: var(--ws-ink-muted);
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ws-term-session-tab.active .ws-term-session-label {
  color: var(--ws-accent);
}

.ws-term-session-close {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: 2px;
  padding: 0;
  color: var(--ws-ink-faint);
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.ws-term-session-close:hover {
  color: var(--ws-ink);
  background: var(--ws-surface);
}

.ws-term-session-new {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  align-self: center;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  margin-left: 2px;
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md);
  background: transparent;
  cursor: pointer;
}

.ws-term-session-new:hover:not(:disabled) {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-surface);
}

.ws-term-session-new:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ws-term-session-body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ws-term-session-body > :deep(.ws-terminal) {
  height: 100%;
}
</style>
