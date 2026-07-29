<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import { BookOpen, LockKeyhole, Pencil, RefreshCw, TableOfContents } from 'lucide-vue-next'
import { authHeaders, collapsedSectionPrefix, sectionPrefixOf, type TutorLab } from '../tutor-model'

/**
 * 实验手册栏。
 *
 * 正文在登录后从 tutor-server 获取；服务端负责教师发布范围与学习进度鉴权。
 * 这里负责可信 Markdown 渲染、阅读位置观测和章节目录。
 */
const props = defineProps<{ lab: TutorLab; editable?: boolean }>()

const emit = defineEmits<{
  (event: 'section-change', payload: { h2: string; h3: string }): void
  /** 教师点「编辑手册」：外层把本栏切换成 Markdown 编辑器。 */
  (event: 'edit'): void
}>()

interface ManualSection {
  id: string
  title: string
  level: number
  prefix: string
  el: HTMLElement
}

const route = useRoute()
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')
const scroller = ref<HTMLElement>()
const docRoot = ref<HTMLElement>()
const sections = ref<ManualSection[]>([])
const activeIndex = ref(0)
const promptSectionCollapsed = ref(true)
const tocOpen = ref(false)
const manualHtml = ref('')
const loading = ref(true)
const error = ref('')
const locked = ref(false)

const markdown = new MarkdownIt({ html: true, linkify: true })
const defaultFence = markdown.renderer.rules.fence
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]
  if (token.info.trim().split(/\s+/)[0] === 'mermaid') {
    return `<div class="mermaid">${markdown.utils.escapeHtml(token.content)}</div>`
  }
  return defaultFence ? defaultFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}
const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const hrefIndex = tokens[index].attrIndex('href')
  if (hrefIndex >= 0) {
    const raw = tokens[index].attrs![hrefIndex][1]
    const labMatch = raw.match(/(?:^|\/)lab([1-8])-[^/#]+(?:\.md)?(#[^\s]*)?$/)
    const answerMatch = raw.match(/(?:^|\/)answers\/lab([1-8])-answers(?:\.md)?(#[^\s]*)?$/)
    if (answerMatch) tokens[index].attrs![hrefIndex][1] = withBase(`/learn/lab${answerMatch[1]}`)
    else if (labMatch) tokens[index].attrs![hrefIndex][1] = withBase(`/learn/lab${labMatch[1]}${labMatch[2] || ''}`)
    else if (/\/?labs\/overview(?:\.md)?$/.test(raw)) tokens[index].attrs![hrefIndex][1] = withBase('/guide/ai-tutor')
    // 教材 PDF（含 #page=）在新标签打开，避免挤掉工作台。
    if (/\/downloads\/.+\.pdf(?:#|$)/i.test(tokens[index].attrs![hrefIndex][1])) {
      const targetIndex = tokens[index].attrIndex('target')
      if (targetIndex < 0) tokens[index].attrPush(['target', '_blank'])
      else tokens[index].attrs![targetIndex][1] = '_blank'
      const relIndex = tokens[index].attrIndex('rel')
      if (relIndex < 0) tokens[index].attrPush(['rel', 'noopener noreferrer'])
    }
  }
  return defaultLinkOpen ? defaultLinkOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

let frame = 0

const activeSection = computed(() => sections.value[activeIndex.value])
const activeH2 = computed(() => {
  for (let index = activeIndex.value; index >= 0; index -= 1) {
    if (sections.value[index]?.level === 2) return sections.value[index]
  }
  return sections.value[0]
})
const activeH3 = computed(() =>
  activeSection.value?.level === 3 ? activeSection.value : undefined,
)

function headingText(el: HTMLElement) {
  return (el.textContent || '')
    .replace(/​/g, '')
    .replace(/[#\s]+$/, '')
    .trim()
}

function indexSections() {
  const root = docRoot.value
  if (!root) return
  const used = new Set<string>()
  root.querySelectorAll<HTMLElement>('h2, h3').forEach((heading, index) => {
    if (heading.id) return
    const base = headingText(heading)
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-|-$/g, '') || `section-${index + 1}`
    let id = base
    let duplicate = 2
    while (used.has(id)) id = `${base}-${duplicate++}`
    used.add(id)
    heading.id = id
  })
  sections.value = [...root.querySelectorAll<HTMLElement>('h2, h3')].map((el) => {
    const title = headingText(el)
    return {
      id: el.id,
      title,
      level: el.tagName === 'H2' ? 2 : 3,
      prefix: sectionPrefixOf(title),
      el,
    }
  })
  applyPromptCollapse()
  updateActiveSection()
}

async function loadManual() {
  loading.value = true
  error.value = ''
  locked.value = false
  manualHtml.value = ''
  sections.value = []
  try {
    const response = await fetch(`${endpoint}/manual?labId=${encodeURIComponent(props.lab.id)}`, {
      headers: authHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      locked.value = response.status === 401 || response.status === 403
      throw new Error(payload.error || `手册服务返回 ${response.status}`)
    }
    manualHtml.value = markdown.render(String(payload.content || ''))
    // 先撤下加载占位，让 v-html 真正挂载，再扫描正文标题生成目录。
    loading.value = false
    await nextTick()
    indexSections()
    const diagrams = docRoot.value?.querySelectorAll<HTMLElement>('.mermaid') || []
    if (diagrams.length) await mermaid.run({ nodes: [...diagrams] })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '实验手册加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 「五、AI 提问模板」的内容已经是导师栏的快捷提问按钮，
 * 在手册里默认折叠，避免学生把同一批模板读两遍。标题保留且可点开。
 */
function applyPromptCollapse() {
  const heading = sections.value.find(
    (section) => section.level === 2 && section.prefix === collapsedSectionPrefix,
  )
  if (!heading) return
  heading.el.classList.add('ws-section-collapsible')
  heading.el.classList.toggle('is-collapsed', promptSectionCollapsed.value)
  heading.el.setAttribute('role', 'button')
  heading.el.setAttribute('tabindex', '0')
  heading.el.setAttribute('aria-expanded', String(!promptSectionCollapsed.value))

  let node = heading.el.nextElementSibling
  while (node && node.tagName !== 'H2') {
    node.classList.toggle('ws-section-collapsed', promptSectionCollapsed.value)
    node = node.nextElementSibling
  }
}

function onDocClick(event: MouseEvent) {
  const heading = (event.target as HTMLElement | null)?.closest('.ws-section-collapsible')
  if (!heading) return
  promptSectionCollapsed.value = !promptSectionCollapsed.value
  applyPromptCollapse()
}

function onDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const heading = (event.target as HTMLElement | null)?.closest('.ws-section-collapsible')
  if (!heading) return
  event.preventDefault()
  promptSectionCollapsed.value = !promptSectionCollapsed.value
  applyPromptCollapse()
}

/** 当前小节 = 视口上沿之上最后一个标题。 */
function updateActiveSection() {
  const container = scroller.value
  if (!container || !sections.value.length) return
  const anchor = container.getBoundingClientRect().top + 88
  let next = 0
  sections.value.forEach((section, index) => {
    if (section.el.getBoundingClientRect().top <= anchor) next = index
  })
  if (next === activeIndex.value) return
  activeIndex.value = next
  emit('section-change', {
    h2: activeH2.value?.title || '',
    h3: activeH3.value?.title || '',
  })
}

function onScroll() {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    updateActiveSection()
  })
}

function scrollToSection(section: ManualSection | undefined, smooth = true) {
  const container = scroller.value
  if (!container || !section) return
  const top =
    section.el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    16
  container.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
  section.el.classList.remove('ws-section-flash')
  // 强制重排，让同一个元素能被连续触发多次高亮动画。
  void section.el.offsetWidth
  section.el.classList.add('ws-section-flash')
  window.setTimeout(() => section.el.classList.remove('ws-section-flash'), 1800)
}

function jumpTo(section: ManualSection) {
  scrollToSection(section)
  tocOpen.value = false
}

watch(
  () => route.path,
  () => void loadManual(),
)

onMounted(async () => {
  await loadManual()
  scroller.value?.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (frame) window.cancelAnimationFrame(frame)
  scroller.value?.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <section class="ws-manual-pane" aria-label="实验手册">
    <header class="ws-manual-toolbar">
      <div class="ws-manual-lead">
        <button
          class="ws-toc-toggle"
          type="button"
          :class="{ open: tocOpen }"
          :aria-expanded="tocOpen"
          title="章节目录"
          @click="tocOpen = !tocOpen"
        >
          <TableOfContents :size="15" aria-hidden="true" />
          <span>目录</span>
        </button>
        <div class="ws-manual-where">
          <span><BookOpen :size="14" aria-hidden="true" />{{ lab.label }} · {{ lab.systemLayer }}</span>
          <strong>
            {{ activeH2?.title || lab.title }}
            <em v-if="activeH3">› {{ activeH3.title }}</em>
          </strong>
        </div>
      </div>
      <div class="ws-manual-tools">
        <button
          v-if="props.editable"
          class="ws-manual-edit"
          type="button"
          title="编辑本实验指导书，增补知识点"
          @click="emit('edit')"
        >
          <Pencil :size="15" aria-hidden="true" />
          <span>编辑手册</span>
        </button>
      </div>

      <!-- 目录下拉：挂在工具条下方，点外部关闭 -->
      <div v-if="tocOpen" class="ws-toc-backdrop" @click="tocOpen = false" />
      <nav v-if="tocOpen" class="ws-toc-pop" aria-label="章节目录">
        <button
          v-for="(section, index) in sections"
          :key="section.id"
          type="button"
          :class="{ active: index === activeIndex, sub: section.level === 3 }"
          @click="jumpTo(section)"
        >
          {{ section.title }}
        </button>
      </nav>
    </header>

    <div ref="scroller" class="ws-manual-scroll">
      <div
        ref="docRoot"
        class="ws-manual-doc vp-doc"
        @click="onDocClick"
        @keydown="onDocKeydown"
      >
        <div v-if="loading" class="ws-manual-state" role="status">
          <RefreshCw :size="22" class="ws-spin" aria-hidden="true" />
          <strong>正在读取实验手册</strong>
          <span>同步教师发布范围与学习进度</span>
        </div>
        <div v-else-if="error" class="ws-manual-state" :class="{ locked }" role="alert">
          <LockKeyhole v-if="locked" :size="24" aria-hidden="true" />
          <RefreshCw v-else :size="24" aria-hidden="true" />
          <strong>{{ locked ? '当前内容尚不可查看' : '实验手册暂时无法读取' }}</strong>
          <span>{{ error }}</span>
          <a v-if="locked" :href="withBase('/guide/ai-tutor')">返回学习路径</a>
          <button v-else type="button" @click="loadManual">重新加载</button>
        </div>
        <div v-else v-html="manualHtml" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ws-manual-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

/* -- 工具条 ---------------------------------------------------------------- */
.ws-manual-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-4);
  min-width: 0;
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-manual-lead {
  display: flex;
  align-items: center;
  gap: var(--ws-space-3);
  min-width: 0;
}

.ws-toc-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-toc-toggle:hover,
.ws-toc-toggle.open {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-toc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8;
}

.ws-toc-pop {
  position: absolute;
  top: calc(100% + 4px);
  left: var(--ws-space-4);
  z-index: 9;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: min(300px, 78vw);
  max-height: min(58vh, 480px);
  padding: var(--ws-space-2);
  overflow-y: auto;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
}

.ws-toc-pop button {
  display: block;
  overflow: hidden;
  width: 100%;
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 0;
  border-left: 2px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  line-height: 1.6;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ws-toc-pop button.sub {
  padding-left: var(--ws-space-6);
  font-size: var(--ws-text-xs);
}

.ws-toc-pop button:hover {
  color: var(--ws-accent);
  background: var(--ws-surface-alt);
}

.ws-toc-pop button.active {
  color: var(--ws-accent);
  border-left-color: var(--ws-accent);
  background: var(--ws-accent-soft);
  font-weight: var(--ws-weight-semibold);
}

.ws-manual-where {
  min-width: 0;
}

.ws-manual-where span {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-manual-where strong {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-manual-where em {
  color: var(--ws-ink-muted);
  font-style: normal;
  font-weight: var(--ws-weight-medium);
}

.ws-manual-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-manual-edit {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  text-decoration: none;
  cursor: pointer;
}

.ws-manual-edit {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
}

.ws-manual-edit:hover {
  opacity: 0.9;
}

/* -- 正文 ------------------------------------------------------------------ */
.ws-manual-scroll {
  min-height: 0;
  padding: var(--ws-space-6) var(--ws-space-6) var(--ws-space-8);
  overflow-y: auto;
  scroll-behavior: smooth;
}

.ws-manual-state {
  display: grid;
  min-height: 320px;
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  color: var(--ws-ink-muted);
  text-align: center;
}

.ws-manual-state strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
}

.ws-manual-state span {
  max-width: 420px;
  font-size: var(--ws-text-sm);
}

.ws-manual-state a,
.ws-manual-state button {
  margin-top: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-accent);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
  cursor: pointer;
}

.ws-manual-state.locked > svg {
  color: var(--ws-warn);
}

.ws-spin {
  animation: ws-manual-spin 1s linear infinite;
}

@keyframes ws-manual-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .ws-manual-scroll {
    padding: var(--ws-space-4) var(--ws-space-4) var(--ws-space-6);
  }

  .ws-manual-edit span {
    display: none;
  }
}
</style>
