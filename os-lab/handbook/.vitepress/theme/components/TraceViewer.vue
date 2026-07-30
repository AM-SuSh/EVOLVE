<script setup lang="ts">
/**
 * Trace Viewer 容器（第 4-5 周）。
 *
 * - 按 runId 调 `GET /runs/:id/trace` 拉取真实 trace 事件；404/异常保持可信空态，不 mock。
 * - 视图切换：Trap 时序图 / 任务状态时间线（默认 Trap，Lab2 主视图）。
 * - 播放控制：播放/暂停、单步、速度、类型/pid 过滤、重置。
 * - 事件列表：>200 条时只渲染窗口，避免大数据卡顿。
 * - 选中事件详情：「跳到源码」「插入报告」。
 * - 上报 `trace_inspected` 事件（切换视图或移动 playhead 时）。
 *
 * 与成员 C 契约：接口未就绪时 unavailable=true，文案明确「查询接口尚未返回真实事件」。
 */
import { computed, ref, watch } from 'vue'
import { GitBranch, Play, Pause, SkipForward, SkipBack, RotateCcw, Code2, FileText } from 'lucide-vue-next'
import { authHeaders } from '../tutor-model'
import {
  useTracePlayback,
  filterTraceEvents,
  collectPids,
  isValidTraceEvent,
  sourceAnchorFor,
  formatTraceEvidence,
  TRACE_PLAYBACK_SPEEDS,
  type TraceEvent,
  type TraceView,
} from '../composables/useTracePlayback'
import TraceTrapView from './TraceTrapView.vue'
import TraceTimelineView from './TraceTimelineView.vue'

const props = defineProps<{
  runId?: string
  labId?: string
  endpoint?: string
}>()

const emit = defineEmits<{
  (event: 'jump', payload: { path: string; line: number }): void
  (event: 'insert-report', text: string): void
  (event: 'trace-inspected', payload: { runId: string; view: TraceView; eventRange: { start: number; end: number } }): void
}>()

const allEvents = ref<TraceEvent[]>([])
const loading = ref(false)
const loaded = ref(false)
const unavailable = ref(false)
const fetchError = ref('')

const view = ref<TraceView>('trap')
const filterTypes = ref(new Set<'trap_enter' | 'task_switch'>())
const filterPids = ref(new Set<number>())

const filteredEvents = computed(() => {
  if (filterTypes.value.size === 0 && filterPids.value.size === 0) return allEvents.value
  return filterTraceEvents(allEvents.value, { types: filterTypes.value, pids: filterPids.value })
})

const playback = useTracePlayback(filteredEvents)
const pids = computed(() => collectPids(allEvents.value))

const EVENT_LIST_CAP = 200
const listEvents = computed(() => filteredEvents.value.slice(0, EVENT_LIST_CAP))
const listTruncated = computed(() => filteredEvents.value.length > EVENT_LIST_CAP)
const currentEvent = computed<TraceEvent | null>(() => playback.current.value)

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

function onJumpSource() {
  const event = currentEvent.value
  if (!event) return
  emit('jump', sourceAnchorFor(event))
}

function onInsertReport() {
  const event = currentEvent.value
  if (!event) return
  emit('insert-report', formatTraceEvidence(event))
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
  if (!props.runId) return { kind: 'no-run', title: '尚未采集运行轨迹', note: '完成可信运行后，此处只展示与运行绑定的 trap_enter 和 task_switch 事件。' }
  if (loading.value) return { kind: 'loading', title: '正在加载轨迹…', note: '' }
  if (unavailable.value) return { kind: 'unavailable', title: '本次运行没有可展示的轨迹', note: fetchError.value || '已关联运行，但轨迹查询接口尚未返回真实事件；这里不会播放预设动画。' }
  if (allEvents.value.length === 0) return { kind: 'empty', title: '本次运行没有 trace 事件', note: '若未启用 trace-edu feature，重开 trace 后再查看。' }
  return { kind: 'empty', title: '', note: '' }
})

const hasEvents = computed(() => allEvents.value.length > 0)
</script>

<template>
  <section class="ws-trace-viewer" aria-label="运行轨迹">
    <div v-if="!hasEvents" class="ws-trace-empty" role="status">
      <GitBranch :size="20" aria-hidden="true" />
      <strong>{{ emptyState.title }}</strong>
      <p v-if="emptyState.note" class="ws-trace-note">{{ emptyState.note }}</p>
      <p v-if="runId && unavailable" class="ws-trace-note">运行 ID：<code>{{ runId }}</code></p>
    </div>

    <template v-else>
      <header class="ws-trace-toolbar">
        <div class="ws-trace-toolbar-row">
          <div class="ws-trace-view-switch" role="tablist" aria-label="trace 视图">
            <button type="button" role="tab" :aria-selected="view === 'trap'" :class="{ active: view === 'trap' }" @click="view = 'trap'">Trap 时序</button>
            <button type="button" role="tab" :aria-selected="view === 'timeline'" :class="{ active: view === 'timeline' }" @click="view = 'timeline'">任务时间线</button>
          </div>
          <span class="ws-trace-count">共 {{ allEvents.length }} 条 · 显示 {{ filteredEvents.length }}</span>
        </div>

        <div class="ws-trace-toolbar-row ws-trace-filters">
          <span class="ws-trace-filter-label">类型</span>
          <button type="button" :class="['ws-trace-chip', { on: filterTypes.size === 0 || filterTypes.has('trap_enter') }]" @click="toggleType('trap_enter')">trap_enter</button>
          <button type="button" :class="['ws-trace-chip', { on: filterTypes.size === 0 || filterTypes.has('task_switch') }]" @click="toggleType('task_switch')">task_switch</button>
          <template v-if="pids.length > 1">
            <span class="ws-trace-filter-label">pid</span>
            <button v-for="pid in pids" :key="pid" type="button" :class="['ws-trace-chip', { on: filterPids.size === 0 || filterPids.has(pid) }]" @click="togglePid(pid)">{{ pid }}</button>
          </template>
          <button type="button" class="ws-trace-chip ws-trace-reset" @click="resetFilter">
            <RotateCcw :size="12" aria-hidden="true" /> 重置
          </button>
        </div>

        <div class="ws-trace-toolbar-row ws-trace-controls">
          <button type="button" class="ws-trace-ctrl" :disabled="playback.atEnd.value && !playback.playing.value" @click="playback.toggle()">
            <component :is="playback.playing.value ? Pause : Play" :size="14" aria-hidden="true" />
            <span>{{ playback.playing.value ? '暂停' : '播放' }}</span>
          </button>
          <button type="button" class="ws-trace-ctrl" :disabled="playback.playhead === 0" @click="playback.stepBack()">
            <SkipBack :size="14" aria-hidden="true" />
          </button>
          <button type="button" class="ws-trace-ctrl" :disabled="playback.atEnd.value" @click="playback.stepForward()">
            <SkipForward :size="14" aria-hidden="true" />
          </button>
          <label class="ws-trace-speed">
            速度
            <select :value="playback.speed.value" @change="playback.setSpeed(Number(($event.target as HTMLSelectElement).value) as 0.5 | 1 | 2 | 4)">
              <option v-for="s in TRACE_PLAYBACK_SPEEDS" :key="s" :value="s">{{ s }}x</option>
            </select>
          </label>
          <span class="ws-trace-pos">#{{ playback.playhead }} / {{ Math.max(0, filteredEvents.length - 1) }}</span>
        </div>
      </header>

      <div class="ws-trace-body">
        <TraceTrapView v-if="view === 'trap'" :events="filteredEvents" :playhead="playback.playhead.value" @select="onSelect" />
        <TraceTimelineView v-else :events="filteredEvents" :playhead="playback.playhead.value" @select="onSelect" />
      </div>

      <footer v-if="currentEvent" class="ws-trace-detail">
        <div class="ws-trace-detail-head">
          <strong>#{{ currentEvent.seq }}</strong>
          <span class="ws-trace-detail-type">{{ currentEvent.type }}</span>
          <span class="ws-trace-detail-pid">pid {{ currentEvent.pid }}</span>
          <span class="ws-trace-detail-ts">ts {{ currentEvent.ts }}</span>
        </div>
        <dl class="ws-trace-detail-body">
          <template v-if="currentEvent.type === 'trap_enter'">
            <div><dt>cause</dt><dd>{{ currentEvent.cause || '?' }}</dd></div>
          </template>
          <template v-else>
            <div><dt>from</dt><dd>{{ currentEvent.from || '?' }}</dd></div>
            <div><dt>to</dt><dd>{{ currentEvent.to || '?' }}</dd></div>
            <div><dt>reason</dt><dd>{{ currentEvent.reason || '?' }}</dd></div>
          </template>
        </dl>
        <div class="ws-trace-detail-actions">
          <button type="button" class="ws-trace-action" @click="onJumpSource">
            <Code2 :size="14" aria-hidden="true" /> 跳到源码
          </button>
          <button type="button" class="ws-trace-action" @click="onInsertReport">
            <FileText :size="14" aria-hidden="true" /> 插入报告
          </button>
        </div>
      </footer>

      <details class="ws-trace-list-wrap">
        <summary>事件列表（{{ filteredEvents.length }}）</summary>
        <ol class="ws-trace-list">
          <li v-for="(event, index) in listEvents" :key="event.seq" :class="{ active: index === playback.playhead.value }">
            <button type="button" @click="onSelect(index)">
              <span class="ws-trace-list-seq">#{{ event.seq }}</span>
              <span class="ws-trace-list-type">{{ event.type }}</span>
              <span class="ws-trace-list-pid">pid {{ event.pid }}</span>
              <span v-if="event.type === 'trap_enter'" class="ws-trace-list-field">{{ event.cause }}</span>
              <span v-else class="ws-trace-list-field">{{ event.from }}→{{ event.to }}</span>
              <span class="ws-trace-list-ts">ts {{ event.ts }}</span>
            </button>
          </li>
        </ol>
        <p v-if="listTruncated" class="ws-trace-list-trunc">
          事件过多，仅渲染前 {{ EVENT_LIST_CAP }} 条；用过滤或播放控制查看其余。
        </p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.ws-trace-viewer { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: var(--ws-text-xs); }
.ws-trace-empty { display: flex; flex-direction: column; align-items: center; gap: var(--ws-space-2); margin: auto; max-width: 36ch; padding: var(--ws-space-3); color: var(--ws-ink-faint); text-align: center; line-height: var(--ws-leading-normal); }
.ws-trace-empty strong { color: var(--ws-ink); font-size: var(--ws-text-sm); }
.ws-trace-note { margin: 0; color: var(--ws-ink-muted); }
.ws-trace-note code { font-family: var(--ws-font-mono); }
.ws-trace-toolbar { display: flex; flex-direction: column; gap: var(--ws-space-2); padding: var(--ws-space-2) var(--ws-space-3); border-bottom: 1px solid var(--ws-line); background: var(--ws-surface); }
.ws-trace-toolbar-row { display: flex; align-items: center; gap: var(--ws-space-2); flex-wrap: wrap; }
.ws-trace-view-switch { display: inline-flex; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-md); overflow: hidden; }
.ws-trace-view-switch button { padding: var(--ws-space-1) var(--ws-space-2); background: transparent; color: var(--ws-ink-muted); border: 0; border-right: 1px solid var(--ws-line); font: inherit; font-size: var(--ws-text-xs); cursor: pointer; }
.ws-trace-view-switch button:last-child { border-right: 0; }
.ws-trace-view-switch button.active { background: var(--ws-accent-soft); color: var(--ws-accent); font-weight: var(--ws-weight-semibold); }
.ws-trace-count { color: var(--ws-ink-faint); font-family: var(--ws-font-mono); }
.ws-trace-filter-label { color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-trace-chip { display: inline-flex; align-items: center; gap: var(--ws-space-1); padding: var(--ws-space-1) var(--ws-space-2); border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink-muted); font: inherit; font-size: var(--ws-text-xs); cursor: pointer; }
.ws-trace-chip.on { border-color: var(--ws-accent); color: var(--ws-accent); background: var(--ws-accent-soft); }
.ws-trace-reset { color: var(--ws-ink-faint); }
.ws-trace-controls { gap: var(--ws-space-2); }
.ws-trace-ctrl { display: inline-flex; align-items: center; gap: var(--ws-space-1); padding: var(--ws-space-1) var(--ws-space-2); border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink); font: inherit; font-size: var(--ws-text-xs); cursor: pointer; }
.ws-trace-ctrl:disabled { opacity: 0.45; cursor: not-allowed; }
.ws-trace-ctrl:hover:not(:disabled) { border-color: var(--ws-accent); color: var(--ws-accent); }
.ws-trace-speed { display: inline-flex; align-items: center; gap: var(--ws-space-1); color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-trace-speed select { padding: var(--ws-space-1) var(--ws-space-1); border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); background: var(--ws-surface); color: var(--ws-ink); font: inherit; font-size: var(--ws-text-xs); }
.ws-trace-pos { margin-left: auto; color: var(--ws-ink-faint); font-family: var(--ws-font-mono); }
.ws-trace-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.ws-trace-detail { border-top: 1px solid var(--ws-line); padding: var(--ws-space-2) var(--ws-space-3); background: var(--ws-surface-alt); }
.ws-trace-detail-head { display: flex; align-items: center; gap: var(--ws-space-2); flex-wrap: wrap; font-family: var(--ws-font-mono); }
.ws-trace-detail-head strong { color: var(--ws-accent); }
.ws-trace-detail-type { padding: 0 var(--ws-space-1); border: 1px solid var(--ws-line); border-radius: var(--ws-radius-sm); color: var(--ws-ink-muted); }
.ws-trace-detail-pid { color: var(--ws-ink-muted); }
.ws-trace-detail-ts { margin-left: auto; color: var(--ws-ink-faint); }
.ws-trace-detail-body { display: flex; flex-wrap: wrap; gap: var(--ws-space-3); margin: var(--ws-space-1) 0 0; }
.ws-trace-detail-body div { display: flex; align-items: baseline; gap: var(--ws-space-1); }
.ws-trace-detail-body dt { color: var(--ws-ink-faint); font-family: var(--ws-font-mono); }
.ws-trace-detail-body dd { margin: 0; color: var(--ws-ink); font-family: var(--ws-font-mono); }
.ws-trace-detail-actions { display: flex; gap: var(--ws-space-2); margin-top: var(--ws-space-2); }
.ws-trace-action { display: inline-flex; align-items: center; gap: var(--ws-space-1); padding: var(--ws-space-1) var(--ws-space-2); border: 1px solid var(--ws-accent); border-radius: var(--ws-radius-sm); background: var(--ws-accent-soft); color: var(--ws-accent); font: inherit; font-size: var(--ws-text-xs); cursor: pointer; }
.ws-trace-action:hover { background: var(--ws-accent); color: var(--ws-accent-contrast); }
.ws-trace-list-wrap { border-top: 1px solid var(--ws-line); }
.ws-trace-list-wrap summary { padding: var(--ws-space-1) var(--ws-space-3); cursor: pointer; color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-trace-list { list-style: none; margin: 0; max-height: 180px; overflow: auto; padding: 0 var(--ws-space-2); font-family: var(--ws-font-mono); }
.ws-trace-list li { border-bottom: 1px solid var(--ws-line); }
.ws-trace-list li.active { background: var(--ws-accent-soft); }
.ws-trace-list button { display: grid; grid-template-columns: auto auto auto 1fr auto; gap: var(--ws-space-2); width: 100%; padding: var(--ws-space-1) var(--ws-space-2); background: transparent; border: 0; color: var(--ws-ink); font: inherit; font-size: var(--ws-text-xs); text-align: left; cursor: pointer; }
.ws-trace-list-seq { color: var(--ws-ink-faint); }
.ws-trace-list-type { color: var(--ws-accent); }
.ws-trace-list-pid { color: var(--ws-ink-muted); }
.ws-trace-list-field { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-trace-list-ts { color: var(--ws-ink-faint); }
.ws-trace-list-trunc { margin: 0; padding: var(--ws-space-2); color: var(--ws-ink-faint); font-size: var(--ws-text-xs); }
@media (max-width: 620px) {
  .ws-trace-controls { gap: var(--ws-space-1); }
  .ws-trace-pos { margin-left: 0; width: 100%; }
  .ws-trace-list button { grid-template-columns: auto auto 1fr; }
  .ws-trace-list-pid, .ws-trace-list-ts { grid-column: span 1; }
}
</style>
