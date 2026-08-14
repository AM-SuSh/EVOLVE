<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bot, ChevronDown, ClipboardList, RefreshCw } from 'lucide-vue-next'
import {
  assessmentEvidenceChips,
  describeAssessmentStatus,
  groupAssessmentItems,
  type AssessmentItem,
  type AssessmentV2,
} from '../tutor-model'

/**
 * 评分 v2 细项面板（学生 / 教师共用）。
 * 只渲染服务端 assessment，无数据时可信空态，不 mock 分数。
 */
const props = withDefaults(
  defineProps<{
    assessment: AssessmentV2 | null
    loading?: boolean
    error?: string
    emptyHint?: string
    showRefresh?: boolean
    refreshLabel?: string
    interactive?: boolean
  }>(),
  {
    loading: false,
    error: '',
    emptyHint: '还没有服务端评价。生成评价后可按细项查看证据链。',
    showRefresh: false,
    refreshLabel: '生成 / 刷新评价',
    interactive: true,
  },
)

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
  (event: 'refresh'): void
}>()

const expanded = ref<Record<string, boolean>>({})

const groups = computed(() =>
  props.assessment ? groupAssessmentItems(props.assessment.items) : [],
)
const agentAssessment = computed(() => props.assessment?.agentAssessment || null)
const fusion = computed(() => props.assessment?.fusion || null)
const agentScored = computed(() =>
  agentAssessment.value?.status === 'scored' && agentAssessment.value.score !== null,
)

function agentStatusLabel() {
  if (agentScored.value) return '已参与融合'
  if (agentAssessment.value?.status === 'insufficient-evidence') return '证据不足'
  if (agentAssessment.value?.status === 'timeout') return '响应超时'
  if (agentAssessment.value?.status === 'unavailable') return '本次未参与'
  return '尚未运行'
}

function isReviewQuestion(item: AssessmentItem) {
  return item.dimension === 'reflection' && /^RQ\d+$/.test(item.id)
}

function itemDisplayId(item: AssessmentItem, index: number) {
  return isReviewQuestion(item) ? `第 ${index + 1} 题` : item.id
}

function itemStatusLabel(item: AssessmentItem) {
  if (!isReviewQuestion(item)) return describeAssessmentStatus(item.status, item.score)
  if (item.score === 2) return '首答完成'
  if (item.score === 1) return '追问后完成'
  if (item.score === 0) return '已回答'
  return '待评价'
}

watch(
  () => props.assessment?.items.map((item) => item.id).join(','),
  () => {
    if (!props.assessment) {
      expanded.value = {}
      return
    }
    const next: Record<string, boolean> = { ...expanded.value }
    for (const item of props.assessment.items) {
      if (next[item.id] === undefined) next[item.id] = false
    }
    expanded.value = next
  },
  { immediate: true },
)

function toggle(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

function onChip(refValue: string) {
  if (!props.interactive) return
  emit('open-evidence', refValue)
}
</script>

<template>
  <section class="asp" aria-label="学习行为融合评价">
    <header class="asp-head">
      <div class="asp-title">
        <ClipboardList :size="16" aria-hidden="true" />
        <div>
          <strong>学习评价</strong>
          <small v-if="assessment">
            {{ assessment.version }} · {{ fusion?.mode === 'rule-agent' ? '规则 + Agent 融合' : '规则基线' }}
          </small>
          <small v-else>过程行为 / 可信验证 / 收获与反思</small>
        </div>
      </div>
      <button
        v-if="showRefresh"
        type="button"
        class="asp-refresh"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <RefreshCw :size="14" aria-hidden="true" :class="{ spin: loading }" />
        <span>{{ loading ? '评价中…' : refreshLabel }}</span>
      </button>
    </header>

    <p v-if="error" class="asp-error" role="alert">{{ error }}</p>

    <div v-if="loading && !assessment" class="asp-empty">
      <p>正在汇总学习行为、可信运行并请求评分 Agent…</p>
    </div>

    <div v-else-if="!assessment" class="asp-empty">
      <p>{{ emptyHint }}</p>
    </div>

    <template v-else>
      <div class="asp-band" :aria-label="`综合分 ${assessment.total}`">
        <div class="asp-total">
          <strong>{{ assessment.total }}</strong>
          <span>融合分</span>
        </div>
        <div>
          <span>规则基线</span>
          <strong>{{ fusion?.ruleScore ?? assessment.ruleScore ?? '—' }}</strong>
        </div>
        <div>
          <span>Agent 评价</span>
          <strong>{{ agentScored ? agentAssessment?.score : '—' }}</strong>
        </div>
        <div>
          <span>过程</span>
          <strong>{{ assessment.dimensions.process }}</strong>
        </div>
        <div>
          <span>收获与反思</span>
          <strong>{{ assessment.dimensions.reflection }}</strong>
        </div>
      </div>
      <section class="asp-agent" :data-status="agentScored ? 'scored' : 'fallback'" aria-label="评分 Agent 评价">
        <header>
          <span class="asp-agent-title"><Bot :size="16" aria-hidden="true" />评分 Agent</span>
          <strong>{{ agentStatusLabel() }}</strong>
        </header>
        <template v-if="agentScored && agentAssessment">
          <p>{{ agentAssessment.rationale || 'Agent 已根据当前学习行为和证据完成评价。' }}</p>
          <details v-if="agentAssessment.criteria.length" class="asp-agent-criteria">
            <summary>查看 Agent 判定项</summary>
            <ul>
              <li v-for="criterion in agentAssessment.criteria" :key="criterion.id">
                <span>{{ criterion.id }}</span>
                <div><strong>{{ criterion.label }}</strong><small>{{ criterion.rationale || describeAssessmentStatus(criterion.status) }}</small></div>
              </li>
            </ul>
          </details>
        </template>
        <p v-else>{{ agentAssessment?.rationale || '本次没有可用的 Agent 评价，融合分等于规则基线。' }}</p>
        <small v-if="fusion?.mode === 'rule-agent'" class="asp-fusion-note">
          规则 {{ Math.round(fusion.ruleWeight * 100) }}% · Agent {{ Math.round(fusion.agentWeight * 100) }}%
        </small>
      </section>
      <p v-if="assessment.uncertainty === 'incomplete-evidence'" class="asp-hint">
        证据不完整：部分细项为「未观察到」，不会凭空满分。
      </p>

      <div v-for="group in groups" :key="group.dimension" class="asp-group">
        <header class="asp-group-head">
          <h3>{{ group.label }}</h3>
          <span>{{ group.items.length }} 项</span>
        </header>
        <ul class="asp-items">
          <li v-for="(item, index) in group.items" :key="item.id" class="asp-item" :data-status="item.status">
            <div v-if="isReviewQuestion(item)" class="asp-item-toggle asp-item-toggle--review">
              <span class="asp-item-id">{{ itemDisplayId(item, index) }}</span>
              <span class="asp-item-score">
                {{ item.score === null ? '—' : `${item.score}/2` }}
              </span>
            </div>
            <button v-else type="button" class="asp-item-toggle" @click="toggle(item.id)">
              <span class="asp-item-id">{{ itemDisplayId(item, index) }}</span>
              <span class="asp-item-label">{{ item.label }}</span>
              <span class="asp-item-status">{{ itemStatusLabel(item) }}</span>
              <span class="asp-item-score">
                {{ item.score === null ? '—' : `${item.score}/2` }}
              </span>
              <ChevronDown
                :size="14"
                class="asp-chevron"
                :class="{ open: expanded[item.id] }"
                aria-hidden="true"
              />
            </button>
            <div v-if="!isReviewQuestion(item) && expanded[item.id]" class="asp-item-body">
              <p v-if="item.note" class="asp-note">{{ item.note }}</p>
              <p v-else-if="item.status === 'unobserved' || item.score === null" class="asp-note faint">
                未观察到对应证据
              </p>
              <div
                v-if="assessmentEvidenceChips(item.evidenceRefs).length"
                class="asp-chips"
                aria-label="证据引用"
              >
                <button
                  v-for="chip in assessmentEvidenceChips(item.evidenceRefs)"
                  :key="chip.ref"
                  type="button"
                  class="asp-chip"
                  :data-kind="chip.kind"
                  :disabled="!interactive"
                  :title="chip.ref"
                  @click="onChip(chip.ref)"
                >
                  {{ chip.label }}
                </button>
              </div>
              <p v-else class="asp-note faint">无 evidenceRefs</p>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.asp {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 10px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
  color: var(--ws-ink, var(--vp-c-text-1));
}

.asp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.asp-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.asp-title strong {
  display: block;
  font-size: 14px;
}

.asp-title small {
  display: block;
  margin-top: 2px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
}

.asp-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--ws-line-strong, var(--vp-c-divider));
  border-radius: 8px;
  background: var(--ws-surface, var(--vp-c-bg));
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.asp-refresh:hover:not(:disabled) {
  border-color: var(--ws-accent, var(--vp-c-brand-1));
}

.asp button:focus-visible,
.asp summary:focus-visible {
  outline: 2px solid var(--ws-accent, var(--vp-c-brand-1));
  outline-offset: 2px;
}

.asp-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.asp-refresh .spin {
  animation: asp-spin 0.8s linear infinite;
}

@keyframes asp-spin {
  to {
    transform: rotate(360deg);
  }
}

.asp-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, #c2410c 12%, transparent);
  color: #9a3412;
  font-size: 12px;
}

.asp-empty {
  padding: 8px 2px 2px;
}

.asp-empty p,
.asp-hint,
.asp-note {
  margin: 0;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  line-height: 1.5;
}

.asp-hint {
  margin-top: -2px;
}

.asp-note.faint {
  opacity: 0.85;
}

.asp-band {
  display: grid;
  grid-template-columns: 104px repeat(4, 1fr);
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 8px;
  overflow: hidden;
  background: var(--ws-surface, var(--vp-c-bg));
}

.asp-band > div {
  display: grid;
  place-content: center;
  gap: 2px;
  min-height: 64px;
  padding: 8px;
  border-right: 1px solid var(--ws-line, var(--vp-c-divider));
  text-align: center;
}

.asp-band > div:last-child {
  border-right: 0;
}

.asp-band span {
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 11px;
}

.asp-band strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.asp-total {
  color: var(--ws-accent-contrast, #fff);
  background: var(--ws-accent, var(--vp-c-brand-1));
}

.asp-total span {
  color: inherit;
  opacity: 0.9;
}

.asp-agent {
  display: grid;
  gap: 8px;
  padding: 10px 2px;
  border-top: 1px solid var(--ws-line, var(--vp-c-divider));
  border-bottom: 1px solid var(--ws-line, var(--vp-c-divider));
}

.asp-agent > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.asp-agent-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
}

.asp-agent > header > strong {
  color: var(--ws-accent, var(--vp-c-brand-1));
  font-size: 12px;
}

.asp-agent[data-status='fallback'] > header > strong {
  color: var(--ws-ink-muted, var(--vp-c-text-2));
}

.asp-agent > p,
.asp-fusion-note,
.asp-agent-criteria small {
  margin: 0;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  line-height: 1.55;
}

.asp-agent-criteria summary {
  padding: 7px 0;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  cursor: pointer;
}

.asp-agent-criteria ul {
  display: grid;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.asp-agent-criteria li {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 8px;
}

.asp-agent-criteria li > span {
  color: var(--ws-accent, var(--vp-c-brand-1));
  font-size: 11px;
  font-weight: 700;
}

.asp-agent-criteria li strong,
.asp-agent-criteria li small {
  display: block;
}

.asp-agent-criteria li strong {
  font-size: 12px;
}

.asp-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0;
}

.asp-group-head h3 {
  margin: 0;
  font-size: 13px;
}

.asp-group-head span {
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 11px;
}

.asp-items {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 8px;
  overflow: hidden;
  background: var(--ws-surface, var(--vp-c-bg));
}

.asp-item + .asp-item {
  border-top: 1px solid var(--ws-line, var(--vp-c-divider));
}

.asp-item-toggle {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto auto 16px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.asp-item-toggle:hover {
  background: color-mix(in srgb, var(--ws-accent, var(--vp-c-brand-1)) 6%, transparent);
}

.asp-item-toggle--review {
  grid-template-columns: minmax(0, 1fr) auto;
}

.asp-item-id {
  color: var(--ws-accent, var(--vp-c-brand-1));
  font-size: 12px;
  font-weight: 700;
}

.asp-item-label {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.asp-item-status {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 11px;
  white-space: nowrap;
}

.asp-item[data-status='unobserved'] .asp-item-status {
  color: #9a3412;
  background: color-mix(in srgb, #c2410c 12%, transparent);
}

.asp-item[data-status='met'] .asp-item-status {
  color: #166534;
  background: color-mix(in srgb, #16a34a 14%, transparent);
}

.asp-item-score {
  min-width: 28px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.asp-chevron {
  transition: transform 0.15s ease;
}

.asp-chevron.open {
  transform: rotate(180deg);
}

.asp-item-body {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px 54px;
}

.asp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.asp-chip {
  padding: 2px 8px;
  border: 1px solid var(--ws-line-strong, var(--vp-c-divider));
  border-radius: 999px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.asp-chip:hover:not(:disabled) {
  border-color: var(--ws-accent, var(--vp-c-brand-1));
}

.asp-chip:disabled {
  cursor: default;
  opacity: 0.85;
}

.asp-chip[data-kind='run'] {
  border-color: color-mix(in srgb, #2563eb 35%, var(--ws-line, #ddd));
}

.asp-chip[data-kind='trace'] {
  border-color: color-mix(in srgb, #7c3aed 35%, var(--ws-line, #ddd));
}

.asp-chip[data-kind='event'] {
  border-color: color-mix(in srgb, #059669 35%, var(--ws-line, #ddd));
}

@media (max-width: 640px) {
  .asp-band {
    grid-template-columns: repeat(2, 1fr);
  }

  .asp-band > div {
    border-bottom: 1px solid var(--ws-line, var(--vp-c-divider));
  }

  .asp-total {
    grid-column: 1 / -1;
  }

  .asp-item-toggle {
    grid-template-columns: 50px minmax(0, 1fr) auto 16px;
  }

  .asp-item-score {
    display: none;
  }

  .asp-item-toggle--review .asp-item-score {
    display: block;
  }

  .asp-item-body {
    padding-left: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .asp-refresh .spin {
    animation: none;
  }

  .asp-chevron {
    transition: none;
  }
}
</style>
