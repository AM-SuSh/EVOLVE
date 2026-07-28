<script setup lang="ts">
import { GitBranch } from 'lucide-vue-next'

/**
 * Trace 可视化面板（第一周占位）。
 *
 * 交互稿（第 4–5 周接 trace-v1 API）：
 * - 按 runId 加载 JSONL 事件流
 * - 播放/暂停/单步/过滤/源码跳转
 * - 关键帧可插入实验报告
 */
defineProps<{
  runId?: string
  labId?: string
}>()
</script>

<template>
  <section class="ws-trace" aria-label="运行轨迹">
    <div v-if="!runId" class="ws-trace-empty">
      <GitBranch :size="20" aria-hidden="true" />
      <p>完成一次可信运行后，Trap、调度或页表 trace 将在此回放。</p>
      <p class="ws-trace-note">当前为占位视图；trace 事件需绑定 <code>runId</code> 并由内核 <code>trace-edu</code> 输出。</p>
    </div>
    <div v-else class="ws-trace-waiting">
      <p>已关联运行 <code>{{ runId }}</code></p>
      <p class="ws-trace-note">第 4–5 周将在此展示时间线与状态机；Lab <code>{{ labId }}</code> 的 trace 映射见 lab 包 <code>visualizations/trace-map.yaml</code>。</p>
      <div class="ws-trace-timeline" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
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

.ws-trace-empty,
.ws-trace-waiting {
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

.ws-trace-note {
  margin: 0;
  color: var(--ws-ink-muted);
}

.ws-trace-note code {
  font-family: var(--ws-font-mono);
}

.ws-trace-timeline {
  display: flex;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-3);
}

.ws-trace-timeline span {
  width: 48px;
  height: 4px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-line);
  animation: ws-trace-pulse 1.4s ease-in-out infinite;
}

.ws-trace-timeline span:nth-child(2) {
  animation-delay: 0.2s;
}

.ws-trace-timeline span:nth-child(3) {
  animation-delay: 0.4s;
}

.ws-trace-timeline span:nth-child(4) {
  animation-delay: 0.6s;
}

@keyframes ws-trace-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
    background: var(--ws-accent);
  }
}
</style>
