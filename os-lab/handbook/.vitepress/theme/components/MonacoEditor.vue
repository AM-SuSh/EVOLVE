<script setup lang="ts">
import loader from '@monaco-editor/loader'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    readOnly?: boolean
    dark?: boolean
    revealLine?: number
    revealKey?: number
  }>(),
  { language: 'plaintext', readOnly: false, dark: false },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'save'): void
}>()

const host = ref<HTMLElement | null>(null)
let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null
let monacoApi: typeof import('monaco-editor') | null = null
let resizeObserver: ResizeObserver | null = null
let syncing = false

function revealRequestedLine() {
  if (!editor || !props.revealLine) return
  editor.revealLineInCenter(props.revealLine)
  editor.setPosition({ lineNumber: props.revealLine, column: 1 })
  editor.focus()
}

function applyTheme() {
  if (!monacoApi) return
  monacoApi.editor.setTheme(props.dark ? 'vs-dark' : 'vs')
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    emit('save')
  }
}

onMounted(async () => {
  if (!host.value || typeof window === 'undefined') return
  window.addEventListener('keydown', onKeydown)
  const monaco = await import('monaco-editor')
  loader.config({ monaco })
  monacoApi = await loader.init()
  applyTheme()
  editor = monacoApi.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readOnly,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12,
    fontFamily: 'Consolas, monospace',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 4,
    renderLineHighlight: props.readOnly ? 'none' : 'line',
  })
  editor.onDidChangeModelContent(() => {
    if (!editor || props.readOnly) return
    syncing = true
    emit('update:modelValue', editor.getValue())
    syncing = false
  })
  revealRequestedLine()
  resizeObserver = new ResizeObserver(() => {
    if (host.value && host.value.offsetHeight > 0) editor?.layout()
  })
  resizeObserver.observe(host.value)
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor || syncing) return
    const current = editor.getValue()
    if (current !== value) editor.setValue(value)
  },
)

watch(
  () => props.language,
  (language) => {
    if (!editor || !monacoApi) return
    const model = editor.getModel()
    if (model) monacoApi.editor.setModelLanguage(model, language)
  },
)

watch(
  () => props.readOnly,
  (readOnly) => {
    editor?.updateOptions({ readOnly })
  },
)

watch(
  () => props.dark,
  () => applyTheme(),
)

watch(
  () => [props.revealKey, props.revealLine],
  () => revealRequestedLine(),
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown)
  editor?.dispose()
  editor = null
  monacoApi = null
})

defineExpose({
  layout() {
    editor?.layout()
  },
  revealLine(line: number) {
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
  },
})
</script>

<template>
  <div ref="host" class="ws-monaco-host" />
</template>

<style scoped>
.ws-monaco-host {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
