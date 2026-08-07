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

type RunAssertion = {
  id: string
  label: string
  passed: boolean
  expected: string
  observed: string
  hint?: string
}

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
}>()

const MAX_SESSIONS = 4

type TermTab = { id: string; label: string }

let termSeq = 1
function makeTab(): TermTab {
  const n = termSeq++
  return {
    id: createId('term'),
    label: `终端 ${n}`,
  }
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
      />
    </div>

    <!-- 会话栏靠右：与外层底栏「终端 / Problems / 测试结果」横向页签区分。 -->
    <aside class="ws-term-session-rail" aria-label="终端会话">
      <div class="ws-term-session-tabs" role="tablist" aria-orientation="vertical">
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
            :title="tab.label"
            :aria-label="tab.label"
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
            <X :size="11" aria-hidden="true" />
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
    </aside>
  </section>
</template>

<style scoped>
.ws-terminal-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
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

.ws-term-session-body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ws-term-session-body > :deep(.ws-terminal) {
  height: 100%;
}

.ws-term-session-rail {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  align-items: stretch;
  gap: 6px;
  width: 88px;
  min-height: 0;
  padding: 8px 6px;
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-term-session-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.ws-term-session-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.ws-term-session-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 32px;
  padding: 6px 4px;
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md, 6px);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: var(--ws-weight-semibold, 600);
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.ws-term-session-tab.active .ws-term-session-label {
  color: var(--ws-accent);
  border-color: color-mix(in srgb, var(--ws-accent) 45%, transparent);
  background: var(--ws-surface-soft);
  box-shadow: inset 3px 0 0 var(--ws-accent);
}

.ws-term-session-close {
  display: grid;
  place-items: center;
  align-self: center;
  width: 18px;
  height: 18px;
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
  width: 100%;
  height: 32px;
  margin-top: auto;
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md, 6px);
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
</style>
