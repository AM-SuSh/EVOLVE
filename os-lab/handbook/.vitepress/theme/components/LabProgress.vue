<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import labsData from '@data/labs.json'
import CopyCommand from './CopyCommand.vue'

type ChecklistItem = { id: string; label: string }
type Lab = {
  id: string
  feature: string
  title: string
  subtitle: string
  guide: string
  exercises: string
  answers: string
  verifyCmd: string
  expected: string[]
  checklist: ChecklistItem[]
}

const STORAGE_KEY = 'os-lab-handbook-progress-v1'

const labs = labsData.labs as Lab[]
const checked = ref<Record<string, boolean>>({})

function itemKey(labId: string, stepId: string) {
  return `${labId}:${stepId}`
}

function load() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) checked.value = JSON.parse(raw)
  } catch {
    checked.value = {}
  }
}

function save() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checked.value))
}

function toggle(labId: string, stepId: string) {
  const key = itemKey(labId, stepId)
  checked.value[key] = !checked.value[key]
  save()
}

function isDone(labId: string, stepId: string) {
  return !!checked.value[itemKey(labId, stepId)]
}

function labProgress(lab: Lab) {
  const total = lab.checklist.length
  const done = lab.checklist.filter((s) => isDone(lab.id, s.id)).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

const totalSteps = computed(() =>
  labs.reduce((n, lab) => n + lab.checklist.length, 0),
)

const doneSteps = computed(() => {
  let n = 0
  for (const lab of labs) {
    for (const step of lab.checklist) {
      if (isDone(lab.id, step.id)) n++
    }
  }
  return n
})

const overallPct = computed(() =>
  totalSteps.value ? Math.round((doneSteps.value / totalSteps.value) * 100) : 0,
)

function resetAll() {
  if (!confirm('确定清空所有学习进度？（仅影响本浏览器本地记录）')) return
  checked.value = {}
  save()
}

onMounted(load)
watch(checked, save, { deep: true })
</script>

<template>
  <div class="lab-progress">
    <div class="progress-summary">
      <span>总进度：<strong>{{ doneSteps }} / {{ totalSteps }}</strong>（{{ overallPct }}%）</span>
      <div class="progress-actions">
        <button type="button" @click="resetAll">清空进度</button>
      </div>
    </div>
    <div class="progress-bar-wrap" role="progressbar" :aria-valuenow="overallPct" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar-fill" :style="{ width: overallPct + '%' }" />
    </div>

    <article v-for="lab in labs" :key="lab.id" class="lab-card">
      <div class="lab-card-header">
        <h3>{{ lab.title }}</h3>
        <span class="lab-badge">feature: {{ lab.feature }}</span>
        <span class="lab-card-subtitle">{{ lab.subtitle }}</span>
        <span class="lab-card-count">
          {{ labProgress(lab).done }}/{{ labProgress(lab).total }}
        </span>
      </div>

      <div class="lab-links">
        <a class="primary" :href="`/learn/${lab.id}`">引导式学习</a>
        <a :href="lab.guide">实验指导</a>
        <a :href="lab.exercises">文字习题</a>
        <a :href="lab.answers">参考答案</a>
      </div>

      <CopyCommand :command="lab.verifyCmd" label="复制验证命令" />

      <p class="expected-output">
        期望输出包含：
        <code v-for="(line, i) in lab.expected" :key="line">
          {{ line }}<template v-if="i < lab.expected.length - 1">、</template>
        </code>
      </p>

      <ul class="checklist">
        <li
          v-for="step in lab.checklist"
          :key="step.id"
          :class="{ done: isDone(lab.id, step.id) }"
        >
          <input
            :id="`${lab.id}-${step.id}`"
            type="checkbox"
            :checked="isDone(lab.id, step.id)"
            @change="toggle(lab.id, step.id)"
          />
          <label :for="`${lab.id}-${step.id}`">{{ step.label }}</label>
        </li>
      </ul>
    </article>

    <h3 style="margin-top: 2rem">环境激活（在仓库根目录）</h3>
    <CopyCommand :command="labsData.envActivate" label="复制环境命令" />

    <h3>组件单元测试（在 os-lab 目录，可选）</h3>
    <CopyCommand :command="labsData.unitTestCmd" label="复制单测命令" />
  </div>
</template>
