<script setup lang="ts">
/**
 * Trap 分层时序图（Lab2 主视图）。
 *
 * 纵向时间轴按 trace 事件顺序排列（不允许前端重排）；trap_enter 为主标记，
 * task_switch 作为上下文标记。两次 trap_enter 之间若无 task_switch，标注
 * 「单任务 syscall 密集」提示（对应 visualization/README.md 教学问题 3）。
 * 点击事件 → emit('select', index) 由父组件 seek 并联动事件列表/源码跳转。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDownToLine, Info, Repeat } from 'lucide-vue-next'
import type { TraceEvent } from '../composables/useTracePlayback'

const props = defineProps<{
  events: TraceEvent[]
  /** 当前播放头在 events 中的索引。 */
  playhead: number
}>()

const emit = defineEmits<{
  (event: 'select', index: number): void
}>()

const listRef = ref<HTMLOListElement | null>(null)

interface TrapRow {
  index: number
  event: TraceEvent
  /** 自上一 trap_enter 起是否出现过 task_switch。 */
  hasSwitchSinceLastTrap: boolean
}

const rows = computed<TrapRow[]>(() => {
  const list: TrapRow[] = []
  let sawSwitchSinceLastTrap = true
  props.events.forEach((event, index) => {
    if (event.type === 'task_switch') {
      sawSwitchSinceLastTrap = true
      list.push({ index, event, hasSwitchSinceLastTrap: true })
      return
    }
    list.push({ index, event, hasSwitchSinceLastTrap: sawSwitchSinceLastTrap })
    sawSwitchSinceLastTrap = false
  })
  return list
})

/** 仅 trap_enter 行，用于「连续 trap 无 switch」提示。 */
const trapRows = computed(() => rows.value.filter((row) => row.event.type === 'trap_enter'))

/** 标记需要「单任务 syscall 密集」提示的 trap_enter 索引。 */
const denseTrapIndices = computed(() => {
  const set = new Set<number>()
  for (let i = 1; i < trapRows.value.length; i += 1) {
    const prev = trapRows.value[i - 1]
    const cur = trapRows.value[i]
    if (!cur.hasSwitchSinceLastTrap) {
      set.add(cur.index)
    }
    // 第一条若没有前置 switch 也标记。
    if (i === 1 && !prev.hasSwitchSinceLastTrap) set.add(prev.index)
  }
  return set
})

function isSyscall(cause: string | undefined): boolean {
  return Boolean(cause && /syscall|ecall/i.test(cause))
}

function onRow(index: number) {
  emit('select', index)
}

watch(
  () => props.playhead,
  async (index) => {
    await nextTick()
    const el = listRef.value?.querySelector<HTMLElement>(`[data-trace-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  },
)
</script>

<template>
  <section class="ws-trace-trap" aria-label="Trap 时序">
    <div v-if="rows.length === 0" class="ws-trace-trap-empty">
      当前筛选下没有事件。
    </div>
    <ol v-else ref="listRef" class="ws-trace-trap-list" role="list">
      <li
        v-for="row in rows"
        :key="row.event.seq"
        :data-trace-index="row.index"
        :class="[
          'ws-trace-row',
          row.event.type,
          { active: row.index === playhead, dense: denseTrapIndices.has(row.index) },
        ]"
      >
        <button type="button" class="ws-trace-row-btn" @click="onRow(row.index)">
          <span class="ws-trace-seq">#{{ row.event.seq }}</span>
          <span class="ws-trace-icon" :aria-hidden="true">
            <ArrowDownToLine v-if="row.event.type === 'trap_enter'" :size="14" />
            <Repeat v-else :size="14" />
          </span>
          <span class="ws-trace-kind">
            <template v-if="row.event.type === 'trap_enter'">进入内核</template>
            <template v-else>任务切换</template>
          </span>
          <span class="ws-trace-pid">任务 {{ row.event.pid }}</span>
          <span v-if="row.event.type === 'trap_enter'" class="ws-trace-cause" :class="{ syscall: isSyscall(row.event.cause) }">
            {{ row.event.cause === 'user_ecall' ? '系统调用 · user_ecall' : (row.event.cause || '原因未知') }}
          </span>
          <span v-else class="ws-trace-switch">
            {{ row.event.from }} → {{ row.event.to }} · {{ row.event.reason === 'scheduler' ? '调度器' : row.event.reason }}
          </span>
          <span class="ws-trace-ts">ts {{ row.event.ts }}</span>
        </button>
        <p v-if="denseTrapIndices.has(row.index)" class="ws-trace-dense-note">
          <Info :size="12" aria-hidden="true" />
          这两次进入内核之间没有任务切换，仍是同一个任务在运行。
        </p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ws-trace-trap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: auto;
  font-size: var(--ws-text-xs);
  font-family: var(--ws-font-mono);
}

.ws-trace-trap-empty {
  margin: auto;
  max-width: 40ch;
  padding: var(--ws-space-3);
  color: var(--ws-ink-faint);
  text-align: center;
  line-height: var(--ws-leading-normal);
  font-family: var(--ws-font-base, inherit);
}

.ws-trace-trap-empty code {
  font-family: var(--ws-font-mono);
}

.ws-trace-trap-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ws-trace-row {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-1);
}

.ws-trace-row-btn {
  display: grid;
  grid-template-columns: auto auto auto auto 1fr auto;
  align-items: center;
  gap: var(--ws-space-2);
  width: 100%;
  padding: var(--ws-space-1) var(--ws-space-2);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  color: var(--ws-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ws-trace-row-btn:hover {
  background: var(--ws-surface-alt);
}

.ws-trace-row.active .ws-trace-row-btn {
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-trace-row.trap_enter {
  border-left: 3px solid var(--ws-accent);
}

.ws-trace-row.task_switch {
  border-left: 3px solid var(--ws-line);
  color: var(--ws-ink-muted);
}

.ws-trace-seq {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-trace-icon {
  display: inline-flex;
  color: var(--ws-ink-muted);
}

.ws-trace-row.trap_enter .ws-trace-icon {
  color: var(--ws-accent);
}

.ws-trace-kind {
  font-weight: var(--ws-weight-semibold);
}

.ws-trace-pid {
  color: var(--ws-ink-muted);
}

.ws-trace-cause {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-trace-cause.syscall {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
}

.ws-trace-switch {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ws-ink-muted);
}

.ws-trace-ts {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.ws-trace-dense-note {
  margin: 0 0 0 calc(var(--ws-space-2) + 3px);
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-warn);
  font-family: var(--ws-font-base, inherit);
  font-size: var(--ws-text-xs);
}

@media (max-width: 620px) {
  .ws-trace-row-btn {
    grid-template-columns: auto auto auto 1fr;
    grid-template-areas:
      'seq icon kind pid'
      'cause cause cause cause'
      'ts ts ts ts';
  }
  .ws-trace-seq {
    grid-area: seq;
  }
  .ws-trace-icon {
    grid-area: icon;
  }
  .ws-trace-kind {
    grid-area: kind;
  }
  .ws-trace-pid {
    grid-area: pid;
  }
  .ws-trace-cause,
  .ws-trace-switch {
    grid-area: cause;
  }
  .ws-trace-ts {
    grid-area: ts;
  }
}
</style>
