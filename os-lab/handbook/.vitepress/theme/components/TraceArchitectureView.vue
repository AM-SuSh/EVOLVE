<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Cpu, GitBranch, Layers3, Radio, Zap } from 'lucide-vue-next'
import type { TraceEvent } from '../composables/useTracePlayback'

const props = defineProps<{
  events: TraceEvent[]
  playhead: number
  speed: 0.5 | 1 | 2 | 4
}>()

const emit = defineEmits<{
  (event: 'select', index: number): void
}>()

const NODE = {
  tasks: { x: 118, y: 188 },
  trap: { x: 350, y: 188 },
  handler: { x: 548, y: 188 },
  scheduler: { x: 752, y: 112 },
  cpu: { x: 752, y: 282 },
}

const event = computed(() => props.events[props.playhead] || null)
const eventKind = computed(() => event.value?.type || 'idle')
const activePid = computed(() => event.value?.pid ?? null)
const taskPids = computed(() => {
  const ids = new Set<number>()
  for (const item of props.events) if (Number.isInteger(item.pid)) ids.add(item.pid)
  return [...ids].sort((a, b) => a - b)
})

const taskRows = computed(() => {
  const rows = taskPids.value.slice(0, 4)
  return rows.map((pid, index) => ({ pid, y: 145 + index * 38 }))
})

const packet = computed(() => {
  if (!event.value) return { x: NODE.tasks.x, y: NODE.tasks.y }
  if (event.value.type === 'trap_enter') return { x: NODE.handler.x, y: NODE.handler.y }
  return { x: NODE.scheduler.x, y: NODE.scheduler.y }
})

const eventTitle = computed(() => {
  if (!event.value) return '等待一条 TRACE 事件'
  if (event.value.type === 'trap_enter') {
    return event.value.cause === 'user_ecall' ? `任务 ${event.value.pid} 发起系统调用` : `任务 ${event.value.pid} 进入内核`
  }
  return `调度器把 CPU 交给任务 ${event.value.pid}`
})

const eventMeaning = computed(() => {
  if (!event.value) return '播放或单步查看一次可信运行，观察数据如何穿过用户态与内核态。'
  if (event.value.type === 'trap_enter') {
    return event.value.cause === 'user_ecall'
      ? '用户程序通过 ecall 请求内核服务，控制权跨过边界进入 trap handler。'
      : `CPU 因 ${event.value.cause || '未知原因'} 离开用户态，进入内核处理路径。`
  }
  return `调度器依据 ${event.value.reason || '当前调度原因'} 选择下一个运行任务，发生 ${event.value.from || '?'} → ${event.value.to || '?' } 的交接。`
})

const activePath = computed(() => eventKind.value === 'trap_enter' ? 'trap' : eventKind.value === 'task_switch' ? 'switch' : 'idle')
const progress = computed(() => props.events.length > 1 ? props.playhead / (props.events.length - 1) : 0)
const motionDuration = computed(() => `${Math.max(110, 520 / props.speed)}ms`)
const cpuLabel = computed(() => {
  if (!event.value || event.value.type !== 'task_switch') return '当前运行'
  return `任务 ${event.value.pid} · ${event.value.to || 'Running'}`
})

function taskLabel(pid: number) {
  return `任务 ${pid}`
}

function eventLabel(item: TraceEvent, index: number) {
  return item.type === 'trap_enter'
    ? `事件 ${index + 1}：任务 ${item.pid} 进入内核`
    : `事件 ${index + 1}：任务 ${item.pid} 任务切换`
}

function isActiveTask(pid: number) {
  return activePid.value === pid
}
</script>

<template>
  <section v-if="props.events.length === 0" class="ws-trace-architecture ws-trace-architecture--empty" aria-live="polite">
    <GitBranch :size="20" aria-hidden="true" />
    <strong>当前筛选没有事件</strong>
    <p>取消一个事件类型或 PID 筛选后，再查看架构中的数据流。</p>
  </section>

  <section v-else class="ws-trace-architecture" aria-label="TRACE 内核架构流动图">
    <div class="ws-architecture-stage">
      <div class="ws-architecture-stage-head">
        <div>
          <span class="ws-architecture-kicker">运行机制</span>
          <h3>一次 TRACE，怎样穿过系统</h3>
        </div>
        <div class="ws-architecture-legend" aria-label="图例">
          <span><i class="legend-dot legend-dot--trap" />进入内核</span>
          <span><i class="legend-dot legend-dot--switch" />任务切换</span>
          <span><i class="legend-dot legend-dot--active" />当前事件</span>
        </div>
      </div>

      <div class="ws-architecture-canvas-wrap">
        <svg class="ws-architecture-canvas" viewBox="0 0 930 420" role="img" :aria-label="eventMeaning">
          <defs>
            <marker id="trace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>

          <rect class="arch-zone arch-zone--user" x="26" y="42" width="292" height="284" rx="8" />
          <rect class="arch-zone arch-zone--kernel" x="318" y="42" width="586" height="284" rx="8" />
          <line class="arch-boundary" x1="318" y1="42" x2="318" y2="326" />
          <text class="arch-zone-label" x="48" y="70">用户态</text>
          <text class="arch-zone-label" x="342" y="70">内核态</text>
          <text class="arch-boundary-label" x="318" y="347" text-anchor="middle">权限边界</text>

          <path class="arch-link" :class="{ active: activePath === 'trap' }" d="M210 188 H328" marker-end="url(#trace-arrow)" />
          <path class="arch-link" :class="{ active: activePath === 'trap' }" d="M372 188 H526" marker-end="url(#trace-arrow)" />
          <path class="arch-link" :class="{ active: activePath === 'switch' }" d="M590 188 C660 188 682 112 724 112" marker-end="url(#trace-arrow)" />
          <path class="arch-link arch-link--vertical" :class="{ active: activePath === 'switch' }" d="M752 138 V256" marker-end="url(#trace-arrow)" />
          <path class="arch-link arch-link--return" :class="{ active: activePath === 'switch' }" d="M724 282 H620 C598 282 590 242 590 218" marker-end="url(#trace-arrow)" />

          <g class="arch-node arch-node--task" :class="{ active: activePath === 'trap' && activePid !== null }" transform="translate(48 102)">
            <rect width="164" height="172" rx="8" />
            <text class="arch-node-title" x="16" y="28">任务池</text>
            <text class="arch-node-subtitle" x="16" y="48">用户程序请求 CPU</text>
            <g v-for="row in taskRows" :key="row.pid" class="arch-task-row" :class="{ active: isActiveTask(row.pid) }" :transform="`translate(12 ${row.y - 102})`" @click="emit('select', props.playhead)">
              <circle cx="9" cy="0" r="5" />
              <text x="22" y="4">{{ taskLabel(row.pid) }}</text>
            </g>
            <text v-if="taskPids.length > 4" class="arch-muted" x="16" y="158">+ {{ taskPids.length - 4 }} 个任务</text>
          </g>

          <g class="arch-node arch-node--trap" :class="{ active: activePath === 'trap' }" transform="translate(328 158)">
            <rect width="44" height="60" rx="8" />
            <Radio :size="18" x="13" y="9" aria-hidden="true" />
            <text x="22" y="47" text-anchor="middle">trap</text>
          </g>

          <g class="arch-node arch-node--handler" :class="{ active: activePath === 'trap' }" transform="translate(526 158)">
            <rect width="130" height="60" rx="8" />
            <Layers3 :size="18" x="14" y="11" aria-hidden="true" />
            <text x="43" y="28">内核处理</text>
            <text class="arch-node-small" x="43" y="46">trap handler</text>
          </g>

          <g class="arch-node arch-node--scheduler" :class="{ active: activePath === 'switch' }" transform="translate(686 82)">
            <rect width="132" height="60" rx="8" />
            <GitBranch :size="18" x="14" y="11" aria-hidden="true" />
            <text x="43" y="28">调度器</text>
            <text class="arch-node-small" x="43" y="46">选择下一个任务</text>
          </g>

          <g class="arch-node arch-node--cpu" :class="{ active: activePath === 'switch' }" transform="translate(686 252)">
            <rect width="132" height="60" rx="8" />
            <Cpu :size="18" x="14" y="11" aria-hidden="true" />
            <text x="43" y="28">CPU</text>
            <text class="arch-node-small" x="43" y="46">{{ cpuLabel }}</text>
          </g>

          <g class="arch-packet" :class="`arch-packet--${activePath}`" :style="{ '--packet-x': `${packet.x}px`, '--packet-y': `${packet.y}px`, '--arch-motion-ms': motionDuration }">
            <circle r="12" />
            <Zap :size="14" x="-7" y="-7" aria-hidden="true" />
          </g>

          <g class="arch-current-callout" transform="translate(350 368)">
            <rect width="554" height="34" rx="6" />
            <text x="14" y="22">{{ eventTitle }}</text>
            <text x="536" y="22" text-anchor="end">{{ event ? `#${event.seq}` : '—' }}</text>
          </g>
        </svg>
      </div>

      <div class="ws-architecture-explanation">
        <div class="arch-explanation-icon" :class="`is-${activePath}`">
          <ArrowRight :size="17" aria-hidden="true" />
        </div>
        <p>{{ eventMeaning }}</p>
      </div>
    </div>

    <div class="ws-architecture-rail" aria-label="TRACE 事件轨道">
      <div class="ws-architecture-rail-head">
        <span>事件轨道</span>
        <span>{{ props.playhead + 1 }} / {{ props.events.length }}</span>
      </div>
      <div class="ws-architecture-rail-line">
        <button
          v-for="(item, index) in props.events"
          :key="item.seq"
          type="button"
          class="arch-event-marker"
          :class="[{ active: index === props.playhead }, `is-${item.type}`]"
          :style="{ left: `${progress === 0 ? 0 : (index / Math.max(1, props.events.length - 1)) * 100}%` }"
          :aria-label="eventLabel(item, index)"
          :title="eventLabel(item, index)"
          @click="emit('select', index)"
        >
          <span />
        </button>
        <div class="arch-event-progress" :style="{ width: `${progress * 100}%` }" />
      </div>
      <div class="ws-architecture-rail-labels">
        <span>开始</span>
        <span>真实事件顺序，不重新推断</span>
        <span>结束</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ws-trace-architecture { display: flex; flex-direction: column; gap: var(--ws-space-1); height: 100%; min-height: 0; overflow: hidden; padding: var(--ws-space-2); background: var(--ws-surface-alt); }
.ws-trace-architecture--empty { align-items: center; justify-content: center; min-height: 220px; color: var(--ws-ink-faint); text-align: center; }
.ws-trace-architecture--empty strong { color: var(--ws-ink); font-size: var(--ws-text-sm); }
.ws-trace-architecture--empty p { max-width: 40ch; margin: 0; color: var(--ws-ink-muted); line-height: 1.5; }
.ws-architecture-stage { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; border: 1px solid var(--ws-line); border-radius: var(--ws-radius-md); background: var(--ws-surface); overflow: hidden; }
.ws-architecture-stage-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ws-space-2); flex: 0 0 auto; padding: var(--ws-space-2) var(--ws-space-3); border-bottom: 1px solid var(--ws-line); }
.ws-architecture-kicker { color: var(--ws-accent); font-size: var(--ws-text-xs); font-weight: var(--ws-weight-semibold); text-transform: uppercase; }
.ws-architecture-stage h3 { margin: 3px 0 0; color: var(--ws-ink); font-size: var(--ws-text-base); }
.ws-architecture-legend { display: flex; flex-wrap: wrap; gap: var(--ws-space-3); color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-architecture-legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ws-ink-faint); }
.legend-dot--trap { background: var(--ws-accent); }
.legend-dot--switch { background: var(--ws-orange, #bd6b3a); }
.legend-dot--active { box-shadow: 0 0 0 3px var(--ws-accent-soft); background: var(--ws-accent); }
.ws-architecture-canvas-wrap { display: flex; flex: 1 1 auto; align-items: center; justify-content: center; min-height: 0; overflow: hidden; padding: var(--ws-space-1); }
.ws-architecture-canvas { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; }
.arch-zone { stroke-width: 1; }
.arch-zone--user { fill: color-mix(in srgb, var(--ws-accent-soft) 38%, transparent); stroke: color-mix(in srgb, var(--ws-accent) 28%, var(--ws-line)); }
.arch-zone--kernel { fill: color-mix(in srgb, var(--ws-surface-alt) 80%, var(--ws-accent-soft)); stroke: var(--ws-line); }
.arch-boundary { stroke: var(--ws-accent); stroke-width: 1.5; stroke-dasharray: 5 5; opacity: .7; }
.arch-zone-label { fill: var(--ws-ink-muted); font-size: 13px; font-weight: 700; letter-spacing: 0; }
.arch-boundary-label { fill: var(--ws-accent); font-size: 10px; }
.arch-link { fill: none; color: var(--ws-line-strong, #9aa5b1); stroke: currentColor; stroke-width: 2; marker-end: url(#trace-arrow); transition: color 260ms ease, stroke-width 260ms ease, opacity 260ms ease; opacity: .78; }
.arch-link.active { color: var(--ws-accent); stroke-width: 3.5; opacity: 1; }
.arch-link--return { color: var(--ws-line-strong, #9aa5b1); stroke-dasharray: 5 4; }
.arch-node rect { fill: var(--ws-surface-raised); stroke: var(--ws-line); stroke-width: 1.5; transition: stroke 220ms ease, fill 220ms ease, filter 220ms ease; }
.arch-node text { fill: var(--ws-ink); font-size: 12px; font-weight: 650; }
.arch-node .arch-node-title { font-size: 14px; }
.arch-node .arch-node-subtitle, .arch-node .arch-node-small, .arch-muted { fill: var(--ws-ink-muted); font-size: 10px; font-weight: 400; }
.arch-node--trap { color: var(--ws-accent); }
.arch-node--handler { color: var(--ws-accent); }
.arch-node--scheduler { color: var(--ws-orange, #bd6b3a); }
.arch-node--cpu { color: var(--ws-green, #3c8066); }
.arch-node :deep(svg) { color: currentColor; }
.arch-node.active rect { fill: var(--ws-accent-soft); stroke: var(--ws-accent); stroke-width: 2.5; filter: drop-shadow(0 3px 5px color-mix(in srgb, var(--ws-accent) 22%, transparent)); }
.arch-node--scheduler.active rect { fill: color-mix(in srgb, var(--ws-orange, #bd6b3a) 12%, var(--ws-surface-raised)); stroke: var(--ws-orange, #bd6b3a); }
.arch-node--cpu.active rect { fill: color-mix(in srgb, var(--ws-green, #3c8066) 12%, var(--ws-surface-raised)); stroke: var(--ws-green, #3c8066); }
.arch-task-row { pointer-events: none; }
.arch-task-row circle { fill: var(--ws-ink-faint); transition: fill 200ms ease, r 200ms ease; }
.arch-task-row text { fill: var(--ws-ink-muted); font-size: 11px; font-weight: 500; }
.arch-task-row.active circle { fill: var(--ws-accent); }
.arch-task-row.active text { fill: var(--ws-accent); font-weight: 700; }
.arch-packet { color: var(--ws-accent); pointer-events: none; transform: translate(var(--packet-x), var(--packet-y)); transition: transform var(--arch-motion-ms, 520ms) cubic-bezier(.22, .7, .22, 1); }
.arch-packet circle { fill: var(--ws-accent); stroke: var(--ws-surface); stroke-width: 3; filter: drop-shadow(0 2px 5px color-mix(in srgb, var(--ws-accent) 40%, transparent)); }
.arch-packet :deep(svg) { color: var(--ws-accent-contrast, #fff); }
.arch-packet--switch { color: var(--ws-orange, #bd6b3a); }
.arch-packet--switch circle { fill: var(--ws-orange, #bd6b3a); }
.arch-current-callout rect { fill: var(--ws-ink); }
.arch-current-callout text { fill: var(--ws-surface); font-size: 11px; }
.arch-current-callout text:last-child { fill: var(--ws-accent-soft); font-family: var(--ws-font-mono); }
.ws-architecture-explanation { display: flex; align-items: flex-start; gap: var(--ws-space-2); flex: 0 0 auto; padding: 0 var(--ws-space-3) var(--ws-space-2); }
.arch-explanation-icon { display: grid; flex: 0 0 auto; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--ws-accent); background: var(--ws-accent-soft); }
.arch-explanation-icon.is-switch { color: var(--ws-orange, #bd6b3a); background: color-mix(in srgb, var(--ws-orange, #bd6b3a) 14%, transparent); }
.ws-architecture-explanation p { margin: 3px 0 0; color: var(--ws-ink-muted); font-size: var(--ws-text-sm); line-height: 1.5; }
.ws-architecture-rail { flex: 0 0 auto; padding: var(--ws-space-1) var(--ws-space-3); border: 1px solid var(--ws-line); border-radius: var(--ws-radius-md); background: var(--ws-surface); }
.ws-architecture-rail-head, .ws-architecture-rail-labels { display: flex; justify-content: space-between; gap: var(--ws-space-2); color: var(--ws-ink-muted); font-size: var(--ws-text-xs); }
.ws-architecture-rail-head { color: var(--ws-ink); font-weight: 650; }
.ws-architecture-rail-line { position: relative; height: 28px; margin: 2px 8px 0; border-bottom: 2px solid var(--ws-line); }
.arch-event-progress { position: absolute; left: 0; bottom: -2px; height: 2px; background: var(--ws-accent); pointer-events: none; }
.arch-event-marker { position: absolute; bottom: -7px; z-index: 1; width: 16px; height: 16px; padding: 0; transform: translateX(-50%); border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.arch-event-marker span { display: block; width: 8px; height: 8px; margin: 4px; border-radius: 50%; background: var(--ws-ink-faint); transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.arch-event-marker.is-trap_enter span { background: var(--ws-accent); }
.arch-event-marker.is-task_switch span { background: var(--ws-orange, #bd6b3a); }
.arch-event-marker:hover span, .arch-event-marker.active span { transform: scale(1.45); box-shadow: 0 0 0 4px var(--ws-accent-soft); }
.arch-event-marker.active.is-task_switch span { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-orange, #bd6b3a) 18%, transparent); }
.ws-architecture-rail-labels { margin-top: var(--ws-space-2); color: var(--ws-ink-faint); }
.ws-architecture-rail-labels span:nth-child(2) { font-family: var(--ws-font-mono); }
@media (max-width: 620px) {
  .ws-trace-architecture { padding: var(--ws-space-1); }
  .ws-architecture-stage-head { align-items: flex-start; padding: var(--ws-space-1) var(--ws-space-2); }
  .ws-architecture-kicker, .ws-architecture-legend { display: none; }
  .ws-architecture-stage h3 { margin: 0; font-size: var(--ws-text-xs); }
  .ws-architecture-explanation { padding-inline: var(--ws-space-2); }
  .ws-architecture-rail-labels span:nth-child(2) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .arch-link, .arch-node rect, .arch-task-row circle, .arch-packet, .arch-event-marker span { transition: none; }
}
</style>
