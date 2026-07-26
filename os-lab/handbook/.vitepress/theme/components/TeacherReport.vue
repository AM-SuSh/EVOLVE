<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, ShieldAlert } from 'lucide-vue-next'
import {
  categoryLabels,
  loadEvents,
  scoreEvents,
  tutorLabs,
  type LearningEvent,
  type QuestionCategory,
} from '../tutor-model'

const events = ref<LearningEvent[]>([])
const selectedSession = ref('')

const sessions = computed(() => {
  const grouped = new Map<string, LearningEvent[]>()
  for (const event of events.value) {
    grouped.set(event.sessionId, [...(grouped.get(event.sessionId) || []), event])
  }
  return [...grouped.entries()]
    .map(([id, items]) => ({
      id,
      labId: items[0]?.labId || 'lab2',
      startedAt: items.find((event) => event.type === 'session_start')?.timestamp || items[0]?.timestamp,
      count: items.length,
    }))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
})

const sessionEvents = computed(() =>
  events.value.filter((event) => event.sessionId === selectedSession.value),
)
const score = computed(() => scoreEvents(sessionEvents.value))
const selectedLab = computed(() => {
  const labId = sessionEvents.value[0]?.labId || 'lab2'
  return tutorLabs.find((lab) => lab.id === labId) || tutorLabs[1]
})
const categories = computed(() => {
  const counts: Partial<Record<QuestionCategory, number>> = {}
  for (const event of sessionEvents.value) {
    if (event.type === 'student_message' && event.category) {
      counts[event.category] = (counts[event.category] || 0) + 1
    }
  }
  return Object.entries(counts).map(([category, count]) => ({
    category: category as QuestionCategory,
    label: categoryLabels[category as QuestionCategory],
    count,
  }))
})
const verificationCount = computed(
  () => sessionEvents.value.filter((event) => event.type === 'verification_attempt').length,
)
const guardrailCount = computed(
  () => sessionEvents.value.filter((event) => event.type === 'guardrail_triggered').length,
)

function formatSession(session: { id: string; labId: string; startedAt?: string }) {
  const date = session.startedAt ? new Date(session.startedAt).toLocaleString('zh-CN') : '未知时间'
  return `${session.labId.toUpperCase()} · ${date} · ${session.id.slice(-8)}`
}

function exportReport() {
  const body = JSON.stringify({ sessionId: selectedSession.value, score: score.value, events: sessionEvents.value }, null, 2)
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${selectedSession.value}-teacher-report.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  events.value = loadEvents()
  selectedSession.value = sessions.value[0]?.id || ''
})
</script>

<template>
  <main class="teacher-report">
    <header class="teacher-report-header">
      <div>
        <span>os-lab · 教师端</span>
        <h1>{{ selectedSession ? `${selectedLab.label} 学习过程报告` : '学习过程报告' }}</h1>
        <p>依据匿名交互事件生成，规则评分不由 LLM 直接决定。</p>
      </div>
      <div class="teacher-report-actions">
        <label for="teacher-session">学习会话</label>
        <select id="teacher-session" v-model="selectedSession" :disabled="!sessions.length">
          <option v-for="session in sessions" :key="session.id" :value="session.id">
            {{ formatSession(session) }}
          </option>
        </select>
        <button type="button" :disabled="!selectedSession" @click="exportReport">
          <Download :size="15" aria-hidden="true" />导出报告
        </button>
      </div>
    </header>

    <section v-if="!selectedSession" class="teacher-empty">
      <ShieldAlert :size="28" aria-hidden="true" />
      <h2>暂无可分析会话</h2>
      <p>学生完成一次 AI 引导学习后，匿名事件会出现在这里。</p>
    </section>

    <template v-else>
      <section class="teacher-score-band">
        <div class="teacher-total-score"><strong>{{ score.total }}</strong><span>综合分</span></div>
        <div><span>过程</span><strong>{{ score.process }}</strong></div>
        <div><span>结果</span><strong>{{ score.result }}</strong></div>
        <div><span>反思</span><strong>{{ score.reflection }}</strong></div>
        <div><span>验证记录</span><strong>{{ verificationCount }}</strong></div>
        <div><span>护栏触发</span><strong>{{ guardrailCount }}</strong></div>
      </section>

      <div class="teacher-report-grid">
        <section class="teacher-dimensions">
          <header><h2>过程维度</h2><span>可解释规则</span></header>
          <div v-for="item in [
            { label: '先想后问', value: score.thinking },
            { label: '问法质量', value: score.questionQuality },
            { label: '追问深度', value: score.depth },
            { label: '实验验证', value: score.verification },
            { label: '复盘完整', value: score.reflection },
          ]" :key="item.label" class="teacher-dimension-row">
            <span>{{ item.label }}</span><i><b :style="{ width: `${item.value}%` }" /></i><strong>{{ item.value }}</strong>
          </div>
        </section>

        <section class="teacher-question-types">
          <header><h2>提问类型</h2><span>{{ categories.reduce((sum, item) => sum + item.count, 0) }} 次</span></header>
          <p v-if="!categories.length">当前会话还没有学生提问。</p>
          <div v-for="item in categories" :key="item.category"><span>{{ item.label }}</span><strong>{{ item.count }}</strong></div>
        </section>

        <section class="teacher-feedback">
          <span>规则反馈</span>
          <h2>{{ score.summary }}</h2>
          <p>扣分项：护栏 {{ score.guardrailPenalty }} 分。报告只用于教师诊断学习过程，不在学生对话界面展示。</p>
        </section>
      </div>
    </template>
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
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: var(--ws-space-2);
}

.teacher-report-actions label {
  grid-column: 1 / -1;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
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

.teacher-score-band {
  display: grid;
  grid-template-columns: 160px repeat(5, 1fr);
  margin-top: var(--ws-space-6);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  overflow: hidden;
}

.teacher-score-band > div {
  display: grid;
  min-height: 92px;
  padding: var(--ws-space-4);
  border-right: 1px solid var(--ws-line);
  place-content: center;
  text-align: center;
}

.teacher-score-band > div:last-child {
  border-right: 0;
}

.teacher-score-band span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-score-band strong {
  margin-top: var(--ws-space-1);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.teacher-total-score {
  color: var(--ws-accent-contrast);
  background: var(--ws-accent);
}

.teacher-total-score strong {
  font-size: 36px;
}

.teacher-total-score span {
  color: var(--ws-accent-contrast);
  opacity: 0.85;
}

.teacher-report-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.75fr);
  gap: var(--ws-space-4);
  margin-top: var(--ws-space-4);
}

.teacher-dimensions,
.teacher-question-types,
.teacher-feedback,
.teacher-empty {
  padding: var(--ws-space-5);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.teacher-dimensions > header,
.teacher-question-types > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ws-space-4);
}

.teacher-dimensions h2,
.teacher-question-types h2,
.teacher-feedback h2,
.teacher-empty h2 {
  margin: 0;
  font-size: var(--ws-text-lg);
}

.teacher-dimensions header span,
.teacher-question-types header span,
.teacher-feedback > span {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.teacher-dimension-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 32px;
  align-items: center;
  gap: var(--ws-space-3);
  margin: var(--ws-space-3) 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.teacher-dimension-row i {
  height: 8px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface-soft);
  overflow: hidden;
}

.teacher-dimension-row i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ws-accent);
}

.teacher-dimension-row strong {
  color: var(--ws-ink);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.teacher-question-types > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ws-space-2) 0;
  color: var(--ws-ink-muted);
  border-bottom: 1px solid var(--ws-line);
  font-size: var(--ws-text-sm);
}

.teacher-question-types > div:last-child {
  border-bottom: 0;
}

.teacher-question-types p,
.teacher-feedback p,
.teacher-empty p {
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.teacher-feedback {
  grid-column: 1 / -1;
  border-left: 4px solid var(--ws-accent);
}

.teacher-feedback h2 {
  margin-top: var(--ws-space-2);
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

@media (max-width: 1040px) {
  .teacher-score-band {
    grid-template-columns: repeat(3, 1fr);
  }

  .teacher-score-band > div {
    border-bottom: 1px solid var(--ws-line);
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

  .teacher-report-actions {
    width: 100%;
  }

  .teacher-score-band {
    grid-template-columns: repeat(2, 1fr);
  }

  .teacher-report-grid {
    display: block;
  }

  .teacher-question-types,
  .teacher-feedback {
    margin-top: var(--ws-space-3);
  }
}
</style>
