<script setup lang="ts">
/**
 * 手册顶知识路径条（成员 A Day5 定稿文案）。
 * Lab2 展示五段路径；其它 Lab 隐藏（不造假路径）。
 */
import { computed, ref } from 'vue'

type KnowledgePathSegmentId =
  | 'prerequisite'
  | 'mechanism'
  | 'artifact'
  | 'evidence'
  | 'transfer'

interface PathSegment {
  id: KnowledgePathSegmentId
  label: string
  text: string
}

const props = defineProps<{
  labId?: string
  /** scaffold.variants[labId]，如 debug / fill / remedial */
  variant?: string
}>()

const emit = defineEmits<{
  (event: 'navigate', segment: KnowledgePathSegmentId): void
}>()

const LAB2_SEGMENTS: PathSegment[] = [
  { id: 'prerequisite', label: '先修', text: 'Lab1：裸机启动与 SBI 输出' },
  { id: 'mechanism', label: '本机制', text: 'Trap 进入/返回 · ecall 系统调用 · 协作式 yield 调度' },
  { id: 'artifact', label: '产物', text: '用户程序经 trap 陷入内核并在多任务间轮转' },
  { id: 'evidence', label: '必观证据', text: '输出断言四条；可选 trace：trap_enter、task_switch' },
  { id: 'transfer', label: '迁移', text: '对照抢占式时钟中断、虚拟机 Exit、异步运行时 yield' },
]

const visible = computed(() => String(props.labId || '').toLowerCase() === 'lab2')

const variantHint = computed(() => {
  const variant = String(props.variant || '').toLowerCase()
  if (variant === 'debug' || variant === 'remedial') {
    return '本变体焦点：让出 ≠ 退出（Yield×5）'
  }
  if (variant === 'fill') {
    return '本变体焦点：补全调度查找与 current 更新'
  }
  return ''
})

const activeId = ref<KnowledgePathSegmentId | null>(null)

function onSegment(segment: PathSegment) {
  activeId.value = segment.id
  emit('navigate', segment.id)
}
</script>

<template>
  <section v-if="visible" class="knowledge-path" aria-label="知识路径">
    <div class="knowledge-path-row">
      <button
        v-for="(segment, index) in LAB2_SEGMENTS"
        :key="segment.id"
        type="button"
        class="knowledge-path-seg"
        :class="{ active: activeId === segment.id }"
        :title="segment.text"
        @click="onSegment(segment)"
      >
        <span class="knowledge-path-label">{{ segment.label }}</span>
        <span class="knowledge-path-text">{{ segment.text }}</span>
        <span v-if="index < LAB2_SEGMENTS.length - 1" class="knowledge-path-arrow" aria-hidden="true">→</span>
      </button>
    </div>
    <p v-if="variantHint" class="knowledge-path-variant">{{ variantHint }}</p>
  </section>
</template>

<style scoped>
.knowledge-path {
  flex: 0 0 auto;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt, var(--ws-surface));
}

.knowledge-path-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 2px 0;
}

.knowledge-path-seg {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--ws-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.knowledge-path-seg:hover,
.knowledge-path-seg.active {
  background: var(--ws-accent-soft, color-mix(in srgb, var(--ws-accent) 12%, transparent));
}

.knowledge-path-label {
  color: var(--ws-accent);
  font-size: 11px;
  font-weight: var(--ws-weight-bold, 650);
  white-space: nowrap;
}

.knowledge-path-text {
  color: var(--ws-ink);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.knowledge-path-arrow {
  margin: 0 4px 0 2px;
  color: var(--ws-ink-faint);
  font-size: 11px;
}

.knowledge-path-variant {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-muted);
  font-size: 11px;
}

@media (max-width: 720px) {
  .knowledge-path-seg {
    width: 100%;
  }

  .knowledge-path-arrow {
    display: none;
  }
}
</style>
