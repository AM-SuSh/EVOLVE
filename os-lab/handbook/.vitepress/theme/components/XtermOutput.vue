<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    content?: string
    dark?: boolean
    scrollback?: number
    interactive?: boolean
  }>(),
  { content: '', dark: false, scrollback: 5000, interactive: false },
)

const host = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let renderedContent = ''
let dataHandler: ((data: string) => void) | null = null

function surfaceColor(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function applyTheme() {
  if (!terminal) return
  const bg = surfaceColor('--ws-surface-soft', props.dark ? '#1e1e1e' : '#f6f8f9')
  const fg = surfaceColor('--ws-ink', props.dark ? '#d4d4d4' : '#213547')
  terminal.options.theme = {
    background: bg,
    foreground: fg,
    cursor: fg,
    selectionBackground: props.dark ? '#264f78' : '#add6ff',
  }
  // 让 host 容器背景与 xterm canvas 背景严格一致，避免拉长后底部空隙色差。
  if (host.value) host.value.style.background = bg
}

function fit() {
  if (!fitAddon || !terminal || !host.value) return
  if (host.value.clientWidth === 0 || host.value.clientHeight === 0) return
  fitAddon.fit()
  terminal.refresh(0, terminal.rows - 1)
}

function syncContent() {
  if (!terminal || props.content === renderedContent) return

  if (props.content.startsWith(renderedContent)) {
    terminal.write(props.content.slice(renderedContent.length))
  } else {
    terminal.reset()
    applyTheme()
    if (props.content) terminal.write(props.content)
  }
  renderedContent = props.content
}

onMounted(() => {
  if (!host.value || typeof window === 'undefined') return
  terminal = new Terminal({
    convertEol: true,
    scrollback: props.scrollback,
    fontFamily:
      "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.25,
    letterSpacing: 0.3,
    disableStdin: !props.interactive,
    cursorBlink: props.interactive,
    cursorStyle: props.interactive ? 'bar' : 'block',
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(host.value)
  applyTheme()
  syncContent()
  fit()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => fit())
    resizeObserver.observe(host.value)
  }
  // 交互模式下拦截 Tab，并处理 Ctrl+C/V 与系统粘贴。
  if (props.interactive) {
    host.value.addEventListener('keydown', onHostKeydown)
    host.value.addEventListener('paste', onHostPaste)
  }
  requestAnimationFrame(() => fit())
})

function onHostKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'c') {
    const selected = terminal?.getSelection()?.trim()
    if (selected) {
      event.preventDefault()
      event.stopPropagation()
      void navigator.clipboard?.writeText(selected)
    }
    // 无选区时放行，让 xterm onData 收到 \x03 做中断/清行
    return
  }
  if (key === 'v') {
    event.preventDefault()
    event.stopPropagation()
    void pasteFromClipboard()
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard?.readText()
    if (!text || !dataHandler) return
    // 多行粘贴时只取第一行进输入缓冲，避免误触发多次运行
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    if (firstLine) dataHandler(firstLine)
  } catch {
    // 剪贴板权限被拒时静默失败
  }
}

function onHostPaste(event: ClipboardEvent) {
  if (!props.interactive) return
  event.preventDefault()
  const text = event.clipboardData?.getData('text') || ''
  const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
  if (firstLine && dataHandler) dataHandler(firstLine)
}

watch(
  () => props.content,
  () => syncContent(),
  { flush: 'post' },
)

watch(
  () => props.dark,
  () => applyTheme(),
)

onBeforeUnmount(() => {
  if (host.value) {
    host.value.removeEventListener('keydown', onHostKeydown)
    host.value.removeEventListener('paste', onHostPaste)
  }
  resizeObserver?.disconnect()
  terminal?.dispose()
  terminal = null
  fitAddon = null
  dataHandler = null
})

function clear() {
  terminal?.reset()
  renderedContent = ''
}

function write(text: string) {
  terminal?.write(text)
}

function writeln(text: string) {
  terminal?.writeln(text)
}

function onData(cb: (data: string) => void) {
  dataHandler = cb
  terminal?.onData(cb)
}

function focus() {
  terminal?.focus()
}

function getSelection() {
  return terminal?.getSelection() || ''
}

defineExpose({ clear, write, writeln, fit, onData, focus, getSelection })
</script>

<template>
  <div ref="host" class="ws-xterm-host" aria-live="polite" />
</template>

<style scoped>
.ws-xterm-host {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: var(--ws-space-1) var(--ws-space-2);
  overflow: hidden;
  background: var(--ws-surface-soft, var(--ws-surface-alt));
}

.ws-xterm-host :deep(.xterm) {
  height: 100%;
}

.ws-xterm-host :deep(.xterm-viewport) {
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
</style>
