<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { withBase } from 'vitepress'
import { ArrowLeft, CheckCircle2, Gauge, LockKeyhole, Send, TerminalSquare } from 'lucide-vue-next'
import {
  authHeaders,
  finalProjectKindLabel,
  type FinalProjectAccess,
} from '../tutor-model'

/**
 * 期末探索任务引导页。复用 Lab8 工作区做代码与运行，这里只承担任务书、
 * 机制约束、验证命令与评分维度，不重复实现另一个编辑器。
 */
const props = defineProps<{
  endpoint: string
  project?: FinalProjectAccess | null
}>()

const markdown = new MarkdownIt({ html: true, linkify: true })
const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen
    ? defaultLinkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}
const descriptionHtml = computed(() => markdown.render(String(props.project?.description || '')))
const updatedAt = computed(() => formatDate(props.project?.updatedAt))

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface RunOption {
  runId: string
  startedAt: string
  exitCode: number | null
  verified: boolean
}

interface MyScore {
  metric: string
  value: number
  unit: string
  evidenceRunId: string
  submittedAt: string
}

interface LeaderboardRow {
  rank: number
  user: string
  value: number
  unit: string
  evidenceRunId: string
}

const leaderboardMetrics = computed(() => props.project?.leaderboard?.metrics || [])
const runOptions = ref<RunOption[]>([])
const myScores = ref<MyScore[]>([])
const leaderboardScores = ref<LeaderboardRow[]>([])
const rankMetric = ref('')
const form = ref({ evidenceRunId: '', note: '', values: {} as Record<string, number | string> })
const submitting = ref(false)
const submitMessage = ref('')
let leaderboardStarted = false

function leaveFinal() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem('os-lab-final-mode')
    window.location.assign(withBase('/learn/lab8'))
  }
}

async function loadRuns() {
  try {
    const response = await fetch(`${props.endpoint}/runs/history?labId=lab8`, {
      headers: authHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    runOptions.value = response.ok && Array.isArray(payload.runs)
      ? payload.runs.filter((run: RunOption) => run.exitCode === 0)
      : []
    if (runOptions.value.length && !form.value.evidenceRunId) {
      form.value.evidenceRunId = runOptions.value[0].runId
    }
  } catch {
    runOptions.value = []
  }
}

async function loadMyScores() {
  try {
    const response = await fetch(`${props.endpoint}/final/performance`, {
      headers: authHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    myScores.value = response.ok && Array.isArray(payload.scores) ? payload.scores : []
  } catch {
    myScores.value = []
  }
}

async function loadLeaderboard() {
  if (!rankMetric.value) return
  try {
    const response = await fetch(
      `${props.endpoint}/final/performance/leaderboard?metric=${encodeURIComponent(rankMetric.value)}`,
      { headers: authHeaders() },
    )
    const payload = await response.json().catch(() => ({}))
    leaderboardScores.value = response.ok && Array.isArray(payload.scores) ? payload.scores : []
  } catch {
    leaderboardScores.value = []
  }
}

async function submitScore() {
  const scores = leaderboardMetrics.value.map((metric) => ({
    metric: metric.id,
    value: Number(form.value.values[metric.id]),
    direction: metric.direction,
    unit: metric.unit,
  }))
  const missing = leaderboardMetrics.value.some(
    (metric) => String(form.value.values[metric.id] ?? '').trim() === '',
  )
  if (!form.value.evidenceRunId || missing || scores.some((score) => !Number.isFinite(score.value))) {
    submitMessage.value = '请填写全部五个指标成绩，并选择一条成功运行记录。'
    return
  }
  submitting.value = true
  submitMessage.value = ''
  try {
    const response = await fetch(`${props.endpoint}/final/performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        scores,
        evidenceRunId: form.value.evidenceRunId,
        note: form.value.note.trim(),
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || '提交失败')
    submitMessage.value = '五个指标已提交，榜单已更新。'
    await loadMyScores()
    await loadLeaderboard()
  } catch (error) {
    submitMessage.value = error instanceof Error ? error.message : '无法连接导师服务'
  } finally {
    submitting.value = false
  }
}

watch(
  leaderboardMetrics,
  (metrics) => {
    form.value.values = Object.fromEntries(
      metrics.map((metric) => [metric.id, form.value.values[metric.id] ?? '']),
    )
    if (!rankMetric.value || !metrics.some((metric) => metric.id === rankMetric.value)) {
      rankMetric.value = metrics[0]?.id || ''
    }
    if (
      !leaderboardStarted &&
      metrics.length &&
      props.project?.unlocked &&
      props.project.kind === 'performance'
    ) {
      leaderboardStarted = true
      void loadRuns()
      void loadMyScores()
      void loadLeaderboard()
    }
  },
  { immediate: true },
)

watch(
  () => rankMetric.value,
  () => {
    if (rankMetric.value) void loadLeaderboard()
  },
)
</script>

<template>
  <div class="fp">
    <template v-if="project?.unlocked && project.title">
      <header class="fp-head">
        <span>期末探索任务</span>
        <strong>{{ project.title }}</strong>
        <button type="button" class="fp-back" @click="leaveFinal">
          <ArrowLeft :size="13" aria-hidden="true" />返回 Lab8 手册
        </button>
      </header>

      <p v-if="project.kindLabel || project.kind" class="fp-kind">
        {{ project.kindLabel || finalProjectKindLabel(project.kind) }}
      </p>
      <small v-if="updatedAt" class="fp-updated">更新于 {{ updatedAt }}</small>

      <div class="fp-markdown" v-html="descriptionHtml" />

      <section v-if="project.mechanisms?.length" class="fp-block">
        <h3>必须用到的系统机制</h3>
        <div class="fp-chips">
          <span v-for="item in project.mechanisms" :key="item">
            <CheckCircle2 :size="13" aria-hidden="true" />{{ item }}
          </span>
        </div>
      </section>

      <section v-if="project.verificationCommand" class="fp-block">
        <h3>验证命令</h3>
        <p class="fp-command">
          <TerminalSquare :size="14" aria-hidden="true" />
          <code>{{ project.verificationCommand }}</code>
        </p>
        <p class="fp-hint">自定义命令只作为运行结果，不作为可信通过证据；以任务书要求的验证为准。</p>
      </section>

      <section v-if="project.rubric?.length" class="fp-block">
        <h3>评分维度</h3>
        <ol class="fp-rubric">
          <li v-for="item in project.rubric" :key="item">{{ item }}</li>
        </ol>
      </section>

      <section
        v-if="project.kind === 'performance' && leaderboardMetrics.length"
        class="fp-block"
      >
        <h3>性能打榜</h3>
        <p class="fp-hint">一次提交同时更新五个榜：填写五个指标，选择一条成功运行记录。</p>

        <form class="fp-leaderboard" @submit.prevent="submitScore">
          <label v-for="metric in leaderboardMetrics" :key="metric.id">
            <span>
              {{ metric.label }}（{{ metric.unit }}，
              {{ metric.direction === 'higher' ? '越大越好' : '越小越好' }}）
            </span>
            <input v-model.number="form.values[metric.id]" type="number" step="any" min="0" />
          </label>

          <label>
            <span>证据运行</span>
            <select v-model="form.evidenceRunId" aria-label="证据运行记录">
              <option value="" disabled>选择一条成功运行记录</option>
              <option v-for="run in runOptions" :key="run.runId" :value="run.runId">
                {{ run.runId.slice(0, 12) }} · {{ run.startedAt.slice(0, 16).replace('T', ' ') }}
              </option>
            </select>
          </label>

          <label>
            <span>备注（可选）</span>
            <input v-model="form.note" type="text" maxlength="200" placeholder="例如：基线 5 次中位数" />
          </label>

          <button type="submit" :disabled="submitting">
            <Gauge :size="14" aria-hidden="true" />
            {{ submitting ? '提交中…' : '提交打榜成绩' }}
          </button>
        </form>

        <p v-if="submitMessage" class="fp-leaderboard-message">{{ submitMessage }}</p>

        <label class="fp-leaderboard-metric">
          <span>查看指标</span>
          <select v-model="rankMetric" aria-label="查看打榜指标">
            <option v-for="metric in leaderboardMetrics" :key="metric.id" :value="metric.id">
              {{ metric.label }}（{{ metric.unit }}）
            </option>
          </select>
        </label>

        <ul v-if="myScores.length" class="fp-scores">
          <li v-for="score in myScores" :key="score.metric">
            {{ score.metric }}：{{ score.value }} {{ score.unit }}
            <code>{{ score.evidenceRunId.slice(0, 12) }}…</code>
          </li>
        </ul>

        <h3>排行榜</h3>
        <table class="fp-rank-table">
          <thead>
            <tr>
              <th>名次</th>
              <th>学生</th>
              <th>成绩</th>
              <th>单位</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="score in leaderboardScores" :key="score.user">
              <td>{{ score.rank }}</td>
              <td>{{ score.user }}</td>
              <td>{{ score.value }}</td>
              <td>{{ score.unit }}</td>
            </tr>
            <tr v-if="!leaderboardScores.length">
              <td colspan="4">还没有成绩，提交后你就是第一名。</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="fp-block">
        <h3>前端呈现与运行证据</h3>
        <p v-if="project.kind === 'app'">
          小程序没有独立 GUI，它以用户程序输出呈现在内核终端里。运行后把 QEMU 终端输出
          作为演示证据贴进实验报告，并点「提交给老师」。
        </p>
        <p v-else>
          基准程序在终端运行并输出成绩，把终端输出和每次 runId 作为运行证据贴进实验报告。
        </p>
      </section>

      <section class="fp-block">
        <h3>最终交付</h3>
        <p>
          完成任务后，在右侧「实验报告」面板按任务书要求撰写报告并点「提交给老师」；
          老师会在「实验验收」的 Lab8 报告入口查看并复核你的期末任务。
        </p>
      </section>
    </template>

    <div v-else class="fp-locked">
      <LockKeyhole :size="28" aria-hidden="true" />
      <strong>期末探索任务尚未解锁</strong>
      <p>{{ project?.reason || '等待老师发布期末探索任务。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  gap: var(--ws-space-3);
  height: 100%;
  min-height: 0;
  padding: var(--ws-space-4);
  overflow-y: auto;
}

.fp-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ws-space-2);
}

.fp-head span {
  display: block;
  grid-column: 1;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.fp-head strong {
  display: block;
  grid-column: 1;
  margin-top: 2px;
  font-size: var(--ws-text-xl);
  line-height: var(--ws-leading-tight);
}

.fp-back {
  display: inline-flex;
  grid-column: 2;
  grid-row: 1 / 3;
  align-items: center;
  justify-self: end;
  gap: 4px;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.fp-back:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.fp-kind {
  display: inline-flex;
  align-self: flex-start;
  margin: 0;
  padding: 2px var(--ws-space-2);
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fp-updated {
  display: block;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.fp-markdown {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.fp-markdown :deep(h1),
.fp-markdown :deep(h2),
.fp-markdown :deep(h3) {
  margin: var(--ws-space-3) 0 var(--ws-space-1);
  line-height: var(--ws-leading-tight);
}

.fp-markdown :deep(h1) {
  font-size: var(--ws-text-xl);
}

.fp-markdown :deep(h2) {
  padding-bottom: 6px;
  border-bottom: 2px solid var(--ws-accent);
  font-size: var(--ws-text-lg);
}

.fp-markdown :deep(h3) {
  color: var(--ws-accent);
  font-size: var(--ws-text-base);
}

.fp-markdown :deep(p) {
  margin: var(--ws-space-1) 0;
}

.fp-markdown :deep(ul),
.fp-markdown :deep(ol) {
  margin: var(--ws-space-1) 0;
  padding-left: 1.4em;
}

.fp-markdown :deep(table) {
  width: 100%;
  margin: var(--ws-space-2) 0;
  border-collapse: collapse;
  font-size: var(--ws-text-xs);
}

.fp-markdown :deep(th),
.fp-markdown :deep(td) {
  padding: 6px var(--ws-space-2);
  text-align: left;
  border: 1px solid var(--ws-line);
}

.fp-markdown :deep(th) {
  background: var(--ws-surface-alt);
  color: var(--ws-ink-muted);
}

.fp-markdown :deep(blockquote) {
  margin: var(--ws-space-2) 0;
  padding-left: var(--ws-space-3);
  color: var(--ws-ink-muted);
  border-left: 3px solid var(--ws-accent);
}

.fp-markdown :deep(code) {
  padding: 1px 4px;
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface-soft);
  font-family: var(--ws-font-mono);
  font-size: 0.92em;
}

.fp-markdown :deep(pre) {
  padding: var(--ws-space-2);
  overflow-x: auto;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
}

.fp-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.fp-block {
  padding-top: var(--ws-space-2);
  border-top: 1px solid var(--ws-line);
}

.fp-block h3 {
  margin: 0 0 var(--ws-space-2);
  font-size: var(--ws-text-sm);
}

.fp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
}

.fp-chips span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px var(--ws-space-2);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  font-size: var(--ws-text-xs);
}

.fp-chips svg {
  color: var(--ws-ok);
}

.fp-command {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-2);
  margin: 0;
  color: var(--ws-ink-muted);
}

.fp-command svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--ws-accent);
}

.fp-command code {
  font-family: var(--ws-font-mono);
  word-break: break-all;
}

.fp-hint {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.fp-rubric {
  display: grid;
  gap: var(--ws-space-1);
  margin: 0;
  padding: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  list-style-position: inside;
}

.fp-leaderboard {
  display: grid;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-2);
}

.fp-leaderboard label {
  display: grid;
  gap: 4px;
}

.fp-leaderboard-metric {
  display: grid;
  gap: 4px;
  margin: var(--ws-space-2) 0;
}

.fp-leaderboard-metric > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fp-leaderboard-metric select {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.fp-leaderboard label > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.fp-leaderboard input,
.fp-leaderboard select {
  width: 100%;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.fp-leaderboard button {
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

.fp-leaderboard button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.fp-leaderboard-message {
  margin: var(--ws-space-1) 0 0;
  color: var(--ws-ok);
  font-size: var(--ws-text-xs);
}

.fp-scores {
  display: grid;
  gap: var(--ws-space-1);
  margin: var(--ws-space-2) 0 0;
  padding: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  list-style: none;
}

.fp-scores code {
  margin-left: var(--ws-space-1);
  font-family: var(--ws-font-mono);
}

.fp-rank-table {
  width: 100%;
  margin-top: var(--ws-space-2);
  overflow: hidden;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--ws-text-xs);
}

.fp-rank-table th,
.fp-rank-table td {
  padding: 6px var(--ws-space-2);
  text-align: left;
  border-bottom: 1px solid var(--ws-line);
  white-space: nowrap;
}

.fp-rank-table th {
  color: var(--ws-ink-muted);
  background: var(--ws-surface-alt);
  font-weight: var(--ws-weight-semibold);
}

.fp-rank-table tr:last-child td {
  border-bottom: 0;
}

.fp-locked {
  display: grid;
  flex: 1;
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  color: var(--ws-ink-muted);
  text-align: center;
}

.fp-locked svg {
  color: var(--ws-warn);
}

.fp-locked p {
  max-width: 34ch;
  margin: 0;
  font-size: var(--ws-text-sm);
}
</style>
