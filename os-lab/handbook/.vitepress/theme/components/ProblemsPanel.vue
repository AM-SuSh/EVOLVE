<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { AlertCircle, AlertTriangle, FileWarning } from 'lucide-vue-next'
import { authHeaders } from '../tutor-model'

export interface RunDiagnostic {
  diagnosticIndex: number
  level: string
  code: string
  message: string
  file: string
  line: number
  column: number
  endLine: number
  endColumn: number
  rendered: string
}

const props = defineProps<{
  endpoint: string
  runId?: string
}>()

const emit = defineEmits<{
  (event: 'open-diagnostic', diagnostic: RunDiagnostic): void
}>()

const diagnostics = ref<RunDiagnostic[]>([])
const loading = ref(false)
const error = ref('')
let requestController: AbortController | null = null

async function loadDiagnostics() {
  requestController?.abort()
  diagnostics.value = []
  error.value = ''
  if (!props.runId) return

  const controller = new AbortController()
  requestController = controller
  loading.value = true
  try {
    const response = await fetch(
      `${props.endpoint}/run/diagnostics?runId=${encodeURIComponent(props.runId)}`,
      { headers: authHeaders(), signal: controller.signal },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    diagnostics.value = payload.diagnostics || []
  } catch (err) {
    if (!controller.signal.aborted) error.value = err instanceof Error ? err.message : '诊断加载失败'
  } finally {
    if (requestController === controller) {
      loading.value = false
      requestController = null
    }
  }
}

watch(() => props.runId, () => void loadDiagnostics(), { immediate: true })
onBeforeUnmount(() => requestController?.abort())
</script>

<template>
  <section class="ws-problems" aria-label="问题列表">
    <p v-if="loading" class="ws-problems-state" role="status">正在读取编译诊断…</p>
    <div v-else-if="error" class="ws-problems-state error" role="alert">
      <AlertCircle :size="18" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>
    <div v-else-if="diagnostics.length" class="ws-problems-list">
      <button
        v-for="diagnostic in diagnostics"
        :key="`${diagnostic.diagnosticIndex}:${diagnostic.file}:${diagnostic.line}`"
        type="button"
        class="ws-problem-row"
        :data-level="diagnostic.level"
        :title="`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`"
        @click="emit('open-diagnostic', diagnostic)"
      >
        <AlertCircle v-if="diagnostic.level === 'error'" :size="15" aria-hidden="true" />
        <AlertTriangle v-else :size="15" aria-hidden="true" />
        <span class="ws-problem-message">{{ diagnostic.message }}</span>
        <code>{{ diagnostic.code }}</code>
        <span class="ws-problem-location">{{ diagnostic.file }}:{{ diagnostic.line }}:{{ diagnostic.column }}</span>
      </button>
    </div>
    <div v-else class="ws-problems-empty" role="status">
      <FileWarning :size="20" aria-hidden="true" />
      <strong>{{ runId ? '本次运行没有编译诊断' : '尚未采集编译诊断' }}</strong>
    </div>
  </section>
</template>

<style scoped>
.ws-problems {
  height: 100%;
  min-height: 0;
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-problems-list {
  display: flex;
  flex-direction: column;
}

.ws-problem-row {
  display: grid;
  grid-template-columns: 16px minmax(180px, 1fr) auto minmax(150px, 0.7fr);
  align-items: center;
  gap: var(--ws-space-2);
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 0;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ws-problem-row:hover,
.ws-problem-row:focus-visible {
  color: var(--ws-ink);
  background: var(--ws-surface-alt);
}

.ws-problem-row[data-level='error'] > svg {
  color: var(--ws-danger, #c0392b);
}

.ws-problem-row:not([data-level='error']) > svg {
  color: var(--ws-warning, #a15c00);
}

.ws-problem-message,
.ws-problem-location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-problem-row code {
  color: var(--ws-ink-faint);
  font-family: var(--ws-font-mono);
}

.ws-problem-location {
  font-family: var(--ws-font-mono);
}

.ws-problems-state,
.ws-problems-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-2);
  min-height: 100%;
  margin: 0;
  padding: var(--ws-space-4);
  color: var(--ws-ink-faint);
  text-align: center;
}

.ws-problems-state.error {
  color: var(--ws-danger, #c0392b);
}

.ws-problems-empty {
  flex-direction: column;
}

.ws-problems-empty strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

@media (max-width: 760px) {
  .ws-problem-row {
    grid-template-columns: 16px minmax(0, 1fr) auto;
  }

  .ws-problem-location {
    grid-column: 2 / -1;
  }
}
</style>
