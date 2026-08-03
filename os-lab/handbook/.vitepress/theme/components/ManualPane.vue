<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import { LockKeyhole, Pencil, RefreshCw, TableOfContents } from 'lucide-vue-next'
import { authHeaders, collapsedSectionPrefix, sectionPrefixOf, type TutorLab } from '../tutor-model'

/**
 * 实验手册栏。
 *
 * 正文在登录后从 tutor-server 获取；服务端负责教师发布范围与学习进度鉴权。
 * 这里负责可信 Markdown 渲染、阅读位置观测和章节目录。
 */
interface ManualLocation {
  h2: string
  h3: string
  offset: number
}

const props = defineProps<{
  lab: TutorLab
  editable?: boolean
  restoreLocation?: ManualLocation | null
}>()

const emit = defineEmits<{
  (event: 'section-change', payload: { h2: string; h3: string }): void
  /** 教师点「编辑手册」：外层把本栏切换成 Markdown 编辑器。 */
  (event: 'edit', location: ManualLocation): void
  /** 学生点手册中的源码引用（`kernel/src/trap.rs` 或 `...:42`）：跳到工作区对应文件/行。 */
  (event: 'source-jump', payload: { path: string; line: number }): void
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
    await nextTick()
    restoreReadingLocation()
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

/** 识别手册正文里的源码引用：`kernel/src/trap.rs` 或 `kernel/src/trap.rs:42`。 */
const SOURCE_REF_PATTERN = /^([\w./-]+\/[\w./-]+\.(?:rs|asm|s|toml|ld|c|h))(?::(\d+))?$/

function parseSourceRef(text: string): { path: string; line: number } | null {
  const value = String(text || '').trim()
  if (!value || value.includes(' ')) return null
  const match = value.match(SOURCE_REF_PATTERN)
  if (!match) return null
  return { path: match[1], line: match[2] ? Number(match[2]) : 0 }
}

function onDocClick(event: MouseEvent) {
  const heading = (event.target as HTMLElement | null)?.closest('.ws-section-collapsible')
  if (heading) {
    promptSectionCollapsed.value = !promptSectionCollapsed.value
    applyPromptCollapse()
    return
  }
  // 源码引用：点 <code>kernel/src/trap.rs:42</code> 跳到编辑器。
  const codeEl = (event.target as HTMLElement | null)?.closest('code')
  if (codeEl) {
    const ref = parseSourceRef(codeEl.textContent || '')
    if (ref) {
      event.preventDefault()
      emit('source-jump', ref)
    }
  }
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

function currentReadingLocation(): ManualLocation {
  updateActiveSection()
  const container = scroller.value
  const section = activeSection.value || sections.value[0]
  if (!container || !section) return { h2: '', h3: '', offset: 0 }
  const sectionTop =
    section.el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  return {
    h2: activeH2.value?.title || '',
    h3: activeH3.value?.title || '',
    offset: Math.max(0, container.scrollTop - sectionTop),
  }
}

/** 供附件溯源：按章节标题跳转。 */
function jumpToTitles(h2?: string, h3?: string) {
  const target =
    (h3 && sections.value.find((section) => section.level === 3 && section.title === h3)) ||
    (h2 && sections.value.find((section) => section.level === 2 && section.title === h2))
  if (target) jumpTo(target)
}

defineExpose({ jumpToTitles })

function restoreReadingLocation() {
  const location = props.restoreLocation
  const container = scroller.value
  if (!location || !container || !sections.value.length) {
    updateActiveSection()
    return
  }
  const target =
    (location.h3 && sections.value.find((section) => section.level === 3 && section.title === location.h3)) ||
    (location.h2 && sections.value.find((section) => section.level === 2 && section.title === location.h2))
  if (!target) {
    updateActiveSection()
    return
  }
  const top =
    target.el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop +
    Math.max(0, location.offset || 0) -
    16
  container.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
  activeIndex.value = sections.value.indexOf(target)
  emit('section-change', {
    h2: activeH2.value?.title || '',
    h3: activeH3.value?.title || '',
  })
}

function closeTocAfterFocus(event: FocusEvent) {
  const drawer = event.currentTarget as HTMLElement
  if (!drawer.contains(event.relatedTarget as Node | null)) tocOpen.value = false
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
  <section
    class="ws-manual-pane"
    :class="{ 'ws-manual-pane--editable': props.editable }"
    aria-label="实验手册"
  >
    <header v-if="props.editable" class="ws-manual-toolbar">
      <button
        class="ws-manual-edit"
        type="button"
        title="编辑本实验指导书，增补知识点"
        @click="emit('edit', currentReadingLocation())"
      >
        <Pencil :size="15" aria-hidden="true" />
        <span>编辑手册</span>
      </button>
    </header>

    <div class="ws-manual-body">
      <div
        class="ws-toc-drawer"
        :class="{ open: tocOpen }"
        @mouseenter="tocOpen = true"
        @mouseleave="tocOpen = false"
        @focusin="tocOpen = true"
        @focusout="closeTocAfterFocus"
      >
        <nav class="ws-toc-panel" aria-label="章节目录" :aria-hidden="!tocOpen">
          <strong>目录</strong>
          <button
            v-for="(section, index) in sections"
            :key="section.id"
            type="button"
            :tabindex="tocOpen ? 0 : -1"
            :class="{ active: index === activeIndex, sub: section.level === 3 }"
            @click="jumpTo(section)"
          >
            {{ section.title }}
          </button>
        </nav>
        <button
          class="ws-toc-edge"
          type="button"
          :aria-expanded="tocOpen"
          title="章节目录"
          :aria-label="tocOpen ? '收起章节目录' : '展开章节目录'"
          @click="tocOpen = !tocOpen"
        >
          <TableOfContents :size="16" aria-hidden="true" />
        </button>
      </div>

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
    </div>
  </section>
</template>

<style scoped>
.ws-manual-pane {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-manual-pane--editable {
  grid-template-rows: auto minmax(0, 1fr);
}

.ws-manual-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-manual-edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  color: var(--ws-ink-muted);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-manual-edit:hover,
.ws-manual-edit:focus-visible {
  color: var(--ws-ink);
  border-color: var(--ws-accent, #3b82f6);
  background: var(--ws-surface-alt);
}

.ws-manual-body {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 目录覆盖在正文之上，不占用纵向空间。 */
.ws-toc-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 7;
  width: 30px;
  transition: width 160ms ease;
}

.ws-toc-drawer.open,
.ws-toc-drawer:focus-within {
  width: min(300px, calc(100% - var(--ws-space-4)));
}

.ws-toc-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: var(--ws-space-3) var(--ws-space-2);
  overflow-y: auto;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-3);
  opacity: 0;
  transform: translateX(-100%);
  transition: opacity 140ms ease, transform 160ms ease;
  pointer-events: none;
}

.ws-toc-drawer.open .ws-toc-panel,
.ws-toc-drawer:focus-within .ws-toc-panel {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.ws-toc-panel > strong {
  padding: var(--ws-space-1) var(--ws-space-2) var(--ws-space-2);
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-toc-panel button {
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

.ws-toc-panel button.sub {
  padding-left: var(--ws-space-6);
  font-size: var(--ws-text-xs);
}

.ws-toc-panel button:hover {
  color: var(--ws-accent);
  background: var(--ws-surface-alt);
}

.ws-toc-panel button.active {
  color: var(--ws-accent);
  border-left-color: var(--ws-accent);
  background: var(--ws-accent-soft);
  font-weight: var(--ws-weight-semibold);
}

.ws-toc-edge {
  position: absolute;
  top: var(--ws-space-4);
  left: 0;
  z-index: 2;
  display: grid;
  width: 30px;
  height: 44px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-left: 0;
  border-radius: 0 var(--ws-radius-md) var(--ws-radius-md) 0;
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-1);
  place-items: center;
  cursor: pointer;
  transition: left 160ms ease, color 140ms ease, border-color 140ms ease;
}

.ws-toc-drawer.open .ws-toc-edge,
.ws-toc-drawer:focus-within .ws-toc-edge {
  left: 100%;
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-toc-edge:hover,
.ws-toc-edge:focus-visible {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  outline: none;
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
  flex: 1 1 auto;
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

  .ws-manual-add-chat span,
  .ws-manual-edit span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ws-toc-drawer,
  .ws-toc-panel,
  .ws-toc-edge {
    transition: none;
  }
}
</style>
