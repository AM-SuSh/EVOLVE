<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FilePlus2, Play, RotateCcw, Square } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'
import XtermOutput from './XtermOutput.vue'

const props = defineProps<{
  lab: TutorLab
  endpoint: string
  student?: string
  sessionId?: string
  dark?: boolean
}>()

type RunAssertion = { id: string; label: string; passed: boolean; expected: string; observed: string }
type RunFinishedPayload = {
  content: string
  passed: boolean
  verified: boolean
  runId: string
  recipeId: string | null
  trusted: boolean
  assertions: RunAssertion[]
}

/** 登录会话决定工作区；前端不通过查询参数传递或切换学生身份。 */
function apiUrl(pathname: string) {
  return `${props.endpoint}${pathname}`
}

const emit = defineEmits<{
  /** 只有服务端可信 recipe 的全部断言通过，passed/verified 才为 true。 */
  (event: 'run-finished', payload: RunFinishedPayload): void
  /** 运行结束（含手动停止），用于关联 trace / Problems。 */
  (event: 'run-exit', runId: string): void
  /** 学生把本次输出插进实验报告的「过程记录」。 */
  (event: 'insert-report', text: string): void
}>()

const command = ref('')
const running = ref(false)
const output = ref('')
const exitInfo = ref<{
  code: number
  ok: boolean
  verified: boolean
  runId: string
  recipeId: string | null
  trusted: boolean
  assertions: RunAssertion[]
  stopped?: string
} | null>(null)
const inserted = ref(false)
const stepTitle = ref('')
const errorText = ref('')
const xtermRef = ref<InstanceType<typeof XtermOutput> | null>(null)

const statusLabel = computed(() => {
  if (running.value) return stepTitle.value ? `运行中 · ${stepTitle.value}` : '运行中…'
  if (errorText.value) return errorText.value
  if (!exitInfo.value) return '可直接编辑命令，或从左侧手册复制后粘贴；支持多行按顺序执行'
  if (exitInfo.value.stopped === 'timeout') return '已超时终止'
  if (exitInfo.value.stopped) return '已手动停止'
  if (exitInfo.value.verified) return '可信验证通过，已自动记录为验证证据'
  if (exitInfo.value.ok && !exitInfo.value.trusted) return '运行成功；自定义命令不作为实验通过证据'
  if (exitInfo.value.ok) return '运行结束，但实验行为断言未全部通过'
  return `运行结束（退出码 ${exitInfo.value.code}）`
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

function appendOutput(text: string) {
  output.value += text
}

async function scrollToBottom() {
  await nextTick()
  xtermRef.value?.fit()
}

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
    const trustedPreset = command.value.trim() === props.lab.verificationCommand.trim()
    const response = await fetch(apiUrl(`/run`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
      body: JSON.stringify({
        labId: props.lab.id,
        sessionId: props.sessionId || '',
        ...(trustedPreset ? {} : { command: command.value }),
      }),
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
        let frame: {
          type?: string
          title?: string
          text?: string
          code?: number
          ok?: boolean
          verified?: boolean
          stopped?: string
          runId?: string
          recipeId?: string | null
          trusted?: boolean
          assertions?: RunAssertion[]
        }
        try {
          frame = JSON.parse(line.slice(5).trim())
        } catch {
          continue
        }
        if (frame.type === 'step') {
          stepTitle.value = frame.title || ''
          appendOutput(`$ ${frame.title}\n`)
        }
        if (frame.type === 'output' && frame.text) appendOutput(frame.text)
        if (frame.type === 'exit') {
          exitInfo.value = {
            code: frame.code ?? -1,
            ok: Boolean(frame.ok),
            verified: Boolean(frame.verified),
            runId: frame.runId || '',
            recipeId: frame.recipeId || null,
            trusted: Boolean(frame.trusted),
            assertions: frame.assertions || [],
            stopped: frame.stopped,
          }
          if (frame.runId) emit('run-exit', frame.runId)
          if (frame.stopped === 'timeout') {
            appendOutput('\r\n\x1b[33m[已超时终止]\x1b[0m\n')
          } else if (frame.stopped) {
            appendOutput('\r\n\x1b[33m[已手动停止]\x1b[0m\n')
          }
        }
      }
    }
    if (exitInfo.value && !exitInfo.value.stopped) {
      emit('run-finished', {
        content: runSummary(),
        passed: exitInfo.value.verified,
        verified: exitInfo.value.verified,
        runId: exitInfo.value.runId,
        recipeId: exitInfo.value.recipeId,
        trusted: exitInfo.value.trusted,
        assertions: exitInfo.value.assertions,
      })
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
    appendOutput('\r\n\x1b[33m[正在停止…]\x1b[0m\n')
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
  <section class="ws-terminal" aria-label="当前实验运行与验证">
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
    </header>

    <p class="ws-terminal-status" :data-ok="exitInfo?.ok">{{ statusLabel }}</p>

    <XtermOutput ref="xtermRef" :content="output" :dark="dark" />
    <p v-if="!output && !running" class="ws-terminal-hint-overlay">点击「运行」在当前账号的实验工作区执行命令，输出会实时显示在这里。</p>

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
  background: var(--ws-surface);
  position: relative;
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

.ws-terminal-hint-overlay {
  position: absolute;
  inset: auto var(--ws-space-3) var(--ws-space-6);
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  pointer-events: none;
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
