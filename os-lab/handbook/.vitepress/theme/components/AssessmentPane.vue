<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AssessmentScorePanel from './AssessmentScorePanel.vue'
import {
  authHeaders,
  normalizeAssessmentV2,
  type AssessmentV2,
  type TutorLab,
} from '../tutor-model'

/**
 * 学习评价页签：与实验报告同级，消费 POST /assessment。
 */
const props = defineProps<{
  lab: TutorLab
  endpoint: string
  sessionId: string
  canAssess: boolean
}>()

const emit = defineEmits<{
  (event: 'open-evidence', ref: string): void
  (event: 'notice', text: string): void
}>()

const assessment = ref<AssessmentV2 | null>(null)
const assessLoading = ref(false)
const assessError = ref('')

const assessEmptyHint = computed(() => {
  if (!props.canAssess) return '登录学生账号后，可按量规 v2 生成评价并查看细项证据链。'
  if (!props.sessionId) return '学习会话尚未就绪，稍后再生成评价。'
  return '还没有服务端评价。点击「生成 / 刷新评价」后，可按细项查看运行 / 诊断 / 事件证据。'
})

async function refreshAssessment() {
  if (!props.canAssess || !props.endpoint || !props.sessionId || assessLoading.value) return
  assessLoading.value = true
  assessError.value = ''
  try {
    const response = await fetch(`${props.endpoint.replace(/\/$/, '')}/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ labId: props.lab.id, sessionId: props.sessionId }),
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
    assessment.value = next
    emit('notice', `已生成评价 · 综合分 ${next.total}`)
  } catch (err) {
    assessError.value = err instanceof Error ? err.message : '无法生成评价'
    assessment.value = null
  } finally {
    assessLoading.value = false
  }
}

watch(
  () => [props.lab.id, props.sessionId] as const,
  () => {
    assessment.value = null
    assessError.value = ''
  },
)
</script>

<template>
  <section class="ws-assessment-pane" aria-label="学习评价">
    <header class="ws-assessment-pane-head">
      <div>
        <strong>{{ lab.label }} 学习评价</strong>
        <small>规则评分（量规 v2）· 可点细项证据跳到运行结果 / 诊断 / 报告</small>
      </div>
    </header>
    <div class="ws-assessment-pane-body">
      <AssessmentScorePanel
        :assessment="assessment"
        :loading="assessLoading"
        :error="assessError"
        :empty-hint="assessEmptyHint"
        :show-refresh="Boolean(canAssess && endpoint && sessionId)"
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
</style>
