<script setup lang="ts">
/**
 * Trace Viewer 容器（第 4-5 周）。
 *
 * - 按 runId 调 `GET /runs/:id/trace` 拉取真实 trace 事件；404/异常保持可信空态，不 mock。
 * - 视图切换：Trap 时序图 / 任务状态时间线（默认 Trap，Lab2 主视图）。
 * - 播放控制：播放/暂停、单步、速度、类型/pid 过滤、重置。
 * - 架构流动图内置当前事件说明和可点击事件轨道，避免重复堆叠文字列表。
 * - 当前事件可跳到对应源码。
 * - 上报 `trace_inspected` 事件（切换视图或移动 playhead 时）。
 *
 * 与成员 C 契约：接口未就绪时 unavailable=true，文案明确「查询接口尚未返回真实事件」。
 */
import { computed, ref, watch } from 'vue'
import { GitBranch, Play, Pause, SkipForward, SkipBack, RotateCcw, Code2 } from 'lucide-vue-next'
import { authHeaders } from '../tutor-model'
import {
  useTracePlayback,
  filterTraceEvents,
  collectPids,
  isValidTraceEvent,
  sourceAnchorFor,
  TRACE_PLAYBACK_SPEEDS,
  type TraceEvent,
  type TraceView,
} from '../composables/useTracePlayback'
import TraceTrapView from './TraceTrapView.vue'
import TraceTimelineView from './TraceTimelineView.vue'
import TraceArchitectureView from './TraceArchitectureView.vue'

const props = defineProps<{
  runId?: string
  endpoint?: string
}>()

const emit = defineEmits<{
  (event: 'jump', payload: { path: string; line: number }): void
  (event: 'trace-inspected', payload: { runId: string; view: TraceView; eventRange: { start: number; end: number } }): void
}>()

const allEvents = ref<TraceEvent[]>([])
const loading = ref(false)
const loaded = ref(false)
const unavailable = ref(false)
const fetchError = ref('')

const view = ref<TraceView>('architecture')
const filterTypes = ref(new Set<'trap_enter' | 'task_switch'>())
const filterPids = ref(new Set<number>())

const filteredEvents = computed(() => {
  if (filterTypes.value.size === 0 && filterPids.value.size === 0) return allEvents.value
  return filterTraceEvents(allEvents.value, { types: filterTypes.value, pids: filterPids.value })
})

const playback = useTracePlayback(filteredEvents)
const playheadIndex = computed(() => playback.playhead.value)
const isPlaying = computed(() => playback.playing.value)
const pids = computed(() => collectPids(allEvents.value))

const currentEvent = computed<TraceEvent | null>(() => playback.current.value)
const trapCount = computed(() => allEvents.value.filter((event) => event.type === 'trap_enter').length)
const switchCount = computed(() => allEvents.value.filter((event) => event.type === 'task_switch').length)

async function fetchTrace(runId: string) {
  loading.value = true
  unavailable.value = false
  fetchError.value = ''
  try {
    const base = String(props.endpoint || '').replace(/\/$/, '')
    const response = await fetch(`${base}/runs/${encodeURIComponent(runId)}/trace`, {
      headers: authHeaders(),
    })
    if (response.status === 404) {
      unavailable.value = true
      allEvents.value = []
      return
    }
    if (!response.ok) throw new Error(`status ${response.status}`)
    const payload = (await response.json()) as { events?: unknown[]; version?: number }
    const raw = Array.isArray(payload.events) ? payload.events : []
    allEvents.value = raw.filter(isValidTraceEvent)
  } catch (err) {
    unavailable.value = true
    fetchError.value = err instanceof Error ? err.message : String(err)
    allEvents.value = []
  } finally {
    loading.value = false
    loaded.value = true
  }
}

watch(
  () => props.runId,
  (runId) => {
    allEvents.value = []
    loaded.value = false
    filterTypes.value = new Set()
    filterPids.value = new Set()
    playback.reset()
    if (runId) void fetchTrace(runId)
  },
  { immediate: true },
)

let lastReportedView: TraceView | null = null
let lastReportedPlayhead = -1
watch(
  [view, playback.playhead, filteredEvents],
  ([nextView, nextPlayhead, events]) => {
    const list = events as TraceEvent[]
    if (!props.runId || list.length === 0) return
    const ph = nextPlayhead as number
    if (nextView === lastReportedView && ph === lastReportedPlayhead) return
    lastReportedView = nextView as TraceView
    lastReportedPlayhead = ph
    emit('trace-inspected', {
      runId: props.runId,
      view: nextView as TraceView,
      eventRange: { start: 0, end: Math.max(0, list.length - 1) },
    })
  },
)

function onSelect(index: number) {
  playback.seek(index)
}

/** 供导师证据引用跳转：定位到指定事件下标 / seq（无事件时为 no-op）。 */
defineExpose({
  seek: (index: number) => playback.seek(index),
  seekSeq: (seq: number) => {
    const index = filteredEvents.value.findIndex((item) => item.seq === seq)
    if (index >= 0) playback.seek(index)
  },
})

function onJumpSource() {
  const event = currentEvent.value
  if (!event) return
  emit('jump', sourceAnchorFor(event))
}

function toggleType(type: 'trap_enter' | 'task_switch') {
  const next = new Set(filterTypes.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  filterTypes.value = next
  playback.reset()
}

function togglePid(pid: number) {
  const next = new Set(filterPids.value)
  if (next.has(pid)) next.delete(pid)
  else next.add(pid)
  filterPids.value = next
  playback.reset()
}

function resetFilter() {
  filterTypes.value = new Set()
  filterPids.value = new Set()
  playback.reset()
}

const emptyState = computed<{ kind: 'no-run' | 'loading' | 'unavailable' | 'empty'; title: string; note: string }>(() => {
  if (!props.runId) {
    return {
      kind: 'no-run',
      title: '暂无 Trace',
      note: '先运行一次可信验证。',
    }
  }
  if (loading.value) return { kind: 'loading', title: '正在加载轨迹…', note: '' }
  if (unavailable.value) {
    return {
      kind: 'unavailable',
      title: '本次运行没有 Trace',
      note: fetchError.value || '请重新执行可信验证。',
    }
  }
  if (allEvents.value.length === 0) {
    return {
      kind: 'empty',
      title: '没有采集到运行事件',
      note: '请使用当前实验的可信验证命令重新运行。',
    }
  }
  return { kind: 'empty', title: '', note: '' }
})

const hasEvents = computed(() => allEvents.value.length > 0)
</script>

<template>
  <section class="ws-trace-viewer" aria-label="运行轨迹 Trace">
    <header class="ws-trace-overview">
      <div>
        <strong>Trace</strong>
        <span v-if="runId">最近一次可信运行</span>
      </div>
      <dl v-if="hasEvents" class="ws-trace-stats">
        <div><dt>进入内核</dt><dd>{{ trapCount }}</dd></div>
        <div><dt>任务切换</dt><dd>{{ switchCount }}</dd></div>
        <div><dt>任务数</dt><dd>{{ pids.length }}</dd></div>
      </dl>
    </header>

    <div v-if="!hasEvents" class="ws-trace-empty" role="status">
      <GitBranch :size="20" aria-hidden="true" />
      <strong>{{ emptyState.title }}</strong>
      <p v-if="emptyState.note" class="ws-trace-note">{{ emptyState.note }}</p>
      <p v-if="runId && unavailable" class="ws-trace-note">运行 ID：<code>{{ runId }}</code></p>
    </div>

    <template v-else>
      <header class="ws-trace-toolbar">
        <div class="ws-trace-toolbar-row ws-trace-toolbar-main">
          <div class="ws-trace-view-switch" role="tablist" aria-label="trace 视图">
            <button type="button" role="tab" :aria-selected="view === 'architecture'" :class="{ active: view === 'architecture' }" @click="view = 'architecture'">架构流动</button>
            <button type="button" role="tab" :aria-selected="view === 'trap'" :class="{ active: view === 'trap' }" @click="view = 'trap'">事件顺序</button>
            <button type="button" role="tab" :aria-selected="view === 'timeline'" :class="{ active: view === 'timeline' }" @click="view = 'timeline'">任务时间线</button>
          </div>
          <span class="ws-trace-count">{{ filteredEvents.length }}/{{ allEvents.length }}</span>
          <span class="ws-trace-filter-label">类型</span>
          <button type="button" :class="['ws-trace-chip', { on: filterTypes.size === 0 || filterTypes.has('trap_enter') }]" @click="toggleType('trap_enter')">进入内核</button>
          <button type="button" :class="['ws-trace-chip', { on: filterTypes.size === 0 || filterTypes.has('task_switch') }]" @click="toggleType('task_switch')">任务切换</button>
          <template v-if="pids.length > 1">
            <span class="ws-trace-filter-label">pid</span>
            <button v-for="pid in pids" :key="pid" type="button" :class="['ws-trace-chip', { on: filterPids.size === 0 || filterPids.has(pid) }]" @click="togglePid(pid)">{{ pid }}</button>
          </template>
          <button type="button" class="ws-trace-chip ws-trace-reset" @click="resetFilter">
            <RotateCcw :size="12" aria-hidden="true" /> 重置
          </button>
          <button type="button" class="ws-trace-ctrl ws-trace-icon-ctrl" :disabled="playback.atEnd.value && !isPlaying" :title="isPlaying ? '暂停' : '播放'" :aria-label="isPlaying ? '暂停' : '播放'" @click="playback.toggle()">
            <component :is="isPlaying ? Pause : Play" :size="14" aria-hidden="true" />
          </button>
          <button type="button" class="ws-trace-ctrl ws-trace-icon-ctrl" :disabled="playheadIndex === 0" title="上一步" aria-label="上一步" @click="playback.stepBack()">
            <SkipBack :size="14" aria-hidden="true" />
          </button>
          <button type="button" class="ws-trace-ctrl ws-trace-icon-ctrl" :disabled="playback.atEnd.value" title="下一步" aria-label="下一步" @click="playback.stepForward()">
            <SkipForward :size="14" aria-hidden="true" />
          </button>
          <label class="ws-trace-speed">
            速度
            <select :value="playback.speed.value" @change="playback.setSpeed(Number(($event.target as HTMLSelectElement).value) as 0.5 | 1 | 2 | 4)">
              <option v-for="s in TRACE_PLAYBACK_SPEEDS" :key="s" :value="s">{{ s }}x</option>
            </select>
          </label>
          <span class="ws-trace-pos">#{{ playheadIndex }} / {{ Math.max(0, filteredEvents.length - 1) }}</span>
          <button
            v-if="currentEvent"
            type="button"
            class="ws-trace-icon-ctrl"
            title="跳到源码"
            aria-label="跳到源码"
            @click="onJumpSource"
          >
            <Code2 :size="14" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="ws-trace-body">
        <TraceArchitectureView v-if="view === 'architecture'" :events="filteredEvents" :playhead="playheadIndex" :speed="playback.speed.value" @select="onSelect" />
        <TraceTrapView v-else-if="view === 'trap'" :events="filteredEvents" :playhead="playheadIndex" @select="onSelect" />
        <TraceTimelineView v-else :events="filteredEvents" :playhead="playheadIndex" @select="onSelect" />
      </div>

    </template>
  </section>
</template>

<style scoped>
.ws-trace-viewer { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: var(--ws-text-xs); }
.ws-trace-overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  flex: 0 0 auto;
  min-height: 36px;
  padding: var(--ws-space-1) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-raised);
}
.ws-trace-overview > div:first-child { display: flex; align-items: baseline; gap: var(--ws-space-2); }
.ws-trace-overview strong { color: var(--ws-ink); font-size: var(--ws-text-base); }
.ws-trace-overview > div:first-child span { color: var(--ws-ink-faint); font-size: var(--ws-text-xs); }
.ws-trace-stats { display: flex; gap: var(--ws-space-3); margin: 0; }
.ws-trace-stats div { display: flex; align-items: baseline; gap: 4px; }
.ws-trace-stats dt { color: var(--ws-ink-faint); font-size: 10px; }
.ws-trace-stats dd {
  margin: 0;
  color: var(--ws-ink);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}
.ws-trace-empty { display: flex; flex-direction: column; align-items: center; gap: var(--ws-space-2); margin: auto; max-width: 44ch; padding: var(--ws-space-3); color: var(--ws-ink-faint); text-align: center; line-height: var(--ws-leading-normal); }
.ws-trace-empty strong { color: var(--ws-ink); font-size: var(--ws-text-sm); }
.ws-trace-note { margin: 0; color: var(--ws-ink-muted); }
.ws-trace-note code { font-family: var(--ws-font-mono); }
.ws-trace-toolbar { flex: 0 0 auto; padding: var(--ws-space-1) var(--ws-space-2); border-bottom: 1px solid var(--ws-line); background: var(--ws-surface); }
.ws-trace-toolbar-row { display: flex; align-items: center; gap: var(--ws-space-1); }
.ws-trace-toolbar-main { flex-wrap: nowrap; min-width: 0; }
.ws-trace-view-switch { display: inline-flex; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); overflow: hidden; }
.ws-trace-view-switch button { min-height: 28px; padding: 3px var(--ws-space-2); background: transparent; color: var(--ws-ink-muted); border: 0; border-right: 1px solid var(--ws-line); font: inherit; font-size: var(--ws-text-xs); white-space: nowrap; cursor: pointer; }
.ws-trace-view-switch button:last-child { border-right: 0; }
.ws-trace-view-switch button.active { background: var(--ws-accent-soft); color: var(--ws-accent); font-weight: var(--ws-weight-semibold); }
.ws-trace-count { color: var(--ws-ink-faint); font-family: var(--ws-font-mono); white-space: nowrap; }
.ws-trace-filter-label { color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-trace-chip { display: inline-flex; align-items: center; gap: 3px; min-height: 28px; padding: 3px 7px; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink-muted); font: inherit; font-size: var(--ws-text-xs); white-space: nowrap; cursor: pointer; }
.ws-trace-chip.on { border-color: var(--ws-accent); color: var(--ws-accent); background: var(--ws-accent-soft); }
.ws-trace-reset { color: var(--ws-ink-faint); }
.ws-trace-ctrl { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink); font: inherit; cursor: pointer; }
.ws-trace-ctrl:disabled { opacity: 0.45; cursor: not-allowed; }
.ws-trace-ctrl:hover:not(:disabled) { border-color: var(--ws-accent); color: var(--ws-accent); }
.ws-trace-speed { display: inline-flex; align-items: center; gap: 3px; color: var(--ws-ink-muted); font-size: var(--ws-text-xs); white-space: nowrap; }
.ws-trace-speed select { height: 28px; padding: 2px 3px; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink); font: inherit; font-size: var(--ws-text-xs); }
.ws-trace-pos { margin-left: auto; color: var(--ws-ink-faint); font-family: var(--ws-font-mono); white-space: nowrap; }
.ws-trace-icon-ctrl { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink-muted); cursor: pointer; }
.ws-trace-icon-ctrl:hover { border-color: var(--ws-accent); color: var(--ws-accent); }
.ws-trace-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
@media (max-width: 900px) {
  .ws-trace-toolbar-main { flex-wrap: wrap; }
  .ws-trace-pos { margin-left: 0; }
}
@media (max-width: 620px) {
  .ws-trace-overview { padding-inline: var(--ws-space-2); }
  .ws-trace-overview > div:first-child span, .ws-trace-stats dt, .ws-trace-count, .ws-trace-filter-label { display: none; }
  .ws-trace-stats { gap: var(--ws-space-2); }
  .ws-trace-toolbar { overflow: hidden; }
  .ws-trace-view-switch button { padding-inline: 5px; }
  .ws-trace-chip { padding-inline: 5px; }
  .ws-trace-pos { display: none; }
}
</style>
