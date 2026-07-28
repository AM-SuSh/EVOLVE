<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next'

/**
 * Problems 面板（第一周占位）。
 *
 * 交互稿（第 2 周接 Cargo JSON 诊断 API）：
 * - 列表展示编译错误/警告：级别、文件、行列、消息
 * - 点击条目 → Monaco revealLine 跳转
 * - 与 runId 关联，仅展示最近一次构建的诊断
 */
defineProps<{
  /** 最近一次可信运行的 ID，用于后续关联诊断 */
  runId?: string
}>()

const mockItems = [
  {
    id: 'demo-1',
    severity: 'error' as const,
    file: 'kernel/src/task.rs',
    line: 42,
    message: '示例：第 2 周将在此显示 cargo --message-format=json 解析结果',
  },
]
</script>

<template>
  <section class="ws-problems" aria-label="问题列表">
    <p v-if="!runId" class="ws-problems-empty">
      <AlertCircle :size="16" aria-hidden="true" />
      运行构建命令后，编译错误与警告将显示在这里。点击条目可跳转到编辑器对应行（第 2 周接入）。
    </p>
    <template v-else>
      <p class="ws-problems-hint">运行 <code>{{ runId }}</code> 的诊断占位（mock）：</p>
      <ul class="ws-problems-list">
        <li v-for="item in mockItems" :key="item.id" class="ws-problems-item" :data-severity="item.severity">
          <span class="ws-problems-sev">{{ item.severity === 'error' ? '错误' : '警告' }}</span>
          <span class="ws-problems-loc">{{ item.file }}:{{ item.line }}</span>
          <span class="ws-problems-msg">{{ item.message }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.ws-problems {
  min-height: 0;
  padding: var(--ws-space-3);
  overflow: auto;
  font-size: var(--ws-text-xs);
}

.ws-problems-empty {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-2);
  margin: 0;
  color: var(--ws-ink-faint);
  line-height: var(--ws-leading-normal);
}

.ws-problems-hint {
  margin: 0 0 var(--ws-space-2);
  color: var(--ws-ink-muted);
}

.ws-problems-hint code {
  font-family: var(--ws-font-mono);
}

.ws-problems-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-problems-item {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2);
  border-radius: var(--ws-radius-sm);
  cursor: default;
}

.ws-problems-item[data-severity='error'] .ws-problems-sev {
  color: var(--ws-danger);
}

.ws-problems-item:hover {
  background: var(--ws-surface-alt);
}

.ws-problems-loc {
  font-family: var(--ws-font-mono);
  color: var(--ws-accent);
}

.ws-problems-msg {
  color: var(--ws-ink-muted);
}
</style>
