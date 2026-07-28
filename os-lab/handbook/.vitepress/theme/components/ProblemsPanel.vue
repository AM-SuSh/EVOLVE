<script setup lang="ts">
import { FileWarning } from 'lucide-vue-next'

/**
 * Problems 可信空态（第一周契约边界）。
 *
 * 交互稿（第 2 周接 Cargo JSON 诊断 API）：
 * 真实诊断 API 接入前不展示 mock；后续列表必须与 runId 绑定。
 */
defineProps<{
  /** 最近一次可信运行的 ID，用于后续关联诊断 */
  runId?: string
}>()

</script>

<template>
  <section class="ws-problems" aria-label="问题列表">
    <div class="ws-problems-empty" role="status">
      <FileWarning :size="20" aria-hidden="true" />
      <strong>{{ runId ? '本次运行没有可用的编译诊断' : '尚未采集编译诊断' }}</strong>
      <p v-if="runId">
        已记录运行 <code>{{ runId }}</code>，但服务端尚未返回结构化诊断；这里不会显示推测或示例错误。
      </p>
      <p v-else>运行可信验证后，此处只展示与该次运行绑定的真实编译错误和警告。</p>
    </div>
  </section>
</template>

<style scoped>
.ws-problems {
  display: flex;
  height: 100%;
  min-height: 0;
  padding: var(--ws-space-3);
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-problems-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ws-space-2);
  max-width: 42ch;
  margin: auto;
  color: var(--ws-ink-faint);
  text-align: center;
  line-height: var(--ws-leading-normal);
}

.ws-problems-empty strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-problems-empty p {
  margin: 0;
}

.ws-problems-empty code {
  font-family: var(--ws-font-mono);
}
</style>
