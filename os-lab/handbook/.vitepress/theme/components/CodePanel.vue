<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { FileCode2, FolderTree, RefreshCw, X } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'
import { mockFileStatus, monacoLanguageForPath, type FileStatusKind } from '../file-status'
import FileStatusBadge from './FileStatusBadge.vue'

const MonacoEditor = defineAsyncComponent(() => import('./MonacoEditor.vue'))

const props = defineProps<{
  lab: TutorLab
  endpoint: string
  student?: string
  dark?: boolean
}>()

function apiUrl(pathname: string) {
  if (!props.student) return `${props.endpoint}${pathname}`
  return `${props.endpoint}${pathname}${pathname.includes('?') ? '&' : '?'}user=${encodeURIComponent(props.student)}`
}

interface FsNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FsNode[]
}

const tree = ref<FsNode[]>([])
const rootName = ref('os-lab')
const expanded = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref('')
const activePath = ref('')
const fileContent = ref('')
const fileTruncated = ref(false)
const fileLoading = ref(false)
const draft = ref('')
const saving = ref(false)
const saveNote = ref('')
const clientReady = ref(false)
/** 文件树抽屉：默认关闭，打开文件后给编辑器让出全宽。 */
const treeOpen = ref(false)

const isStudent = computed(() => rootName.value.startsWith('student-labs'))
const canEdit = computed(() => isStudent.value && !fileTruncated.value && Boolean(activePath.value))
const editorLanguage = computed(() =>
  activePath.value ? monacoLanguageForPath(activePath.value) : 'plaintext',
)
const showEditor = computed(() => Boolean(activePath.value) && !fileLoading.value)
const workspaceLabel = computed(() =>
  isStudent.value ? `你的系统 · ${rootName.value.split('/')[1] || ''}` : '参考实现 · 只读',
)

const labFiles = computed(() => {
  const seen = new Set<string>()
  for (const stage of Object.values(props.lab.resources)) {
    for (const p of stage.paths) {
      if (/\.(rs|asm|ld|toml)$/.test(p)) seen.add(p)
    }
  }
  return [...seen].slice(0, 8)
})

function fileStatusFor(path: string): FileStatusKind | null {
  if (!isStudent.value) return null
  return mockFileStatus(props.lab.id, path)
}

async function loadTree() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(apiUrl('/fs/tree'), { headers: authHeaders() })
    if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)
    const payload = await response.json()
    tree.value = payload.tree || []
    rootName.value = payload.root || 'os-lab'
    expanded.value = new Set(tree.value.filter((n) => n.type === 'dir').map((n) => n.path))
  } catch (err) {
    error.value =
      err instanceof Error && err.message
        ? `无法加载目录：${err.message}`
        : '无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor'
  } finally {
    loading.value = false
  }
}

function toggleDir(node: FsNode) {
  const next = new Set(expanded.value)
  if (next.has(node.path)) next.delete(node.path)
  else next.add(node.path)
  expanded.value = next
}

function toggleTree() {
  treeOpen.value = !treeOpen.value
}

function closeTree() {
  treeOpen.value = false
}

async function openFile(relative: string) {
  activePath.value = relative
  fileLoading.value = true
  fileContent.value = ''
  fileTruncated.value = false
  saveNote.value = ''
  treeOpen.value = false
  try {
    const response = await fetch(apiUrl(`/fs/file?path=${encodeURIComponent(relative)}`), {
      headers: authHeaders(),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    fileContent.value = payload.content || ''
    draft.value = fileContent.value
    fileTruncated.value = Boolean(payload.truncated)
    const parts = relative.split('/')
    const next = new Set(expanded.value)
    for (let index = 1; index < parts.length; index += 1) {
      next.add(parts.slice(0, index).join('/'))
    }
    expanded.value = next
  } catch (err) {
    fileContent.value = ''
    error.value = err instanceof Error ? err.message : '读取文件失败'
  } finally {
    fileLoading.value = false
  }
}

async function saveEdit() {
  if (saving.value || !canEdit.value) return
  saving.value = true
  try {
    const response = await fetch(apiUrl('/fs/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ path: activePath.value, content: draft.value }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    fileContent.value = draft.value
    saveNote.value = '已保存。去终端重新运行验证你的修改。'
  } catch (err) {
    saveNote.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function onEditorSave() {
  void saveEdit()
}

onMounted(() => {
  clientReady.value = true
  void loadTree()
})
</script>

<template>
  <section class="ws-code" aria-label="系统代码">
    <header class="ws-code-toolbar">
      <button
        type="button"
        class="ws-code-tree-btn"
        :class="{ active: treeOpen }"
        :aria-expanded="treeOpen"
        title="打开文件目录"
        @click="toggleTree"
      >
        <FolderTree :size="15" aria-hidden="true" />
        <span>目录</span>
      </button>

      <div v-if="activePath" class="ws-code-file-meta">
        <FileCode2 :size="14" aria-hidden="true" />
        <FileStatusBadge v-if="fileStatusFor(activePath)" :kind="fileStatusFor(activePath)!" />
        <code>{{ activePath }}</code>
        <em v-if="fileTruncated">（已截断）</em>
      </div>
      <div v-else class="ws-code-file-meta ws-code-file-meta--hint">
        <span>{{ workspaceLabel }}</span>
        <small>执行目录 <code>{{ rootName }}/</code></small>
      </div>

      <div class="ws-code-toolbar-actions">
        <button
          v-if="canEdit && activePath"
          type="button"
          class="ws-code-save"
          :disabled="saving || draft === fileContent"
          @click="saveEdit"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button type="button" class="ws-code-icon-btn" title="重新加载目录" @click="loadTree">
          <RefreshCw :size="14" aria-hidden="true" />
        </button>
      </div>
    </header>

    <p v-if="saveNote" class="ws-code-flash" :class="{ ok: saveNote.startsWith('已保存') }">{{ saveNote }}</p>

    <div class="ws-code-main">
      <button
        v-if="treeOpen"
        type="button"
        class="ws-code-tree-backdrop"
        aria-label="关闭文件目录"
        @click="closeTree"
      />

      <aside v-if="treeOpen" class="ws-code-tree-drawer" aria-label="目录结构">
        <header class="ws-code-drawer-head">
          <strong>文件</strong>
          <small><code>{{ rootName }}/</code></small>
          <button type="button" class="ws-code-icon-btn" aria-label="关闭" @click="closeTree">
            <X :size="14" aria-hidden="true" />
          </button>
        </header>
        <div class="ws-code-tree">
          <p v-if="loading" class="ws-code-note">目录加载中…</p>
          <p v-else-if="error" class="ws-code-note error">{{ error }}</p>
          <template v-else>
            <template v-for="node in tree" :key="node.path">
              <CodeTreeNode
                :node="node"
                :depth="0"
                :expanded="expanded"
                :active-path="activePath"
                :lab-id="lab.id"
                :student-root="isStudent"
                @toggle="toggleDir"
                @open="openFile"
              />
            </template>
          </template>
        </div>
      </aside>

      <div class="ws-code-view">
        <div v-if="!activePath" class="ws-code-empty">
          <p class="ws-code-empty-lead">选择要查看或编辑的源码文件</p>
          <p class="ws-code-empty-sub">工作区 <code>{{ rootName }}/</code> · 可从下方快捷入口或左侧「目录」浏览</p>
          <div v-if="labFiles.length" class="ws-code-picks">
            <span>本 Lab 相关</span>
            <div class="ws-code-picks-grid">
              <button v-for="file in labFiles" :key="file" type="button" @click="openFile(file)">
                <FileCode2 :size="14" aria-hidden="true" />
                {{ file }}
              </button>
            </div>
          </div>
          <button type="button" class="ws-code-browse" @click="treeOpen = true">
            <FolderTree :size="15" aria-hidden="true" />
            浏览全部文件
          </button>
        </div>

        <template v-else>
          <p v-if="fileLoading" class="ws-code-note">读取中…</p>
          <MonacoEditor
            v-else-if="showEditor && clientReady"
            v-model="draft"
            :language="editorLanguage"
            :read-only="!canEdit"
            :dark="dark"
            @save="onEditorSave"
          />
        </template>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import {
  ChevronDown as IconDown,
  ChevronRight as IconRight,
  FileCode2 as IconFile,
  Folder as IconFolder,
  FolderOpen as IconFolderOpen,
} from 'lucide-vue-next'
import FileStatusBadge from './FileStatusBadge.vue'
import { mockFileStatus, type FileStatusKind } from '../file-status'

interface FsNodeShape {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FsNodeShape[]
}

const CodeTreeNode = defineComponent({
  name: 'CodeTreeNode',
  components: { FileStatusBadge },
  props: {
    node: { type: Object as PropType<FsNodeShape>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Set<string>>, required: true },
    activePath: { type: String, required: true },
    labId: { type: String, required: true },
    studentRoot: { type: Boolean, default: false },
  },
  emits: ['toggle', 'open'],
  setup(props, { emit }) {
    function status(): FileStatusKind | null {
      if (!props.studentRoot || props.node.type !== 'file') return null
      return mockFileStatus(props.labId, props.node.path)
    }
    return () => {
      const { node, depth } = props
      const indent = { paddingLeft: `${8 + depth * 14}px` }
      const fileStatus = status()
      if (node.type === 'file') {
        return h(
          'button',
          {
            class: ['ws-tree-item', 'file', { active: props.activePath === node.path }],
            style: indent,
            type: 'button',
            onClick: () => emit('open', node.path),
          },
          [
            h(IconFile, { size: 13, 'aria-hidden': 'true' }),
            fileStatus ? h(FileStatusBadge, { kind: fileStatus }) : null,
            h('span', node.name),
          ],
        )
      }
      const isOpen = props.expanded.has(node.path)
      return h('div', [
        h(
          'button',
          {
            class: 'ws-tree-item dir',
            style: indent,
            type: 'button',
            'aria-expanded': String(isOpen),
            onClick: () => emit('toggle', node),
          },
          [
            h(isOpen ? IconDown : IconRight, { size: 13, 'aria-hidden': 'true' }),
            h(isOpen ? IconFolderOpen : IconFolder, { size: 13, 'aria-hidden': 'true' }),
            h('span', node.name),
          ],
        ),
        isOpen && node.children
          ? node.children.map((child) =>
              h(CodeTreeNode, {
                key: child.path,
                node: child,
                depth: depth + 1,
                expanded: props.expanded,
                activePath: props.activePath,
                labId: props.labId,
                studentRoot: props.studentRoot,
                onToggle: (value: FsNodeShape) => emit('toggle', value),
                onOpen: (value: string) => emit('open', value),
              }),
            )
          : null,
      ])
    }
  },
})

export default { components: { CodeTreeNode } }
</script>

<style scoped>
.ws-code {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-code-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  min-width: 0;
  padding: var(--ws-space-1) var(--ws-space-2);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-code-tree-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-height: var(--ws-control-sm);
  padding: 0 var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-code-tree-btn:hover,
.ws-code-tree-btn.active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-code-file-meta {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--ws-space-1);
  min-width: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-code-file-meta code {
  overflow: hidden;
  font-family: var(--ws-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-code-file-meta--hint {
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

.ws-code-file-meta--hint span {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-code-file-meta--hint small {
  color: var(--ws-ink-faint);
}

.ws-code-toolbar-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-1);
  margin-left: auto;
}

.ws-code-save {
  min-height: var(--ws-control-sm);
  padding: 0 var(--ws-space-3);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-code-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ws-code-icon-btn {
  display: grid;
  width: var(--ws-control-sm);
  height: var(--ws-control-sm);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  place-items: center;
  cursor: pointer;
}

.ws-code-icon-btn:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-code-flash {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
}

.ws-code-flash.ok {
  color: var(--ws-ok, #1a7f37);
}

.ws-code-main {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ws-code-tree-backdrop {
  position: absolute;
  inset: 0;
  z-index: 4;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, var(--ws-ink) 28%, transparent);
  cursor: pointer;
}

.ws-code-tree-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(300px, 88%);
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-code-drawer-head {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-code-drawer-head strong {
  font-size: var(--ws-text-sm);
}

.ws-code-drawer-head small {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-code-drawer-head small code {
  font-family: var(--ws-font-mono);
}

.ws-code-tree {
  min-height: 0;
  padding: var(--ws-space-2);
  overflow: auto;
}

.ws-code-tree :deep(.ws-tree-item) {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  width: 100%;
  padding-top: 3px;
  padding-right: var(--ws-space-2);
  padding-bottom: 3px;
  color: var(--ws-ink-muted);
  border: 0;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-xs);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.ws-code-tree :deep(.ws-tree-item span) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-code-tree :deep(.ws-tree-item:hover) {
  color: var(--ws-accent);
  background: var(--ws-surface-alt);
}

.ws-code-tree :deep(.ws-tree-item.file.active) {
  color: var(--ws-accent);
  background: var(--ws-accent-soft);
  font-weight: var(--ws-weight-semibold);
}

.ws-code-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ws-code-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-4);
  min-height: 0;
  padding: var(--ws-space-6);
  text-align: center;
}

.ws-code-empty-lead {
  margin: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
  font-weight: var(--ws-weight-semibold);
}

.ws-code-empty-sub {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-code-empty-sub code {
  font-family: var(--ws-font-mono);
}

.ws-code-picks {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-2);
  width: min(100%, 520px);
}

.ws-code-picks > span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ws-code-picks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--ws-space-2);
}

.ws-code-picks-grid button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  text-align: left;
  cursor: pointer;
}

.ws-code-picks-grid button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-code-browse {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: 0 var(--ws-space-4);
  color: var(--ws-accent);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-code-browse:hover {
  background: var(--ws-accent-soft);
}

.ws-code-note {
  margin: 0;
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.ws-code-note.error {
  color: var(--ws-danger, #c0392b);
}
</style>
