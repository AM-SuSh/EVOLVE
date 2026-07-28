<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import ProblemsPanel from './ProblemsPanel.vue'
import TracePanel from './TracePanel.vue'

export type DockTab = 'terminal' | 'problems' | 'trace' | 'tests'

const props = withDefaults(
  defineProps<{
    activeTab: DockTab
    runId?: string
    labId?: string
    maximized?: boolean
    /** 底部面板高度占工作台比例（桌面端） */
    heightPercent?: number
  }>(),
  { heightPercent: 28 },
)

const emit = defineEmits<{
  (event: 'update:activeTab', tab: DockTab): void
  (event: 'update:heightPercent', value: number): void
  (event: 'toggle-max'): void
}>()

const DOCK_MIN = 18
const DOCK_MAX = 55

const resizing = ref(false)
const localHeight = computed({
  get: () => props.heightPercent,
  set: (value) => emit('update:heightPercent', value),
})

const tabs: { id: DockTab; label: string }[] = [
  { id: 'terminal', label: '终端' },
  { id: 'problems', label: 'Problems' },
  { id: 'trace', label: 'Trace' },
  { id: 'tests', label: '测试结果' },
]

function selectTab(tab: DockTab) {
  emit('update:activeTab', tab)
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  resizing.value = true
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('ws-dock-resizing')
}

function moveResize(event: PointerEvent) {
  if (!resizing.value) return
  const workspace = document.querySelector('.ws-workspace')
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  const fromBottom = rect.bottom - event.clientY
  const percent = (fromBottom / rect.height) * 100
  localHeight.value = Math.min(DOCK_MAX, Math.max(DOCK_MIN, percent))
}

function finishResize(event?: PointerEvent) {
  if (!resizing.value) return
  resizing.value = false
  document.documentElement.classList.remove('ws-dock-resizing')
  if (event) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('os-lab-dock-height', String(localHeight.value))
  }
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove('ws-dock-resizing')
})
</script>

<template>
  <section
    class="ws-bottom-dock"
    :class="{ 'ws-dock-max': maximized, 'ws-dock-resizing': resizing }"
    :style="{ '--ws-dock-height': `${heightPercent}%` }"
  >
    <div
      class="ws-dock-resizer"
      role="separator"
      aria-label="调整底部面板高度"
      aria-orientation="horizontal"
      tabindex="0"
      title="拖动调整底部面板高度"
      @pointerdown="startResize"
      @pointermove="moveResize"
      @pointerup="finishResize"
      @pointercancel="finishResize"
      @lostpointercapture="finishResize"
    >
      <span aria-hidden="true" />
    </div>

    <div class="ws-dock-tabs" role="tablist" aria-label="运行与诊断">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
      <button
        type="button"
        class="ws-dock-max-btn"
        :title="maximized ? '恢复布局' : '放大底部面板'"
        :aria-label="maximized ? '恢复布局' : '放大底部面板'"
        @click="emit('toggle-max')"
      >
        {{ maximized ? '恢复' : '放大' }}
      </button>
    </div>

    <div class="ws-dock-body">
      <div v-show="activeTab === 'terminal'" class="ws-dock-pane">
        <slot name="terminal" />
      </div>
      <ProblemsPanel v-show="activeTab === 'problems'" :run-id="runId" />
      <TracePanel v-show="activeTab === 'trace'" :run-id="runId" :lab-id="labId" />
      <div v-show="activeTab === 'tests'" class="ws-dock-pane ws-dock-tests">
        <p v-if="!runId">运行可信验证命令后，断言结果将汇总在此。</p>
        <p v-else>最近一次运行 <code>{{ runId }}</code> 的断言详情见终端状态栏与实验报告证据。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ws-bottom-dock {
  display: grid;
  grid-template-rows: 6px auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-dock-resizer {
  display: grid;
  height: 6px;
  cursor: row-resize;
  touch-action: none;
  place-items: center;
  background: var(--ws-surface-alt);
}

.ws-dock-resizer span {
  width: 52px;
  height: 3px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-line-strong, var(--ws-line));
}

.ws-dock-resizer:hover span,
.ws-dock-resizing .ws-dock-resizer span {
  background: var(--ws-accent);
}

.ws-dock-tabs {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  padding: var(--ws-space-1) var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-dock-tabs button {
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-dock-tabs button:hover,
.ws-dock-tabs button.active {
  color: var(--ws-accent);
}

.ws-dock-tabs button.active {
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.ws-dock-max-btn {
  margin-left: auto;
  margin-bottom: var(--ws-space-1);
  font-size: var(--ws-text-xs) !important;
}

.ws-dock-body {
  min-height: 0;
  overflow: hidden;
}

.ws-dock-pane {
  display: grid;
  height: 100%;
  min-height: 0;
}

.ws-dock-tests {
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-dock-tests code {
  font-family: var(--ws-font-mono);
}

.ws-dock-max {
  position: fixed;
  top: var(--ws-topbar-height);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  box-shadow: var(--ws-shadow-3);
}

:global(html.ws-dock-resizing),
:global(html.ws-dock-resizing *) {
  cursor: row-resize !important;
  user-select: none !important;
}
</style>
