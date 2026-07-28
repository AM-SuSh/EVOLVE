<script setup lang="ts">
import { GitBranch } from 'lucide-vue-next'

/**
 * Trace 可信空态（第一周契约边界）。
 *
 * 交互稿（第 4–5 周接 trace-v1 API）：
 * Trace 查询 API 接入前不展示 mock 或预设动画；后续事件必须与 runId 绑定。
 */
defineProps<{
  runId?: string
  labId?: string
}>()
</script>

<template>
  <section class="ws-trace" aria-label="运行轨迹">
    <div class="ws-trace-empty" role="status">
      <GitBranch :size="20" aria-hidden="true" />
      <strong>{{ runId ? '本次运行没有可展示的轨迹' : '尚未采集运行轨迹' }}</strong>
      <p v-if="runId" class="ws-trace-note">
        已关联运行 <code>{{ runId }}</code>，但轨迹查询接口尚未返回真实事件；这里不会播放预设动画。
      </p>
      <p v-else class="ws-trace-note">
        完成可信运行后，此处只展示与运行绑定的 <code>trap_enter</code> 和 <code>task_switch</code> 事件。
      </p>
    </div>
  </section>
</template>

<style scoped>
.ws-trace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--ws-space-3);
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-trace-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ws-space-2);
  margin: auto;
  max-width: 36ch;
  color: var(--ws-ink-faint);
  text-align: center;
  line-height: var(--ws-leading-normal);
}

.ws-trace-empty strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.ws-trace-note {
  margin: 0;
  color: var(--ws-ink-muted);
}

.ws-trace-note code {
  font-family: var(--ws-font-mono);
}

</style>
