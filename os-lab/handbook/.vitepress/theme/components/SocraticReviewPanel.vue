<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-vue-next'
import {
  authHeaders,
  hasCustomLlmConfig,
  type LlmConfig,
  type SocraticReview,
  type SocraticReviewEvaluation,
  type SocraticReviewResponse,
  type SocraticReviewStatus,
  type SocraticReviewTurn,
  type TutorLabId,
} from '../tutor-model'

const props = defineProps<{
  endpoint: string
  authenticated: boolean
  labId: TutorLabId
  sessionId: string
  verified: boolean
  llmConfig: LlmConfig
}>()

const emit = defineEmits<{
  (event: 'update', review: SocraticReview | null): void
  (event: 'completed', review: SocraticReview): void
  (event: 'notice', text: string): void
}>()

type ReviewAction = 'load' | 'start' | 'answer' | 'resume' | 'summary' | ''

const review = ref<SocraticReview | null>(null)
const action = ref<ReviewAction>('')
const error = ref('')
const answerDraft = ref('')
const summaryDraft = ref('')
const mounted = ref(false)
let loadSequence = 0
let activeQuestionId = ''
let completedEmittedId = ''

const apiBase = computed(() => props.endpoint.replace(/\/$/, ''))
const readyToLoad = computed(
  () => Boolean(props.authenticated && apiBase.value && props.labId && props.sessionId),
)
const askedTurns = computed(() =>
  (review.value?.turns || [])
    .filter((turn) => Boolean(turn.askedAt && turn.prompt))
    .sort((left, right) => left.ordinal - right.ordinal),
)
const currentTurn = computed<SocraticReviewTurn | null>(
  () => askedTurns.value.find((turn) => !turn.answeredAt) || null,
)
const currentNumber = computed(() => {
  if (!currentTurn.value) return Math.min(askedTurns.value.length, 5)
  return askedTurns.value.findIndex((turn) => turn.questionId === currentTurn.value?.questionId) + 1
})
const latestAnsweredTurn = computed<SocraticReviewTurn | null>(() =>
  [...askedTurns.value].reverse().find((turn) => Boolean(turn.answeredAt)) || null,
)
const summaryReady = computed(() => {
  const value = review.value
  return Boolean(
    value
      && value.status === 'review_active'
      && askedTurns.value.length
      && askedTurns.value.every((turn) => Boolean(turn.answeredAt)),
  )
})
const canStart = computed(() => readyToLoad.value && props.verified && !action.value)
const canSubmitAnswer = computed(
  () => Boolean(currentTurn.value && answerDraft.value.trim() && !action.value),
)
const canSubmitSummary = computed(
  () => Boolean(summaryReady.value && summaryDraft.value.trim() && !action.value),
)

const statusLabel = computed(() => {
  const labels: Record<SocraticReviewStatus, string> = {
    review_planning: '正在生成复盘计划',
    review_ready: '复盘已就绪',
    review_active: summaryReady.value ? '等待最终总结' : '复盘进行中',
    awaiting_evidence: '等待补充证据',
    review_completed: '复盘已完成',
    deferred: '转为后续关注',
  }
  return review.value ? labels[review.value.status] : '尚未开始'
})

const latestFeedback = computed(() => {
  const turn = latestAnsweredTurn.value
  return turn?.evaluation || null
})

function evaluationLabel(evaluation: SocraticReviewEvaluation) {
  if (evaluation.verdict === 'passed') return '正确'
  if (evaluation.verdict === 'partial') return '部分正确'
  return '需修正'
}

function evaluationSummary(evaluation: SocraticReviewEvaluation) {
  const details = [evaluation.verdictLabel, evaluation.rationale]
    .map((item) => String(item || '').trim())
    .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index)
  return details.join('：')
}

function evaluationTone(evaluation: SocraticReviewEvaluation) {
  if (evaluation.verdict === 'passed') return 'is-passed'
  if (evaluation.verdict === 'partial') return 'is-partial'
  return 'is-corrective'
}

function llmPayload() {
  return hasCustomLlmConfig(props.llmConfig)
    ? { llm: { ...props.llmConfig } }
    : {}
}

function applyReview(next: SocraticReview | null) {
  const previousReviewId = review.value?.reviewId || ''
  review.value = next
  emit('update', next)

  const nextQuestionId = next?.turns?.find((turn) => turn.askedAt && !turn.answeredAt)?.questionId || ''
  if (nextQuestionId !== activeQuestionId) {
    activeQuestionId = nextQuestionId
    answerDraft.value = ''
  }
  if (next?.reviewId !== previousReviewId) summaryDraft.value = next?.finalSummary || ''
  if (next?.status === 'review_completed' && next.reviewId !== completedEmittedId) {
    completedEmittedId = next.reviewId
    emit('completed', next)
  }
}

async function requestReview(pathname: string, init?: RequestInit): Promise<SocraticReviewResponse> {
  const response = await fetch(`${apiBase.value}${pathname}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({})) as Partial<SocraticReviewResponse>
  if (!response.ok) throw new Error(payload.error || `复盘服务返回 ${response.status}`)
  return payload as SocraticReviewResponse
}

async function refreshReview(options: { quiet?: boolean } = {}) {
  const sequence = ++loadSequence
  error.value = ''
  if (!readyToLoad.value) {
    applyReview(null)
    return
  }
  action.value = 'load'
  try {
    const query = new URLSearchParams({ labId: props.labId, sessionId: props.sessionId })
    const payload = await requestReview(`/learning/review?${query.toString()}`)
    if (sequence !== loadSequence) return
    applyReview(payload.review || null)
  } catch (caught) {
    if (sequence !== loadSequence) return
    error.value = caught instanceof Error ? caught.message : '复盘状态加载失败'
    if (!options.quiet) emit('notice', error.value)
  } finally {
    if (sequence === loadSequence) action.value = ''
  }
}

async function runAction(
  nextAction: Exclude<ReviewAction, 'load' | ''>,
  pathname: string,
  body: Record<string, unknown>,
  successNotice: string,
) {
  if (action.value || !readyToLoad.value) return
  ++loadSequence
  action.value = nextAction
  error.value = ''
  try {
    const payload = await requestReview(pathname, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    applyReview(payload.review || null)
    if (successNotice) emit('notice', successNotice)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '复盘操作失败'
    emit('notice', error.value)
  } finally {
    action.value = ''
  }
}

async function startReview() {
  if (!canStart.value) return
  await runAction(
    'start',
    '/learning/review/start',
    { labId: props.labId, sessionId: props.sessionId, ...llmPayload() },
    '复盘已开始。',
  )
}

async function submitAnswer() {
  const turn = currentTurn.value
  const answer = answerDraft.value.trim()
  if (!turn || !answer || !review.value) return
  await runAction(
    'answer',
    '/learning/review/answer',
    { reviewId: review.value.reviewId, questionId: turn.questionId, answer, ...llmPayload() },
    '回答已记录。',
  )
}

async function resumeReview() {
  if (!review.value || review.value.status !== 'awaiting_evidence') return
  await runAction(
    'resume',
    '/learning/review/resume',
    { reviewId: review.value.reviewId },
    '已读取新的可信验证，继续复盘。',
  )
}

async function submitSummary() {
  const finalSummary = summaryDraft.value.trim()
  if (!review.value || !finalSummary) return
  await runAction(
    'summary',
    '/learning/review/summary',
    { reviewId: review.value.reviewId, finalSummary },
    '复盘已完成并写入实验记录。',
  )
}

function onAnswerKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submitAnswer()
  }
}

function onSummaryKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submitSummary()
  }
}

watch(
  () => [props.endpoint, props.authenticated, props.labId, props.sessionId] as const,
  () => {
    ++loadSequence
    review.value = null
    error.value = ''
    answerDraft.value = ''
    summaryDraft.value = ''
    activeQuestionId = ''
    completedEmittedId = ''
    if (mounted.value) refreshReview({ quiet: true })
  },
)

onMounted(() => {
  mounted.value = true
  refreshReview({ quiet: true })
})

defineExpose({ refreshReview, startReview })
</script>

<template>
  <section class="review-panel" aria-label="收获与复盘">
    <header class="review-head">
      <div class="review-heading">
        <span class="review-mark" aria-hidden="true"><ClipboardCheck :size="18" /></span>
        <div>
          <strong>收获与复盘</strong>
          <small>{{ statusLabel }}</small>
        </div>
      </div>
      <button
        v-if="readyToLoad"
        class="icon-button"
        type="button"
        title="刷新复盘状态"
        aria-label="刷新复盘状态"
        :disabled="Boolean(action)"
        @click="refreshReview()"
      >
        <RefreshCw :size="16" :class="{ spinning: action === 'load' }" aria-hidden="true" />
      </button>
    </header>

    <div class="review-body" aria-live="polite">
      <div v-if="action === 'load' && !review" class="state-block" role="status">
        <LoaderCircle class="spinning" :size="22" aria-hidden="true" />
        <strong>正在恢复复盘进度</strong>
      </div>

      <div v-else-if="!authenticated" class="state-block">
        <LockKeyhole :size="23" aria-hidden="true" />
        <strong>登录后进入复盘</strong>
      </div>

      <div v-else-if="!sessionId" class="state-block">
        <CircleAlert :size="23" aria-hidden="true" />
        <strong>学习会话尚未就绪</strong>
      </div>

      <div v-else-if="error && !review" class="state-block state-error" role="alert">
        <CircleAlert :size="23" aria-hidden="true" />
        <strong>{{ error }}</strong>
        <button type="button" :disabled="Boolean(action)" @click="refreshReview()">
          <RefreshCw :size="15" aria-hidden="true" />重试
        </button>
      </div>

      <template v-else-if="!review">
        <div v-if="!verified" class="state-block">
          <ShieldCheck :size="24" aria-hidden="true" />
          <strong>完成可信验证后开始复盘</strong>
        </div>
        <div v-else class="state-block state-ready">
          <Bot :size="24" aria-hidden="true" />
          <strong>实验已验证，可以开始复盘</strong>
          <button type="button" :disabled="!canStart" @click="startReview">
            <LoaderCircle v-if="action === 'start'" class="spinning" :size="15" aria-hidden="true" />
            <Play v-else :size="15" aria-hidden="true" />
            开始复盘
          </button>
        </div>
      </template>

      <template v-else>
        <div v-if="error" class="inline-alert" role="alert">
          <CircleAlert :size="16" aria-hidden="true" />
          <span>{{ error }}</span>
        </div>

        <div v-if="review.status === 'review_completed'" class="completed-view">
          <div class="completion-line">
            <CheckCircle2 :size="20" aria-hidden="true" />
            <div>
              <strong>本次复盘已完成</strong>
              <small>问题、原始回答与最终总结已写入实验记录。</small>
            </div>
          </div>
          <pre class="transcript">{{ review.transcriptMarkdown || '复盘记录已保存。' }}</pre>
          <ol v-if="askedTurns.some((turn) => turn.evaluation)" class="turn-history completed-evaluations">
            <li v-for="(turn, index) in askedTurns" :key="turn.questionId">
              <strong>问题 {{ index + 1 }} 的评价</strong>
              <div
                v-if="turn.evaluation"
                class="evaluation-detail"
                :class="evaluationTone(turn.evaluation)"
              >
                <div class="evaluation-heading">
                  <span class="verdict-label">{{ evaluationLabel(turn.evaluation) }}</span>
                  <span v-if="evaluationSummary(turn.evaluation)">{{ evaluationSummary(turn.evaluation) }}</span>
                </div>
                <div v-if="turn.evaluation.missingPoints?.length" class="evaluation-section">
                  <strong>缺失点</strong>
                  <ul>
                    <li v-for="item in turn.evaluation.missingPoints" :key="item">{{ item }}</li>
                  </ul>
                </div>
                <div v-if="turn.evaluation.correctReasoning" class="evaluation-section">
                  <strong>参考因果链</strong>
                  <p>{{ turn.evaluation.correctReasoning }}</p>
                </div>
                <div v-if="turn.evaluation.correctiveExplanation" class="evaluation-section">
                  <strong>纠正说明</strong>
                  <p>{{ turn.evaluation.correctiveExplanation }}</p>
                </div>
              </div>
            </li>
          </ol>
        </div>

        <div v-else-if="review.status === 'deferred'" class="deferred-view">
          <div class="status-callout deferred">
            <CircleAlert :size="19" aria-hidden="true" />
            <div>
              <strong>本次复盘已转为后续关注</strong>
              <p>{{ review.deferredReason || '当前问题需要教师结合后续证据继续确认。' }}</p>
              <p class="submission-note">当前状态仍可提交报告，复盘问答与评价会一并交给教师继续确认。</p>
            </div>
          </div>
          <ol v-if="askedTurns.length" class="turn-history">
            <li v-for="(turn, index) in askedTurns" :key="turn.questionId">
              <strong>问题 {{ index + 1 }}</strong>
              <p>{{ turn.prompt }}</p>
              <blockquote v-if="turn.studentAnswer">{{ turn.studentAnswer }}</blockquote>
              <div
                v-if="turn.evaluation"
                class="evaluation-detail"
                :class="evaluationTone(turn.evaluation)"
              >
                <div class="evaluation-heading">
                  <span class="verdict-label">{{ evaluationLabel(turn.evaluation) }}</span>
                  <span v-if="evaluationSummary(turn.evaluation)">{{ evaluationSummary(turn.evaluation) }}</span>
                </div>
                <div v-if="turn.evaluation.missingPoints?.length" class="evaluation-section">
                  <strong>缺失点</strong>
                  <ul>
                    <li v-for="item in turn.evaluation.missingPoints" :key="item">{{ item }}</li>
                  </ul>
                </div>
                <div v-if="turn.evaluation.correctReasoning" class="evaluation-section">
                  <strong>参考因果链</strong>
                  <p>{{ turn.evaluation.correctReasoning }}</p>
                </div>
                <div v-if="turn.evaluation.correctiveExplanation" class="evaluation-section">
                  <strong>纠正说明</strong>
                  <p>{{ turn.evaluation.correctiveExplanation }}</p>
                </div>
                <div v-if="turn.evaluation.missingEvidence?.length" class="evaluation-section">
                  <strong>待补证据</strong>
                  <ul>
                    <li v-for="item in turn.evaluation.missingEvidence" :key="item">{{ item }}</li>
                  </ul>
                </div>
              </div>
              <div v-else class="evaluation-detail is-pending">本题尚无评价记录。</div>
            </li>
          </ol>
        </div>

        <div v-else-if="review.status === 'awaiting_evidence'" class="evidence-view">
          <div class="review-progress">已回答 {{ review.answeredCount }} 题 / 最多 5 题</div>
          <div class="status-callout evidence">
            <FileCheck2 :size="20" aria-hidden="true" />
            <div>
              <strong>需要一条新的可信验证</strong>
              <p>{{ latestFeedback ? evaluationSummary(latestFeedback) : '完成新的可信运行或断言后，再继续本次复盘。' }}</p>
              <div v-if="latestFeedback?.missingPoints?.length" class="evaluation-section">
                <strong>缺失点</strong>
                <ul>
                  <li v-for="item in latestFeedback.missingPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="latestFeedback?.correctReasoning" class="evaluation-section">
                <strong>参考因果链</strong>
                <p>{{ latestFeedback.correctReasoning }}</p>
              </div>
              <div v-if="latestFeedback?.correctiveExplanation" class="evaluation-section">
                <strong>纠正说明</strong>
                <p>{{ latestFeedback.correctiveExplanation }}</p>
              </div>
              <ul v-if="latestFeedback?.missingEvidence?.length">
                <li v-for="item in latestFeedback.missingEvidence" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
          <button class="primary-action" type="button" :disabled="Boolean(action)" @click="resumeReview">
            <LoaderCircle v-if="action === 'resume'" class="spinning" :size="16" aria-hidden="true" />
            <RefreshCw v-else :size="16" aria-hidden="true" />
            已完成新验证，继续复盘
          </button>
        </div>

        <div v-else-if="currentTurn" class="question-view">
          <div class="review-progress">第 {{ currentNumber }} / 最多 5 题</div>
          <div
            v-if="latestFeedback"
            class="inline-feedback evaluation-detail"
            :class="evaluationTone(latestFeedback)"
          >
            <Bot :size="16" aria-hidden="true" />
            <div>
              <div class="evaluation-heading">
                <span class="verdict-label">{{ evaluationLabel(latestFeedback) }}</span>
                <span v-if="evaluationSummary(latestFeedback)">{{ evaluationSummary(latestFeedback) }}</span>
              </div>
              <div v-if="latestFeedback.missingPoints?.length" class="evaluation-section">
                <strong>缺失点</strong>
                <ul>
                  <li v-for="item in latestFeedback.missingPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="latestFeedback.correctReasoning" class="evaluation-section">
                <strong>参考因果链</strong>
                <p>{{ latestFeedback.correctReasoning }}</p>
              </div>
              <div v-if="latestFeedback.correctiveExplanation" class="evaluation-section">
                <strong>纠正说明</strong>
                <p>{{ latestFeedback.correctiveExplanation }}</p>
              </div>
            </div>
          </div>
          <article class="question-block">
            <div class="question-source"><Bot :size="17" aria-hidden="true" />AI 导师</div>
            <p>{{ currentTurn.prompt }}</p>
          </article>
          <label class="composer">
            <span>你的回答</span>
            <textarea
              v-model="answerDraft"
              rows="6"
              maxlength="8000"
              :disabled="action === 'answer'"
              @keydown="onAnswerKeydown"
            />
          </label>
          <div class="composer-actions">
            <span>{{ answerDraft.length }} / 8000</span>
            <button type="button" :disabled="!canSubmitAnswer" @click="submitAnswer">
              <LoaderCircle v-if="action === 'answer'" class="spinning" :size="16" aria-hidden="true" />
              <Send v-else :size="16" aria-hidden="true" />
              提交回答
            </button>
          </div>
        </div>

        <div v-else-if="summaryReady" class="summary-view">
          <div class="review-progress">已回答 {{ review.answeredCount }} 题 / 最多 5 题</div>
          <div
            v-if="latestFeedback"
            class="inline-feedback evaluation-detail"
            :class="evaluationTone(latestFeedback)"
          >
            <Bot :size="16" aria-hidden="true" />
            <div>
              <div class="evaluation-heading">
                <span class="verdict-label">{{ evaluationLabel(latestFeedback) }}</span>
                <span v-if="evaluationSummary(latestFeedback)">{{ evaluationSummary(latestFeedback) }}</span>
              </div>
              <div v-if="latestFeedback.missingPoints?.length" class="evaluation-section">
                <strong>缺失点</strong>
                <ul>
                  <li v-for="item in latestFeedback.missingPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="latestFeedback.correctReasoning" class="evaluation-section">
                <strong>参考因果链</strong>
                <p>{{ latestFeedback.correctReasoning }}</p>
              </div>
              <div v-if="latestFeedback.correctiveExplanation" class="evaluation-section">
                <strong>纠正说明</strong>
                <p>{{ latestFeedback.correctiveExplanation }}</p>
              </div>
            </div>
          </div>
          <div class="summary-headline">
            <FileCheck2 :size="20" aria-hidden="true" />
            <div>
              <strong>写下最终总结</strong>
              <small>这段总结将与复盘问答一同进入实验记录。</small>
            </div>
          </div>
          <label class="composer">
            <span>我的最终总结</span>
            <textarea
              v-model="summaryDraft"
              rows="7"
              maxlength="8000"
              :disabled="action === 'summary'"
              @keydown="onSummaryKeydown"
            />
          </label>
          <div class="composer-actions">
            <span>{{ summaryDraft.length }} / 8000</span>
            <button type="button" :disabled="!canSubmitSummary" @click="submitSummary">
              <LoaderCircle v-if="action === 'summary'" class="spinning" :size="16" aria-hidden="true" />
              <CheckCircle2 v-else :size="16" aria-hidden="true" />
              完成复盘
            </button>
          </div>
        </div>

        <div v-else class="state-block" role="status">
          <LoaderCircle class="spinning" :size="22" aria-hidden="true" />
          <strong>{{ statusLabel }}</strong>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.review-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--ws-ink, var(--vp-c-text-1));
  background: var(--ws-surface, var(--vp-c-bg));
}

.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 54px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ws-line, var(--vp-c-divider));
}

.review-heading,
.completion-line,
.summary-headline,
.question-source,
.inline-alert,
.inline-feedback,
.status-callout {
  display: flex;
  align-items: flex-start;
}

.review-heading {
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.review-mark {
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ws-accent, var(--vp-c-brand-1));
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 6px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
}

.review-heading strong,
.review-heading small,
.completion-line strong,
.completion-line small,
.summary-headline strong,
.summary-headline small {
  display: block;
}

.review-heading strong {
  font-size: 14px;
  line-height: 1.35;
}

.review-heading small,
.completion-line small,
.summary-headline small {
  margin-top: 2px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  line-height: 1.45;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  color: var(--ws-accent-contrast, #fff);
  border: 1px solid var(--ws-accent, var(--vp-c-brand-1));
  border-radius: 6px;
  background: var(--ws-accent, var(--vp-c-brand-1));
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--ws-accent-hover, var(--vp-c-brand-2));
  background: var(--ws-accent-hover, var(--vp-c-brand-2));
}

button:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--ws-accent, var(--vp-c-brand-1));
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.icon-button {
  flex: 0 0 34px;
  width: 34px;
  padding: 0;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  border-color: transparent;
  background: transparent;
}

.icon-button:hover:not(:disabled) {
  color: var(--ws-ink, var(--vp-c-text-1));
  border-color: var(--ws-line, var(--vp-c-divider));
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
}

.review-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  text-align: center;
}

.state-block strong {
  max-width: 440px;
  color: var(--ws-ink, var(--vp-c-text-1));
  font-size: 14px;
}

.state-ready > svg {
  color: var(--ws-accent, var(--vp-c-brand-1));
}

.state-error > svg,
.inline-alert > svg {
  color: var(--ws-danger, var(--vp-c-red-1));
}

.review-progress {
  margin-bottom: 12px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.inline-alert,
.inline-feedback {
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 10px;
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.55;
}

.inline-alert {
  color: var(--ws-danger, var(--vp-c-red-1));
  border-color: color-mix(in srgb, var(--ws-danger, var(--vp-c-red-1)) 35%, var(--ws-line, var(--vp-c-divider)));
  background: var(--ws-danger-soft, var(--vp-c-red-soft));
}

.inline-feedback {
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
}

.inline-feedback > div {
  min-width: 0;
}

.inline-alert svg,
.inline-feedback svg,
.status-callout svg,
.completion-line svg,
.summary-headline svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.question-view,
.summary-view,
.evidence-view,
.completed-view,
.deferred-view {
  width: min(100%, 760px);
  margin: 0 auto;
}

.question-block {
  padding: 16px;
  border: 1px solid var(--ws-line-strong, var(--vp-c-border));
  border-radius: 6px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
}

.question-source {
  align-items: center;
  gap: 7px;
  color: var(--ws-accent, var(--vp-c-brand-1));
  font-size: 12px;
  font-weight: 700;
}

.question-block p {
  margin: 12px 0 0;
  color: var(--ws-ink, var(--vp-c-text-1));
  font-size: 15px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.composer {
  display: block;
  margin-top: 16px;
}

.composer > span {
  display: block;
  margin-bottom: 7px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 12px;
  font-weight: 650;
}

.composer textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 132px;
  resize: vertical;
  padding: 11px 12px;
  color: var(--ws-ink, var(--vp-c-text-1));
  border: 1px solid var(--ws-line-strong, var(--vp-c-border));
  border-radius: 6px;
  background: var(--ws-surface, var(--vp-c-bg));
  font: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.composer textarea:disabled {
  opacity: 0.72;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 9px;
}

.composer-actions > span {
  color: var(--ws-ink-faint, var(--vp-c-text-3));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.status-callout {
  gap: 11px;
  padding: 14px;
  border: 1px solid var(--ws-line-strong, var(--vp-c-border));
  border-radius: 6px;
}

.status-callout strong,
.status-callout p {
  display: block;
  margin: 0;
}

.status-callout p,
.status-callout li {
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  font-size: 13px;
  line-height: 1.6;
}

.status-callout p {
  margin-top: 4px;
}

.status-callout ul {
  margin: 7px 0 0;
  padding-left: 18px;
}

.status-callout.evidence {
  border-color: color-mix(in srgb, var(--ws-warn, var(--vp-c-yellow-1)) 42%, var(--ws-line, var(--vp-c-divider)));
  background: var(--ws-warn-soft, var(--vp-c-yellow-soft));
}

.status-callout.evidence > svg {
  color: var(--ws-warn, var(--vp-c-yellow-1));
}

.status-callout.deferred {
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
}

.status-callout .submission-note {
  margin-top: 8px;
  color: var(--ws-ink, var(--vp-c-text-1));
  font-weight: 650;
}

.primary-action {
  margin-top: 12px;
}

.summary-headline,
.completion-line {
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--ws-line, var(--vp-c-divider));
}

.summary-headline > svg,
.completion-line > svg {
  color: var(--ws-ok, var(--vp-c-green-1));
}

.transcript {
  margin: 16px 0 0;
  padding: 16px;
  overflow: auto;
  color: var(--ws-ink, var(--vp-c-text-1));
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-radius: 6px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.turn-history {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.completed-evaluations {
  margin-top: 8px;
}

.turn-history li {
  padding: 14px 0;
  border-bottom: 1px solid var(--ws-line, var(--vp-c-divider));
}

.turn-history strong {
  color: var(--ws-accent, var(--vp-c-brand-1));
  font-size: 12px;
}

.turn-history p,
.turn-history blockquote {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.turn-history blockquote {
  padding-left: 10px;
  color: var(--ws-ink-muted, var(--vp-c-text-2));
  border-left: 2px solid var(--ws-line-strong, var(--vp-c-border));
}

.evaluation-detail {
  color: var(--ws-ink-muted, var(--vp-c-text-2));
}

.turn-history .evaluation-detail {
  margin-top: 10px;
  padding: 11px 12px;
  border: 1px solid var(--ws-line, var(--vp-c-divider));
  border-left-width: 3px;
  border-radius: 6px;
  background: var(--ws-surface-soft, var(--vp-c-bg-soft));
  font-size: 12px;
  line-height: 1.6;
}

.evaluation-detail.is-passed {
  border-color: color-mix(in srgb, var(--ws-ok, var(--vp-c-green-1)) 38%, var(--ws-line, var(--vp-c-divider)));
}

.evaluation-detail.is-partial {
  border-color: color-mix(in srgb, var(--ws-warn, var(--vp-c-yellow-1)) 45%, var(--ws-line, var(--vp-c-divider)));
}

.evaluation-detail.is-corrective {
  border-color: color-mix(in srgb, var(--ws-danger, var(--vp-c-red-1)) 38%, var(--ws-line, var(--vp-c-divider)));
}

.evaluation-detail.is-pending {
  color: var(--ws-ink-faint, var(--vp-c-text-3));
}

.evaluation-heading {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.verdict-label {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 22px;
  padding: 1px 7px;
  color: var(--ws-ink, var(--vp-c-text-1));
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
}

.is-passed .verdict-label {
  color: var(--ws-ok, var(--vp-c-green-1));
}

.is-partial .verdict-label {
  color: var(--ws-warn, var(--vp-c-yellow-1));
}

.is-corrective .verdict-label {
  color: var(--ws-danger, var(--vp-c-red-1));
}

.evaluation-heading > span:last-child {
  padding-top: 2px;
}

.evaluation-section {
  margin-top: 9px;
}

.evaluation-section strong {
  display: block;
  margin-bottom: 3px;
  color: var(--ws-ink, var(--vp-c-text-1));
  font-size: 12px;
}

.evaluation-section p,
.evaluation-section ul {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.evaluation-section ul {
  padding-left: 18px;
}

.spinning {
  animation: review-spin 0.8s linear infinite;
}

@keyframes review-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .review-body {
    padding: 14px 12px;
  }

  .question-block,
  .status-callout,
  .transcript {
    padding: 12px;
  }

  .composer-actions {
    align-items: flex-end;
  }

  .composer-actions button,
  .primary-action {
    max-width: 74%;
    min-height: 38px;
    white-space: normal;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
}
</style>
