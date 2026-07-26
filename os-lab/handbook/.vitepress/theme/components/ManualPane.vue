<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { BookOpen, ExternalLink, TableOfContents } from 'lucide-vue-next'
import { collapsedSectionPrefix, sectionPrefixOf, type TutorLab } from '../tutor-model'

/**
 * 实验手册栏。
 *
 * 正文由 VitePress 在构建期通过 @include 并入 /learn/labN，再作为 <slot/> 传进来，
 * 因此这里拿到的是完整 markdown 管线的产物：shiki 高亮、mermaid、锚点、容器全部原生可用。
 * 本组件负责两件事：观测学生读到哪一节（供导师上下文），提供左侧可折叠目录。
 */
const props = defineProps<{ lab: TutorLab }>()

const emit = defineEmits<{
  (event: 'section-change', payload: { h2: string; h3: string }): void
}>()

interface ManualSection {
  id: string
  title: string
  level: number
  prefix: string
  el: HTMLElement
}

const route = useRoute()
const scroller = ref<HTMLElement>()
const docRoot = ref<HTMLElement>()
const sections = ref<ManualSection[]>([])
const activeIndex = ref(0)
const promptSectionCollapsed = ref(true)
const tocOpen = ref(false)

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
  () => nextTick(indexSections),
)

onMounted(async () => {
  await nextTick()
  indexSections()
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
      <a
        class="ws-manual-open-full"
        :href="lab.documentRoute"
        target="_blank"
        rel="noopener"
        title="在新标签打开完整手册"
      >
        <ExternalLink :size="15" aria-hidden="true" />
        <span>完整手册</span>
      </a>

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
        <slot />
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

.ws-manual-open-full {
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
  font-size: var(--ws-text-sm);
  text-decoration: none;
}

.ws-manual-open-full:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

/* -- 正文 ------------------------------------------------------------------ */
.ws-manual-scroll {
  min-height: 0;
  padding: var(--ws-space-6) var(--ws-space-6) var(--ws-space-8);
  overflow-y: auto;
  scroll-behavior: smooth;
}

@media (max-width: 900px) {
  .ws-manual-scroll {
    padding: var(--ws-space-4) var(--ws-space-4) var(--ws-space-6);
  }

  .ws-manual-open-full span {
    display: none;
  }
}
</style>
