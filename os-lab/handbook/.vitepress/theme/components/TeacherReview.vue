<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { ArrowLeft, CheckCircle2, ClipboardCheck, RefreshCw, Save, Search } from 'lucide-vue-next'
import { authHeaders, loadAuth } from '../tutor-model'

/**
 * 实验验收（/teacher-review）：处理队列、报告正文与验收意见三栏协作，
 * 保存后学生会在实验报告面板看到老师的反馈。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

interface StudentReport {
  user: string
  className?: string
  labId: string
  updatedAt: string
  content: string
  feedback?: string
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

const classes = computed(() => [...new Set(reports.value.map((r) => r.className).filter(Boolean))])
const labs = computed(() => [...new Set(reports.value.map((r) => r.labId))].sort())
const filtered = computed(() =>
  reports.value.filter(
    (report) => {
      const matchesStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'reviewed' ? Boolean(report.feedback?.trim()) : !report.feedback?.trim())
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
const pendingCount = computed(() => reports.value.filter((report) => !report.feedback?.trim()).length)
const reviewedCount = computed(() => reports.value.length - pendingCount.value)
const active = computed(() => reports.value.find((report) => reportKey(report) === activeKey.value))
const hasChanges = computed(() => feedbackDraft.value !== feedbackSaved.value)

function reportKey(report: StudentReport) {
  return `${report.user}::${report.labId}`
}

function open(report: StudentReport) {
  if (hasChanges.value && !window.confirm('当前验收意见尚未保存，确定切换到另一份报告吗？')) return
  activeKey.value = reportKey(report)
  feedbackDraft.value = report.feedback || ''
  feedbackSaved.value = feedbackDraft.value
  note.value = ''
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
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
    }
  } catch (err) {
    note.value =
      err instanceof Error && err.message ? err.message : '无法连接导师服务（npm run tutor）'
  }
}

async function saveFeedback() {
  if (!active.value || busy.value) return
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
        <span>OS</span>
        <div><strong>os-lab 实验验收</strong><small>提交检查与学习反馈</small></div>
      </a>
      <div class="tr-topbar-actions">
        <span>{{ teacherName }}</span>
        <a :href="withBase('/guide/ai-tutor')"><ArrowLeft :size="15" aria-hidden="true" />引导式学习</a>
        <button type="button" title="刷新提交" aria-label="刷新提交" @click="load"><RefreshCw :size="15" aria-hidden="true" /></button>
      </div>
    </header>

    <div v-if="denied" class="tr-state">
      <ClipboardCheck :size="28" aria-hidden="true" />
      <strong>需要教师账号</strong>
      <p>请先登录教师账号，再进入实验验收。</p>
      <a :href="withBase('/guide/ai-tutor')">返回引导式学习</a>
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
            <span class="tr-list-main"><strong>{{ report.user }}</strong><small>{{ formatTime(report.updatedAt) }}</small></span>
            <span>{{ report.className || '未分班' }} · {{ report.labId }}</span>
            <CheckCircle2 v-if="report.feedback?.trim()" class="reviewed" :size="16" aria-label="已完成验收" />
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
              <h1>{{ active.user }} 的实验报告</h1>
            </div>
            <time :datetime="active.updatedAt">提交于 {{ formatTime(active.updatedAt) }}</time>
          </header>
          <pre class="tr-content">{{ active.content }}</pre>
        </template>
      </main>

      <aside class="tr-feedback" :class="{ disabled: !active }">
        <header>
          <span>验收意见</span>
          <strong>{{ active?.feedback?.trim() ? '已完成' : '待验收' }}</strong>
        </header>
        <p>意见保存后会立即同步到学生的实验报告面板。</p>
        <textarea
          v-model="feedbackDraft"
          :disabled="!active"
          placeholder="记录达成情况、证据是否充分，以及下一步需要改进的内容。"
          aria-label="验收意见"
        />
        <p v-if="note" class="tr-note" :class="{ ok: note.startsWith('验收意见已保存') }">{{ note }}</p>
        <div class="tr-feedback-footer">
          <span>{{ hasChanges ? '有未保存修改' : active ? '已保存' : '' }}</span>
          <button type="button" :disabled="!active || busy || !hasChanges" title="保存验收意见（Ctrl/Command + S）" @click="saveFeedback">
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
  background: var(--vp-c-bg);
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
  color: #fff;
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
  height: 100dvh;
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

.tr-brand > span {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  place-items: center;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
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
  height: var(--ws-control-sm);
  padding: 0 var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
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
