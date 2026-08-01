<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

/** 解析 CSS 变量为可用颜色；取到未展开的 var(...) 时回退，避免 xterm 主题失效。 */
function cssColor(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw || raw.includes('var(')) return fallback
  return raw
}

function buildTheme(dark: boolean): ITheme {
  if (dark) {
    return {
      background: cssColor('--vp-c-bg-soft', '#1e1e22'),
      foreground: cssColor('--vp-c-text-1', '#e6e6e6'),
      cursor: cssColor('--vp-c-brand-1', '#63c3bd'),
      cursorAccent: cssColor('--vp-c-bg', '#1b1b1f'),
      selectionBackground: 'rgba(99, 195, 189, 0.35)',
      selectionForeground: '#f0f0f0',
      black: '#1b1b1f',
      red: '#f07178',
      green: '#7fd99a',
      yellow: '#e6c07b',
      blue: '#6cb6ff',
      magenta: '#d2a8ff',
      cyan: '#63c3bd',
      white: '#e6e6e6',
      brightBlack: '#6e7681',
      brightRed: '#ff7b72',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#7ee0d8',
      brightWhite: '#f0f3f5',
    }
  }
  return {
    background: cssColor('--vp-c-bg-soft', '#f6f8f9'),
    foreground: cssColor('--vp-c-text-1', '#213547'),
    cursor: cssColor('--vp-c-brand-1', '#126a73'),
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(31, 123, 130, 0.28)',
    selectionForeground: '#213547',
    black: '#213547',
    red: '#c0392b',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#126a73',
    white: '#f6f8f9',
    brightBlack: '#6b7280',
    brightRed: '#cf222e',
    brightGreen: '#1a7f37',
    brightYellow: '#9a6700',
    brightBlue: '#0550ae',
    brightMagenta: '#8250df',
    brightCyan: '#1f7b82',
    brightWhite: '#ffffff',
  }
}

function applyTheme() {
  if (!terminal) return
  const theme = buildTheme(Boolean(props.dark))
  terminal.options.theme = theme
  if (host.value) host.value.style.background = theme.background || ''
  // 主题变更后强制重绘，否则已渲染行仍停留在旧底色。
  terminal.refresh(0, terminal.rows - 1)
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
    theme: buildTheme(Boolean(props.dark)),
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
  async () => {
    // 等 .dark class 与 CSS 变量落盘后再读色并刷新。
    await nextTick()
    requestAnimationFrame(() => applyTheme())
  },
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
  applyTheme()
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
  <div
    ref="host"
    class="ws-xterm-host"
    :class="{ 'ws-xterm-host--dark': dark }"
    aria-live="polite"
  />
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
  color-scheme: light;
}

.ws-xterm-host--dark {
  color-scheme: dark;
}

.ws-xterm-host :deep(.xterm) {
  height: 100%;
}

.ws-xterm-host :deep(.xterm-viewport) {
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.ws-xterm-host--dark :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 10px;
}

.ws-xterm-host--dark :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}

.ws-xterm-host--dark :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
}

.ws-xterm-host--dark :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.28);
}
</style>
