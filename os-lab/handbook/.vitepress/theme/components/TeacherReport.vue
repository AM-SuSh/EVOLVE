<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { ClipboardList, Download, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import AssessmentScorePanel from './AssessmentScorePanel.vue'
import {
  authHeaders,
  loadAuth,
  normalizeAssessmentV2,
  shortRef,
  tutorLabs,
  type AssessmentV2,
} from '../tutor-model'

/**
 * 教师评分复核：消费 GET /teacher/reviews 的 automaticResult，
 * 并以 POST /teacher/review 提交改分 + 理由留痕（不覆盖自动分）。
 * 与「实验验收」TeacherReview（报告批语）不同页。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

type ReviewDecisionKind = 'confirmed' | 'corrected' | 'dismissed'

interface ReviewGate {
  code?: string
  severity?: string
  reason?: string
  evidenceRefs?: string[]
}

interface CorrectedResult {
  total: number
  dimensions: { process: number; result: number; reflection: number }
}

interface ReviewDecision {
  decisionId: string
  revision: number
  teacher: string
  decision: ReviewDecisionKind
  correctedResult: CorrectedResult | null
  rationale: string
  evidenceRefs: string[]
  createdAt?: string
}

interface AssessmentReview {
  reviewId: string
  assessmentId: string
  student: string
  className?: string
  sessionId: string
  labId: string
  status: string
  rubricVersion?: string
  gates?: ReviewGate[]
  evidenceRefs?: string[]
  automaticResult: {
    total: number
    dimensions: { process: number; result: number; reflection: number }
    items: AssessmentV2['items']
    uncertainty?: string
  }
  decisions?: ReviewDecision[]
  createdAt?: string
  updatedAt?: string
}

const authed = ref(false)
const denied = ref(false)
const loading = ref(false)
const submitting = ref(false)
const note = ref('')
const toast = ref('')
const formError = ref('')
const reviews = ref<AssessmentReview[]>([])
const selectedId = ref('')
const statusFilter = ref<'pending' | 'all'>('pending')

const decision = ref<ReviewDecisionKind>('confirmed')
const rationale = ref('')
const selectedRefs = ref<string[]>([])
const correctedTotal = ref(0)
const correctedProcess = ref(0)
const correctedResultDim = ref(0)
const correctedReflection = ref(0)

const filtered = computed(() => {
  if (statusFilter.value === 'all') return reviews.value
  return reviews.value.filter((item) => item.status === 'pending')
})

const active = computed(() =>
  filtered.value.find((item) => item.reviewId === selectedId.value)
  || reviews.value.find((item) => item.reviewId === selectedId.value)
  || null,
)

const assessment = computed(() => {
  const review = active.value
  if (!review) return null
  return normalizeAssessmentV2(review.automaticResult, {
    version: review.rubricVersion || 'rubric-v2.0.0',
    labId: review.labId,
    sessionId: review.sessionId,
  })
})

const selectedLab = computed(() => {
  const labId = active.value?.labId || 'lab2'
  return tutorLabs.find((lab) => lab.id === labId) || tutorLabs[1]
})

const canSubmit = computed(() => active.value?.status === 'pending')

const legalEvidenceRefs = computed(() => {
  const items = active.value?.automaticResult?.items || []
  const set = new Set<string>()
  for (const item of items) {
    for (const ref of item.evidenceRefs || []) {
      if (ref) set.add(String(ref))
    }
  }
  return [...set].sort()
})

const decisions = computed(() => active.value?.decisions || [])

const emptyHint = computed(() => {
  if (denied.value) return '请先以教师账号登录后再查看评分复核。'
  if (!reviews.value.length) {
    return '暂无服务端评价进入复核队列。请学生先在「学习评价」页签生成评价，且触发门控后会出现在此；不显示本地启发式假分。'
  }
  if (statusFilter.value === 'pending' && !filtered.value.length) {
    return '没有待复核评价。可切换到「全部」查看已处理项。'
  }
  return '选择左侧一条评价查看细项与证据链。'
})

const decisionLabel: Record<ReviewDecisionKind, string> = {
  confirmed: '确认自动分',
  corrected: '修正分数',
  dismissed: '驳回入队',
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function resetFormFromActive() {
  const review = active.value
  formError.value = ''
  decision.value = 'confirmed'
  rationale.value = ''
  selectedRefs.value = []
  if (!review) {
    correctedTotal.value = 0
    correctedProcess.value = 0
    correctedResultDim.value = 0
    correctedReflection.value = 0
    return
  }
  const dims = review.automaticResult.dimensions
  correctedTotal.value = clampScore(review.automaticResult.total)
  correctedProcess.value = clampScore(dims.process)
  correctedResultDim.value = clampScore(dims.result)
  correctedReflection.value = clampScore(dims.reflection)
}

function formatReview(review: AssessmentReview) {
  const when = review.createdAt ? new Date(review.createdAt).toLocaleString('zh-CN') : '未知时间'
  const cls = review.className ? ` · ${review.className}` : ''
  return `${review.student}${cls} · ${review.labId.toUpperCase()} · ${review.automaticResult.total} 分 · ${when}`
}

function formatDecisionTime(iso?: string) {
  if (!iso) return '未知时间'
  return new Date(iso).toLocaleString('zh-CN')
}

function toggleRef(refValue: string, checked: boolean) {
  if (checked) {
    if (!selectedRefs.value.includes(refValue)) selectedRefs.value = [...selectedRefs.value, refValue]
    return
  }
  selectedRefs.value = selectedRefs.value.filter((item) => item !== refValue)
}

async function load() {
  loading.value = true
  note.value = ''
  denied.value = false
  try {
    const auth = loadAuth()
    if (!auth?.token) {
      denied.value = true
      authed.value = false
      reviews.value = []
      return
    }
    const response = await fetch(`${endpoint}/teacher/reviews`, { headers: authHeaders() })
    if (response.status === 401) {
      denied.value = true
      authed.value = false
      reviews.value = []
      return
    }
    if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)
    const payload = await response.json()
    reviews.value = Array.isArray(payload.reviews) ? payload.reviews : []
    authed.value = true
    if (!reviews.value.some((item) => item.reviewId === selectedId.value)) {
      selectedId.value = filtered.value[0]?.reviewId || reviews.value[0]?.reviewId || ''
    }
  } catch (err) {
    note.value = err instanceof Error ? err.message : '无法连接导师服务（npm run tutor）'
    reviews.value = []
  } finally {
    loading.value = false
  }
}

async function submitReview() {
  if (!active.value || !canSubmit.value || submitting.value) return
  formError.value = ''
  const reason = rationale.value.trim()
  if (!reason) {
    formError.value = '复核必须填写理由'
    return
  }
  const body: Record<string, unknown> = {
    reviewId: active.value.reviewId,
    decision: decision.value,
    rationale: reason,
    evidenceRefs: [...selectedRefs.value],
  }
  if (decision.value === 'corrected') {
    body.correctedResult = {
      total: clampScore(correctedTotal.value),
      dimensions: {
        process: clampScore(correctedProcess.value),
        result: clampScore(correctedResultDim.value),
        reflection: clampScore(correctedReflection.value),
      },
    }
  }
  submitting.value = true
  try {
    const response = await fetch(`${endpoint}/teacher/review`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.ok === false) {
      formError.value = String(payload.error || `提交失败（HTTP ${response.status}）`)
      return
    }
    toast.value = `已提交复核 · revision ${payload.revision ?? '—'}`
    window.setTimeout(() => {
      if (toast.value.startsWith('已提交复核')) toast.value = ''
    }, 4200)
    await load()
  } catch {
    formError.value = '无法连接导师服务（npm run tutor）'
  } finally {
    submitting.value = false
  }
}

function exportAssessment() {
  if (!active.value || !assessment.value) return
  const body = JSON.stringify(
    {
      reviewId: active.value.reviewId,
      assessmentId: active.value.assessmentId,
      student: active.value.student,
      labId: active.value.labId,
      sessionId: active.value.sessionId,
      gates: active.value.gates || [],
      decisions: active.value.decisions || [],
      assessment: assessment.value,
    },
    null,
    2,
  )
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${active.value.student}-${active.value.labId}-assessment-v2.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function onOpenEvidence(refValue: string) {
  const raw = String(refValue || '').trim()
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    toast.value = `已复制 ${shortRef(raw)}（教师页无学生工作台，请到引导式学习中跳转面板）`
  } catch {
    toast.value = `${raw}（教师页仅展示/复制引用，不跳转学生 IDE）`
  }
  window.setTimeout(() => {
    if (toast.value.includes(raw.slice(0, 8)) || toast.value.includes(shortRef(raw))) toast.value = ''
  }, 4200)
}

watch(statusFilter, () => {
  if (!filtered.value.some((item) => item.reviewId === selectedId.value)) {
    selectedId.value = filtered.value[0]?.reviewId || ''
  }
})

watch(selectedId, () => {
  resetFormFromActive()
})

watch(reviews, () => {
  resetFormFromActive()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="teacher-report">
    <header class="teacher-report-header">
      <div>
        <span>os-lab · 教师端 · 评分复核</span>
        <h1>{{ active ? `${selectedLab.label} · 评分复核` : '评分复核（评分 v2）' }}</h1>
        <p>
          只读展示服务端 automaticResult；改分经 POST /teacher/review 留痕，不覆盖自动分。
          报告批语请用「实验验收」。
        </p>
      </div>
      <div class="teacher-report-actions">
        <label for="teacher-review-filter">队列筛选</label>
        <select id="teacher-review-filter" v-model="statusFilter" :disabled="!authed">
          <option value="pending">待复核</option>
          <option value="all">全部</option>
        </select>
        <label for="teacher-review-session">评价条目</label>
        <select
          id="teacher-review-session"
          v-model="selectedId"
          :disabled="!filtered.length"
        >
          <option v-for="review in filtered" :key="review.reviewId" :value="review.reviewId">
            {{ formatReview(review) }}
          </option>
        </select>
        <button type="button" :disabled="loading" title="刷新复核队列" @click="load">
          <RefreshCw :size="15" aria-hidden="true" />刷新
        </button>
        <button type="button" :disabled="!assessment" @click="exportAssessment">
          <Download :size="15" aria-hidden="true" />导出评价
        </button>
      </div>
    </header>

    <p v-if="toast" class="teacher-toast" role="status">{{ toast }}</p>
    <p v-if="note" class="teacher-note" role="alert">{{ note }}</p>

    <section v-if="denied" class="teacher-empty">
      <ShieldAlert :size="28" aria-hidden="true" />
      <h2>需要教师账号</h2>
      <p>请先在引导式学习登录教师账号，再打开本页进行评分复核。</p>
      <a :href="withBase('/guide/ai-tutor')">返回引导式学习</a>
    </section>

    <div v-else class="teacher-layout">
      <aside class="teacher-queue" aria-label="复核评价列表">
        <header>
          <ClipboardList :size="16" aria-hidden="true" />
          <strong>{{ filtered.length }}</strong>
          <span>条</span>
        </header>
        <button
          v-for="review in filtered"
          :key="review.reviewId"
          type="button"
          class="teacher-queue-item"
          :class="{ active: review.reviewId === selectedId }"
          @click="selectedId = review.reviewId"
        >
          <strong>{{ review.student }}</strong>
          <span>{{ review.labId.toUpperCase() }} · {{ review.automaticResult.total }} 分 · {{ review.status }}</span>
          <small v-if="review.gates?.length">门控 {{ review.gates.map((g) => g.code).filter(Boolean).join(', ') }}</small>
        </button>
        <p v-if="!filtered.length" class="teacher-queue-empty">{{ loading ? '加载中…' : '队列为空' }}</p>
      </aside>

      <section class="teacher-main">
        <AssessmentScorePanel
          :assessment="assessment"
          :loading="loading"
          :empty-hint="emptyHint"
          :show-refresh="false"
          @open-evidence="onOpenEvidence"
        />

        <section v-if="active?.gates?.length" class="teacher-gates">
          <header><h2>触发门控</h2><span>{{ active.gates.length }}</span></header>
          <ul>
            <li v-for="(gate, index) in active.gates" :key="`${gate.code || 'g'}-${index}`">
              <strong>{{ gate.code || 'gate' }}</strong>
              <span>{{ gate.severity || '—' }} · {{ gate.reason || '无说明' }}</span>
            </li>
          </ul>
        </section>

        <section v-if="active" class="teacher-decision" aria-label="评分复核操作">
          <header>
            <h2>复核决定</h2>
            <span v-if="canSubmit">待复核 · 可提交</span>
            <span v-else>已处理 · 表单只读（automaticResult 不变）</span>
          </header>

          <fieldset :disabled="!canSubmit || submitting">
            <div class="teacher-decision-kinds" role="radiogroup" aria-label="决定类型">
              <label v-for="kind in (['confirmed', 'corrected', 'dismissed'] as ReviewDecisionKind[])" :key="kind">
                <input v-model="decision" type="radio" name="review-decision" :value="kind">
                {{ decisionLabel[kind] }}
              </label>
            </div>

            <label class="teacher-field">
              <span>理由（必填）</span>
              <textarea v-model="rationale" rows="3" maxlength="4000" placeholder="说明确认 / 改分 / 驳回的依据" />
            </label>

            <div v-if="decision === 'corrected'" class="teacher-corrected">
              <label>
                <span>总分</span>
                <input v-model.number="correctedTotal" type="number" min="0" max="100" step="1">
              </label>
              <label>
                <span>过程</span>
                <input v-model.number="correctedProcess" type="number" min="0" max="100" step="1">
              </label>
              <label>
                <span>结果</span>
                <input v-model.number="correctedResultDim" type="number" min="0" max="100" step="1">
              </label>
              <label>
                <span>反思</span>
                <input v-model.number="correctedReflection" type="number" min="0" max="100" step="1">
              </label>
              <p class="teacher-corrected-hint">仅修正维度总分（0–100 整数），不改写细项；原自动分只读保留。</p>
            </div>

            <div class="teacher-refs">
              <span>引用证据（须属于原评价 items）</span>
              <p v-if="!legalEvidenceRefs.length" class="teacher-refs-empty">原评价无 evidenceRefs 可勾选。</p>
              <label v-for="refValue in legalEvidenceRefs" :key="refValue" class="teacher-ref-item">
                <input
                  type="checkbox"
                  :checked="selectedRefs.includes(refValue)"
                  @change="toggleRef(refValue, ($event.target as HTMLInputElement).checked)"
                >
                <code>{{ shortRef(refValue) }}</code>
                <button type="button" class="teacher-ref-copy" @click.prevent="onOpenEvidence(refValue)">复制</button>
              </label>
            </div>

            <p v-if="formError" class="teacher-form-error" role="alert">{{ formError }}</p>

            <button
              type="button"
              class="teacher-submit"
              :disabled="!canSubmit || submitting"
              @click="submitReview"
            >
              {{ submitting ? '提交中…' : '提交复核' }}
            </button>
          </fieldset>
        </section>

        <section v-if="active" class="teacher-audit" aria-label="复核审计时间线">
          <header>
            <h2>审计留痕</h2>
            <span>{{ decisions.length }} 条决定</span>
          </header>
          <p v-if="!decisions.length" class="teacher-audit-empty">尚无教师决定；提交复核后会出现在此。</p>
          <ol v-else class="teacher-audit-list">
            <li v-for="item in decisions" :key="item.decisionId">
              <strong>r{{ item.revision }} · {{ decisionLabel[item.decision] || item.decision }}</strong>
              <span>{{ item.teacher }} · {{ formatDecisionTime(item.createdAt) }}</span>
              <p>{{ item.rationale }}</p>
              <p v-if="item.correctedResult">
                修正分：总分 {{ item.correctedResult.total }}
                （过程 {{ item.correctedResult.dimensions.process }}
                / 结果 {{ item.correctedResult.dimensions.result }}
                / 反思 {{ item.correctedResult.dimensions.reflection }}）
              </p>
              <p v-if="item.evidenceRefs?.length" class="teacher-audit-refs">
                证据：
                <button
                  v-for="refValue in item.evidenceRefs"
                  :key="`${item.decisionId}-${refValue}`"
                  type="button"
                  @click="onOpenEvidence(refValue)"
                >
                  {{ shortRef(refValue) }}
                </button>
              </p>
            </li>
          </ol>
        </section>
      </section>
    </div>
  </main>
</template>

<style scoped>
.teacher-report {
  width: min(1180px, calc(100vw - 2 * var(--ws-space-5)));
  margin: 0 auto;
  padding: var(--ws-space-8) 0 var(--ws-space-8);
  color: var(--ws-ink);
}

.teacher-report :where(h1, h2) {
  padding: 0;
  border: 0;
}

.teacher-report-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ws-space-8);
  padding-bottom: var(--ws-space-5);
  border-bottom: 1px solid var(--ws-line);
}

.teacher-report-header > div:first-child > span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.teacher-report-header h1 {
  margin: var(--ws-space-1) 0 var(--ws-space-2);
  font-size: 28px;
  line-height: var(--ws-leading-tight);
}

.teacher-report-header p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.teacher-report-actions {
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(240px, 1.2fr) auto auto;
  gap: var(--ws-space-2);
  align-items: end;
}

.teacher-report-actions label {
  grid-column: span 1;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-report-actions label:nth-of-type(1) {
  grid-column: 1;
  grid-row: 1;
}

.teacher-report-actions label:nth-of-type(2) {
  grid-column: 2;
  grid-row: 1;
}

.teacher-report-actions select,
.teacher-report-actions button {
  min-height: var(--ws-control-lg);
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  cursor: pointer;
}

.teacher-report-actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-2);
}

.teacher-report-actions button:hover:not(:disabled),
.teacher-report-actions select:hover {
  border-color: var(--ws-accent);
}

.teacher-report-actions button:disabled,
.teacher-report-actions select:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.teacher-toast,
.teacher-note {
  margin: var(--ws-space-3) 0 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  font-size: var(--ws-text-sm);
}

.teacher-toast {
  background: var(--ws-accent-soft, color-mix(in srgb, var(--ws-accent) 12%, transparent));
  color: var(--ws-ink);
}

.teacher-note {
  background: color-mix(in srgb, #c2410c 12%, transparent);
  color: #9a3412;
}

.teacher-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--ws-space-4);
  margin-top: var(--ws-space-6);
}

.teacher-queue {
  display: grid;
  align-content: start;
  gap: var(--ws-space-2);
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.teacher-queue > header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-queue-item {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: var(--ws-space-2) var(--ws-space-3);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.teacher-queue-item:hover,
.teacher-queue-item.active {
  border-color: var(--ws-line-strong);
  background: var(--ws-surface-soft);
}

.teacher-queue-item.active {
  border-color: var(--ws-accent);
}

.teacher-queue-item strong {
  font-size: var(--ws-text-sm);
}

.teacher-queue-item span,
.teacher-queue-item small,
.teacher-queue-empty {
  color: var(--ws-ink-muted);
  font-size: 12px;
}

.teacher-main {
  display: grid;
  gap: var(--ws-space-4);
  min-width: 0;
}

.teacher-gates,
.teacher-decision,
.teacher-audit,
.teacher-empty {
  padding: var(--ws-space-5);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.teacher-gates > header,
.teacher-decision > header,
.teacher-audit > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  margin-bottom: var(--ws-space-3);
}

.teacher-gates h2,
.teacher-decision h2,
.teacher-audit h2,
.teacher-empty h2 {
  margin: 0;
  font-size: var(--ws-text-lg);
}

.teacher-gates header span,
.teacher-decision header span,
.teacher-audit header span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-gates ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.teacher-gates li {
  display: grid;
  gap: 2px;
  padding: var(--ws-space-2) 0;
  border-bottom: 1px solid var(--ws-line);
  font-size: var(--ws-text-sm);
}

.teacher-gates li:last-child {
  border-bottom: 0;
}

.teacher-gates li span {
  color: var(--ws-ink-muted);
}

.teacher-decision fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.teacher-decision fieldset:disabled {
  opacity: 0.72;
}

.teacher-decision-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-3);
  margin-bottom: var(--ws-space-3);
  font-size: var(--ws-text-sm);
}

.teacher-decision-kinds label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.teacher-field {
  display: grid;
  gap: var(--ws-space-1);
  margin-bottom: var(--ws-space-3);
  font-size: var(--ws-text-sm);
}

.teacher-field span,
.teacher-refs > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-field textarea,
.teacher-corrected input {
  width: 100%;
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft, var(--ws-surface));
  font: inherit;
  font-size: var(--ws-text-sm);
}

.teacher-corrected {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-3);
}

.teacher-corrected label {
  display: grid;
  gap: 4px;
  font-size: var(--ws-text-xs);
  color: var(--ws-ink-muted);
}

.teacher-corrected-hint,
.teacher-refs-empty,
.teacher-audit-empty {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: 12px;
}

.teacher-refs {
  display: grid;
  gap: var(--ws-space-1);
  margin-bottom: var(--ws-space-3);
}

.teacher-ref-item {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  font-size: var(--ws-text-sm);
}

.teacher-ref-item code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.teacher-ref-copy {
  padding: 2px 8px;
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.teacher-form-error {
  margin: 0 0 var(--ws-space-2);
  color: #9a3412;
  font-size: var(--ws-text-sm);
}

.teacher-submit {
  min-height: var(--ws-control-lg);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: #fff;
  border: 0;
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-bold);
  cursor: pointer;
}

.teacher-submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.teacher-audit-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.teacher-audit-list li {
  display: grid;
  gap: 4px;
  padding: var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
  font-size: var(--ws-text-sm);
}

.teacher-audit-list li:last-child {
  border-bottom: 0;
}

.teacher-audit-list li span,
.teacher-audit-list li p {
  margin: 0;
  color: var(--ws-ink-muted);
}

.teacher-audit-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.teacher-audit-refs button {
  padding: 2px 8px;
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.teacher-empty {
  margin-top: var(--ws-space-6);
  text-align: center;
}

.teacher-empty svg {
  color: var(--ws-accent);
}

.teacher-empty h2 {
  margin-top: var(--ws-space-3);
}

.teacher-empty p,
.teacher-empty a {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.teacher-empty a {
  display: inline-block;
  margin-top: var(--ws-space-3);
  color: var(--ws-accent);
}

@media (max-width: 900px) {
  .teacher-report-actions {
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }

  .teacher-layout {
    grid-template-columns: 1fr;
  }

  .teacher-corrected {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .teacher-report {
    width: calc(100vw - 2 * var(--ws-space-3));
    padding-top: var(--ws-space-6);
  }

  .teacher-report-header {
    display: grid;
    align-items: start;
  }
}
</style>
