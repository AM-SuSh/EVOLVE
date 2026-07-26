<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, RefreshCw } from 'lucide-vue-next'
import type { TutorLab } from '../tutor-model'

/**
 * 只读代码查看器：让学生看到自己正在构建的系统长什么样——
 * 目录结构、每个文件的源码，以及命令是在哪个目录下执行的。
 */
const props = defineProps<{ lab: TutorLab; endpoint: string }>()

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

/** 本 Lab 各阶段推荐阅读的代码文件（去重，仅保留仓库代码路径）。 */
const labFiles = computed(() => {
  const seen = new Set<string>()
  for (const stage of Object.values(props.lab.resources)) {
    for (const p of stage.paths) {
      if (/\.(rs|asm|ld|toml)$/.test(p)) seen.add(p)
    }
  }
  return [...seen].slice(0, 8)
})

const lines = computed(() => (fileContent.value ? fileContent.value.split('\n') : []))

async function loadTree() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`${props.endpoint}/fs/tree`)
    if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)
    const payload = await response.json()
    tree.value = payload.tree || []
    rootName.value = payload.root || 'os-lab'
    // 默认展开一层，kernel/src 直接可见。
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

async function openFile(relative: string) {
  activePath.value = relative
  fileLoading.value = true
  fileContent.value = ''
  fileTruncated.value = false
  try {
    const response = await fetch(`${props.endpoint}/fs/file?path=${encodeURIComponent(relative)}`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    fileContent.value = payload.content || ''
    fileTruncated.value = Boolean(payload.truncated)
    // 展开并高亮所在目录链。
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

onMounted(loadTree)
</script>

<template>
  <section class="ws-code" aria-label="系统代码">
    <header class="ws-code-head">
      <div class="ws-code-cwd">
        <strong>{{ rootName === 'student-lab' ? '你的系统 · 只读源码' : '参考实现 · 只读源码' }}</strong>
        <small>命令执行目录：<code>{{ rootName }}/</code>（下面就是它的内容）</small>
      </div>
      <button type="button" title="重新加载目录" @click="loadTree">
        <RefreshCw :size="14" aria-hidden="true" />
      </button>
    </header>

    <div v-if="labFiles.length" class="ws-code-quick">
      <span>本 Lab 相关：</span>
      <button
        v-for="file in labFiles"
        :key="file"
        type="button"
        :class="{ active: activePath === file }"
        @click="openFile(file)"
      >
        {{ file }}
      </button>
    </div>

    <div class="ws-code-body">
      <nav class="ws-code-tree" aria-label="目录结构">
        <p v-if="loading" class="ws-code-note">目录加载中…</p>
        <p v-else-if="error" class="ws-code-note error">{{ error }}</p>
        <template v-else>
          <template v-for="node in tree" :key="node.path">
            <CodeTreeNode
              :node="node"
              :depth="0"
              :expanded="expanded"
              :active-path="activePath"
              @toggle="toggleDir"
              @open="openFile"
            />
          </template>
        </template>
      </nav>

      <div class="ws-code-view">
        <p v-if="!activePath" class="ws-code-note">
          左边选择一个文件查看源码。建议从 <code>kernel/src/main.rs</code> 或上方「本 Lab 相关」文件开始。
        </p>
        <template v-else>
          <p class="ws-code-file">
            <FileCode2 :size="14" aria-hidden="true" /><code>{{ rootName }}/{{ activePath }}</code>
            <em v-if="fileTruncated">（文件过大，已截断显示）</em>
          </p>
          <p v-if="fileLoading" class="ws-code-note">读取中…</p>
          <div v-else class="ws-code-source">
            <div v-for="(line, index) in lines" :key="index" class="ws-code-line">
              <span>{{ index + 1 }}</span>
              <code>{{ line }}</code>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import { ChevronDown as IconDown, ChevronRight as IconRight, FileCode2 as IconFile, Folder as IconFolder, FolderOpen as IconFolderOpen } from 'lucide-vue-next'

interface FsNodeShape {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FsNodeShape[]
}

/** 递归目录节点：小而平的实现，避免为一棵树引入额外依赖。 */
const CodeTreeNode = defineComponent({
  name: 'CodeTreeNode',
  props: {
    node: { type: Object as PropType<FsNodeShape>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Set<string>>, required: true },
    activePath: { type: String, required: true },
  },
  emits: ['toggle', 'open'],
  setup(props, { emit }) {
    return () => {
      const { node, depth } = props
      const indent = { paddingLeft: `${8 + depth * 14}px` }
      if (node.type === 'file') {
        return h(
          'button',
          {
            class: ['ws-tree-item', 'file', { active: props.activePath === node.path }],
            style: indent,
            type: 'button',
            onClick: () => emit('open', node.path),
          },
          [h(IconFile, { size: 13, 'aria-hidden': 'true' }), h('span', node.name)],
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
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-code-cwd strong {
  display: block;
  font-size: var(--ws-text-sm);
}

.ws-code-cwd small {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-code-cwd code {
  font-family: var(--ws-font-mono);
}

.ws-code-head > button {
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

.ws-code-head > button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-code-quick {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-3);
  overflow-x: auto;
  border-bottom: 1px solid var(--ws-line);
  scrollbar-width: none;
  font-size: var(--ws-text-xs);
}

.ws-code-quick::-webkit-scrollbar {
  display: none;
}

.ws-code-quick > span {
  flex: 0 0 auto;
  color: var(--ws-ink-faint);
}

.ws-code-quick button {
  flex: 0 0 auto;
  padding: 2px var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-code-quick button:hover,
.ws-code-quick button.active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-code-body {
  display: grid;
  grid-template-columns: minmax(150px, 220px) minmax(0, 1fr);
  min-height: 0;
}

.ws-code-tree {
  min-height: 0;
  padding: var(--ws-space-2);
  overflow: auto;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
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
  background: var(--ws-surface);
}

.ws-code-tree :deep(.ws-tree-item.file.active) {
  color: var(--ws-accent);
  background: var(--ws-accent-soft);
  font-weight: var(--ws-weight-semibold);
}

.ws-code-view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ws-code-file {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  margin: 0;
  padding: var(--ws-space-1) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-code-file code {
  font-family: var(--ws-font-mono);
}

.ws-code-file em {
  color: var(--ws-warn, #b7791f);
  font-style: normal;
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

.ws-code-source {
  min-height: 0;
  overflow: auto;
  flex: 1 1 auto;
  padding: var(--ws-space-2) 0;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  line-height: 1.6;
}

.ws-code-line {
  display: flex;
  gap: var(--ws-space-3);
  padding: 0 var(--ws-space-3);
  white-space: pre;
}

.ws-code-line:hover {
  background: var(--ws-surface-alt);
}

.ws-code-line > span {
  flex: 0 0 34px;
  color: var(--ws-ink-faint);
  text-align: right;
  user-select: none;
}

.ws-code-line > code {
  color: var(--ws-ink);
  font-family: inherit;
}
</style>
