<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, Code2, MessagesSquare } from 'lucide-vue-next'
import JourneyRail from './JourneyRail.vue'
import { workspaceNavState, type WorkspacePanelKey } from '../workspace-nav'

const visible = computed(() => workspaceNavState.active && !workspaceNavState.teacher)

function togglePanel(key: WorkspacePanelKey) {
  workspaceNavState.togglePanel?.(key)
}
</script>

<template>
  <nav v-if="visible" class="wn" aria-label="引导式学习导航">
    <JourneyRail
      :journey="workspaceNavState.journey"
      :applied-labs="workspaceNavState.appliedLabs"
      :final-project="workspaceNavState.finalProject"
      @enter-lab="workspaceNavState.enterLab?.($event)"
      @enter-final="workspaceNavState.enterFinal?.()"
      @export-growth="workspaceNavState.exportGrowth?.()"
    />
    <button
      type="button"
      class="wn-button"
      :class="{ active: workspaceNavState.panels.manual }"
      title="显示/隐藏实验手册"
      @click="togglePanel('manual')"
    >
      <BookOpen :size="15" aria-hidden="true" /><span>手册</span>
    </button>
    <button
      type="button"
      class="wn-button"
      :class="{ active: workspaceNavState.panels.practice }"
      title="显示/隐藏代码与运行工作区"
      @click="togglePanel('practice')"
    >
      <Code2 :size="15" aria-hidden="true" /><span>工作区</span>
    </button>
    <button
      type="button"
      class="wn-button"
      :class="{ active: workspaceNavState.panels.terminal }"
      title="显示/隐藏报告与 Trace"
      @click="togglePanel('terminal')"
    >
      <MessagesSquare :size="15" aria-hidden="true" /><span>学习支持</span>
    </button>
  </nav>
</template>

<style scoped>
.wn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--vp-c-divider);
}

.wn :deep(.ws-journey-trigger),
.wn-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  color: var(--vp-c-text-2);
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.wn :deep(.ws-journey-trigger:hover),
.wn-button:hover,
.wn-button.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.wn :deep(.ws-journey-dots),
.wn :deep(.ws-journey-trigger strong) {
  display: none;
}

.wn svg,
.wn :deep(.ws-journey-trigger > svg) {
  color: currentColor;
}

@media (max-width: 1060px) {
  .wn-button span,
  .wn :deep(.ws-journey-trigger-text) {
    display: none;
  }
}
</style>
