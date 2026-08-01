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
  (event: 'jump', payload: { path: string; line: number; code: string }): void
  /** 某次 run 的诊断加载完成；count>0 时父级可自动切到 Problems。 */
  (event: 'diagnostics-loaded', payload: { runId: string; count: number }): void
}>()

const diagnostics = ref<RunDiagnostic[]>([])
const loading = ref(false)
const error = ref('')
let requestController: AbortController | null = null

async function loadDiagnostics() {
  requestController?.abort()
  diagnostics.value = []
  error.value = ''
  if (!props.runId) {
    emit('diagnostics-loaded', { runId: '', count: 0 })
    return
  }

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
    if (!controller.signal.aborted) {
      emit('diagnostics-loaded', { runId: props.runId, count: diagnostics.value.length })
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      error.value = err instanceof Error ? err.message : '诊断加载失败'
      emit('diagnostics-loaded', { runId: props.runId, count: 0 })
    }
  } finally {
    if (requestController === controller) {
      loading.value = false
      requestController = null
    }
  }
}

watch(() => props.runId, () => void loadDiagnostics(), { immediate: true })
onBeforeUnmount(() => requestController?.abort())

function jumpToDiagnostic(diagnostic: RunDiagnostic) {
  emit('jump', { path: diagnostic.file, line: diagnostic.line, code: diagnostic.code })
}
</script>

<template>
  <section class="ws-problems" aria-label="编译诊断 Problems">
    <header class="ws-problems-intro">
      <strong>Problems · 编译诊断</strong>
      <p>
        汇总<strong>最近一次运行</strong>解析出的编译错误与警告（文件、行号、错误码）。
        点击一条可跳到工作区对应源码；这里不是终端输出原文，而是结构化问题列表。
      </p>
    </header>
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
        @click="jumpToDiagnostic(diagnostic)"
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
      <strong>{{ runId ? '本次运行没有编译诊断' : '还没有编译诊断' }}</strong>
      <p>
        {{
          runId
            ? '构建已成功或未产生可解析的 cargo 诊断。若编译失败却仍为空，请确认命令走了 tutor 运行通道。'
            : '先保存再构建：在「终端」页签运行构建/验证命令后，有错误或警告时会自动切到本页签。'
        }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.ws-problems {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-size: var(--ws-text-xs);
}

.ws-problems-intro {
  flex: 0 0 auto;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-problems-intro strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-problems-intro p {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  line-height: var(--ws-leading-normal);
}

.ws-problems-list {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
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

.ws-problem-message {
  overflow: visible;
  text-overflow: unset;
  white-space: normal;
  word-break: break-word;
}

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
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: var(--ws-space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--ws-ink-faint);
  text-align: center;
  -webkit-overflow-scrolling: touch;
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

.ws-problems-empty p {
  margin: 0;
  max-width: 42ch;
  color: var(--ws-ink-faint);
  line-height: var(--ws-leading-normal);
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
