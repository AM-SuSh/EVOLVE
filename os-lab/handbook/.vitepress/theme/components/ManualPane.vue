<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
} from 'lucide-vue-next'
import EvidencePanel from './EvidencePanel.vue'
import {
  collapsedSectionPrefix,
  evidenceKindFor,
  sectionPrefixOf,
  stageManualSection,
  type LabJourneyItem,
  type TutorLab,
  type TutorStageId,
} from '../tutor-model'

/**
 * 实验手册栏。
 *
 * 正文由 VitePress 在构建期通过 @include 并入 /learn/labN，再作为 <slot/> 传进来，
 * 因此这里拿到的是完整 markdown 管线的产物：shiki 高亮、mermaid、锚点、容器全部原生可用。
 * 本组件只负责三件事：观测学生读到哪一节、按阶段把视线带到对应章节、就地收集学习证据。
 */
const props = defineProps<{
  lab: TutorLab
  activeStage: TutorStageId
  journeyItem: LabJourneyItem | undefined
}>()

const emit = defineEmits<{
  (event: 'section-change', payload: { h2: string; h3: string }): void
  (event: 'record-verification', payload: { content: string; passed: boolean }): void
  (event: 'submit-reflection', content: string): void
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
const evidenceOpen = ref(false)

let frame = 0

const evidenceKind = computed(() => evidenceKindFor(props.activeStage))
const evidenceSatisfied = computed(() =>
  evidenceKind.value === 'verification'
    ? Boolean(props.journeyItem?.passedVerification)
    : Boolean(props.journeyItem?.reflected),
)
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
const stageTarget = computed(() => stageManualSection[props.activeStage])
const evidenceLabel = computed(() =>
  evidenceKind.value === 'verification' ? '记录一次运行验证' : '完成这一层的学习复盘',
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
  // 首次进入不自动跳转：让学生从标题和「零、开始之前」自然读起。
  // 只有显式切换阶段时才把视线带到对应章节。
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

function scrollToStageSection(smooth = true) {
  const target = sections.value.find(
    (section) => section.level === 2 && section.prefix === stageTarget.value.prefix,
  )
  scrollToSection(target, smooth)
}

function step(delta: number) {
  const next = Math.min(Math.max(activeIndex.value + delta, 0), sections.value.length - 1)
  scrollToSection(sections.value[next])
}

function jumpTo(id: string) {
  scrollToSection(sections.value.find((section) => section.id === id))
}

watch(
  () => props.activeStage,
  () => {
    scrollToStageSection()
    // 进入需要留证据的阶段且尚未留下证据时，直接把面板展开，
    // 而不是等学生自己去找一个图标。
    evidenceOpen.value = Boolean(evidenceKind.value) && !evidenceSatisfied.value
  },
)

watch(
  () => route.path,
  () => nextTick(indexSections),
)

onMounted(async () => {
  await nextTick()
  indexSections()
  evidenceOpen.value = Boolean(evidenceKind.value) && !evidenceSatisfied.value
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
      <div class="ws-manual-where">
        <span><BookOpen :size="14" aria-hidden="true" />{{ lab.label }} · {{ lab.systemLayer }}</span>
        <strong>
          {{ activeH2?.title || lab.title }}
          <em v-if="activeH3">› {{ activeH3.title }}</em>
        </strong>
      </div>

      <div class="ws-manual-tools">
        <label class="ws-visually-hidden" for="ws-section-jump">跳转到章节</label>
        <select
          id="ws-section-jump"
          :value="activeSection?.id"
          @change="jumpTo(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="section in sections" :key="section.id" :value="section.id">
            {{ section.level === 3 ? '　' : '' }}{{ section.title }}
          </option>
        </select>
        <a
          :href="lab.documentRoute"
          target="_blank"
          rel="noopener"
          title="在新标签打开完整手册"
        >
          <ExternalLink :size="15" aria-hidden="true" />
          <span>完整手册</span>
        </a>
      </div>
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

    <div v-if="evidenceKind" class="ws-manual-evidence" :class="{ open: evidenceOpen }">
      <button
        class="ws-manual-evidence-toggle"
        type="button"
        :aria-expanded="evidenceOpen"
        @click="evidenceOpen = !evidenceOpen"
      >
        <span>
          本阶段要留下证据：{{ evidenceLabel }}
          <em v-if="evidenceSatisfied">已完成</em>
        </span>
        <ChevronDown v-if="evidenceOpen" :size="17" aria-hidden="true" />
        <ChevronUp v-else :size="17" aria-hidden="true" />
      </button>
      <div v-if="evidenceOpen" class="ws-manual-evidence-body">
        <EvidencePanel
          :kind="evidenceKind"
          :lab="lab"
          :verification-passed="Boolean(journeyItem?.passedVerification)"
          :reflected="Boolean(journeyItem?.reflected)"
          @record-verification="emit('record-verification', $event)"
          @submit-reflection="emit('submit-reflection', $event)"
        />
      </div>
    </div>

    <footer class="ws-manual-footer">
      <button type="button" :disabled="activeIndex === 0" @click="step(-1)">
        <ChevronLeft :size="15" aria-hidden="true" />上一节
      </button>
      <span>{{ activeIndex + 1 }} / {{ sections.length || 1 }}</span>
      <button
        type="button"
        :disabled="activeIndex >= sections.length - 1"
        @click="step(1)"
      >
        下一节<ChevronRight :size="15" aria-hidden="true" />
      </button>
    </footer>
  </section>
</template>

<style scoped>
.ws-manual-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* -- 工具条 ---------------------------------------------------------------- */
.ws-manual-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-4);
  min-width: 0;
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
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

.ws-manual-tools select {
  max-width: 200px;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  cursor: pointer;
}

.ws-manual-tools a {
  display: inline-flex;
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

.ws-manual-tools a:hover,
.ws-manual-tools select:hover {
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

/* -- 证据坞 ---------------------------------------------------------------- */
.ws-manual-evidence {
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-manual-evidence.open {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  max-height: 48vh;
}

.ws-manual-evidence-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  width: 100%;
  min-height: var(--ws-control-lg);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-accent);
  border: 0;
  border-left: 3px solid var(--ws-accent);
  background: var(--ws-accent-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  text-align: left;
  cursor: pointer;
}

.ws-manual-evidence-toggle em {
  margin-left: var(--ws-space-2);
  padding: 1px var(--ws-space-2);
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-ok);
  font-size: var(--ws-text-xs);
  font-style: normal;
}

.ws-manual-evidence-body {
  min-height: 0;
  padding: 0 var(--ws-space-6) var(--ws-space-5);
  overflow-y: auto;
}

.ws-manual-evidence-body :deep(.ws-evidence) {
  margin-top: var(--ws-space-4);
}

/* -- 章节导航 -------------------------------------------------------------- */
.ws-manual-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-manual-footer span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  font-variant-numeric: tabular-nums;
}

.ws-manual-footer button {
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
  font-size: var(--ws-text-sm);
  cursor: pointer;
}

.ws-manual-footer button:hover:not(:disabled) {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-manual-footer button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 900px) {
  .ws-manual-scroll {
    padding: var(--ws-space-4) var(--ws-space-4) var(--ws-space-6);
  }

  .ws-manual-tools select {
    max-width: 132px;
  }

  .ws-manual-tools a span {
    display: none;
  }

  .ws-manual-evidence-body {
    padding-inline: var(--ws-space-4);
  }
}
</style>
