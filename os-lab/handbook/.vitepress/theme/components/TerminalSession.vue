<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RotateCcw, Square } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'
import XtermOutput from './XtermOutput.vue'

const props = defineProps<{
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
type RunFinishedPayload = {
  content: string
  passed: boolean
  verified: boolean
  runId: string
  recipeId: string | null
  trusted: boolean
  assertions: RunAssertion[]
  stopped?: string
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
  /** 运行结束时附带的编译诊断（若有），供立即切换 Problems。 */
  (event: 'run-diagnostics', payload: { runId: string; diagnostics: unknown[] }): void
}>()

const command = ref('')
const inputBuffer = ref('')
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
const stepTitle = ref('')
const errorText = ref('')
const lastRunCommand = ref('')
const xtermRef = ref<InstanceType<typeof XtermOutput> | null>(null)

/** 本 Lab 推荐的验证命令，作为终端输入行的 ghost text（虚写提示）。 */
const recommendedCommand = computed(() => props.lab.verificationCommand)

/** 本 Lab 常用推荐指令库（命令字符串列表），供上下方向键循环选用。 */
const commandLibrary = computed(() => {
  const cmds = props.lab.commands
  if (cmds && cmds.length) return cmds.map((c) => c.command)
  return [props.lab.verificationCommand]
})

/** 历史浏览指针：-1 表示处于实时输入（未在指令库中浏览）。 */
const histIdx = ref(-1)
let liveBuffer = ''

function historyUp() {
  const lib = commandLibrary.value
  if (!lib.length) return
  if (histIdx.value === -1) {
    liveBuffer = inputBuffer.value
    histIdx.value = lib.length - 1
  } else {
    histIdx.value = Math.max(0, histIdx.value - 1)
  }
  inputBuffer.value = lib[histIdx.value]
  renderPrompt()
}

function historyDown() {
  if (histIdx.value === -1) return
  const lib = commandLibrary.value
  histIdx.value += 1
  if (histIdx.value >= lib.length) {
    histIdx.value = -1
    inputBuffer.value = liveBuffer
  } else {
    inputBuffer.value = lib[histIdx.value]
  }
  renderPrompt()
}

/**
 * 终端输入行的虚写提示：当用户尚未输入、或输入内容仍是推荐命令的前缀时，
 * 显示推荐命令的剩余部分；一旦输入偏离推荐命令即消失。
 */
const ghostText = computed(() => {
  const rec = recommendedCommand.value
  const buf = inputBuffer.value
  if (!rec || buf.includes('\n')) return ''
  return rec.startsWith(buf) ? rec.slice(buf.length) : ''
})

const failedAssertions = computed(() => (exitInfo.value?.assertions || []).filter((item) => !item.passed))

const statusLabel = computed(() => {
  if (running.value) return stepTitle.value ? `运行中 · ${stepTitle.value}` : '运行中…'
  if (errorText.value) return errorText.value
  if (!exitInfo.value) return ''
  if (exitInfo.value.stopped === 'timeout') return '已超时终止'
  if (exitInfo.value.stopped) return '已手动停止'
  if (exitInfo.value.verified) return '可信验证通过，已自动记录为验证证据'
  if (exitInfo.value.ok && !exitInfo.value.trusted) return '运行成功；自定义命令不作为实验通过证据'
  if (exitInfo.value.ok && failedAssertions.value.length) {
    const labels = failedAssertions.value.slice(0, 3).map((item) => item.label || item.id)
    const more = failedAssertions.value.length > 3 ? ` 等 ${failedAssertions.value.length} 条` : ''
    return `运行结束，断言未全部通过：${labels.join('、')}${more}；查看“测试结果”的修改建议后重新运行`
  }
  if (exitInfo.value.ok) return '运行结束，但实验行为断言未全部通过'
  return `运行失败（退出码 ${exitInfo.value.code}），先修复报错后重新运行`
})

/** 重绘当前输入行：清行后写出 `$ ` + 已输入内容 + 灰色 ghost 提示。 */
function renderPrompt() {
  const term = xtermRef.value
  if (!term) return
  const buf = inputBuffer.value
  const ghost = ghostText.value
  // `$ ` 用青色作 prompt 标识；用户输入用默认前景色；ghost 用斜体浅灰虚写（暗色略亮）。
  const ghostAnsi = props.dark ? '\x1b[38;5;244m' : '\x1b[38;5;245m'
  let line = `\r\x1b[2K\x1b[36m$ \x1b[39m${buf}`
  if (ghost) {
    line += `\x1b[3m${ghostAnsi}${ghost}\x1b[23m\x1b[39m\x1b[${ghost.length}D`
  }
  term.write(line)
}

watch(
  () => props.dark,
  async () => {
    await nextTick()
    if (!running.value) renderPrompt()
  },
)

/** 把文本同时写入 xterm 与输出缓冲（输出缓冲用于复制/插入报告）。 */
function writeTerm(text: string) {
  output.value += text
  xtermRef.value?.write(text)
}

function handleData(data: string) {
  if (running.value) {
    // 运行中只响应 Ctrl+C 停止
    if (data === '\x03') void stop()
    return
  }
  // 方向键：上下在指令库中循环，左右忽略（不支持行内光标移动）
  if (data === '\x1b[A') {
    historyUp()
    return
  }
  if (data === '\x1b[B') {
    historyDown()
    return
  }
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (ch === '\r' || ch === '\n') {
      const cmd = inputBuffer.value
      xtermRef.value?.write('\r\n')
      inputBuffer.value = ''
      histIdx.value = -1
      if (cmd.trim()) {
        command.value = cmd
        void run()
      } else {
        renderPrompt()
      }
      return
    }
    if (code === 9) {
      // Tab：一键补全剩余推荐命令（ghost text）
      const ghost = ghostText.value
      if (ghost) {
        inputBuffer.value += ghost
        renderPrompt()
      }
      continue
    }
    if (code === 127) {
      // 退格
      if (inputBuffer.value.length > 0) {
        inputBuffer.value = inputBuffer.value.slice(0, -1)
        renderPrompt()
      }
      continue
    }
    if (code === 3) {
      // Ctrl+C：清空当前行
      inputBuffer.value = ''
      xtermRef.value?.write('\r\n')
      renderPrompt()
      continue
    }
    if (code >= 32) {
      inputBuffer.value += ch
      renderPrompt()
    }
  }
}

function resetCommand() {
  inputBuffer.value = props.lab.verificationCommand
  command.value = props.lab.verificationCommand
  histIdx.value = -1
  renderPrompt()
}

watch(() => props.lab.id, () => {
  inputBuffer.value = ''
  command.value = ''
  output.value = ''
  exitInfo.value = null
  errorText.value = ''
  lastRunCommand.value = ''
  histIdx.value = -1
  xtermRef.value?.clear()
  renderPrompt()
})

onMounted(() => {
  xtermRef.value?.onData(handleData)
  renderPrompt()
  xtermRef.value?.focus()
})

async function scrollToBottom() {
  await nextTick()
  xtermRef.value?.fit()
}

function runSummary() {
  const tail = output.value.length > 2400 ? `…${output.value.slice(-2400)}` : output.value
  return `$ ${lastRunCommand.value || command.value.trim()}\n${tail}`
}

async function run() {
  if (running.value) return
  running.value = true
  // 不在开跑时清空 exitInfo / 整段 output：上一轮状态与滚动历史保留到本轮结束。
  errorText.value = ''
  stepTitle.value = ''
  const runCommand = command.value.trim()
  lastRunCommand.value = runCommand
  const runMarker = `\r\n\x1b[90m──── ${new Date().toLocaleTimeString()} · ${runCommand} ────\x1b[0m\r\n`
  writeTerm(runMarker)
  // 本轮复制缓冲从分隔线起算，但 xterm 画面保留更早输出。
  output.value = runMarker

  try {
    const trustedPreset = runCommand === props.lab.verificationCommand.trim()
    const response = await fetch(apiUrl(`/run`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
      body: JSON.stringify({
        labId: props.lab.id,
        sessionId: props.sessionId || '',
        ...(trustedPreset ? {} : { command: runCommand }),
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
          diagnostics?: unknown[]
          diagnosticCount?: number
          traceCount?: number
        }
        try {
          frame = JSON.parse(line.slice(5).trim())
        } catch {
          continue
        }
        if (frame.type === 'step') {
          stepTitle.value = frame.title || ''
          writeTerm(`$ ${frame.title}\n`)
        }
        if (frame.type === 'output' && frame.text) writeTerm(frame.text)
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
          if (frame.runId && Array.isArray(frame.diagnostics) && frame.diagnostics.length > 0) {
            emit('run-diagnostics', { runId: frame.runId, diagnostics: frame.diagnostics })
          }
          if (typeof frame.traceCount === 'number' && frame.traceCount > 0) {
            writeTerm(`\r\n\x1b[36m[Trace] 采集到 ${frame.traceCount} 条事件，可在右侧学习支持 → Trace 查看\x1b[0m\n`)
          }
          if (typeof frame.diagnosticCount === 'number' && frame.diagnosticCount > 0) {
            writeTerm(`\r\n\x1b[33m[Problems] 采集到 ${frame.diagnosticCount} 条编译诊断，已切换到底部 Problems\x1b[0m\n`)
          }
          if (frame.stopped === 'timeout') {
            writeTerm('\r\n\x1b[33m[已超时终止]\x1b[0m\n')
          } else if (frame.stopped) {
            writeTerm('\r\n\x1b[33m[已手动停止]\x1b[0m\n')
          }
        }
      }
    }
    if (exitInfo.value) {
      emit('run-finished', {
        content: runSummary(),
        passed: exitInfo.value.verified,
        verified: exitInfo.value.verified,
        runId: exitInfo.value.runId,
        recipeId: exitInfo.value.recipeId,
        trusted: exitInfo.value.trusted,
        assertions: exitInfo.value.assertions,
        stopped: exitInfo.value.stopped,
      })
    }
  } catch (error) {
    errorText.value =
      error instanceof Error && error.message
        ? error.message
        : '无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor'
    writeTerm(`\x1b[31m${errorText.value}\x1b[0m\n`)
  } finally {
    running.value = false
    stepTitle.value = ''
    scrollToBottom()
    renderPrompt()
  }
}

async function stop() {
  try {
    await fetch(apiUrl(`/run/stop`), { method: 'POST', headers: authHeaders() })
    writeTerm('\r\n\x1b[33m[正在停止…]\x1b[0m\n')
  } catch {
    // 服务不在时无事可停。
  }
}

onBeforeUnmount(() => {
  if (running.value) void stop()
})
</script>

<template>
  <section
    class="ws-terminal"
    :class="{ 'ws-terminal--dark': dark }"
    aria-label="终端会话"
  >
    <p v-if="statusLabel" class="ws-terminal-status" :data-ok="exitInfo?.ok">{{ statusLabel }}</p>

    <div class="ws-terminal-stage">
      <XtermOutput ref="xtermRef" :dark="!!dark" interactive />
      <div class="ws-terminal-controls">
        <button
          v-if="!running"
          type="button"
          class="ws-term-ctrl"
          title="恢复本 Lab 默认验证命令"
          aria-label="恢复默认命令"
          @click="resetCommand"
        >
          <RotateCcw :size="13" aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          class="ws-term-ctrl ws-term-ctrl--stop"
          title="停止运行"
          aria-label="停止运行"
          @click="stop"
        >
          <Square :size="12" aria-hidden="true" />
        </button>

      </div>

      
    </div>
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
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: transparent;
  position: relative;
  color-scheme: light;
}

.ws-terminal--dark {
  color-scheme: dark;
}

.ws-terminal-stage {
  position: relative;
  display: flex;
  min-height: 0;
  min-width: 0;
  isolation: isolate;
  overflow: hidden;
}

.ws-terminal-stage :deep(.ws-xterm-host) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.ws-terminal-controls {
  position: absolute;
  top: var(--ws-space-1);
  right: var(--ws-space-2);
  z-index: 2;
  display: flex;
  gap: var(--ws-space-1);
}

.ws-term-ctrl {
  display: grid;
  place-items: center;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  padding: 0;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.ws-term-ctrl:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-term-ctrl--stop {
  color: var(--ws-danger, #c0392b);
  border-color: var(--ws-danger, #c0392b);
}

.ws-term-ctrl--stop:hover {
  color: var(--ws-accent-contrast);
  background: var(--ws-danger, #c0392b);
}

.ws-term-ctrl--active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-terminal-help-backdrop {
  position: absolute;
  inset: 0;
  z-index: 4;
}

.ws-terminal-help {
  position: absolute;
  top: calc(var(--ws-control-sm) + var(--ws-space-2));
  right: var(--ws-space-2);
  z-index: 5;
  width: calc(100% - var(--ws-space-4));
  max-width: 460px;
  max-height: calc(100% - var(--ws-control-sm) - var(--ws-space-4));
  box-sizing: border-box;
  padding: var(--ws-space-2) var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-2);
  font-size: var(--ws-text-xs);
  color: var(--ws-ink);
  overflow-y: auto;
}

.ws-terminal-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ws-space-2);
  font-weight: var(--ws-weight-semibold);
}

.ws-terminal-help-close {
  border: 0;
  background: transparent;
  color: var(--ws-ink-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--ws-space-1);
}

.ws-terminal-help-close:hover {
  color: var(--ws-ink);
}

.ws-terminal-help-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-1);
}

.ws-terminal-help-list > div {
  display: flex;
  gap: var(--ws-space-2);
  align-items: baseline;
}

.ws-terminal-help-list dt {
  flex: 0 0 auto;
  min-width: 104px;
  color: var(--ws-ink-muted);
}

.ws-terminal-help-list dd {
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}

.ws-terminal-help kbd {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm, 4px);
  background: var(--ws-surface-alt);
  font-family: var(--ws-font-mono);
  font-size: 11px;
  line-height: 1.5;
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

</style>
