<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FileCode2, FolderTree, RefreshCw, SquareTerminal, X } from 'lucide-vue-next'
import { authHeaders, type TutorLab } from '../tutor-model'
import { monacoLanguageForPath, type FileStatusKind } from '../file-status'
import { resolveFileStatus, useFileStatus } from '../composables/useFileStatus'
import { clampSelection, useWorkspaceContext } from '../composables/useWorkspaceContext'
import FileStatusBadge from './FileStatusBadge.vue'

const MonacoEditor = defineAsyncComponent(() => import('./MonacoEditor.vue'))

const props = defineProps<{
  lab: TutorLab
  endpoint: string
  student?: string
  dark?: boolean
  terminalOpen?: boolean
}>()

const emit = defineEmits<{
  /** 用户点击终端开关图标，请求切换终端面板开合。 */
  (event: 'toggle-terminal'): void
}>()

function apiUrl(pathname: string) {
  return `${props.endpoint}${pathname}`
}

interface FsNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FsNode[]
}

interface OpenTab {
  path: string
  content: string
  draft: string
  truncated: boolean
  loading: boolean
  error: string
  saveNote: string
}

const tree = ref<FsNode[]>([])
const rootName = ref('os-lab')
const expanded = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref('')
const openTabs = ref<OpenTab[]>([])
const activePath = ref('')
const saving = ref(false)
const clientReady = ref(false)
const codeRoot = ref<HTMLElement | null>(null)
/** 桌面端是常驻侧栏，窄屏下由同一状态控制抽屉。 */
const treeOpen = ref(true)
const editorRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
const workspaceContext = useWorkspaceContext()

const { statusMap, source, refresh: refreshFileStatus } = useFileStatus(
  props.endpoint,
  computed(() => props.lab.id),
  null,
)

const isStudent = computed(() => rootName.value.startsWith('student-labs'))
const activeTab = computed(() => openTabs.value.find((tab) => tab.path === activePath.value) || null)
const canEdit = computed(() => isStudent.value && Boolean(activeTab.value) && !activeTab.value!.truncated)
const editorLanguage = computed(() =>
  activePath.value ? monacoLanguageForPath(activePath.value) : 'plaintext',
)
const showEditor = computed(() => Boolean(activeTab.value) && !activeTab.value!.loading)
const hasUnsavedChanges = computed(() => Boolean(activeTab.value) && activeTab.value!.draft !== activeTab.value!.content)
const workspaceLabel = computed(() =>
  isStudent.value ? '我的系统' : '参考实现 · 只读',
)

/** v-model 代理：绑定到激活 tab 的 draft。切换 tab 时 MonacoEditor 的 watch 会同步内容。 */
const draft = computed<string>({
  get: () => activeTab.value?.draft ?? '',
  set: (value) => {
    if (activeTab.value) activeTab.value.draft = value
  },
})

const existingFiles = computed(() => {
  const paths = new Set<string>()
  const visit = (nodes: FsNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') paths.add(node.path)
      else if (node.children) visit(node.children)
    }
  }
  visit(tree.value)
  return paths
})

const labFiles = computed(() => {
  const seen = new Set<string>()
  for (const stage of Object.values(props.lab.resources)) {
    for (const p of stage.paths) {
      if (/\.(rs|asm|ld|toml)$/.test(p)) seen.add(p)
    }
  }
  return [...seen].filter((path) => existingFiles.value.has(path)).slice(0, 8)
})

function fileStatusFor(path: string): FileStatusKind | null {
  if (!isStudent.value) return null
  return resolveFileStatus(props.lab.id, path, statusMap.value, source.value)
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

function closeTreeOnNarrowScreen() {
  if ((codeRoot.value?.clientWidth || window.innerWidth) <= 620) closeTree()
}

function allowDiscardDraft(nextPath: string) {
  if (!hasUnsavedChanges.value || nextPath === activePath.value) return true
  return window.confirm(`“${activePath.value}”还有未保存的修改。放弃修改并打开其他文件吗？`)
}

function expandToPath(relative: string) {
  const parts = relative.split('/')
  const next = new Set(expanded.value)
  for (let index = 1; index < parts.length; index += 1) {
    next.add(parts.slice(0, index).join('/'))
  }
  expanded.value = next
}

async function openFile(relative: string) {
  if (relative === activePath.value) {
    closeTreeOnNarrowScreen()
    return
  }
  // 已打开：直接激活，保留各自 draft。
  const existing = openTabs.value.find((tab) => tab.path === relative)
  if (existing) {
    activePath.value = relative
    closeTreeOnNarrowScreen()
    expandToPath(relative)
    return
  }
  if (!allowDiscardDraft(relative)) return
  // 新建 tab 占位，立刻激活以显示 loading。
  const tab: OpenTab = {
    path: relative,
    content: '',
    draft: '',
    truncated: false,
    loading: true,
    error: '',
    saveNote: '',
  }
  openTabs.value.push(tab)
  // 取回 reactive 代理：后续必须通过代理修改，直接改原始 tab 不触发更新。
  const view = openTabs.value[openTabs.value.length - 1]
  activePath.value = relative
  closeTreeOnNarrowScreen()
  expandToPath(relative)
  try {
    const response = await fetch(apiUrl(`/fs/file?path=${encodeURIComponent(relative)}`), {
      headers: authHeaders(),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    view.content = payload.content || ''
    view.draft = view.content
    view.truncated = Boolean(payload.truncated)
    view.error = ''
  } catch (err) {
    view.error = err instanceof Error ? err.message : '读取文件失败'
  } finally {
    view.loading = false
  }
}

function closeTab(path: string) {
  const index = openTabs.value.findIndex((tab) => tab.path === path)
  if (index < 0) return
  const tab = openTabs.value[index]
  if (tab.draft !== tab.content) {
    if (!window.confirm(`“${path}”还有未保存的修改。关闭并放弃修改吗？`)) return
  }
  openTabs.value.splice(index, 1)
  if (activePath.value === path) {
    const next = openTabs.value[index] || openTabs.value[index - 1] || null
    activePath.value = next ? next.path : ''
  }
}

async function saveEdit() {
  const tab = activeTab.value
  if (saving.value || !tab || !canEdit.value) return
  saving.value = true
  tab.saveNote = ''
  try {
    const response = await fetch(apiUrl('/fs/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ path: tab.path, content: tab.draft }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    tab.content = tab.draft
    tab.saveNote = '已保存。可在下方“运行与验证”中检查修改。'
    void refreshFileStatus()
  } catch (err) {
    tab.saveNote = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function onEditorSave() {
  void saveEdit()
}

function onEditorCursor(payload: { line: number; column: number; selection: string }) {
  if (!workspaceContext || !activePath.value) return
  workspaceContext.currentFile = activePath.value
  workspaceContext.currentLine = payload.line
  workspaceContext.currentSelection = clampSelection(payload.selection)
}

/** 手册「源码引用」跳转入口：打开文件并定位行。 */
async function openAtLine(path: string, line: number) {
  await openFile(path)
  await nextTick()
  if (line > 0) editorRef.value?.revealLine(line)
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!openTabs.value.some((tab) => tab.draft !== tab.content)) return
  event.preventDefault()
  event.returnValue = ''
}

watch(activePath, (path) => {
  if (workspaceContext) workspaceContext.currentFile = path
})

onMounted(() => {
  clientReady.value = true
  window.addEventListener('beforeunload', warnBeforeUnload)
  void loadTree()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
})

defineExpose({ openAtLine, refreshFileStatus })
</script>

<template>
  <section ref="codeRoot" class="ws-code" aria-label="系统代码">
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
        <em v-if="activeTab?.truncated">（已截断）</em>
        <em v-else-if="hasUnsavedChanges" class="ws-code-unsaved">未保存</em>
      </div>
      <div v-else class="ws-code-file-meta ws-code-file-meta--hint">
        <span>{{ workspaceLabel }}</span>
        <small>代码编辑与下方运行共用此工作区</small>
      </div>

      <div class="ws-code-toolbar-actions">
        <button
          v-if="canEdit && activePath"
          type="button"
          class="ws-code-save"
          :disabled="saving || !hasUnsavedChanges"
          @click="saveEdit"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button
          type="button"
          class="ws-code-icon-btn"
          :class="{ 'ws-code-icon-btn--active': terminalOpen }"
          :title="terminalOpen ? '隐藏终端' : '显示终端'"
          :aria-label="terminalOpen ? '隐藏终端' : '显示终端'"
          @click="emit('toggle-terminal')"
        >
          <SquareTerminal :size="14" aria-hidden="true" />
        </button>
        <button type="button" class="ws-code-icon-btn" title="重新加载目录" @click="loadTree">
          <RefreshCw :size="14" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="openTabs.length" class="ws-code-tabs" role="tablist" aria-label="打开的文件">
      <button
        v-for="tab in openTabs"
        :key="tab.path"
        type="button"
        role="tab"
        :aria-selected="tab.path === activePath"
        :class="['ws-code-tab', { active: tab.path === activePath }]"
        :title="tab.path"
        @click="openFile(tab.path)"
      >
        <FileStatusBadge v-if="fileStatusFor(tab.path)" :kind="fileStatusFor(tab.path)!" />
        <span class="ws-code-tab-name">{{ tab.path.split('/').pop() }}</span>
        <span
          v-if="tab.draft !== tab.content"
          class="ws-code-tab-dot"
          aria-label="未保存"
        ></span>
        <span
          class="ws-code-tab-close"
          role="button"
          tabindex="-1"
          :aria-label="`关闭 ${tab.path}`"
          @click.stop="closeTab(tab.path)"
        >
          <X :size="12" aria-hidden="true" />
        </span>
      </button>
    </div>

    <p
      v-if="activeTab?.saveNote"
      class="ws-code-flash"
      :class="{ ok: activeTab.saveNote.startsWith('已保存') }"
    >{{ activeTab.saveNote }}</p>
    <div class="ws-code-main">
      <button
        v-if="treeOpen"
        type="button"
        class="ws-code-tree-backdrop"
        aria-label="关闭文件目录"
        @click="closeTree"
      />

      <aside class="ws-code-tree-drawer" :class="{ open: treeOpen }" aria-label="目录结构">
        <header class="ws-code-drawer-head">
          <div>
            <strong>文件</strong>
            <small>{{ workspaceLabel }}</small>
          </div>
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
                :status-map="statusMap"
                :status-source="source"
                @toggle="toggleDir"
                @open="openFile"
              />
            </template>
          </template>
        </div>
      </aside>

      <div class="ws-code-view">
        <p v-if="activeTab?.error" class="ws-code-file-error">{{ activeTab.error }}</p>
        <div v-if="!activePath" class="ws-code-empty">
          <p class="ws-code-empty-lead">选择要查看或编辑的源码文件</p>
          <p class="ws-code-empty-sub">{{ workspaceLabel }} · 从左侧文件栏浏览当前账号的实验代码</p>
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
          <p v-if="activeTab?.loading" class="ws-code-note">读取中…</p>
          <MonacoEditor
            v-else-if="showEditor && clientReady"
            ref="editorRef"
            v-model="draft"
            :language="editorLanguage"
            :read-only="!canEdit"
            :dark="dark"
            @save="onEditorSave"
            @cursor="onEditorCursor"
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
import { type FileStatusKind } from '../file-status'
import { resolveFileStatus, type FileStatusSource } from '../composables/useFileStatus'

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
    statusMap: { type: Object as PropType<Record<string, FileStatusKind>>, default: () => ({}) },
    statusSource: { type: String as PropType<FileStatusSource>, default: 'none' },
  },
  emits: ['toggle', 'open'],
  setup(props, { emit }) {
    function status(): FileStatusKind | null {
      if (!props.studentRoot || props.node.type !== 'file') return null
      return resolveFileStatus(props.labId, props.node.path, props.statusMap, props.statusSource)
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
                statusMap: props.statusMap,
                statusSource: props.statusSource,
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
  container-type: inline-size;
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

.ws-code-file-meta .ws-code-unsaved {
  flex: 0 0 auto;
  color: var(--ws-warning, #a15c00);
  font-style: normal;
  font-weight: var(--ws-weight-semibold);
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

.ws-code-icon-btn--active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-surface-alt, var(--ws-surface));
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

.ws-code-source-hint {
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-faint);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
}

.ws-code-tabs {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  gap: 2px;
  min-height: 30px;
  padding: 0 var(--ws-space-2);
  overflow-x: auto;
  scrollbar-width: thin;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-code-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  padding: 4px var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-code-tab:hover {
  color: var(--ws-accent);
  background: var(--ws-surface);
}

.ws-code-tab.active {
  color: var(--ws-ink);
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.ws-code-tab-name {
  overflow: hidden;
  font-family: var(--ws-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-code-tab-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-warning, #a15c00);
}

.ws-code-tab-close {
  display: inline-grid;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--ws-ink-faint);
  border-radius: var(--ws-radius-sm);
  place-items: center;
}

.ws-code-tab-close:hover {
  color: var(--ws-danger, #c0392b);
  background: color-mix(in srgb, var(--ws-danger, #c0392b) 12%, transparent);
}

.ws-code-main {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: row;
}

.ws-code-tree-backdrop {
  display: none;
}

.ws-code-tree-drawer {
  display: none;
  flex: 0 0 clamp(210px, 27%, 290px);
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-code-tree-drawer.open {
  display: grid;
}

.ws-code-drawer-head {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-code-drawer-head > div {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.ws-code-drawer-head strong {
  font-size: var(--ws-text-sm);
}

.ws-code-drawer-head small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
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
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ws-code-file-error {
  position: absolute;
  z-index: 2;
  top: var(--ws-space-2);
  right: var(--ws-space-2);
  left: var(--ws-space-2);
  margin: 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-danger, #c0392b);
  border: 1px solid color-mix(in srgb, var(--ws-danger, #c0392b) 35%, var(--ws-line));
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-2);
  font-size: var(--ws-text-xs);
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

@container (max-width: 620px) {
  .ws-code-tree-backdrop {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: block;
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
    width: min(300px, 88%);
    box-shadow: var(--ws-shadow-3);
  }

  .ws-code-empty {
    padding: var(--ws-space-4);
  }

  .ws-code-picks-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
