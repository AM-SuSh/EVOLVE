<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, RotateCcw, Save } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'

/**
 * 工作台·教师手册编辑：占据左栏整栏，直接改该实验指导书的 Markdown 源
 * （增补知识点、订正内容），保存自动同步；「返回预览」回到渲染视图。
 */
interface ManualLocation {
  h2: string
  h3: string
  offset: number
}

const props = defineProps<{
  lab: TutorLab
  endpoint: string
  location?: ManualLocation | null
}>()
const emit = defineEmits<{
  (event: 'notice', text: string): void
  (event: 'close', location: ManualLocation): void
}>()

/** '/labs/lab1-bare-metal' → 'lab1-bare-metal.md' */
const docFile = computed(() => `${props.lab.documentRoute.split('/').pop()}.md`)

const content = ref('')
const savedContent = ref('')
const loading = ref(false)
const busy = ref(false)
const note = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)

const dirty = computed(() => content.value !== savedContent.value)
const lineCount = computed(() => content.value ? content.value.split('\n').length : 0)

async function load(force = false) {
  if (!force && dirty.value && !window.confirm('当前修改尚未保存，确定重新载入服务器版本吗？')) return
  loading.value = true
  note.value = ''
  try {
    const response = await fetch(
      `${props.endpoint}/teacher/doc?path=${encodeURIComponent(docFile.value)}`,
      { headers: authHeaders() },
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    content.value = payload.content || ''
    savedContent.value = content.value
    await nextTick()
    positionEditor(props.location)
  } catch (err) {
    note.value = err instanceof Error ? err.message : '读取失败（需教师账号 + 导师服务运行中）'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (busy.value || !dirty.value) return
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(`${props.endpoint}/teacher/doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ path: docFile.value, content: content.value }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    savedContent.value = content.value
    note.value = payload.synced ? '已保存并同步。刷新页面可见左栏新内容。' : '已保存，但站点同步失败（手动 npm run sync）。'
    emit('notice', '手册已保存并同步。')
  } catch (err) {
    note.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

function reload() {
  void load()
}

function markdownHeadings(source: string) {
  const headings: Array<{ level: 2 | 3; title: string; start: number; line: number }> = []
  let cursor = 0
  source.split('\n').forEach((line, index) => {
    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/)
    if (match) {
      headings.push({
        level: match[1].length as 2 | 3,
        title: match[2]
          .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
          .replace(/[*_`~]/g, '')
          .trim(),
        start: cursor,
        line: index,
      })
    }
    cursor += line.length + 1
  })
  return headings
}

function positionEditor(location?: ManualLocation | null) {
  const target = editor.value
  if (!target || !location) return
  const headings = markdownHeadings(content.value)
  const heading =
    (location.h3 && headings.find((item) => item.level === 3 && item.title === location.h3)) ||
    (location.h2 && headings.find((item) => item.level === 2 && item.title === location.h2))
  if (!heading) return
  target.focus()
  target.setSelectionRange(heading.start, heading.start)
  const lineHeight = Number.parseFloat(window.getComputedStyle(target).lineHeight) || 24
  target.scrollTop = Math.max(0, (heading.line - 2) * lineHeight)
}

function currentEditorLocation(): ManualLocation {
  const target = editor.value
  const headings = markdownHeadings(content.value)
  const cursor = target?.selectionStart ?? 0
  const preceding = headings.filter((item) => item.start <= cursor)
  const h2 = [...preceding].reverse().find((item) => item.level === 2)
  const h3 = [...preceding].reverse().find((item) => item.level === 3 && (!h2 || item.start >= h2.start))
  return {
    h2: h2?.title || props.location?.h2 || '',
    h3: h3?.title || '',
    offset: 0,
  }
}

function close() {
  if (dirty.value && !window.confirm('当前修改尚未保存，确定返回预览吗？')) return
  emit('close', currentEditorLocation())
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
}

watch(docFile, () => void load(true))
onMounted(() => {
  void load(true)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <section class="ws-tdoc" aria-label="手册编辑">
    <header class="ws-tdoc-head">
      <div>
        <strong>编辑 {{ lab.label }} 实验手册</strong>
        <small><code>labs/{{ docFile }}</code><span aria-hidden="true"> · </span>{{ lineCount }} 行</small>
      </div>
      <div class="ws-tdoc-actions">
        <span class="ws-tdoc-state" :class="{ dirty }">{{ dirty ? '有未保存修改' : '已同步' }}</span>
        <button type="button" title="重新载入服务器版本" aria-label="重新载入服务器版本" @click="reload">
          <RotateCcw :size="14" aria-hidden="true" />
        </button>
        <button type="button" class="primary" :disabled="busy || loading || !dirty" title="保存并同步（Ctrl/Command + S）" @click="save">
          <Save :size="14" aria-hidden="true" />{{ busy ? '保存中…' : '保存' }}
        </button>
        <button type="button" title="返回手册预览" @click="close">
          <ArrowLeft :size="14" aria-hidden="true" />预览
        </button>
      </div>
    </header>
    <p v-if="note" class="ws-tdoc-note" :class="{ ok: note.startsWith('已保存并同步') }">{{ note }}</p>
    <textarea
      ref="editor"
      v-model="content"
      class="ws-tdoc-editor"
      :disabled="loading"
      :placeholder="loading ? '正在载入实验手册…' : '在这里编辑 Markdown…'"
      aria-label="实验手册 Markdown 编辑器"
      spellcheck="false"
    />
  </section>
</template>

<style scoped>
.ws-tdoc {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-tdoc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-tdoc-head strong {
  display: block;
  font-size: var(--ws-text-sm);
}

.ws-tdoc-head small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-tdoc-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--ws-space-2);
}

.ws-tdoc-state {
  align-self: center;
  color: var(--ws-ok);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.ws-tdoc-state.dirty {
  color: var(--ws-warn);
}

.ws-tdoc-actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-tdoc-actions button.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-tdoc-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.ws-tdoc-note {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-4);
  color: var(--ws-danger, #c0392b);
  font-size: var(--ws-text-xs);
}

.ws-tdoc-note.ok {
  color: var(--ws-ok, #1a7f37);
}

.ws-tdoc-editor {
  grid-row: 3;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--ws-space-4) clamp(16px, 3vw, 40px);
  color: var(--ws-ink);
  border: 0;
  outline: none;
  background: var(--ws-surface-soft, var(--ws-surface-alt));
  resize: none;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
  line-height: 1.75;
  tab-size: 2;
}

.ws-tdoc-editor:focus {
  box-shadow: inset 3px 0 0 var(--ws-accent);
}

@media (max-width: 720px) {
  .ws-tdoc-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .ws-tdoc-actions {
    width: 100%;
  }

  .ws-tdoc-state {
    margin-right: auto;
  }
}
</style>
