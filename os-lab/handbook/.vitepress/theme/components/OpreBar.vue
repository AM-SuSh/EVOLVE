<script setup lang="ts">
/**
 * Trace 旁 OPRE 条（成员 A Day5 定稿文案）。
 * 无独立 API：按 view + labId 绑定静态步骤模板，经 insert-report 写入报告。
 */
import { computed } from 'vue'
import { FileText } from 'lucide-vue-next'

type TraceView = 'trap' | 'timeline'

interface OpreStep {
  key: string
  label: string
  hint: string
  template: string
}

const props = defineProps<{
  view: TraceView
  hasEvents: boolean
  labId?: string
}>()

const emit = defineEmits<{
  (event: 'insert-report', text: string): void
}>()

const COPY = {
  title: '观察 → 预测 → 运行 → 解释',
  hint: '每步写一句即可；可用「插入报告」写入过程记录。',
  emptyTrace: '当前 run 无可用 trace。可先看输出断言，或换一次带 trace 的可信运行。',
  degraded: '视图未就绪：请按降级说明用源码/输出完成，并在报告注明。',
}

const LAB2_TRAP: OpreStep[] = [
  {
    key: 'observe',
    label: '观察',
    hint: '数一数本次 trap_enter',
    template: '【观察】本次 run 中 trap_enter 约 ___ 条。（run:___）',
  },
  {
    key: 'predict',
    label: '预测',
    hint: 'Yield×5 时 trap 会多于 5 吗？',
    template: '【预测】我认为 trap_enter ___（会/不会）明显多于 5，因为 ___。',
  },
  {
    key: 'run',
    label: '运行',
    hint: '使用可信 Lab2（含 trace）',
    template: '【运行】已执行受信验证；断言结果：___。',
  },
  {
    key: 'explain',
    label: '解释',
    hint: '区分 ecall 与其它 trap',
    template: '【解释】多出来的 trap 可能来自 ___；若无法区分，记「未观察到」。',
  },
]

const LAB2_TIMELINE: OpreStep[] = [
  {
    key: 'observe',
    label: '观察',
    hint: '对齐第 1/5 次 Yield 与 task_switch',
    template: '【观察】第 1 次与第 5 次 Yield round 邻近的 task_switch：___。',
  },
  {
    key: 'predict',
    label: '预测',
    hint: '若 yield→Exited，时间线会怎样',
    template: '【预测】若让出被标成退出，我会看到 ___。',
  },
  {
    key: 'run',
    label: '运行',
    hint: '对比未修 vs 已修（或失败 artifact）',
    template: '【运行】对比结果：Yield 行数 ___ → ___。',
  },
  {
    key: 'explain',
    label: '解释',
    hint: '让出 ≠ 退出',
    template: '【解释】状态机上 yield 应进入 ___ 而非 ___；证据是 ___。',
  },
]

const LAB3_DEGRADED_TEMPLATE = `【页表-降级】阅读 mm.rs 映射；预测去 U 位后果：___；
用断言确认未破坏用户程序：___；标注：视图未就绪，源码降级。`

const mode = computed(() => {
  const labId = String(props.labId || '').toLowerCase()
  if (labId === 'lab2') return props.view === 'timeline' ? 'lab2-timeline' : 'lab2-trap'
  if (labId === 'lab3') return 'lab3-degraded'
  return 'generic'
})

const steps = computed<OpreStep[]>(() => {
  if (mode.value === 'lab2-trap') return LAB2_TRAP
  if (mode.value === 'lab2-timeline') return LAB2_TIMELINE
  return []
})

const taskLabel = computed(() => {
  if (mode.value === 'lab2-trap') return 'T-OPRE-1 · Trap'
  if (mode.value === 'lab2-timeline') return 'S-OPRE-1 · 时间线'
  if (mode.value === 'lab3-degraded') return 'P-OPRE-1 · 降级'
  return 'OPRE'
})

function insert(template: string) {
  emit('insert-report', template)
}
</script>

<template>
  <section class="opre-bar" aria-label="OPRE 观察预测运行解释">
    <header class="opre-bar-head">
      <strong>{{ COPY.title }}</strong>
      <span>{{ taskLabel }}</span>
    </header>
    <p class="opre-bar-hint">{{ COPY.hint }}</p>

    <p v-if="!hasEvents" class="opre-bar-empty" role="status">{{ COPY.emptyTrace }}</p>

    <template v-if="mode === 'lab3-degraded'">
      <p class="opre-bar-degraded">{{ COPY.degraded }}</p>
      <button type="button" class="opre-step-insert" @click="insert(LAB3_DEGRADED_TEMPLATE)">
        <FileText :size="12" aria-hidden="true" />
        插入降级模板
      </button>
    </template>

    <template v-else-if="steps.length">
      <ol class="opre-steps">
        <li v-for="step in steps" :key="step.key">
          <div>
            <strong>{{ step.label }}</strong>
            <span>{{ step.hint }}</span>
          </div>
          <button type="button" class="opre-step-insert" @click="insert(step.template)">
            <FileText :size="12" aria-hidden="true" />
            插入报告
          </button>
        </li>
      </ol>
    </template>

    <p v-else class="opre-bar-degraded">{{ COPY.degraded }}</p>
  </section>
</template>

<style scoped>
.opre-bar {
  flex: 0 0 auto;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.opre-bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ws-space-2);
}

.opre-bar-head strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.opre-bar-head span {
  color: var(--ws-ink-faint);
  font-size: 11px;
  font-family: var(--ws-font-mono);
}

.opre-bar-hint,
.opre-bar-empty,
.opre-bar-degraded {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.opre-bar-empty {
  color: #9a3412;
}

.opre-steps {
  display: grid;
  gap: var(--ws-space-1);
  margin: var(--ws-space-2) 0 0;
  padding: 0;
  list-style: none;
}

.opre-steps li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  padding: var(--ws-space-1) 0;
  border-top: 1px dashed var(--ws-line);
}

.opre-steps li:first-child {
  border-top: 0;
}

.opre-steps strong {
  display: block;
  color: var(--ws-ink);
  font-size: var(--ws-text-xs);
}

.opre-steps span {
  color: var(--ws-ink-muted);
  font-size: 11px;
}

.opre-step-insert {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft, transparent);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.opre-step-insert:hover {
  border-color: var(--ws-accent);
}

@media (max-width: 620px) {
  .opre-steps li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
