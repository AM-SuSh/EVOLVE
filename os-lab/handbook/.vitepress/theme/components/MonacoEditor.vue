<script setup lang="ts">
import loader from '@monaco-editor/loader'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    readOnly?: boolean
    dark?: boolean
  }>(),
  { language: 'plaintext', readOnly: false, dark: false },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'save'): void
  (event: 'cursor', payload: { line: number; column: number; selection: string }): void
}>()

const host = ref<HTMLElement | null>(null)
let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null
let monacoApi: typeof import('monaco-editor') | null = null
let resizeObserver: ResizeObserver | null = null
let syncing = false

function applyTheme() {
  if (!monacoApi) return
  monacoApi.editor.setTheme(props.dark ? 'vs-dark' : 'vs')
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (event.key.toLowerCase() !== 's') return
  // 仅当焦点在本编辑器内时处理，避免多实例互相抢
  if (!host.value?.contains(document.activeElement) && document.activeElement !== host.value) return
  event.preventDefault()
  event.stopPropagation()
  if (!props.readOnly) emit('save')
}

function bindSaveShortcut() {
  if (!editor || !monacoApi || props.readOnly) return
  editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
    emit('save')
  })
}

onMounted(async () => {
  if (!host.value || typeof window === 'undefined') return
  window.addEventListener('keydown', onKeydown, true)
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
  bindSaveShortcut()
  editor.onDidChangeModelContent(() => {
    if (!editor || props.readOnly) return
    syncing = true
    emit('update:modelValue', editor.getValue())
    syncing = false
  })
  editor.onDidChangeCursorPosition((event) => {
    if (!editor) return
    const selection = editor.getSelection()
    const selectionText = selection ? editor.getModel()?.getValueInRange(selection) || '' : ''
    emit('cursor', {
      line: event.position.lineNumber,
      column: event.position.column,
      selection: selectionText,
    })
  })
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
    if (!readOnly) bindSaveShortcut()
  },
)

watch(
  () => props.dark,
  () => applyTheme(),
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown, true)
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
  /** 供「添加到对话」：优先选区，否则取光标附近若干行。 */
  getChatSnippet(radius = 20) {
    if (!editor) return { text: '', line: 0, scope: 'context' as const }
    const model = editor.getModel()
    if (!model) return { text: '', line: 0, scope: 'context' as const }
    const selection = editor.getSelection()
    const selected = selection ? model.getValueInRange(selection).trim() : ''
    if (selected) {
      return {
        text: selected,
        line: selection?.startLineNumber || editor.getPosition()?.lineNumber || 0,
        scope: 'selection' as const,
      }
    }
    const line = editor.getPosition()?.lineNumber || 1
    const start = Math.max(1, line - radius)
    const end = Math.min(model.getLineCount(), line + radius)
    return {
      text: model.getValueInRange({
        startLineNumber: start,
        startColumn: 1,
        endLineNumber: end,
        endColumn: model.getLineMaxColumn(end),
      }),
      line,
      scope: 'context' as const,
    }
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
