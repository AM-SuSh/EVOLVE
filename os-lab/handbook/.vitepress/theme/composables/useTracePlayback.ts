import { computed, ref, watch, type Ref } from 'vue'

/**
 * 教学 trace 事件（trace-v1 schema 子集，前端只消费真实事件，不伪造）。
 */
export interface TraceEvent {
  v: 1
  seq: number
  ts: number
  cpu: number
  pid: number
  tid: number
  type: 'trap_enter' | 'task_switch'
  cause?: string
  from?: string
  to?: string
  reason?: string
}

export type TraceView = 'trap' | 'timeline'

export interface TraceFilter {
  types: Set<'trap_enter' | 'task_switch'>
  pids: Set<number>
}

export const TRACE_PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const
const BASE_STEP_MS = 700

/**
 * trace 播放状态机：playhead / playing / speed / filter / step / reset / 定时器。
 *
 * 不持有事件数据本身，只接收外部传入的已过滤事件引用，避免与 fetch 耦合。
 * 切换 runId 或过滤条件变化时由调用方 reset。
 */
export function useTracePlayback(events: Ref<TraceEvent[]>) {
  const playhead = ref(0)
  const playing = ref(false)
  const speed = ref<(typeof TRACE_PLAYBACK_SPEEDS)[number]>(1)
  let timer: number | null = null

  const atEnd = computed(() => events.value.length === 0 || playhead.value >= events.value.length - 1)
  const current = computed<TraceEvent | null>(() => events.value[playhead.value] || null)

  function clearTimer() {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  function play() {
    if (events.value.length === 0) return
    if (atEnd.value) playhead.value = 0
    playing.value = true
    clearTimer()
    timer = window.setInterval(() => {
      if (atEnd.value) {
        stop()
        return
      }
      playhead.value += 1
    }, BASE_STEP_MS / speed.value)
  }

  function stop() {
    playing.value = false
    clearTimer()
  }

  function toggle() {
    if (playing.value) stop()
    else play()
  }

  function stepForward() {
    stop()
    if (!atEnd.value) playhead.value += 1
  }

  function stepBack() {
    stop()
    if (playhead.value > 0) playhead.value -= 1
  }

  function seek(index: number) {
    stop()
    const clamped = Math.max(0, Math.min(index, events.value.length - 1))
    playhead.value = clamped
  }

  function reset() {
    stop()
    playhead.value = 0
  }

  function setSpeed(value: (typeof TRACE_PLAYBACK_SPEEDS)[number]) {
    speed.value = value
    if (playing.value) {
      // 重新按新速度启动定时器。
      play()
    }
  }

  // 事件列表变化（新 runId / 过滤）时回到起点，避免越界。
  watch(
    () => events.value,
    () => reset(),
  )

  return {
    playhead,
    playing,
    speed,
    current,
    atEnd,
    play,
    stop,
    toggle,
    stepForward,
    stepBack,
    seek,
    reset,
    setSpeed,
  }
}

/**
 * 按 type / pid 过滤 trace 事件，保持原顺序（不允许前端重排）。
 */
export function filterTraceEvents(events: TraceEvent[], filter: TraceFilter): TraceEvent[] {
  return events.filter((event) => {
    if (filter.types.size > 0 && !filter.types.has(event.type)) return false
    if (filter.pids.size > 0 && !filter.pids.has(event.pid)) return false
    return true
  })
}

/**
 * 收集 trace 中出现过的 pid，供过滤下拉使用。
 */
export function collectPids(events: TraceEvent[]): number[] {
  const set = new Set<number>()
  for (const event of events) set.add(event.pid)
  return [...set].sort((a, b) => a - b)
}

/**
 * 前端再校验一遍 trace 事件，防异常 trace 污染视图。
 * 与 contracts.mjs 的 validateTraceEvent 形态一致，但不依赖服务端。
 */
export function isValidTraceEvent(event: unknown): event is TraceEvent {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  if (e.v !== 1) return false
  if (!Number.isInteger(e.seq) || (e.seq as number) < 0) return false
  if (!Number.isInteger(e.ts) || (e.ts as number) < 0) return false
  if (!Number.isInteger(e.pid) || (e.pid as number) < 0) return false
  if (e.type !== 'trap_enter' && e.type !== 'task_switch') return false
  if (e.type === 'trap_enter') return typeof e.cause === 'string' && e.cause.length > 0
  return typeof e.from === 'string' && typeof e.to === 'string' && typeof e.reason === 'string'
}

/**
 * trace 事件到源码锚点的静态映射（文件级；行号可后续按 cause/reason 细化）。
 * 对应 visualization/README.md「对应源码锚点」。
 */
export const TRACE_SOURCE_MAP: Record<TraceEvent['type'], { path: string; label: string }> = {
  trap_enter: { path: 'kernel/src/trap.rs', label: 'trap.rs' },
  task_switch: { path: 'kernel/src/task.rs', label: 'task.rs' },
}

export function sourceAnchorFor(event: TraceEvent): { path: string; line: number } {
  const anchor = TRACE_SOURCE_MAP[event.type]
  return { path: anchor.path, line: 1 }
}

/**
 * 把一个事件或一段范围格式化为可插入实验报告的文本证据。
 */
export function formatTraceEvidence(
  event: TraceEvent,
  range?: { start: number; end: number },
): string {
  if (range && range.end > range.start) {
    return `[trace ${range.start}–${range.end}] 共 ${range.end - range.start + 1} 条事件，类型 ${event.type}，pid ${event.pid}`
  }
  if (event.type === 'trap_enter') {
    return `[trace #${event.seq}] trap_enter pid=${event.pid} cause=${event.cause || '?'} ts=${event.ts}`
  }
  return `[trace #${event.seq}] task_switch pid=${event.pid} ${event.from || '?'}→${event.to || '?'} reason=${event.reason || '?'} ts=${event.ts}`
}
