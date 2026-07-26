<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FilePlus2, Maximize2, Minimize2, Play, RotateCcw, Square } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'

const props = defineProps<{ lab: TutorLab; endpoint: string; student?: string; maximized?: boolean }>()

/** 带上学生身份：服务端据此在该生自己的工作区里执行命令。 */
function apiUrl(pathname: string) {
  if (!props.student) return `${props.endpoint}${pathname}`
  return `${props.endpoint}${pathname}?user=${encodeURIComponent(props.student)}`
}

const emit = defineEmits<{
  /** 每次运行结束自动上报（passed = 全部步骤退出码 0），作为验证证据。 */
  (event: 'run-finished', payload: { content: string; passed: boolean }): void
  /** 学生把本次输出插进实验报告的「过程记录」。 */
  (event: 'insert-report', text: string): void
  (event: 'toggle-max'): void
}>()

const command = ref('')
const running = ref(false)
const output = ref('')
const exitInfo = ref<{ code: number; ok: boolean; stopped?: string } | null>(null)
const inserted = ref(false)
const stepTitle = ref('')
const errorText = ref('')
const outputEl = ref<HTMLElement>()

const statusLabel = computed(() => {
  if (running.value) return stepTitle.value ? `运行中 · ${stepTitle.value}` : '运行中…'
  if (errorText.value) return errorText.value
  if (!exitInfo.value) return '可直接编辑命令，或从左侧手册复制后粘贴；支持多行按顺序执行'
  if (exitInfo.value.stopped === 'timeout') return '已超时终止'
  if (exitInfo.value.stopped) return '已手动停止'
  return exitInfo.value.ok ? '运行结束（退出码 0），已自动记录为验证证据' : `运行结束（退出码 ${exitInfo.value.code}）`
})

function resetCommand() {
  command.value = props.lab.verificationCommand
}

watch(() => props.lab.id, () => {
  resetCommand()
  output.value = ''
  exitInfo.value = null
  inserted.value = false
  errorText.value = ''
}, { immediate: true })

async function scrollToBottom() {
  await nextTick()
  const el = outputEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(output, () => {
  const el = outputEl.value
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (nearBottom) scrollToBottom()
})

function runSummary() {
  const tail = output.value.length > 2400 ? `…${output.value.slice(-2400)}` : output.value
  return `$ ${command.value.trim()}\n${tail}`
}

async function run() {
  if (running.value) return
  running.value = true
  output.value = ''
  exitInfo.value = null
  inserted.value = false
  errorText.value = ''
  stepTitle.value = ''

  try {
    const response = await fetch(apiUrl(`/run`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
      body: JSON.stringify({ labId: props.lab.id, command: command.value }),
    })
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((item) => item.startsWith('data:'))
        if (!line) continue
        let frame: { type?: string; title?: string; text?: string; code?: number; ok?: boolean; stopped?: string }
        try {
          frame = JSON.parse(line.slice(5).trim())
        } catch {
          continue
        }
        if (frame.type === 'step') {
          stepTitle.value = frame.title || ''
          output.value += `$ ${frame.title}\n`
        }
        if (frame.type === 'output' && frame.text) output.value += frame.text
        if (frame.type === 'exit') {
          exitInfo.value = { code: frame.code ?? -1, ok: Boolean(frame.ok), stopped: frame.stopped }
        }
      }
    }
    if (exitInfo.value && !exitInfo.value.stopped) {
      emit('run-finished', { content: runSummary(), passed: exitInfo.value.ok })
    }
  } catch (error) {
    errorText.value =
      error instanceof Error && error.message
        ? error.message
        : '无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor'
  } finally {
    running.value = false
    stepTitle.value = ''
    scrollToBottom()
  }
}

async function stop() {
  try {
    await fetch(apiUrl(`/run/stop`), { method: 'POST', headers: authHeaders() })
  } catch {
    // 服务不在时无事可停。
  }
}

function insertReport() {
  emit('insert-report', runSummary())
  inserted.value = true
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    run()
  }
}

onBeforeUnmount(() => {
  if (running.value) void stop()
})
</script>

<template>
  <section class="ws-terminal" aria-label="本机终端">
    <header class="ws-terminal-head">
      <label class="ws-visually-hidden" for="ws-terminal-input">要运行的命令</label>
      <textarea
        id="ws-terminal-input"
        v-model="command"
        class="ws-terminal-input"
        rows="1"
        spellcheck="false"
        placeholder="输入或粘贴命令（cargo / make / qemu-system-riscv64…），Ctrl+Enter 运行"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="ws-terminal-icon"
        title="恢复本 Lab 默认验证命令"
        aria-label="恢复默认命令"
        @click="resetCommand"
      >
        <RotateCcw :size="14" aria-hidden="true" />
      </button>
      <button v-if="!running" type="button" class="ws-terminal-run" :disabled="!command.trim()" @click="run">
        <Play :size="14" aria-hidden="true" /><span>运行</span>
      </button>
      <button v-else type="button" class="ws-terminal-stop" @click="stop">
        <Square :size="13" aria-hidden="true" /><span>停止</span>
      </button>
      <button
        type="button"
        class="ws-terminal-icon"
        :title="maximized ? '恢复布局' : '放大到整页'"
        :aria-label="maximized ? '恢复布局' : '放大到整页'"
        @click="emit('toggle-max')"
      >
        <Minimize2 v-if="maximized" :size="14" aria-hidden="true" />
        <Maximize2 v-else :size="14" aria-hidden="true" />
      </button>
    </header>

    <p class="ws-terminal-status" :data-ok="exitInfo?.ok">{{ statusLabel }}</p>

    <pre ref="outputEl" class="ws-terminal-output" aria-live="polite"><span v-if="!output && !running" class="ws-terminal-hint">点击「运行」在本机执行命令，输出会实时显示在这里。</span>{{ output }}</pre>

    <footer v-if="exitInfo" class="ws-terminal-foot">
      <button v-if="!inserted" type="button" @click="insertReport">
        <FilePlus2 :size="14" aria-hidden="true" />把输出插入实验报告
      </button>
      <span v-else class="done">已插入实验报告的「过程记录」。</span>
    </footer>
  </section>
</template>

<style scoped>
.ws-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ws-terminal {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-terminal-head {
  display: flex;
  align-items: stretch;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-terminal-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  line-height: 1.6;
  resize: vertical;
}

.ws-terminal-input:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-terminal-icon {
  display: grid;
  flex: 0 0 auto;
  width: var(--ws-control-md);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-terminal-icon:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-terminal-run,
.ws-terminal-stop {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-3);
  border: 0;
  border-radius: var(--ws-radius-md);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-terminal-run {
  color: var(--ws-accent-contrast);
  background: var(--ws-accent);
}

.ws-terminal-run:hover:not(:disabled) {
  background: var(--ws-accent-hover);
}

.ws-terminal-run:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ws-terminal-stop {
  color: var(--ws-accent-contrast);
  background: var(--ws-danger, #c0392b);
}

.ws-terminal-status {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-terminal-status[data-ok='true'] {
  color: var(--ws-ok, #1a7f37);
}

.ws-terminal-status[data-ok='false'] {
  color: var(--ws-danger, #c0392b);
}

.ws-terminal-output {
  min-height: 0;
  margin: 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  overflow: auto;
  color: var(--ws-ink);
  background: var(--ws-surface-soft, var(--ws-surface-alt));
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
}

.ws-terminal-hint {
  color: var(--ws-ink-faint);
  font-family: inherit;
}

.ws-terminal-foot {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-top: 1px solid var(--ws-line);
  font-size: var(--ws-text-xs);
}

.ws-terminal-foot button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-terminal-foot button:hover {
  border-color: var(--ws-accent);
}

.ws-terminal-foot .done {
  color: var(--ws-ok, #1a7f37);
}
</style>
