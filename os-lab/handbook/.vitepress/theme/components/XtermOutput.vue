<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    dark?: boolean
    scrollback?: number
  }>(),
  { dark: false, scrollback: 5000 },
)

const host = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

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
}

function fit() {
  fitAddon?.fit()
}

onMounted(() => {
  if (!host.value || typeof window === 'undefined') return
  terminal = new Terminal({
    convertEol: true,
    scrollback: props.scrollback,
    fontFamily: 'var(--ws-font-mono), Consolas, monospace',
    fontSize: 12,
    disableStdin: true,
    cursorBlink: false,
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(host.value)
  applyTheme()
  fit()
  resizeObserver = new ResizeObserver(() => fit())
  resizeObserver.observe(host.value)
})

watch(
  () => props.dark,
  () => applyTheme(),
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  terminal?.dispose()
  terminal = null
  fitAddon = null
})

function clear() {
  terminal?.clear()
}

function write(text: string) {
  terminal?.write(text)
}

function writeln(text: string) {
  terminal?.writeln(text)
}

defineExpose({ clear, write, writeln, fit })
</script>

<template>
  <div ref="host" class="ws-xterm-host" aria-live="polite" />
</template>

<style scoped>
.ws-xterm-host {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: var(--ws-space-1) var(--ws-space-2);
  overflow: hidden;
  background: var(--ws-surface-soft, var(--ws-surface-alt));
}

.ws-xterm-host :deep(.xterm) {
  height: 100%;
}

.ws-xterm-host :deep(.xterm-viewport) {
  overflow-y: auto;
}
</style>
