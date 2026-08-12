<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, RefreshCw, Save, Search } from 'lucide-vue-next'
import { authHeaders, loadAuth } from '../tutor-model'
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
  reviewStatus?: string
  reviewUpdatedAt?: string
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

interface TutorConversationTurn {
  id: string
  role: 'student' | 'assistant'
  content: string
  timestamp: string
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
const teacherName = loadAuth()?.username || '教师'
const socraticReview = ref<TeacherSocraticReview | null>(null)
const tutorConversation = ref<TutorConversationTurn[]>([])
const reviewLoading = ref(false)
const reviewError = ref('')

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
const hasChanges = computed(() =>
  Boolean(active.value && reportExists(active.value) && feedbackDraft.value !== feedbackSaved.value),
)

function reportExists(report?: StudentReport | null) {
  return Boolean(report && report.hasReport !== false)
}

function reportReviewed(report: StudentReport) {
  return reportExists(report) && Boolean(report.feedback?.trim())
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
  tutorConversation.value = []
  try {
    const query = new URLSearchParams({ user: report.user, labId: report.labId })
    const response = await fetch(`${endpoint}/teacher/socratic-review?${query.toString()}`, { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `导师服务返回 ${response.status}`)
    if (reportKey(report) !== activeKey.value) return
    socraticReview.value = payload.review || null
    tutorConversation.value = Array.isArray(payload.tutorConversation) ? payload.tutorConversation : []
  } catch (err) {
    if (reportKey(report) === activeKey.value) {
      reviewError.value = err instanceof Error ? err.message : '无法加载苏格拉底复盘记录'
    }
  } finally {
    if (reportKey(report) === activeKey.value) reviewLoading.value = false
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
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(`${endpoint}/teacher/report-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user: active.value.user, labId: active.value.labId, feedback: feedbackDraft.value }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || `服务返回 ${response.status}`)
    active.value.feedback = feedbackDraft.value
    feedbackSaved.value = feedbackDraft.value
    note.value = '验收意见已保存，学生端已同步。'
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
    <header class="tr-topbar">
      <a class="tr-brand" :href="withBase('/guide/ai-tutor')">
        <img :src="withBase('/logo.svg')" alt="" />
        <div><strong>EVOLVE 实验验收</strong><small>提交检查与学习反馈</small></div>
      </a>
      <div class="tr-topbar-actions">
        <span>{{ teacherName }}</span>
        <a :href="withBase('/guide/ai-tutor')"><ArrowLeft :size="15" aria-hidden="true" />教师工作台</a>
        <button type="button" title="刷新提交" aria-label="刷新提交" @click="load"><RefreshCw :size="15" aria-hidden="true" /></button>
      </div>
    </header>

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
            <CheckCircle2 v-if="reportExists(report) && report.feedback?.trim()" class="reviewed" :size="16" aria-label="已完成验收" />
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
          <section class="tr-socratic" aria-label="苏格拉底复盘记录">
            <header>
              <div><span>苏格拉底复盘</span><strong>{{ socraticReview?.status || active.reviewStatus || '未记录' }}</strong></div>
              <small v-if="socraticReview?.sourceAssessmentId">Assessment {{ socraticReview.sourceAssessmentId }}</small>
            </header>
            <p v-if="reviewLoading" class="tr-review-state">正在加载复盘证据...</p>
            <p v-else-if="reviewError" class="tr-review-state is-error">{{ reviewError }}</p>
            <p v-else-if="!socraticReview" class="tr-review-state">此条目没有服务端复盘记录。</p>
            <template v-else>
              <p v-if="socraticReview.plan?.rationale" class="tr-review-rationale">{{ socraticReview.plan.rationale }}</p>
              <div v-for="turn in socraticReview.turns" :key="turn.id" class="tr-review-turn">
                <div class="tr-review-turn-head"><strong>问题 {{ turn.ordinal }}</strong><span>{{ turn.conceptId }} · {{ turn.kind }}</span></div>
                <p><b>AI 导师：</b>{{ turn.prompt }}</p>
                <p><b>学生：</b>{{ turn.studentAnswer || '未回答' }}</p>
                <div v-if="turn.evaluation" class="tr-review-evaluation">
                  <strong>{{ reviewVerdictLabel(turn.evaluation.verdict) }}</strong>
                  <span>{{ turn.evaluation.rationale }}</span>
                  <div
                    v-if="reviewDetailText(turn.evaluation.missingPoints) || reviewDetailText(turn.evaluation.correctReasoning) || reviewDetailText(turn.evaluation.correctiveExplanation)"
                    class="tr-review-evaluation-details"
                  >
                    <div v-if="reviewDetailText(turn.evaluation.missingPoints)">
                      <b>遗漏要点</b><span>{{ reviewDetailText(turn.evaluation.missingPoints) }}</span>
                    </div>
                    <div v-if="reviewDetailText(turn.evaluation.correctReasoning)">
                      <b>正确推理</b><span>{{ reviewDetailText(turn.evaluation.correctReasoning) }}</span>
                    </div>
                    <div v-if="reviewDetailText(turn.evaluation.correctiveExplanation)">
                      <b>纠正说明</b><span>{{ reviewDetailText(turn.evaluation.correctiveExplanation) }}</span>
                    </div>
                  </div>
                  <code v-for="ref in turn.evaluation.evidenceRefs" :key="ref">{{ ref }}</code>
                  <code v-for="ref in turn.evidenceRefs" :key="`plan-${ref}`">{{ ref }}</code>
                </div>
              </div>
              <div v-if="socraticReview.finalSummary" class="tr-review-summary"><strong>学生最终总结</strong><p>{{ socraticReview.finalSummary }}</p></div>
              <details v-if="socraticReview.transcriptMarkdown" class="tr-review-conversation">
                <summary>原始复盘 transcript</summary>
                <pre>{{ socraticReview.transcriptMarkdown }}</pre>
              </details>
              <details v-if="tutorConversation.length" class="tr-review-conversation">
                <summary>导师日常对话证据（{{ tutorConversation.length }} 条）</summary>
                <ol>
                  <li v-for="message in tutorConversation" :key="message.id"><strong>{{ message.role === 'assistant' ? 'AI 导师' : '学生' }}</strong><span>{{ message.content }}</span></li>
                </ol>
              </details>
            </template>
          </section>
        </template>
      </main>

      <aside class="tr-feedback" :class="{ disabled: !active || !reportExists(active) }">
        <header>
          <span>验收意见</span>
          <strong>{{ active && !reportExists(active) ? '等待报告' : active?.feedback?.trim() ? '已完成' : '待验收' }}</strong>
        </header>
        <p v-if="active && !reportExists(active)">学生提交实验报告后，才可填写并保存报告验收意见。</p>
        <p v-else>意见保存后会立即同步到学生的实验报告面板。</p>
        <textarea
          v-model="feedbackDraft"
          :disabled="!active || !reportExists(active)"
          placeholder="记录达成情况、证据是否充分，以及下一步需要改进的内容。"
          aria-label="验收意见"
        />
        <p v-if="note" class="tr-note" :class="{ ok: note.startsWith('验收意见已保存') }">{{ note }}</p>
        <div class="tr-feedback-footer">
          <span>{{ active && !reportExists(active) ? '尚无报告可验收' : hasChanges ? '有未保存修改' : active ? '已保存' : '' }}</span>
          <button
            type="button"
            :disabled="!active || !reportExists(active) || busy || !hasChanges"
            :title="active && !reportExists(active) ? '学生尚未提交报告' : '保存验收意见（Ctrl/Command + S）'"
            @click="saveFeedback"
          >
            <Save :size="15" aria-hidden="true" />{{ busy ? '保存中…' : '保存意见' }}
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
  grid-template-rows: 58px minmax(0, 1fr);
  height: calc(100dvh - var(--vp-nav-height));
  min-width: 0;
  color: var(--ws-ink);
  background: var(--ws-surface-alt);
}

.tr-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-4);
  padding: 0 var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.tr-brand,
.tr-topbar-actions,
.tr-topbar-actions a,
.tr-topbar-actions button {
  display: flex;
  align-items: center;
}

.tr-brand {
  gap: var(--ws-space-2);
  color: var(--ws-ink);
  text-decoration: none;
}

.tr-brand > img {
  width: 30px;
  height: 30px;
  border-radius: var(--ws-radius-sm);
}

.tr-brand strong,
.tr-brand small {
  display: block;
}

.tr-brand strong {
  font-size: var(--ws-text-base);
}

.tr-brand small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.tr-topbar-actions {
  gap: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.tr-topbar-actions a,
.tr-topbar-actions button {
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  text-decoration: none;
  cursor: pointer;
}

.tr-topbar-actions button {
  width: var(--ws-control-md);
  padding: 0;
}

.tr-topbar-actions a:hover,
.tr-topbar-actions button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
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
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background-color: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-xs);
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

.tr-content {
  max-height: none;
  margin: 0;
  padding: var(--ws-space-5) clamp(var(--ws-space-5), 4vw, 48px) var(--ws-space-8);
  overflow: auto;
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
  padding: var(--ws-space-4) clamp(var(--ws-space-5), 4vw, 48px) var(--ws-space-7);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.tr-socratic > header,
.tr-review-turn-head,
.tr-review-evaluation,
.tr-socratic code {
  display: flex;
  align-items: center;
}

.tr-socratic > header {
  justify-content: space-between;
  gap: var(--ws-space-3);
  margin-bottom: var(--ws-space-3);
}

.tr-socratic > header div {
  display: grid;
  gap: 2px;
}

.tr-socratic > header span,
.tr-socratic > header small,
.tr-review-turn-head span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.tr-socratic > header strong {
  font-size: var(--ws-text-base);
}

.tr-review-state,
.tr-review-rationale {
  margin: 0 0 var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.tr-review-state.is-error { color: var(--ws-danger, #b42318); }

.tr-review-turn,
.tr-review-summary,
.tr-review-conversation {
  margin-top: var(--ws-space-3);
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.tr-review-turn p,
.tr-review-summary p { margin: var(--ws-space-2) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }

.tr-review-turn-head { justify-content: space-between; gap: var(--ws-space-3); }

.tr-review-evaluation {
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-3);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.tr-review-evaluation strong { color: var(--ws-accent); }

.tr-review-evaluation-details {
  display: grid;
  gap: var(--ws-space-2);
  width: 100%;
  padding: var(--ws-space-2) 0;
  border-top: 1px solid var(--ws-line);
  border-bottom: 1px solid var(--ws-line);
}

.tr-review-evaluation-details > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--ws-space-2);
}

.tr-review-evaluation-details b {
  color: var(--ws-ink);
}

.tr-review-evaluation-details span {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tr-socratic code {
  max-width: 100%;
  padding: 2px 5px;
  overflow-wrap: anywhere;
  color: var(--ws-ink-muted);
  border-radius: 3px;
  background: var(--ws-surface-alt);
  font-size: 11px;
}

.tr-review-summary strong { font-size: var(--ws-text-sm); }

.tr-review-conversation summary { cursor: pointer; color: var(--ws-ink-muted); font-size: var(--ws-text-sm); }
.tr-review-conversation pre { margin: var(--ws-space-3) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.tr-review-conversation ol { margin: var(--ws-space-3) 0 0; padding-left: 20px; }
.tr-review-conversation li + li { margin-top: var(--ws-space-2); }
.tr-review-conversation li strong { display: block; color: var(--ws-accent); font-size: var(--ws-text-xs); }
.tr-review-conversation li span { white-space: pre-wrap; overflow-wrap: anywhere; }

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
  grid-template-rows: auto auto minmax(180px, 1fr) auto auto;
  gap: var(--ws-space-3);
  margin: 0;
  padding: var(--ws-space-4);
  border-left: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

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

.tr-feedback textarea {
  width: 100%;
  min-height: 0;
  padding: var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  outline: 0;
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
  resize: none;
}

.tr-feedback textarea:focus {
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
  .tr {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .tr-topbar {
    min-height: 58px;
  }

  .tr-brand small,
  .tr-topbar-actions > span,
  .tr-topbar-actions a {
    display: none;
  }

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
