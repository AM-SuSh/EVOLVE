<script setup lang="ts">
import { FileWarning } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { authHeaders } from '../tutor-model'

interface DiagnosticItem {
  level: 'error' | 'warning' | 'info'
  file: string
  line: number
  column?: number
  code?: string
  message: string
}

const props = defineProps<{
  /** 最近一次可信运行的 ID，用于关联诊断。 */
  runId?: string
  /** 导师服务地址，避免相对到 VitePress 站点。 */
  endpoint?: string
}>()

const emit = defineEmits<{
  /** 学生点诊断条目：跳到对应文件与行。 */
  (event: 'jump', payload: { path: string; line: number }): void
}>()

const diagnostics = ref<DiagnosticItem[]>([])
const loading = ref(false)
const loaded = ref(false)
/** 接口未就绪时为 true，保持可信空态而非 mock。 */
const unavailable = ref(false)

async function fetchDiagnostics(runId: string) {
  loading.value = true
  unavailable.value = false
  try {
    const base = String(props.endpoint || '').replace(/\/$/, '')
    const response = await fetch(`${base}/runs/${encodeURIComponent(runId)}/diagnostics`, {
      headers: authHeaders(),
    })
    if (response.status === 404) {
      // 成员 C 的诊断接口尚未提供：保持空态，不展示 mock。
      unavailable.value = true
      diagnostics.value = []
      return
    }
    if (!response.ok) throw new Error(`status ${response.status}`)
    const payload = (await response.json()) as { diagnostics?: DiagnosticItem[] }
    diagnostics.value = Array.isArray(payload.diagnostics) ? payload.diagnostics : []
  } catch {
    unavailable.value = true
    diagnostics.value = []
  } finally {
    loading.value = false
    loaded.value = true
  }
}

watch(
  () => props.runId,
  (runId) => {
    diagnostics.value = []
    loaded.value = false
    if (runId) void fetchDiagnostics(runId)
  },
  { immediate: true },
)

function onJump(item: DiagnosticItem) {
  if (item.line > 0) emit('jump', { path: item.file, line: item.line })
}
</script>

<template>
  <section class="ws-problems" aria-label="问题列表">
    <div v-if="!runId" class="ws-problems-empty" role="status">
      <FileWarning :size="20" aria-hidden="true" />
      <strong>尚未采集编译诊断</strong>
      <p>运行可信验证后，此处只展示与该次运行绑定的真实编译错误和警告。</p>
    </div>
    <div v-else-if="loading" class="ws-problems-empty" role="status">
      <FileWarning :size="20" aria-hidden="true" />
      <strong>正在加载诊断…</strong>
    </div>
    <div v-else-if="diagnostics.length" class="ws-problems-list">
      <button
        v-for="(item, index) in diagnostics"
        :key="index"
        type="button"
        :class="['ws-problem-item', `is-${item.level}`]"
        @click="onJump(item)"
      >
        <span class="ws-problem-level">{{ item.level === 'error' ? '错误' : item.level === 'warning' ? '警告' : '提示' }}</span>
        <span class="ws-problem-loc">{{ item.file }}<template v-if="item.line">:{{ item.line }}</template></span>
        <span class="ws-problem-msg">{{ item.message }}</span>
        <span v-if="item.code" class="ws-problem-code">{{ item.code }}</span>
      </button>
    </div>
    <div v-else class="ws-problems-empty" role="status">
      <FileWarning :size="20" aria-hidden="true" />
      <strong>{{ unavailable ? '本次运行没有可用的编译诊断' : '本次运行没有编译错误' }}</strong>
      <p v-if="unavailable">
        已记录运行 <code>{{ runId }}</code>，但服务端尚未返回结构化诊断；这里不会显示推测或示例错误。
      </p>
      <p v-else>运行 <code>{{ runId }}</code> 的编译诊断为空。</p>
    </div>
  </section>
</template>

<style scoped>
.ws-problems {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: var(--ws-space-3);
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-problems-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ws-space-2);
  max-width: 42ch;
  margin: auto;
  color: var(--ws-ink-faint);
  text-align: center;
  line-height: var(--ws-leading-normal);
}

.ws-problems-empty strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-problems-empty p {
  margin: 0;
}

.ws-problems-empty code {
  font-family: var(--ws-font-mono);
}

.ws-problems-list {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-1);
}

.ws-problem-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: start;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-xs);
  text-align: left;
  cursor: pointer;
}

.ws-problem-item:hover {
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-problem-item.is-error {
  border-left: 3px solid var(--ws-danger, #c0392b);
}

.ws-problem-item.is-warning {
  border-left: 3px solid var(--ws-warning, #a15c00);
}

.ws-problem-item.is-info {
  border-left: 3px solid var(--ws-accent);
}

.ws-problem-level {
  flex: 0 0 auto;
  color: var(--ws-ink-muted);
  font-weight: var(--ws-weight-semibold);
}

.ws-problem-item.is-error .ws-problem-level {
  color: var(--ws-danger, #c0392b);
}

.ws-problem-item.is-warning .ws-problem-level {
  color: var(--ws-warning, #a15c00);
}

.ws-problem-loc {
  flex: 0 0 auto;
  color: var(--ws-ink-muted);
  font-family: var(--ws-font-mono);
  white-space: nowrap;
}

.ws-problem-msg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-problem-code {
  flex: 0 0 auto;
  color: var(--ws-ink-faint);
  font-family: var(--ws-font-mono);
}
</style>
