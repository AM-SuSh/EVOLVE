<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCircle2 } from 'lucide-vue-next'
import AssessmentScorePanel from './AssessmentScorePanel.vue'
import {
  authHeaders,
  hasCustomLlmConfig,
  normalizeAssessmentV2,
  type AssessmentV2,
  type LlmConfig,
  type TutorLab,
} from '../tutor-model'

/**
 * 学习评价页签：与实验报告同级，读取最近结果并按需重新生成评价。
 */
const props = defineProps<{
  lab: TutorLab
  endpoint: string
  sessionId: string
  canAssess: boolean
  llmConfig: LlmConfig
}>()

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
  (event: 'notice', text: string): void
  (event: 'acceptance-change', accepted: boolean): void
}>()

const assessment = ref<AssessmentV2 | null>(null)
interface AssessmentAcceptance {
  acceptanceId: string
  assessmentId: string
  revision: number
  teacher: string
  finalScore: {
    total: number
    dimensions: { process: number; reflection: number }
  }
  feedback: string
  acceptanceAdvice: string
  createdAt: string
}

const acceptance = ref<AssessmentAcceptance | null>(null)
const assessLoading = ref(false)
const resultLoading = ref(false)
const assessError = ref('')
let requestGeneration = 0

const teacherComment = computed(() =>
  acceptance.value?.acceptanceAdvice || acceptance.value?.feedback || '',
)

const assessEmptyHint = computed(() => {
  if (!props.canAssess) return '登录学生账号后，可生成规则与 Agent 融合的学习评价。'
  if (!props.sessionId) return '学习会话尚未就绪，稍后再生成评价。'
  return '还没有服务端评价。点击「生成 / 刷新评价」后，可按细项查看运行 / 诊断 / 事件证据。'
})

function normalizeAcceptance(raw: unknown): AssessmentAcceptance | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<AssessmentAcceptance>
  const total = Number(value.finalScore?.total)
  const process = Number(value.finalScore?.dimensions?.process)
  const reflection = Number(value.finalScore?.dimensions?.reflection)
  if (![total, process, reflection].every((score) => Number.isInteger(score) && score >= 0 && score <= 100)) {
    return null
  }
  return {
    acceptanceId: String(value.acceptanceId || ''),
    assessmentId: String(value.assessmentId || ''),
    revision: Number(value.revision || 0),
    teacher: String(value.teacher || ''),
    finalScore: { total, dimensions: { process, reflection } },
    feedback: String(value.feedback || ''),
    acceptanceAdvice: String(value.acceptanceAdvice || ''),
    createdAt: String(value.createdAt || ''),
  }
}

function formatAcceptedAt(value: string) {
  if (!value) return ''
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return ''
  return timestamp.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

async function loadLatestAssessment() {
  if (!props.canAssess || !props.endpoint || assessLoading.value) return
  const generation = ++requestGeneration
  resultLoading.value = true
  assessError.value = ''
  try {
    const endpoint = props.endpoint.replace(/\/$/, '')
    const response = await fetch(`${endpoint}/assessment?labId=${encodeURIComponent(props.lab.id)}`, {
      headers: authHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `评价服务返回 ${response.status}`)
    if (generation !== requestGeneration) return
    assessment.value = payload.assessment
      ? normalizeAssessmentV2(payload.assessment.automaticResult, {
          version: payload.assessment.rubricVersion,
          labId: props.lab.id,
          sessionId: payload.assessment.sessionId || props.sessionId,
        })
      : null
    const nextAcceptance = normalizeAcceptance(payload.acceptance)
    acceptance.value = nextAcceptance && nextAcceptance.assessmentId === payload.assessment?.assessmentId
      ? nextAcceptance
      : null
  } catch (err) {
    if (generation === requestGeneration) {
      assessError.value = err instanceof Error ? err.message : '无法读取评价结果'
    }
  } finally {
    if (generation === requestGeneration) resultLoading.value = false
  }
}

async function refreshAssessment() {
  if (!props.canAssess || !props.endpoint || !props.sessionId || assessLoading.value) return
  const generation = ++requestGeneration
  resultLoading.value = false
  assessLoading.value = true
  assessError.value = ''
  try {
    const response = await fetch(`${props.endpoint.replace(/\/$/, '')}/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        labId: props.lab.id,
        sessionId: props.sessionId,
        ...(hasCustomLlmConfig(props.llmConfig) ? { llm: props.llmConfig } : {}),
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || `评价服务返回 ${response.status}`)
    }
    const next = normalizeAssessmentV2(payload.assessment, {
      labId: props.lab.id,
      sessionId: props.sessionId,
    })
    if (!next) throw new Error('评价结果缺少 total / dimensions / items')
    if (generation !== requestGeneration) return
    assessment.value = next
    acceptance.value = null
    emit('notice', `已生成评价 · 综合分 ${next.total}`)
  } catch (err) {
    if (generation === requestGeneration) {
      assessError.value = err instanceof Error ? err.message : '无法生成评价'
      assessment.value = null
      acceptance.value = null
    }
  } finally {
    assessLoading.value = false
  }
}

watch(
  () => [props.lab.id, props.sessionId, props.canAssess, props.endpoint] as const,
  () => {
    requestGeneration += 1
    assessment.value = null
    acceptance.value = null
    assessError.value = ''
    void loadLatestAssessment()
  },
  { immediate: true },
)

watch(
  () => acceptance.value?.acceptanceId || '',
  (acceptanceId) => emit('acceptance-change', Boolean(acceptanceId)),
  { immediate: true },
)

defineExpose({ refreshAssessment, loadLatestAssessment })
</script>

<template>
  <section class="ws-assessment-pane" aria-label="学习评价">
    <header class="ws-assessment-pane-head">
      <div>
        <strong>{{ lab.label }} 学习评价</strong>
        <small>行为规则与评分 Agent 融合 · 可按证据回看对话、运行与诊断</small>
      </div>
    </header>
    <div class="ws-assessment-pane-body">
      <section v-if="assessment && acceptance" class="ws-assessment-final" aria-label="教师最终验收结果">
        <header>
          <span><CheckCircle2 :size="17" aria-hidden="true" />教师最终验收</span>
          <strong>成绩已固定</strong>
        </header>
        <div class="ws-assessment-final-scores">
          <div>
            <span>最近系统评分</span>
            <strong>{{ assessment.total }}</strong>
          </div>
          <div class="is-teacher-score">
            <span>教师最终成绩</span>
            <strong>{{ acceptance.finalScore.total }}</strong>
          </div>
        </div>
        <div v-if="teacherComment" class="ws-assessment-final-comment">
          <strong>教师评价</strong>
          <p>{{ teacherComment }}</p>
        </div>
        <small>
          {{ acceptance.teacher ? `验收教师：${acceptance.teacher}` : '教师已验收' }}
          <template v-if="formatAcceptedAt(acceptance.createdAt)"> · {{ formatAcceptedAt(acceptance.createdAt) }}</template>
        </small>
      </section>
      <AssessmentScorePanel
        :assessment="assessment"
        :loading="assessLoading || resultLoading"
        :error="assessError"
        :empty-hint="assessEmptyHint"
        :show-refresh="Boolean(canAssess && endpoint && sessionId && !resultLoading && !acceptance)"
        refresh-label="重新生成系统评价"
        @refresh="refreshAssessment"
        @open-evidence="(ref) => emit('open-evidence', ref)"
      />
    </div>
  </section>
</template>

<style scoped>
.ws-assessment-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ws-ink);
}

.ws-assessment-pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-assessment-pane-head strong {
  display: block;
  font-size: 14px;
}

.ws-assessment-pane-head small {
  display: block;
  margin-top: 2px;
  color: var(--ws-ink-muted);
  font-size: 12px;
}

.ws-assessment-pane-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.ws-assessment-final {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, #15803d 38%, var(--ws-line));
  border-radius: 8px;
  background: color-mix(in srgb, #16a34a 7%, var(--ws-surface));
}

.ws-assessment-final > header,
.ws-assessment-final > header > span {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ws-assessment-final > header {
  justify-content: space-between;
}

.ws-assessment-final > header > span {
  font-size: 13px;
  font-weight: 700;
}

.ws-assessment-final > header > strong {
  color: #166534;
  font-size: 12px;
}

.ws-assessment-final-scores {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--ws-line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--ws-surface);
}

.ws-assessment-final-scores > div {
  display: grid;
  place-content: center;
  gap: 3px;
  min-height: 72px;
  padding: 10px;
  text-align: center;
}

.ws-assessment-final-scores > div + div {
  border-left: 1px solid var(--ws-line);
}

.ws-assessment-final-scores span,
.ws-assessment-final > small {
  color: var(--ws-ink-muted);
  font-size: 11px;
}

.ws-assessment-final-scores strong {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.ws-assessment-final-scores .is-teacher-score strong {
  color: #166534;
}

.ws-assessment-final-comment {
  display: grid;
  gap: 4px;
}

.ws-assessment-final-comment strong {
  font-size: 12px;
}

.ws-assessment-final-comment p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 480px) {
  .ws-assessment-final-scores {
    grid-template-columns: 1fr;
  }

  .ws-assessment-final-scores > div + div {
    border-top: 1px solid var(--ws-line);
    border-left: 0;
  }
}
</style>
