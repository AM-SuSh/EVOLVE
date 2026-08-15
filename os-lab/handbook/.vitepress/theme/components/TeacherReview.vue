<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { Bot, CheckCircle2, ClipboardCheck, Download, RefreshCw, Save, Search, Sparkles, User } from 'lucide-vue-next'
import AssessmentScorePanel from './AssessmentScorePanel.vue'
import { authHeaders, loadAuth, normalizeAssessmentV2, shortRef, type AssessmentV2 } from '../tutor-model'
import { createReportMarkdown, renderReportHtml } from '../report-markdown'

/**
 * 实验验收（/teacher-review）：处理队列、报告正文与验收意见三栏协作，
 * 保存后学生会在实验报告面板看到老师的反馈。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

interface ReportAttachment {
  name: string
  mime: string
  size: number
  storedName: string
}

interface StudentReport {
  user: string
  className?: string
  labId: string
  updatedAt?: string
  content?: string
  feedback?: string
  attachments?: ReportAttachment[]
  hasReport?: boolean
  hasAcceptance?: boolean
  reviewStatus?: string
  reviewUpdatedAt?: string
}

interface ReportAssessment {
  assessmentId: string
  sessionId: string
  labId: string
  rubricVersion: string
  automaticResult: {
    total: number
    dimensions: { process: number; reflection: number }
    items: AssessmentV2['items']
    fusion?: AssessmentV2['fusion']
    agentAssessment?: AssessmentV2['agentAssessment']
    uncertainty?: string
  }
  llmSuggestion?: AssessmentV2['agentAssessment'] & { reasons?: string[] }
}

interface ReportAcceptance {
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

interface ReviewTurn {
  id: string
  ordinal: number
  conceptId: string
  kind: string
  prompt: string
  studentAnswer: string
  evidenceRefs: string[]
  evaluation: null | {
    verdict: string
    rationale: string
    evidenceRefs: string[]
    missingEvidence: string[]
    missingPoints?: string | string[]
    correctReasoning?: string | string[]
    correctiveExplanation?: string | string[]
  }
}

interface TeacherSocraticReview {
  reviewId: string
  status: string
  sourceAssessmentId: string
  finalSummary: string
  transcriptMarkdown: string
  completedAt: string | null
  plan: { rationale?: string; evidenceRefs?: string[] }
  turns: ReviewTurn[]
}

const authed = ref(false)
const denied = ref(false)
const reports = ref<StudentReport[]>([])
const classFilter = ref('')
const labFilter = ref('')
const statusFilter = ref<'pending' | 'reviewed' | 'all'>('pending')
const query = ref('')
const activeKey = ref('')
const feedbackDraft = ref('')
const feedbackSaved = ref('')
const busy = ref(false)
const note = ref('')
const socraticReview = ref<TeacherSocraticReview | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')
const reportAssessment = ref<ReportAssessment | null>(null)
const reportAcceptance = ref<ReportAcceptance | null>(null)
const finalScoreDraft = ref(0)
const finalScoreSaved = ref(0)

const classes = computed(() => [...new Set(reports.value.map((r) => r.className).filter(Boolean))])
const labs = computed(() => [...new Set(reports.value.map((r) => r.labId))].sort())
const filtered = computed(() =>
  reports.value.filter(
    (report) => {
      const matchesStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'reviewed' ? reportReviewed(report) : !reportReviewed(report))
      const keyword = query.value.trim().toLowerCase()
      const matchesQuery =
        !keyword ||
        report.user.toLowerCase().includes(keyword) ||
        (report.className || '').toLowerCase().includes(keyword) ||
        report.labId.toLowerCase().includes(keyword)
      return (
        (!classFilter.value || report.className === classFilter.value) &&
        (!labFilter.value || report.labId === labFilter.value) &&
        matchesStatus &&
        matchesQuery
      )
    },
  ),
)
const pendingCount = computed(() => reports.value.filter((report) => !reportReviewed(report)).length)
const reviewedCount = computed(() => reports.value.length - pendingCount.value)
const active = computed(() => reports.value.find((report) => reportKey(report) === activeKey.value))
const automaticAssessment = computed(() => {
  const assessment = reportAssessment.value
  return assessment
    ? normalizeAssessmentV2(assessment.automaticResult, {
        version: assessment.rubricVersion || 'rubric-v3',
        labId: assessment.labId,
        sessionId: assessment.sessionId,
      })
    : null
})
const hasChanges = computed(() =>
  Boolean(
    active.value &&
      ((reportExists(active.value) && feedbackDraft.value !== feedbackSaved.value) ||
        (reportAssessment.value && (!reportAcceptance.value || finalScoreDraft.value !== finalScoreSaved.value))),
  ),
)

function reportExists(report?: StudentReport | null) {
  return Boolean(report && report.hasReport !== false)
}

function reportReviewed(report: StudentReport) {
  return reportExists(report) && report.hasAcceptance === true
}

function reportTimestamp(report: StudentReport) {
  return reportExists(report)
    ? report.updatedAt || report.reviewUpdatedAt || ''
    : report.reviewUpdatedAt || report.updatedAt || ''
}

function reviewDetailText(value?: string | string[]) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n')
}

function reviewDetailList(value?: string | string[]) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function attachmentUrl(user: string, labId: string, file: string) {
  const token = loadAuth()?.token || ''
  const url = new URL(`${endpoint}/teacher/report-attachment`)
  url.searchParams.set('user', user)
  url.searchParams.set('labId', labId)
  url.searchParams.set('file', file)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function resolveTeacherAttachment(report: StudentReport, ref: string) {
  const key = String(ref || '').trim()
  let decoded = key
  try {
    decoded = decodeURIComponent(key)
  } catch {
    decoded = key
  }
  const item = (report.attachments || []).find(
    (att) =>
      att.storedName === key ||
      att.storedName === decoded ||
      att.name === key ||
      att.name === decoded ||
      // 学生端现在用 attachment:附件id 引用；教师端按文件名匹配，id 对不上时回落第一个同名策略。
      att.storedName.endsWith(decoded) ||
      decoded.endsWith(att.name),
  )
  if (!item) return null
  return attachmentUrl(report.user, report.labId, item.storedName)
}

const reportMarkdown = createReportMarkdown()

const activeHtml = computed(() => {
  const report = active.value
  if (!report || !reportExists(report)) return ''
  return renderReportHtml(
    report.content || '',
    (ref) => resolveTeacherAttachment(report, ref),
    reportMarkdown,
  )
})

async function downloadAttachment(report: StudentReport, item: ReportAttachment) {
  try {
    const response = await fetch(
      `${endpoint}/teacher/report-attachment?user=${encodeURIComponent(report.user)}&labId=${encodeURIComponent(report.labId)}&file=${encodeURIComponent(item.storedName)}`,
      { headers: authHeaders() },
    )
    if (!response.ok) throw new Error(`下载失败 ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = item.name
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    note.value = err instanceof Error ? err.message : '附件下载失败'
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function reportKey(report: StudentReport) {
  return `${report.user}::${report.labId}`
}

function open(report: StudentReport) {
  if (hasChanges.value && !window.confirm('当前验收意见尚未保存，确定切换到另一份报告吗？')) return
  activeKey.value = reportKey(report)
  feedbackDraft.value = report.feedback || ''
  feedbackSaved.value = feedbackDraft.value
  reportAssessment.value = null
  reportAcceptance.value = null
  finalScoreDraft.value = 0
  finalScoreSaved.value = 0
  note.value = ''
  void loadSocraticReview(report)
}

function reviewVerdictLabel(value: string) {
  return ({
    passed: '已掌握',
    partial: '部分掌握',
    'needs-evidence': '待补证据',
    misconception: '存在误解',
    defer: '待教师跟进',
  } as Record<string, string>)[value] || value
}

async function loadSocraticReview(report: StudentReport) {
  reviewLoading.value = true
  reviewError.value = ''
  socraticReview.value = null
  reportAssessment.value = null
  reportAcceptance.value = null
  try {
    const query = new URLSearchParams({ user: report.user, labId: report.labId })
    const [reviewResponse, assessmentResponse] = await Promise.all([
      fetch(`${endpoint}/teacher/socratic-review?${query.toString()}`, { headers: authHeaders() }),
      fetch(`${endpoint}/teacher/report-assessment?${query.toString()}`, { headers: authHeaders() }),
    ])
    const response = reviewResponse
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    if (reportKey(report) !== activeKey.value) return
    socraticReview.value = payload.review || null
    if (assessmentResponse.ok) {
      const assessmentPayload = await assessmentResponse.json().catch(() => ({}))
      reportAssessment.value = assessmentPayload.assessment || null
      reportAcceptance.value = assessmentPayload.acceptance || null
      const latest = reportAcceptance.value?.finalScore?.total
      finalScoreDraft.value = Number.isInteger(latest)
        ? Number(latest)
        : report.hasAcceptance
          ? 0
          : Number(reportAssessment.value?.automaticResult?.total || 0)
      finalScoreSaved.value = finalScoreDraft.value
      if (reportAcceptance.value) {
        feedbackDraft.value = reportAcceptance.value.acceptanceAdvice || reportAcceptance.value.feedback || report.feedback || ''
        feedbackSaved.value = feedbackDraft.value
      }
    }
  } catch (err) {
    if (reportKey(report) === activeKey.value) {
      reviewError.value = err instanceof Error ? err.message : '无法加载苏格拉底复盘记录'
    }
  } finally {
    if (reportKey(report) === activeKey.value) reviewLoading.value = false
  }
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function onFinalScoreInput(event: Event) {
  finalScoreDraft.value = clampScore(Number((event.target as HTMLInputElement).value))
}

async function onOpenEvidence(refValue: string) {
  const raw = String(refValue || '').trim()
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    note.value = `已复制评分证据 ${shortRef(raw)}`
  } catch {
    note.value = `评分证据：${raw}`
  }
}

function formatTime(value: string) {
  if (!value) return '时间未知'
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return '时间未知'
  return timestamp.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

async function load() {
  denied.value = false
  try {
    const response = await fetch(`${endpoint}/teacher/reports`, { headers: authHeaders() })
    if (response.status === 401) {
      denied.value = true
      return
    }
    if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)
    reports.value = (await response.json()).reports || []
    authed.value = true
    const current = reports.value.find((report) => reportKey(report) === activeKey.value)
    if (current) {
      feedbackDraft.value = current.feedback || ''
      feedbackSaved.value = feedbackDraft.value
      void loadSocraticReview(current)
    }
  } catch (err) {
    note.value =
      err instanceof Error && err.message ? err.message : '无法连接导师服务（npm run tutor）'
  }
}

async function saveFeedback() {
  if (!active.value || !reportExists(active.value) || busy.value) return
  const target = active.value
  const targetKey = reportKey(target)
  const targetAssessment = reportAssessment.value
  busy.value = true
  note.value = ''
  try {
    const advice = feedbackDraft.value.trim()
    if (!advice) {
      note.value = '请填写验收建议，作为教师最终评分的理由。'
      return
    }
    if (!targetAssessment) {
      note.value = '当前没有关联的自动评分，请让学生先生成学习评价。'
      return
    }
    const dimensions = reportAcceptance.value?.finalScore.dimensions || targetAssessment.automaticResult.dimensions
    const savedScore = clampScore(finalScoreDraft.value)
    const response = await fetch(`${endpoint}/teacher/report-acceptance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        user: target.user,
        labId: target.labId,
        assessmentId: targetAssessment.assessmentId,
        finalScore: { total: savedScore, dimensions },
        feedback: advice,
        acceptanceAdvice: advice,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    target.feedback = advice
    target.hasAcceptance = true
    reportAcceptance.value = payload.acceptance || null
    feedbackDraft.value = advice
    feedbackSaved.value = advice
    finalScoreDraft.value = savedScore
    finalScoreSaved.value = savedScore
    statusFilter.value = 'reviewed'
    activeKey.value = targetKey
    note.value = '最终评分与验收建议已保存，学生端已同步。'
    await loadSocraticReview(target)
  } catch (err) {
    note.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void saveFeedback()
  }
}

watch(filtered, (items) => {
  if (!items.length) {
    activeKey.value = ''
    feedbackDraft.value = ''
    feedbackSaved.value = ''
    return
  }
  if (!items.some((report) => reportKey(report) === activeKey.value) && !hasChanges.value) open(items[0])
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (loadAuth()?.role === 'teacher') void load()
  else denied.value = true
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="tr">
    <div v-if="denied" class="tr-state">
      <ClipboardCheck :size="28" aria-hidden="true" />
      <strong>需要教师账号</strong>
      <p>请先登录教师账号，再进入实验验收。</p>
      <a :href="withBase('/guide/ai-tutor')">返回教师工作台</a>
    </div>

    <div v-else-if="authed" class="tr-body">
      <aside class="tr-queue">
        <header>
          <div><span>处理队列</span><strong>{{ filtered.length }} 份</strong></div>
          <label class="tr-search">
            <Search :size="14" aria-hidden="true" />
            <input v-model="query" type="search" placeholder="学生、班级或 Lab" aria-label="搜索提交" />
          </label>
          <div class="tr-filters">
            <select v-model="classFilter" aria-label="按班级筛选">
              <option value="">全部班级</option>
              <option v-for="c in classes" :key="c" :value="c">{{ c }}</option>
            </select>
            <select v-model="labFilter" aria-label="按实验筛选">
              <option value="">全部实验</option>
              <option v-for="lab in labs" :key="lab" :value="lab">{{ lab }}</option>
            </select>
          </div>
          <div class="tr-status-tabs" role="tablist" aria-label="验收状态">
            <button type="button" :class="{ active: statusFilter === 'pending' }" @click="statusFilter = 'pending'">待验收 {{ pendingCount }}</button>
            <button type="button" :class="{ active: statusFilter === 'reviewed' }" @click="statusFilter = 'reviewed'">已完成 {{ reviewedCount }}</button>
            <button type="button" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button>
          </div>
        </header>

        <nav class="tr-list" aria-label="学生提交列表">
          <button
            v-for="report in filtered"
            :key="reportKey(report)"
            type="button"
            :class="{ active: reportKey(report) === activeKey }"
            @click="open(report)"
          >
            <span class="tr-list-main"><strong>{{ report.user }}</strong><small>{{ formatTime(reportTimestamp(report)) }}</small></span>
            <span class="tr-list-meta">
              <span>{{ report.className || '未分班' }} · {{ report.labId }}</span>
              <em :class="{ 'review-only': !reportExists(report) }" :title="report.reviewStatus || undefined">
                {{ reportExists(report) ? '报告已提交' : '复盘待验收' }}
              </em>
            </span>
            <CheckCircle2 v-if="reportReviewed(report)" class="reviewed" :size="16" aria-label="已完成验收" />
          </button>
          <div v-if="!filtered.length" class="tr-empty">
            <ClipboardCheck :size="24" aria-hidden="true" />
            <span>当前条件下没有提交</span>
          </div>
        </nav>
      </aside>

      <main class="tr-reader">
        <div v-if="!active" class="tr-empty tr-empty-reader">
          <ClipboardCheck :size="30" aria-hidden="true" />
          <strong>从左侧选择一份提交</strong>
          <span>报告正文会显示在这里。</span>
        </div>
        <template v-else>
          <header>
            <div>
              <span>{{ active.className || '未分班' }} · {{ active.labId }}</span>
              <h1>{{ active.user }} 的{{ reportExists(active) ? '实验报告' : '实验复盘' }}</h1>
            </div>
            <time :datetime="reportTimestamp(active)">
              {{ reportExists(active) ? '提交于' : '复盘更新于' }} {{ formatTime(reportTimestamp(active)) }}
            </time>
          </header>
          <div class="tr-document">
          <div v-if="reportExists(active) && active.attachments?.length" class="tr-attachments">
            <strong>附件</strong>
            <button
              v-for="item in active.attachments"
              :key="item.storedName"
              type="button"
              @click="downloadAttachment(active, item)"
            >
              <Download :size="14" aria-hidden="true" />
              {{ item.name }}
              <small>{{ formatSize(item.size) }}</small>
            </button>
          </div>
          <div v-if="reportExists(active)" class="tr-content tr-md" v-html="activeHtml" />
          <div v-else class="tr-report-missing" role="status">
            <ClipboardCheck :size="26" aria-hidden="true" />
            <div>
              <strong>学生尚未提交实验报告</strong>
              <p>当前条目来自实验复盘，下方仍可查看完整的苏格拉底复盘记录。</p>
            </div>
          </div>
          <section class="tr-socratic" aria-label="复盘对话记录">
            <header><span>复盘对话记录</span></header>
            <p v-if="reviewLoading" class="tr-review-state">正在加载复盘证据...</p>
            <p v-else-if="reviewError" class="tr-review-state is-error">{{ reviewError }}</p>
            <p v-else-if="!socraticReview" class="tr-review-state">此条目没有服务端复盘记录。</p>
            <template v-else>
              <article v-for="turn in socraticReview.turns" :key="turn.id" class="tr-review-turn">
                <header class="tr-review-turn-head">
                  <strong>问题 {{ turn.ordinal }}</strong>
                  <span>{{ turn.conceptId }} · {{ turn.kind }}</span>
                  <em
                    v-if="turn.evaluation"
                    class="tr-verdict"
                    :class="`is-${turn.evaluation.verdict}`"
                  >{{ reviewVerdictLabel(turn.evaluation.verdict) }}</em>
                </header>
                <div class="tr-chat">
                  <div class="tr-chat-message is-tutor">
                    <span class="tr-chat-avatar" aria-hidden="true"><Bot :size="15" /></span>
                    <div class="tr-chat-bubble"><small>AI 导师</small><p>{{ turn.prompt }}</p></div>
                  </div>
                  <div class="tr-chat-message is-student">
                    <span class="tr-chat-avatar" aria-hidden="true"><User :size="15" /></span>
                    <div class="tr-chat-bubble"><small>学生</small><p>{{ turn.studentAnswer || '未回答' }}</p></div>
                  </div>
                </div>
                <footer
                  v-if="turn.evaluation && (reviewDetailList(turn.evaluation.missingPoints).length || reviewDetailText(turn.evaluation.correctReasoning))"
                  class="tr-review-evaluation"
                >
                  <dl class="tr-review-evaluation-details">
                    <div v-if="reviewDetailList(turn.evaluation.missingPoints).length">
                      <dt>缺失点</dt>
                      <dd>
                        <ul><li v-for="item in reviewDetailList(turn.evaluation.missingPoints)" :key="item">{{ item }}</li></ul>
                      </dd>
                    </div>
                    <div v-if="reviewDetailText(turn.evaluation.correctReasoning)">
                      <dt>参考答案</dt><dd>{{ reviewDetailText(turn.evaluation.correctReasoning) }}</dd>
                    </div>
                  </dl>
                </footer>
              </article>
              <div v-if="socraticReview.finalSummary" class="tr-review-summary">
                <strong><Sparkles :size="14" aria-hidden="true" />反问表现总结</strong>
                <p>{{ socraticReview.finalSummary }}</p>
              </div>
            </template>
          </section>
          </div>
        </template>
      </main>

      <aside class="tr-feedback" :class="{ disabled: !active || !reportExists(active) }">
        <header>
          <span>实验验收</span>
          <strong>{{ active && !reportExists(active) ? '等待报告' : active && reportReviewed(active) ? '已完成' : '待验收' }}</strong>
        </header>
        <div class="tr-feedback-scroll">
          <p v-if="active && !reportExists(active)" class="tr-feedback-hint">学生提交实验报告后，才可完成验收。</p>
          <template v-else-if="active">
            <section class="tr-auto-score">
              <header><span>自动评分</span><strong>{{ automaticAssessment ? `${automaticAssessment.total} 分` : '暂无' }}</strong></header>
              <div v-if="automaticAssessment" class="tr-score-dimensions">
                <span>过程 <b>{{ automaticAssessment.dimensions.process }}</b></span>
                <span>反思 <b>{{ automaticAssessment.dimensions.reflection }}</b></span>
              </div>
              <details v-if="automaticAssessment" class="tr-score-details">
                <summary>查看评分细项与证据</summary>
                <AssessmentScorePanel
                  :assessment="automaticAssessment"
                  :interactive="true"
                  @open-evidence="onOpenEvidence"
                />
              </details>
            </section>
            <label class="tr-final-score">
              <span>教师最终分</span>
              <span class="tr-score-input">
                <input
                  :value="finalScoreDraft"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  :disabled="!reportAssessment"
                  @input="onFinalScoreInput"
                />
                <b>/ 100</b>
              </span>
              <small v-if="!reportAssessment">没有关联的自动评分时暂不支持定分。</small>
            </label>
            <label class="tr-advice">
              <span>验收建议</span>
              <textarea
                v-model="feedbackDraft"
                placeholder="说明达成情况、评分理由，以及需要继续改进的内容。"
                aria-label="验收建议"
              />
            </label>
          </template>
        </div>
        <p v-if="note" class="tr-note" :class="{ ok: note.includes('已保存') }">{{ note }}</p>
        <div class="tr-feedback-footer">
          <span>{{ active && !reportExists(active) ? '尚无报告可验收' : hasChanges ? '有未保存修改' : active ? '已保存' : '' }}</span>
          <button
            type="button"
            :disabled="!active || !reportExists(active) || busy || !hasChanges"
            :title="active && !reportExists(active) ? '学生尚未提交报告' : '保存最终评分与验收建议（Ctrl/Command + S）'"
            @click="saveFeedback"
          >
            <Save :size="15" aria-hidden="true" />{{ busy ? '保存中…' : '保存验收' }}
          </button>
        </div>
      </aside>
    </div>

    <div v-else class="tr-state">
      <RefreshCw :size="24" aria-hidden="true" />
      <strong>正在载入提交</strong>
      <p>{{ note }}</p>
    </div>
  </div>
</template>

<style scoped>
.tr-denied {
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.tr-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.tr-toolbar label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.tr-toolbar select {
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background-color: var(--vp-c-bg-soft);
}

.tr-count {
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.tr-toolbar button,
.tr-feedback-row button {
  padding: 6px 14px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 6px;
  background: var(--vp-c-brand-1);
  color: var(--ws-accent-contrast);
  cursor: pointer;
}

.tr-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  min-height: 60vh;
}

.tr-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 74vh;
  overflow-y: auto;
  padding-right: 4px;
}

.tr-list > button {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  text-align: left;
  cursor: pointer;
}

.tr-list > button:hover {
  border-color: var(--vp-c-brand-1);
}

.tr-list > button.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.tr-list span {
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.tr-list small {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.tr-list .reviewed {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 1px 8px;
  color: #fff;
  border-radius: 999px;
  background: var(--vp-c-green-1, #1a7f37);
  font-size: 12px;
  font-style: normal;
}

.tr-reader h2 {
  margin: 0 0 10px;
  border: 0;
  padding: 0;
}

.tr-content {
  max-height: 48vh;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  white-space: pre-wrap;
}

.tr-feedback {
  margin-top: 14px;
}

.tr-feedback h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.tr-feedback textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  font: inherit;
}

.tr-feedback-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.tr-feedback-row span {
  color: var(--vp-c-danger-1, #c0392b);
  font-size: 13px;
}

.tr-feedback-row span.ok {
  color: var(--vp-c-green-1, #1a7f37);
}

.tr-empty {
  color: var(--vp-c-text-3);
}

@media (max-width: 860px) {
  .tr-body {
    grid-template-columns: 1fr;
  }
}

/* Full-screen acceptance workspace. These rules intentionally follow the legacy
   review styles above while the old route remains backward compatible. */
.tr {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: calc(100dvh - var(--vp-nav-height));
  min-width: 0;
  color: var(--ws-ink);
  background: var(--ws-surface-alt);
}

.tr-body {
  display: grid;
  grid-template-columns: 300px minmax(360px, 1fr) minmax(280px, 340px);
  gap: 0;
  min-height: 0;
}

.tr-queue,
.tr-reader,
.tr-feedback {
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.tr-queue {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--ws-line);
}

.tr-queue > header {
  padding: var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-queue > header > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ws-space-2);
}

.tr-queue > header > div:first-child span,
.tr-reader > header span,
.tr-feedback > header span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.tr-queue > header > div:first-child strong {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.tr-search {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  height: var(--ws-control-md);
  padding: 0 var(--ws-space-2);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.tr-search:focus-within {
  border-color: var(--ws-accent);
  box-shadow: 0 0 0 2px var(--ws-accent-soft);
}

.tr-search input {
  min-width: 0;
  width: 100%;
  color: var(--ws-ink);
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
}

.tr-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-2);
}

.tr-filters select {
  min-width: 0;
  height: var(--ws-control-md);
  padding: var(--ws-space-1) calc(var(--ws-space-2) + 14px) var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--ws-space-1) center;
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-medium);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  appearance: none;
  -webkit-appearance: none;
}

.tr-filters select:hover {
  border-color: var(--vp-c-brand-2);
}

.tr-filters select:focus-visible {
  border-color: var(--ws-accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--ws-accent-soft);
}

.tr-filters select option {
  color: var(--ws-ink);
  background-color: var(--ws-surface);
}

/* linear-gradient 覆盖 Chromium 下拉选中项的默认蓝色高亮 */
.tr-filters select option:checked {
  color: var(--vp-c-brand-1);
  background: linear-gradient(
    color-mix(in srgb, var(--vp-c-brand-1) 16%, var(--ws-surface)),
    color-mix(in srgb, var(--vp-c-brand-1) 16%, var(--ws-surface))
  );
  font-weight: var(--ws-weight-semibold);
}

.tr-status-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 2px;
  margin-top: var(--ws-space-2);
  padding: 2px;
  border-radius: var(--ws-radius-md);
  background: var(--ws-line);
}

.tr-status-tabs button {
  min-height: 28px;
  padding: 0 var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 0;
  border-radius: calc(var(--ws-radius-md) - 2px);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.tr-status-tabs button.active {
  color: var(--ws-accent-contrast);
  background: var(--ws-accent);
}

.tr-list {
  display: block;
  max-height: none;
  padding: var(--ws-space-2);
  overflow-y: auto;
}

.tr-list > button {
  position: relative;
  display: flex;
  width: 100%;
  gap: var(--ws-space-1);
  margin: 0 0 var(--ws-space-1);
  padding: var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md);
  background: transparent;
  text-align: left;
}

.tr-list > button:hover {
  border-color: var(--ws-line-strong);
  background: var(--ws-surface-alt);
}

.tr-list > button.active {
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
  box-shadow: inset 3px 0 0 var(--ws-accent);
}

.tr-list-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ws-space-2);
  width: 100%;
  padding-right: var(--ws-space-5);
  color: var(--ws-ink) !important;
}

.tr-list-main small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.tr-list .reviewed {
  position: absolute;
  top: var(--ws-space-3);
  right: var(--ws-space-3);
  color: var(--ws-ok);
  background: transparent;
}

.tr-list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  width: 100%;
}

.tr-list-meta em {
  flex: none;
  padding: 1px 6px;
  color: var(--ws-ok);
  border: 1px solid color-mix(in srgb, var(--ws-ok) 35%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ws-ok) 8%, transparent);
  font-size: 11px;
  font-style: normal;
  line-height: 18px;
}

.tr-list-meta em.review-only {
  color: var(--ws-warn);
  border-color: color-mix(in srgb, var(--ws-warn) 38%, transparent);
  background: color-mix(in srgb, var(--ws-warn) 9%, transparent);
}

.tr-reader {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.tr-reader > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--ws-space-4);
  min-height: 74px;
  padding: var(--ws-space-3) var(--ws-space-5);
  border-bottom: 1px solid var(--ws-line);
}

.tr-reader h1 {
  margin: 2px 0 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
  line-height: var(--ws-leading-tight);
  letter-spacing: 0;
}

.tr-reader time {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  white-space: nowrap;
}

.tr-document {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--ws-surface);
}

.tr-content {
  max-height: none;
  margin: 0;
  padding: var(--ws-space-5) clamp(var(--ws-space-5), 4vw, 48px) var(--ws-space-8);
  overflow: visible;
  color: var(--ws-ink);
  border: 0;
  border-radius: 0;
  background: var(--ws-surface);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tr-content.tr-md {
  font-family: inherit;
  white-space: normal;
}

.tr-content.tr-md :deep(h1),
.tr-content.tr-md :deep(h2),
.tr-content.tr-md :deep(h3) {
  margin: 1em 0 0.4em;
  line-height: 1.3;
}

.tr-content.tr-md :deep(.ws-report-figure) {
  margin: 1em 0;
  text-align: center;
}

.tr-content.tr-md :deep(.ws-report-figure img),
.tr-content.tr-md :deep(img) {
  display: block;
  max-width: min(100%, 720px);
  height: auto;
  margin: 0.6em auto;
  border: 1px solid var(--ws-line);
  border-radius: 6px;
}

.tr-content.tr-md :deep(.ws-report-figure figcaption) {
  margin-top: 0.35em;
  color: var(--ws-ink-faint);
  font-size: 12px;
}

.tr-content.tr-md :deep(pre) {
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--ws-line);
  border-radius: 6px;
  background: var(--ws-surface-alt);
}

.tr-report-missing {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-3);
  margin: var(--ws-space-5) clamp(var(--ws-space-5), 4vw, 48px);
  padding: var(--ws-space-4);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.tr-report-missing svg {
  flex: none;
  color: var(--ws-warn);
}

.tr-report-missing strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.tr-report-missing p {
  margin: var(--ws-space-1) 0 0;
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.tr-socratic {
  padding: var(--ws-space-5) clamp(var(--ws-space-5), 4vw, 48px) var(--ws-space-7);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-socratic > header {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-4);
}

.tr-socratic > header::before {
  content: '';
  width: 4px;
  height: 18px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
}

.tr-socratic > header span {
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
  font-weight: var(--ws-weight-bold);
}

.tr-review-state {
  margin: 0 0 var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.tr-review-state.is-error { color: var(--ws-danger, #b42318); }

.tr-review-turn {
  margin-top: var(--ws-space-3);
  padding: 0;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.tr-review-turn-head {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-review-turn-head strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.tr-review-turn-head > span {
  overflow: hidden;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tr-verdict {
  flex: none;
  margin-left: auto;
  padding: 2px 10px;
  border-radius: var(--ws-radius-full);
  font-size: var(--ws-text-xs);
  font-style: normal;
  font-weight: var(--ws-weight-semibold);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line-strong);
  background: var(--ws-surface);
}

.tr-verdict.is-passed {
  color: var(--ws-ok);
  border-color: color-mix(in srgb, var(--ws-ok) 35%, transparent);
  background: color-mix(in srgb, var(--ws-ok) 10%, transparent);
}

.tr-verdict.is-partial,
.tr-verdict.is-needs-evidence {
  color: var(--ws-warn);
  border-color: color-mix(in srgb, var(--ws-warn) 38%, transparent);
  background: color-mix(in srgb, var(--ws-warn) 10%, transparent);
}

.tr-verdict.is-misconception {
  color: var(--ws-danger);
  border-color: color-mix(in srgb, var(--ws-danger) 35%, transparent);
  background: color-mix(in srgb, var(--ws-danger) 8%, transparent);
}

.tr-chat {
  display: grid;
  gap: var(--ws-space-3);
  padding: var(--ws-space-3);
}

.tr-chat-message {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-2);
  max-width: min(720px, 92%);
}

.tr-chat-message.is-student {
  flex-direction: row-reverse;
  justify-self: end;
}

.tr-chat-avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: var(--ws-radius-full);
}

.tr-chat-message.is-tutor .tr-chat-avatar {
  color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.tr-chat-message.is-student .tr-chat-avatar {
  color: var(--ws-ink-muted);
  background: var(--ws-surface-alt);
  border: 1px solid var(--ws-line);
}

.tr-chat-bubble {
  min-width: 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
}

.tr-chat-message.is-tutor .tr-chat-bubble {
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-top-left-radius: 4px;
  background: var(--ws-surface-alt);
}

.tr-chat-message.is-student .tr-chat-bubble {
  color: var(--ws-ink);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 24%, transparent);
  border-top-right-radius: 4px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, var(--ws-surface));
}

.tr-chat-bubble small {
  display: block;
  margin-bottom: 2px;
  color: var(--ws-ink-faint);
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
  letter-spacing: 0.02em;
}

.tr-chat-message.is-tutor .tr-chat-bubble small {
  color: var(--ws-accent);
}

.tr-chat-bubble p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tr-review-evaluation {
  padding: var(--ws-space-2) var(--ws-space-3) var(--ws-space-3);
  border-top: 1px dashed var(--ws-line);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.tr-review-evaluation-details {
  display: grid;
  gap: var(--ws-space-2);
  margin: var(--ws-space-2) 0 0;
  padding: var(--ws-space-2) var(--ws-space-3);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.tr-review-evaluation-details > div {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  gap: var(--ws-space-2);
}

.tr-review-evaluation-details dt {
  color: var(--ws-ink);
  font-weight: var(--ws-weight-semibold);
}

.tr-review-evaluation-details dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tr-review-evaluation-details ul {
  margin: 0;
  padding-left: 16px;
}

.tr-review-evaluation-details li + li {
  margin-top: 2px;
}

.tr-review-summary {
  margin-top: var(--ws-space-3);
  padding: var(--ws-space-3) var(--ws-space-4);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 26%, transparent);
  border-radius: var(--ws-radius-lg);
  background: color-mix(in srgb, var(--vp-c-brand-1) 7%, var(--ws-surface));
}

.tr-review-summary strong {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  color: var(--ws-accent);
  font-size: var(--ws-text-sm);
}

.tr-review-summary p {
  margin: var(--ws-space-2) 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tr-attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px clamp(var(--ws-space-5), 4vw, 48px);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-attachments strong {
  margin-right: 4px;
  font-size: 13px;
}

.tr-attachments button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: 6px;
  background: var(--ws-surface);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.tr-attachments button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.tr-attachments small {
  color: var(--ws-ink-faint);
}

.tr-feedback {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: var(--ws-space-3);
  margin: 0;
  padding: var(--ws-space-4);
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-feedback-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}

.tr-feedback-hint {
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.tr-auto-score {
  display: grid;
  gap: var(--ws-space-3);
  padding-bottom: var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
}

.tr-auto-score > header,
.tr-score-dimensions,
.tr-score-input {
  display: flex;
  align-items: center;
}

.tr-auto-score > header { justify-content: space-between; gap: var(--ws-space-2); }
.tr-auto-score > header span { color: var(--ws-ink-muted); font-size: var(--ws-text-xs); font-weight: var(--ws-weight-semibold); }
.tr-auto-score > header strong { color: var(--ws-accent); font-size: var(--ws-text-xl); }

.tr-score-dimensions {
  justify-content: space-between;
  gap: var(--ws-space-2);
  padding: var(--ws-space-2) 0;
  border-top: 1px solid var(--ws-line);
  border-bottom: 1px solid var(--ws-line);
}

.tr-score-dimensions span { display: grid; gap: 1px; color: var(--ws-ink-faint); font-size: var(--ws-text-xs); }
.tr-score-dimensions b { color: var(--ws-ink); font-size: var(--ws-text-base); }

.tr-score-details > summary {
  cursor: pointer;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.tr-score-details :deep(.asp) { margin-top: var(--ws-space-3); padding: 0; border: 0; background: transparent; }
.tr-score-details :deep(.asp-head) { display: none; }

.tr-final-score,
.tr-advice {
  display: grid;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-4);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.tr-score-input {
  justify-content: space-between;
  min-height: 54px;
  padding: 0 var(--ws-space-3);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.tr-score-input input {
  width: 90px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ws-ink);
  font: inherit;
  font-size: 26px;
  font-weight: var(--ws-weight-semibold);
}

.tr-score-input b { color: var(--ws-ink-faint); font-size: var(--ws-text-sm); }
.tr-final-score small { color: var(--ws-warn); font-weight: var(--ws-weight-normal); }

.tr-feedback.disabled {
  opacity: 0.65;
}

.tr-feedback > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tr-feedback > header strong {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.tr-feedback > p {
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

.tr-advice textarea {
  width: 100%;
  min-height: 150px;
  padding: var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  outline: 0;
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
  resize: vertical;
}

.tr-advice textarea:focus,
.tr-score-input:focus-within {
  border-color: var(--ws-accent);
  box-shadow: 0 0 0 2px var(--ws-accent-soft);
}

.tr-note {
  color: var(--ws-danger) !important;
}

.tr-note.ok {
  color: var(--ws-ok) !important;
}

.tr-feedback-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
}

.tr-feedback-footer span {
  color: var(--ws-warn);
  font-size: var(--ws-text-xs);
}

.tr-feedback-footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.tr-feedback-footer button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.tr-empty,
.tr-state {
  color: var(--ws-ink-faint);
}

.tr-empty {
  display: grid;
  justify-items: center;
  gap: var(--ws-space-2);
  padding: var(--ws-space-6) var(--ws-space-3);
  text-align: center;
}

.tr-empty-reader {
  align-content: center;
  height: 100%;
}

.tr-empty strong {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.tr-empty span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.tr-state {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  min-height: 0;
  text-align: center;
}

.tr-state strong {
  color: var(--ws-ink);
}

.tr-state p {
  margin: 0;
  font-size: var(--ws-text-sm);
}

.tr-state a {
  color: var(--ws-accent);
  font-size: var(--ws-text-sm);
}

@media (max-width: 1100px) {
  .tr-body {
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .tr-feedback {
    position: fixed;
    right: 0;
    bottom: 0;
    z-index: 20;
    width: min(380px, calc(100vw - 270px));
    height: 44vh;
    border-top: 1px solid var(--ws-line);
    box-shadow: var(--ws-shadow-3);
  }

  .tr-reader {
    padding-bottom: 44vh;
  }
}

@media (max-width: 720px) {
  .tr-body {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .tr-queue {
    min-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid var(--ws-line);
  }

  .tr-reader {
    min-height: 60vh;
    padding-bottom: 0;
  }

  .tr-feedback {
    position: static;
    width: auto;
    height: auto;
    min-height: 52vh;
    border-top: 1px solid var(--ws-line);
    border-left: 0;
    box-shadow: none;
  }
}
</style>
