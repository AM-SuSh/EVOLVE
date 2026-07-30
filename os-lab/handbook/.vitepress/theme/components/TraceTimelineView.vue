<script setup lang="ts">
/**
 * 任务状态时间线（Lab2 主视图，泳道）。
 *
 * 每个出现过的 pid 一条横向泳道；x 轴为事件序号（不允许前端重排）。
 * task_switch 的 from→to 在对应 pid 泳道上画 Running 块，块延伸到下一条
 * task_switch（协作式调度同一时刻只有一个 Running）。trap_enter 在对应 pid
 * 泳道上画轻量竖线。两次 switch 之间的状态不伪造为 Ready/Exited，标注
 * 「未观测」，对应规格「禁止把协作式画成硬抢占」「禁止用动画掩盖空洞」。
 * 点击 Running 块或 trap 标记 → emit('select', index)。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { TraceEvent } from '../composables/useTracePlayback'

const props = defineProps<{
  events: TraceEvent[]
  playhead: number
}>()

const emit = defineEmits<{
  (event: 'select', index: number): void
}>()

const scrollRef = ref<HTMLElement | null>(null)

interface Lane {
  pid: number
  /** 该 pid 的 Running 区间：[startIndex, endIndexExclusive)。 */
  runningBlocks: Array<{ startIndex: number; endIndex: number }>
  /** 该 pid 的 trap_enter 事件索引。 */
  trapMarks: number[]
}

const LANE_HEIGHT = 28
const LANE_GAP = 6
const LEFT_PAD = 56
const RIGHT_PAD = 16
const TOP_PAD = 12
const BOTTOM_PAD = 12
const MIN_WIDTH = 240

const lanes = computed<Lane[]>(() => {
  const pidSet = new Set<number>()
  for (const event of props.events) pidSet.add(event.pid)
  const pids = [...pidSet].sort((a, b) => a - b)
  const byPid = new Map<number, Lane>()
  for (const pid of pids) {
    byPid.set(pid, { pid, runningBlocks: [], trapMarks: [] })
  }
  const switches = props.events.filter((e) => e.type === 'task_switch')
  switches.forEach((event, i) => {
    const lane = byPid.get(event.pid)
    if (!lane) return
    const startIndex = props.events.indexOf(event)
    const next = switches[i + 1]
    const endIndex = next ? props.events.indexOf(next) : props.events.length
    lane.runningBlocks.push({ startIndex, endIndex })
  })
  for (const [index, event] of props.events.entries()) {
    if (event.type === 'trap_enter') {
      byPid.get(event.pid)?.trapMarks.push(index)
    }
  }
  return pids.map((pid) => byPid.get(pid)!)
})

const totalEvents = computed(() => props.events.length)
const innerWidth = computed(() => Math.max(MIN_WIDTH, totalEvents.value * 8))
const svgWidth = computed(() => LEFT_PAD + innerWidth.value + RIGHT_PAD)
const svgHeight = computed(() => TOP_PAD + lanes.value.length * (LANE_HEIGHT + LANE_GAP) + BOTTOM_PAD)

function xForIndex(index: number): number {
  if (totalEvents.value <= 1) return LEFT_PAD
  return LEFT_PAD + (index / (totalEvents.value - 1)) * innerWidth.value
}

function yForLane(laneIndex: number): number {
  return TOP_PAD + laneIndex * (LANE_HEIGHT + LANE_GAP)
}

function blockStyle(block: { startIndex: number; endIndex: number }, laneIndex: number) {
  const x = xForIndex(block.startIndex)
  const xEnd = xForIndex(Math.min(block.endIndex - 1, totalEvents.value - 1))
  const width = Math.max(4, xEnd - x)
  return {
    left: `${x}px`,
    top: `${yForLane(laneIndex) + 4}px`,
    width: `${width}px`,
    height: `${LANE_HEIGHT - 8}px`,
  }
}

function trapStyle(index: number, laneIndex: number) {
  return {
    left: `${xForIndex(index) - 1}px`,
    top: `${yForLane(laneIndex) + 2}px`,
    height: `${LANE_HEIGHT - 4}px`,
  }
}

function playheadX() {
  return xForIndex(props.playhead)
}

function onSelect(index: number) {
  emit('select', index)
}

watch(
  () => props.playhead,
  async (index) => {
    await nextTick()
    const scroller = scrollRef.value
    if (!scroller) return
    const x = xForIndex(index)
    const left = scroller.scrollLeft
    const right = left + scroller.clientWidth
    const margin = Math.min(80, scroller.clientWidth * 0.25)
    if (x < left + margin || x > right - margin) {
      scroller.scrollTo({ left: Math.max(0, x - scroller.clientWidth / 2), behavior: 'smooth' })
    }
  },
)
</script>

<template>
  <section class="ws-trace-timeline" aria-label="任务状态时间线">
    <div v-if="events.length === 0" class="ws-trace-timeline-empty">
      本次运行没有 <code>task_switch</code> 事件。若未启用 <code>trace-edu</code> feature，重开 trace 后再查看。
    </div>
    <div v-else ref="scrollRef" class="ws-trace-timeline-scroll">
      <div class="ws-trace-timeline-canvas" :style="{ width: `${svgWidth}px`, height: `${svgHeight}px` }">
        <!-- 泳道标签与底纹 -->
        <div
          v-for="(lane, laneIndex) in lanes"
          :key="lane.pid"
          class="ws-trace-lane-bg"
          :style="{ top: `${yForLane(laneIndex)}px`, height: `${LANE_HEIGHT}px` }"
        >
          <span class="ws-trace-lane-label">pid {{ lane.pid }}</span>
        </div>

        <!-- trap_enter 标记 -->
        <button
          v-for="(mark, m) in lanes.flatMap((lane, i) => lane.trapMarks.map((idx) => ({ idx, i })))"
          :key="`trap-${mark.idx}-${m}`"
          type="button"
          class="ws-trace-trap-mark"
          :style="trapStyle(mark.idx, mark.i)"
          :title="`trap_enter @ #${events[mark.idx].seq}`"
          @click="onSelect(mark.idx)"
        />

        <!-- Running 块 -->
        <button
          v-for="(block, b) in lanes.flatMap((lane, i) => lane.runningBlocks.map((bk) => ({ bk, i, pid: lane.pid })))"
          :key="`run-${block.pid}-${b}`"
          type="button"
          class="ws-trace-running-block"
          :class="{ active: block.bk.startIndex === playhead }"
          :style="blockStyle(block.bk, block.i)"
          :title="`task_switch pid=${block.pid} → Running`"
          @click="onSelect(block.bk.startIndex)"
        >
          <span class="ws-trace-running-label">Running</span>
        </button>

        <!-- 未观测区段提示（在两个 Running 块之间） -->
        <template v-for="(lane, laneIndex) in lanes" :key="`gap-${lane.pid}`">
          <div
            v-if="lane.runningBlocks.length > 1"
            class="ws-trace-gap-note"
            :style="{ left: `${LEFT_PAD}px`, top: `${yForLane(laneIndex) + LANE_HEIGHT - 2}px`, width: `${innerWidth}px` }"
          >
            两次 Running 之间的 Ready/Exited 状态未在 trace 中显式记录，此处不伪造。
          </div>
        </template>

        <!-- 播放头竖线 -->
        <div class="ws-trace-playhead" :style="{ left: `${playheadX()}px`, top: `${TOP_PAD}px`, height: `${svgHeight - TOP_PAD - BOTTOM_PAD}px` }" />

        <!-- x 轴刻度 -->
        <div class="ws-trace-axis" :style="{ left: `${LEFT_PAD}px`, width: `${innerWidth}px` }">
          <span>事件 #0</span>
          <span>#{{ Math.max(0, totalEvents - 1) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ws-trace-timeline {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-trace-timeline-empty {
  margin: auto;
  max-width: 40ch;
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  text-align: center;
  line-height: var(--ws-leading-normal);
}

.ws-trace-timeline-empty code {
  font-family: var(--ws-font-mono);
}

.ws-trace-timeline-scroll {
  overflow: auto;
  padding: var(--ws-space-2);
}

.ws-trace-timeline-canvas {
  position: relative;
  min-width: 100%;
}

.ws-trace-lane-bg {
  position: absolute;
  left: 0;
  width: 100%;
  border-bottom: 1px dashed var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-trace-lane-label {
  position: absolute;
  left: var(--ws-space-2);
  top: 50%;
  transform: translateY(-50%);
  color: var(--ws-ink-muted);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
}

.ws-trace-trap-mark {
  position: absolute;
  width: 2px;
  padding: 0;
  border: 0;
  background: var(--ws-accent);
  opacity: 0.55;
  cursor: pointer;
}

.ws-trace-trap-mark:hover {
  opacity: 1;
}

.ws-trace-running-block {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--ws-space-1);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  color: var(--ws-ink);
  font: inherit;
  font-family: var(--ws-font-mono);
  font-size: 10px;
  cursor: pointer;
  overflow: hidden;
}

.ws-trace-running-block:hover {
  background: var(--ws-accent);
  color: var(--ws-accent-contrast);
}

.ws-trace-running-block.active {
  outline: 2px solid var(--ws-accent);
  outline-offset: 1px;
}

.ws-trace-running-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-trace-gap-note {
  position: absolute;
  color: var(--ws-ink-faint);
  font-size: 10px;
  font-family: var(--ws-font-base, inherit);
  pointer-events: none;
  padding-left: var(--ws-space-2);
}

.ws-trace-playhead {
  position: absolute;
  width: 2px;
  background: var(--ws-danger, #c0392b);
  pointer-events: none;
}

.ws-trace-axis {
  position: absolute;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  color: var(--ws-ink-faint);
  font-family: var(--ws-font-mono);
  font-size: 10px;
}

@media (max-width: 620px) {
  .ws-trace-gap-note {
    display: none;
  }
}
</style>
