<script setup lang="ts">

import ProblemsPanel from './ProblemsPanel.vue'

import TracePanel from './TracePanel.vue'



export type DockTab = 'terminal' | 'problems' | 'trace' | 'tests'



defineProps<{

  activeTab: DockTab

  runId?: string

  labId?: string

}>()



const emit = defineEmits<{

  (event: 'update:activeTab', tab: DockTab): void

}>()



const tabs: { id: DockTab; label: string }[] = [

  { id: 'terminal', label: '终端' },

  { id: 'problems', label: 'Problems' },

  { id: 'trace', label: 'Trace' },

  { id: 'tests', label: '测试结果' },

]



function selectTab(tab: DockTab) {

  emit('update:activeTab', tab)

}

</script>



<template>

  <section class="ws-bottom-dock" aria-label="运行与诊断">

    <div class="ws-dock-tabs" role="tablist" aria-label="运行与诊断">

      <button

        v-for="tab in tabs"

        :key="tab.id"

        type="button"

        role="tab"

        :aria-selected="activeTab === tab.id"

        :class="{ active: activeTab === tab.id }"

        @click="selectTab(tab.id)"

      >

        {{ tab.label }}

      </button>

    </div>



    <div class="ws-dock-body">

      <div v-show="activeTab === 'terminal'" class="ws-dock-pane">

        <slot name="terminal" />

      </div>

      <div v-show="activeTab === 'problems'" class="ws-dock-pane ws-dock-scroll">

        <ProblemsPanel :run-id="runId" />

      </div>

      <div v-show="activeTab === 'trace'" class="ws-dock-pane ws-dock-scroll">

        <TracePanel :run-id="runId" :lab-id="labId" />

      </div>

      <div v-show="activeTab === 'tests'" class="ws-dock-pane ws-dock-scroll ws-dock-tests">

        <p v-if="!runId">运行可信验证命令后，断言结果将汇总在此。</p>

        <p v-else>最近一次运行 <code>{{ runId }}</code> 的断言详情见终端状态栏与实验报告证据。</p>

      </div>

    </div>

  </section>

</template>



<style scoped>

.ws-bottom-dock {

  display: grid;

  grid-template-rows: auto minmax(0, 1fr);

  height: 100%;

  min-width: 0;

  min-height: 0;

  background: var(--ws-surface);

}



.ws-dock-tabs {

  display: flex;

  align-items: center;

  gap: var(--ws-space-1);

  flex-shrink: 0;

  padding: 0 var(--ws-space-2);

  border-bottom: 1px solid var(--ws-line);

  background: var(--ws-surface-alt);

}



.ws-dock-tabs button {

  min-height: var(--ws-control-md);

  padding: var(--ws-space-1) var(--ws-space-3);

  color: var(--ws-ink-muted);

  border: 1px solid transparent;

  border-bottom: 0;

  border-radius: var(--ws-radius-md) var(--ws-radius-md) 0 0;

  background: transparent;

  font: inherit;

  font-size: var(--ws-text-sm);

  font-weight: var(--ws-weight-semibold);

  cursor: pointer;

}



.ws-dock-tabs button:hover,

.ws-dock-tabs button.active {

  color: var(--ws-accent);

}



.ws-dock-tabs button.active {

  border-color: var(--ws-line);

  background: var(--ws-surface);

}



.ws-dock-body {

  min-height: 0;

  overflow: hidden;

  display: grid;

  grid-template-rows: minmax(0, 1fr);

}



.ws-dock-pane {

  display: grid;

  height: 100%;

  min-height: 0;

}



.ws-dock-scroll {

  overflow: auto;

}



.ws-dock-tests {

  padding: var(--ws-space-3);

  color: var(--ws-ink-faint);

  font-size: var(--ws-text-xs);

}



.ws-dock-tests code {

  font-family: var(--ws-font-mono);

}

</style>

