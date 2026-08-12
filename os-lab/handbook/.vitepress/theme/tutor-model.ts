import { parse as parseYaml } from 'yaml'
// @ts-expect-error 评分唯一实现（前端与 tutor-server 共用，避免两处漂移）
import { scoreLearningEvents } from '../../../learning/rubric.mjs'
// @ts-expect-error 本轮问题分类与服务端意图策略共用同一实现
import { inferQuestionCategory, inferTutorIntent } from '../../../tutor/turn-policy.mjs'
// 护栏规则单一事实源：与 tutor-server 读同一份 YAML
import guardrailSource from '../../../tutor/prompts/guardrails.yaml?raw'

export type TutorStageId = 'orient' | 'read' | 'run' | 'debug' | 'reflect' | 'transfer'

export type TutorLabId = 'lab1' | 'lab2' | 'lab3' | 'lab4' | 'lab5' | 'lab6' | 'lab7' | 'lab8'

export type TutorRole = 'student' | 'assistant'

export type QuestionCategory =
  | 'concept'
  | 'phenomenon'
  | 'cause'
  | 'comparison'
  | 'exploration'
  | 'direct_answer'

export interface TutorStage {
  id: TutorStageId
  index: string
  title: string
  shortTitle: string
  description: string
  goal: string
  evidence: string
  checkpoint: string
}

export interface TutorPrompt {
  id: string
  stage: TutorStageId
  category: Exclude<QuestionCategory, 'direct_answer'>
  label: string
  text: string
}

export interface StageResource {
  paths: string[]
  docs: Array<{ title: string; description: string; href: string }>
}

export interface TutorLab {
  id: TutorLabId
  label: string
  title: string
  shortTitle: string
  systemLayer: string
  buildOutcome: string
  bridge: string
  focus: string
  documentRoute: string
  initialQuestion: string
  verificationCommand: string
  /** 本 Lab 常用推荐指令库，供终端上下方向键循环选用；首条约定为验证命令。 */
  commands: { label: string; command: string }[]
  /** 本 Lab 最需要学生在测试结果页盯住的关键断言；不强制所有 Lab 配置。 */
  keyAssertion?: { id: string; label: string; note: string }
  resources: Record<Exclude<TutorStageId, 'transfer'>, StageResource> & { transfer?: StageResource }
}

export interface TutorMessage {
  id: string
  role: TutorRole
  content: string
  timestamp: string
  kind?: 'stage_intro' | 'conversation'
  stage?: TutorStageId
  category?: QuestionCategory
  guardrail?: boolean
  /** 当轮服务端门控摘要（助手消息）；用于 chips / 拒答态 / 提示层级。 */
  hintLevel?: number
  gate?: string
  evidenceRefs?: string[]
  refused?: boolean
  /** 学生消息附带的工作台附件（可点击溯源；正文 content 仍含拼装后的全文给导师）。 */
  chatAttachments?: Array<{
    id: string
    source: 'code' | 'terminal' | 'problems' | 'tests' | 'manual' | 'trace'
    title: string
    body: string
    origin?: {
      path?: string
      line?: number
      runId?: string
      assertionId?: string
      h2?: string
      h3?: string
      seq?: number
      scope?: 'selection' | 'full' | 'context' | 'single' | 'all'
    }
  }>
  knowledge?: TutorKnowledgeChunk[]
  retrieval?: TutorRetrievalDiagnostics
}

export interface TutorKnowledgeChunk {
  citation: string
  sourceId: string
  sourceTitle?: string
  sectionPath?: string[]
  contentClass?: 'student-safe' | 'guided-hint' | 'teacher-only' | 'system-metadata' | string
  labScopes?: string[]
  locatorStart?: Record<string, unknown> | null
  locatorEnd?: Record<string, unknown> | null
  retrieval?: {
    score?: number
    rrf?: number
    lexicalRank?: number | null
    vectorRank?: number | null
    vectorSimilarity?: number | null
    provider?: string
    model?: string
  } | null
}

export interface TutorRetrievalDiagnostics {
  provider?: string
  model?: string
  lexicalCandidates?: number
  vectorCandidates?: number
  eligibleChunks?: number
  fallbackReason?: string
}

/** 服务端 decideTutorTurn 回传字段（成员 C · Day2 契约）。 */
export interface TutorToolContext {
  latestRun?: {
    runId?: string
    verified?: boolean
    status?: string
    traceCount?: number
  } | null
  diagnosticCount?: number
  traceCount?: number
}

export interface TutorState {
  version?: string
  stage?: TutorStageId
  previousStage?: TutorStageId
  requestedStage?: TutorStageId
  transitioned?: boolean
  gate?: string
  hintLevel?: number
  hintAdvanced?: boolean
  topicKey?: string
  topicIntent?: string
  topicAnchor?: string
  topicChanged?: boolean
  topicChangeReason?: string
  actions?: string[]
  evidenceRefs?: string[]
  toolContext?: TutorToolContext
}

const TUTOR_ACTION_NEXT: Record<string, string> = {
  'ask-for-judgment': '先用自己的话写出初始判断',
  'request-source-evidence': '打开相关源码并指出关键位置',
  'request-trusted-run': '在工作台发起一次可信验证运行',
  'request-regression-run': '修改后重新跑一次可信验证',
  'request-falsifiable-hypothesis': '写出可证伪假设与下一步观察点',
  'inspect-run-evidence': '对照本次运行输出与断言差异',
  'inspect-diagnostic': '打开 Problems 查看编译诊断',
  'ask-causal-explanation': '用因果链解释：现象 → 机制 → 证据',
  'request-socratic-review': '在报告区完成基于过程证据的苏格拉底复盘',
  'request-report-submission': '将已完成复盘的报告提交给教师',
  'ask-transfer-question': '尝试一条迁移问题并说明如何验证',
  'cite-server-evidence': '引用本次可信 run / 断言，勿凭空声称已通过',
  'apply-answer-guardrail': '不要索要完整代码；先给出判断或观察',
}

const TUTOR_GATE_NEXT: Record<string, string> = {
  'missing-initial-judgment': '缺初始判断：先说出实验要解决的系统问题',
  'missing-source-evidence': '缺源码证据：打开 trap/调度相关文件并指出位置',
  'missing-trusted-run': '缺可信运行：先发起工作台里的可信验证',
  'missing-debug-hypothesis': '缺可证伪假设：先写现象与下一步观察',
  'missing-review-evidence': '缺最终复盘：先完成基于对话、行为和运行证据的苏格拉底问答',
  'missing-report-evidence': '复盘已完成：提交报告后再进入迁移检验',
  'answer-guardrail': '请求被护栏拦截：改为描述判断或观察',
  'diagnostic-available': '已有诊断：先定位问题再改代码',
  'trusted-run-failed': '验证未通过：用最小实验区分失败原因',
  'trusted-run-passed': '已有通过的可信 run：解释断言各证明什么',
  'change-awaits-regression': '已改代码：再跑一次回归验证',
  'initial-judgment-observed': '继续：打开源码核对机制路径',
  'source-evidence-observed': '继续：发起可信验证',
  'regression-passed': '回归已过：进入因果解释与复盘',
  'review-evidence-complete': '复盘与报告证据齐：尝试迁移检验',
  'transfer-check': '完成一条带预测的迁移回答',
}

/** 通用提示阶梯（L0–L4）；具体 Lab 话术仍由服务端 / manifest 负责。 */
export const TUTOR_HINT_LADDER: Record<number, { short: string; detail: string }> = {
  0: { short: '观察复现', detail: '先完整跑通并记录可观察现象，再下结论。' },
  1: { short: '提出假设', detail: '用自己的话提出可检验假设，说明依据。' },
  2: { short: '最小实验', detail: '设计能区分假设的最小实验或对照观察。' },
  3: { short: '对比路径', detail: '对照相关代码路径与状态写入，定位差异。' },
  4: { short: '升阶边界', detail: '提示已到边界；需要教师短辅导，不代替完整实现。' },
}

export function describeTutorHintLevel(level: number | undefined | null): string {
  if (!Number.isInteger(level) || Number(level) < 0) return ''
  const meta = TUTOR_HINT_LADDER[Number(level)] || TUTOR_HINT_LADDER[4]
  return `L${level} · ${meta.short}`
}

export function tutorHintDetail(level: number | undefined | null): string {
  if (!Number.isInteger(level) || Number(level) < 0) return ''
  const meta = TUTOR_HINT_LADDER[Number(level)] || TUTOR_HINT_LADDER[4]
  return meta.detail
}

/** 是否处于「拒答完整实现」门控态。 */
export function isTutorRefused(state: TutorState | null | undefined): boolean {
  if (!state) return false
  if (state.gate === 'answer-guardrail') return true
  return (state.actions || []).includes('apply-answer-guardrail')
}

/** 可导航的证据引用（过滤 event:）。 */
export function navigableEvidenceRefs(refs: string[] | undefined | null): string[] {
  return (refs || []).filter((ref) => {
    const value = String(ref || '')
    return value.startsWith('run:') || value.startsWith('trace:') || value.startsWith('diag:') || value.startsWith('diagnostic:')
  })
}

export type TutorEvidenceChip = { ref: string; label: string; kind: 'run' | 'trace' | 'diag' }

/** 从 tutorState 生成可点击证据 chips（含诊断摘要）。 */
export function tutorEvidenceChips(state: TutorState | null | undefined): TutorEvidenceChip[] {
  if (!state) return []
  const chips: TutorEvidenceChip[] = []
  const seen = new Set<string>()
  const push = (ref: string, label: string, kind: TutorEvidenceChip['kind']) => {
    if (seen.has(ref)) return
    seen.add(ref)
    chips.push({ ref, label, kind })
  }
  for (const ref of navigableEvidenceRefs(state.evidenceRefs)) {
    if (ref.startsWith('run:')) push(ref, shortRef(ref), 'run')
    else if (ref.startsWith('trace:')) push(ref, shortRef(ref), 'trace')
    else push(ref, '诊断', 'diag')
  }
  const runId = state.toolContext?.latestRun?.runId
  if (runId) {
    push(`run:${runId}`, shortRef(`run:${runId}`), 'run')
    const traces = Number(state.toolContext?.traceCount ?? state.toolContext?.latestRun?.traceCount ?? 0)
    if (traces > 0) push(`trace:${runId}`, `trace:${String(runId).slice(0, 8)}…`, 'trace')
  }
  const diagnostics = Number(state.toolContext?.diagnosticCount || 0)
  if (diagnostics > 0) push('diag:latest', `诊断 ${diagnostics} 条`, 'diag')
  return chips
}

/** 从 tutorState 归纳「已有证据」文案；无 verified run 时绝不写「已验证通过」。 */
export function describeTutorEvidenceHave(state: TutorState | null | undefined): string {
  if (!state) return '尚无服务端证据'
  const parts: string[] = []
  const run = state.toolContext?.latestRun
  if (run?.runId) {
    parts.push(run.verified ? `可信 run 已通过（${shortRef(run.runId)}）` : `可信 run 未通过（${shortRef(run.runId)}）`)
  }
  const diagnostics = Number(state.toolContext?.diagnosticCount || 0)
  if (diagnostics > 0) parts.push(`诊断 ${diagnostics} 条`)
  const traces = Number(state.toolContext?.traceCount ?? run?.traceCount ?? 0)
  if (traces > 0) parts.push(`trace ${traces} 条`)
  const refs = (state.evidenceRefs || []).filter((ref) => !ref.startsWith('event:'))
  if (refs.length && !run?.runId) {
    parts.push(refs.slice(0, 2).map(shortRef).join('、'))
  }
  return parts.length ? parts.join(' · ') : '尚无服务端证据'
}

/** 从 gate / actions 归纳「下一步所需」；优先强调 missing-* 缺口。 */
export function describeTutorEvidenceNext(state: TutorState | null | undefined): string {
  if (!state) return '先向导师提问，或跑一次可信验证'
  const gate = String(state.gate || '')
  if (gate.startsWith('missing-') && TUTOR_GATE_NEXT[gate]) return TUTOR_GATE_NEXT[gate]
  if (gate && TUTOR_GATE_NEXT[gate]) return TUTOR_GATE_NEXT[gate]
  const actions = state.actions || []
  for (const action of actions) {
    if (action.startsWith('offer-hint-')) continue
    if (action === 'apply-answer-guardrail') continue
    if (TUTOR_ACTION_NEXT[action]) return TUTOR_ACTION_NEXT[action]
  }
  if (actions.includes('apply-answer-guardrail')) return TUTOR_ACTION_NEXT['apply-answer-guardrail']
  return '保持当前阶段，补充可观察证据后再推进'
}

export function tutorStageMeta(stageId: TutorStageId | undefined) {
  return tutorStages.find((stage) => stage.id === stageId) || tutorStages[0]
}

export function shortRef(ref: string): string {
  const value = String(ref || '')
  if (value.startsWith('run:')) return `run:${value.slice(4, 12)}…`
  if (value.startsWith('trace:')) return `trace:${value.slice(6, 14)}…`
  if (value.startsWith('diag:') || value.startsWith('diagnostic:')) return '诊断'
  if (value.length > 14) return `${value.slice(0, 12)}…`
  return value
}

export interface LearningEvent {
  version: 1 | 2
  id: string
  sessionId: string
  labId: TutorLabId
  timestamp: string
  type:
    | 'session_start'
    | 'stage_enter'
    | 'template_used'
    | 'student_message'
    | 'ai_response'
    | 'guardrail_triggered'
    | 'verification_attempt'
    | 'reflection_submitted'
    | 'manual_note'
    | 'code_open'
    | 'code_save'
    | 'run_started'
    | 'run_finished'
    | 'diagnostic_opened'
    | 'trace_inspected'
    | 'hint_requested'
    | 'checkpoint_answered'
    | 'report_submitted'
    | 'teacher_reviewed'
  stage: TutorStageId
  category?: QuestionCategory
  content?: string
  metadata?: Record<string, unknown>
  runId?: string
  recipeId?: string
  workspaceVersion?: string
  exitCode?: number
  duration?: number
  outputHash?: string
  assertions?: Array<{ id: string; label: string; passed: boolean; expected: string; observed: string }>
  file?: string
  line?: number
  code?: string
  view?: string
  eventRange?: { start: number; end: number }
}

export interface TutorScore {
  total: number
  process: number
  result: number
  thinking: number
  questionQuality: number
  depth: number
  verification: number
  reflection: number
  guardrailPenalty: number
  summary: string
}

/** 服务端主导的实验结束苏格拉底复盘状态。 */
export type SocraticReviewStatus =
  | 'review_planning'
  | 'review_ready'
  | 'review_active'
  | 'awaiting_evidence'
  | 'review_completed'
  | 'deferred'

export type SocraticReviewVerdict =
  | 'passed'
  | 'partial'
  | 'needs-evidence'
  | 'misconception'
  | 'defer'

export type SocraticReviewQuestionKind =
  | 'concept-explanation'
  | 'causal-explanation'
  | 'evidence-reflection'
  | 'counterexample'
  | 'transfer'

export interface SocraticReviewEvaluation {
  verdict: SocraticReviewVerdict
  rationale: string
  missingEvidence: string[]
}

/** 公开复盘题目。服务端只返回已经 asked 的题目，学生端不得提前展示计划题。 */
export interface SocraticReviewTurn {
  id: string
  ordinal: number
  questionId: string
  conceptId: string
  kind: SocraticReviewQuestionKind
  prompt: string
  parentTurnId: string | null
  studentAnswer: string | null
  evaluation: SocraticReviewEvaluation | null
  askedAt: string
  answeredAt: string | null
}

export interface SocraticReview {
  reviewId: string
  sessionId: string
  labId: TutorLabId
  status: SocraticReviewStatus
  maxQuestions: number
  askedCount: number
  answeredCount: number
  finalSummary: string | null
  transcriptMarkdown: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  deferredReason: string
  turns: SocraticReviewTurn[]
}

export interface SocraticReviewResponse {
  ok: boolean
  lifecycle?: string
  review: SocraticReview | null
  resumed?: boolean
  replayed?: boolean
  error?: string
}

/** 评分量规 v2 细项（与 learning/rubric-v2.mjs 对齐）。 */
export type AssessmentItemStatus = 'unobserved' | 'met' | 'partial' | 'not-met' | string

export interface AssessmentItem {
  id: string
  dimension: 'process' | 'result' | 'reflection' | string
  label: string
  score: number | null
  status: AssessmentItemStatus
  evidenceRefs: string[]
  note?: string
}

export interface AssessmentDimensions {
  process: number
  result: number
  reflection: number
}

export interface AssessmentV2 {
  version: string
  labId?: string
  sessionId?: string
  total: number
  dimensions: AssessmentDimensions
  items: AssessmentItem[]
  uncertainty?: string
}

export type AssessmentEvidenceKind = 'run' | 'trace' | 'diag' | 'event' | 'other'

export type AssessmentEvidenceChip = { ref: string; label: string; kind: AssessmentEvidenceKind }

const ASSESSMENT_DIMENSION_LABELS: Record<string, string> = {
  process: '过程',
  result: '结果',
  reflection: '反思',
}

/** 细项状态 → 中文；unobserved / 无分一律「未观察到」。 */
export function describeAssessmentStatus(status: AssessmentItemStatus | undefined | null, score?: number | null): string {
  if (score === null || status === 'unobserved' || !status) return '未观察到'
  if (status === 'met') return '已满足'
  if (status === 'partial') return '部分'
  if (status === 'not-met') return '未满足'
  return String(status)
}

export function describeAssessmentDimension(dimension: string | undefined): string {
  return ASSESSMENT_DIMENSION_LABELS[String(dimension || '')] || String(dimension || '其他')
}

/** 将 API / automaticResult 规范为 AssessmentV2；缺字段时不造假分。 */
export function normalizeAssessmentV2(
  raw: Partial<AssessmentV2> | null | undefined,
  extras?: { version?: string; labId?: string; sessionId?: string },
): AssessmentV2 | null {
  if (!raw || typeof raw !== 'object') return null
  const dimensions = raw.dimensions
  if (!dimensions || typeof raw.total !== 'number' || !Array.isArray(raw.items)) return null
  return {
    version: String(raw.version || extras?.version || 'rubric-v2'),
    labId: raw.labId || extras?.labId,
    sessionId: raw.sessionId || extras?.sessionId,
    total: Math.round(raw.total),
    dimensions: {
      process: Math.round(Number(dimensions.process) || 0),
      result: Math.round(Number(dimensions.result) || 0),
      reflection: Math.round(Number(dimensions.reflection) || 0),
    },
    items: raw.items.map((item) => ({
      id: String(item.id || ''),
      dimension: String(item.dimension || ''),
      label: String(item.label || item.id || ''),
      score: item.score === null || item.score === undefined ? null : Number(item.score),
      status: (item.score === null || item.score === undefined ? 'unobserved' : item.status) || 'unobserved',
      evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [],
      note: item.note ? String(item.note) : '',
    })),
    uncertainty: raw.uncertainty ? String(raw.uncertainty) : undefined,
  }
}

export function assessmentEvidenceKind(ref: string): AssessmentEvidenceKind {
  const value = String(ref || '')
  if (value.startsWith('run:')) return 'run'
  if (value.startsWith('trace:')) return 'trace'
  if (value.startsWith('diag:') || value.startsWith('diagnostic:')) return 'diag'
  if (value.startsWith('event:')) return 'event'
  return 'other'
}

/** 细项证据 chips（含 event:，供得分区展示）。 */
export function assessmentEvidenceChips(refs: string[] | undefined | null): AssessmentEvidenceChip[] {
  const chips: AssessmentEvidenceChip[] = []
  const seen = new Set<string>()
  for (const ref of refs || []) {
    const value = String(ref || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    const kind = assessmentEvidenceKind(value)
    chips.push({
      ref: value,
      label: kind === 'event' ? `event:${value.slice(6, 14)}${value.length > 14 ? '…' : ''}` : shortRef(value),
      kind,
    })
  }
  return chips
}

export function groupAssessmentItems(items: AssessmentItem[]): Array<{ dimension: string; label: string; items: AssessmentItem[] }> {
  const order = ['process', 'result', 'reflection']
  const groups = new Map<string, AssessmentItem[]>()
  for (const item of items) {
    const key = item.dimension || 'other'
    const list = groups.get(key) || []
    list.push(item)
    groups.set(key, list)
  }
  const keys = [
    ...order.filter((key) => groups.has(key)),
    ...[...groups.keys()].filter((key) => !order.includes(key)),
  ]
  return keys.map((dimension) => ({
    dimension,
    label: describeAssessmentDimension(dimension),
    items: groups.get(dimension) || [],
  }))
}

export const categoryLabels: Record<QuestionCategory, string> = {
  concept: '概念澄清',
  phenomenon: '现象描述',
  cause: '追因分析',
  comparison: '对比迁移',
  exploration: '实验验证',
  direct_answer: '索要答案',
}

export const tutorStages: TutorStage[] = [
  {
    id: 'orient',
    index: '00',
    title: '建立问题边界',
    shortTitle: '定界',
    description: '先说出这个实验要解决的系统问题，以及你当前的判断。',
    goal: '把“我不会写”改写成一个可讨论、可验证的问题。',
    evidence: '一条自己的初始判断',
    checkpoint: '我能说清实验目标、关键边界和自己的初始假设。',
  },
  {
    id: 'read',
    index: '01',
    title: '阅读机制路径',
    shortTitle: '阅读',
    description: '沿实验的关键入口、核心数据结构和调用链阅读实现。',
    goal: '区分机制边界，找到真正决定行为的代码路径。',
    evidence: '能口述一条完整机制链',
    checkpoint: '我能从入口追到核心实现，并说明每一层的职责。',
  },
  {
    id: 'run',
    index: '02',
    title: '运行验证实验',
    shortTitle: '验证',
    description: '先预测关键输出，再运行当前 Lab，对照实际差异。',
    goal: '把模型回答变成可以被 QEMU 输出检验的假设。',
    evidence: 'QEMU 关键输出或失败片段',
    checkpoint: '我记录了至少一次运行结果，而不是只相信导师解释。',
  },
  {
    id: 'debug',
    index: '03',
    title: '解释异常现象',
    shortTitle: '排错',
    description: '用“现象、假设、最小实验”组织排错。',
    goal: '让调试从猜 patch 变成构造证据链。',
    evidence: '现象、假设、验证三件套',
    checkpoint: '我能给出一个会证伪当前假设的最小实验。',
  },
  {
    id: 'reflect',
    index: '04',
    title: '完成复盘报告',
    shortTitle: '复盘',
    description: '区分独立判断、AI 帮助与客观验证。',
    goal: '形成答辩时可展示的学习过程证据。',
    evidence: '三句话复盘与导出记录',
    checkpoint: '我能说明 AI 帮了哪里，以及我自己验证了哪里。',
  },
  {
    id: 'transfer',
    index: '05',
    title: '完成迁移检验',
    shortTitle: '迁移',
    description: '改变一个关键条件，重新预测并解释机制。',
    goal: '确认理解能够迁移，而不是只复述原实验答案。',
    evidence: '一条带预测和验证方案的迁移回答',
    checkpoint: '我能在条件变化后重新解释机制，并指出如何验证。',
  },
]

export const tutorLabs: TutorLab[] = [
  {
    id: 'lab1',
    label: 'Lab1',
    title: '裸机启动与 SBI',
    shortTitle: 'Bare Metal',
    systemLayer: '启动底座',
    buildOutcome: '让内核从固件接管机器，完成启动、输出与关机。',
    bridge: '从一台只有固件的 RISC-V 机器开始。',
    focus: '理解从固件进入内核、链接脚本、入口汇编与 SBI 输出之间的启动链路。',
    documentRoute: '/labs/lab1-bare-metal',
    initialQuestion: '从机器上电到内核打印第一行文字，中间至少经过哪些环节？先写下你的判断，我们再沿入口和链接地址逐层验证。',
    verificationCommand: 'cargo run -p kernel --features lab1 --release',
    commands: [
      { label: '验证运行', command: 'cargo run -p kernel --features lab1 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab1' },
      { label: '构建（release）', command: 'cargo build -p kernel --features lab1 --release' },
      { label: '构建（debug）', command: 'cargo build -p kernel --features lab1' },
      { label: '检查', command: 'cargo check -p kernel --features lab1' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab1-bare-metal.md', 'kernel/src/entry.asm'], docs: [{ title: 'Lab1 实验指导', description: '建立裸机启动、SBI 与内核入口的整体认识', href: '/labs/lab1-bare-metal' }, { title: '实验知识地图', description: '查看八个 Lab 的递进关系', href: '/labs/overview' }] },
      read: { paths: ['kernel/linker.ld', 'kernel/src/entry.asm', 'kernel/src/main.rs'], docs: [{ title: 'Lab1 启动链路', description: '沿链接地址、入口汇编与 Rust 主函数阅读', href: '/labs/lab1-bare-metal' }, { title: '系统架构', description: '理解工作区中各模块的职责边界', href: '/project/architecture' }] },
      run: { paths: ['kernel/src/main.rs', 'kernel/src/console.rs'], docs: [{ title: '快速验证', description: '检查环境、启动 QEMU 并观察输出', href: '/guide/ai-tutor' }, { title: 'Lab1 阅读理解（任务二）', description: '用实验文档【任务二】自测机制理解', href: '/labs/lab1-bare-metal' }] },
      debug: { paths: ['kernel/linker.ld', 'kernel/src/entry.asm', 'kernel/src/console.rs'], docs: [{ title: 'Lab1 常见问题', description: '对照启动地址、栈和 SBI 输出排查异常', href: '/labs/lab1-bare-metal' }, { title: '验证方法', description: '用最小观察点缩小故障范围', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab1-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理判断、提示与验证证据', href: '/project/ai-collaboration' }, { title: 'Lab1 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab1-answers' }] },
    },
  },
  {
    id: 'lab2',
    label: 'Lab2',
    title: 'Trap 与任务切换',
    shortTitle: 'Trap & Task',
    systemLayer: '执行与切换',
    buildOutcome: '当前目标：让用户程序经 trap 请求内核服务，并在多任务间协作切换；用输出断言证明学会了。',
    bridge: '复用 Lab1 的启动入口、内核栈和控制台，为用户态执行建立边界。',
    focus: '先弄清「为何必须 trap」，再沿 ecall→保存→分发→调度→sret 找证据；变体任务看 task.rs 文件头。',
    documentRoute: '/labs/lab2-trap-and-task',
    initialQuestion: '用户程序为什么不能直接调用内核里的普通函数？先写下你的判断（不必完美），我们再把它对到代码路径，并用 QEMU 输出验证。',
    verificationCommand: 'cargo run -p kernel --features lab2 --release',
    keyAssertion: {
      id: 'yield-five-rounds',
      label: 'Yield round ×5',
      note: '退出码 0 不足为凭；必须看到 5 次 Yield round。',
    },
    commands: [
      { label: '验证运行', command: 'cargo run -p kernel --features lab2 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab2' },
      { label: '构建（release）', command: 'cargo build -p kernel --features lab2 --release' },
      { label: '构建（debug）', command: 'cargo build -p kernel --features lab2' },
      { label: '检查', command: 'cargo check -p kernel --features lab2' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab2-trap-and-task.md', 'kernel/src/trap.rs'], docs: [{ title: 'Lab2 实验指导', description: '看清本实验目标：用户态、trap 与多任务', href: '/labs/lab2-trap-and-task' }, { title: '实验知识地图', description: 'Lab2 在八个 Lab 中的位置', href: '/labs/overview' }] },
      read: { paths: ['os-context/src/trap.asm', 'kernel/src/trap.rs', 'os-context/src/lib.rs'], docs: [{ title: '沿着控制流读', description: 'ecall → TrapContext → sret；对照正文知识层次表', href: '/labs/lab2-trap-and-task' }, { title: '系统架构', description: 'kernel 与 os-context 的职责边界', href: '/project/architecture' }] },
      run: { paths: ['kernel/src/main.rs', 'user/src/bin/yield.rs'], docs: [{ title: '受信验证', description: '必须同时看到 Hello、幂结果、Yield×5、全部退出', href: '/guide/ai-tutor' }, { title: '阅读理解（任务二）', description: '先独立作答再对照答案', href: '/labs/lab2-trap-and-task' }] },
      debug: { paths: ['kernel/src/trap.rs', 'kernel/src/task.rs', 'kernel/src/console.rs'], docs: [{ title: '最小实验排错', description: '区分双栈 / 调度状态 / ABI；变体见文件头与验证命令', href: '/labs/lab2-trap-and-task' }, { title: '验证断言', description: '不要只用退出码 0 判断通过', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab2-answers.md'], docs: [{ title: '复盘证据链', description: '写清假设、AI 帮助点与验证输出', href: '/project/ai-collaboration' }, { title: 'Lab2 参考答案', description: '完成后再核对', href: '/answers/lab2-answers' }] },
    },
  },
  {
    id: 'lab3',
    label: 'Lab3',
    title: '内存与虚拟内存',
    shortTitle: 'Memory',
    systemLayer: '地址空间',
    buildOutcome: '为任务建立隔离的虚拟地址空间，并让页表管理真实物理内存。',
    bridge: '承接 Lab2 的 Trap 与任务上下文，为每个执行流补上受保护的地址空间。',
    focus: '理解物理页分配、页表映射、地址转换与内核内存管理的边界。',
    documentRoute: '/labs/lab3-memory',
    initialQuestion: '虚拟地址为什么不能直接当作物理地址使用？先画出你理解中的地址转换链路，再用代码和运行结果检查它。',
    verificationCommand: 'cargo run -p kernel --features lab3 --release',
    commands: [
      { label: '验证运行', command: 'cargo run -p kernel --features lab3 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab3' },
      { label: '构建（release）', command: 'cargo build -p kernel --features lab3 --release' },
      { label: '构建（debug）', command: 'cargo build -p kernel --features lab3' },
      { label: '检查', command: 'cargo check -p kernel --features lab3' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab3-memory.md', 'kernel/src/mm.rs'], docs: [{ title: 'Lab3 实验指导', description: '建立物理内存、页表与地址空间的整体模型', href: '/labs/lab3-memory' }, { title: '实验知识地图', description: '查看内存机制与前后 Lab 的关系', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/mm.rs', 'kernel/src/config.rs', 'kernel/src/riscv.rs'], docs: [{ title: 'Lab3 机制说明', description: '沿页分配、映射与地址转换阅读代码', href: '/labs/lab3-memory' }, { title: '系统架构', description: '定位内存模块在内核中的职责', href: '/project/architecture' }] },
      run: { paths: ['kernel/src/mm.rs', 'kernel/src/main.rs'], docs: [{ title: '快速验证', description: '运行内存测试并记录关键映射输出', href: '/guide/ai-tutor' }, { title: 'Lab3 阅读理解（任务二）', description: '用实验文档【任务二】自测机制理解', href: '/labs/lab3-memory' }] },
      debug: { paths: ['kernel/src/mm.rs', 'kernel/src/loader.rs', 'kernel/src/trap.rs'], docs: [{ title: 'Lab3 常见问题', description: '从映射权限、页号和生命周期定位异常', href: '/labs/lab3-memory' }, { title: '验证方法', description: '用最小映射实验验证假设', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab3-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理地址转换的证据链', href: '/project/ai-collaboration' }, { title: 'Lab3 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab3-answers' }] },
    },
  },
  {
    id: 'lab4',
    label: 'Lab4',
    title: '进程管理',
    shortTitle: 'Process',
    systemLayer: '进程能力',
    buildOutcome: '让程序能够 fork、exec、wait，形成可创建、替换和回收的进程生命周期。',
    bridge: '复用 Lab3 的地址空间与 Lab2 的上下文切换，把任务提升为完整进程。',
    focus: '理解进程创建、地址空间复制、调度状态与 fork/exec 生命周期。',
    documentRoute: '/labs/lab4-process',
    initialQuestion: '一个正在运行的程序与一个进程控制块有什么区别？先列出进程必须拥有的状态，再沿 fork 或 exec 验证。',
    verificationCommand: 'cargo run -p kernel --features lab4 --release',
    commands: [
      { label: '验证运行', command: 'cargo run -p kernel --features lab4 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab4' },
      { label: '构建（release）', command: 'cargo build -p kernel --features lab4 --release' },
      { label: '构建（debug）', command: 'cargo build -p kernel --features lab4' },
      { label: '检查', command: 'cargo check -p kernel --features lab4' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab4-process.md', 'kernel/src/process.rs'], docs: [{ title: 'Lab4 实验指导', description: '建立进程生命周期和调度状态模型', href: '/labs/lab4-process' }, { title: '实验知识地图', description: '查看进程与内存、文件系统的关系', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/process.rs', 'kernel/src/task.rs', 'kernel/src/loader.rs'], docs: [{ title: 'Lab4 机制说明', description: '沿创建、装载、切换和回收阅读实现', href: '/labs/lab4-process' }, { title: '系统架构', description: '理解进程模块与其他子系统的边界', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/fork_test.rs', 'user/src/bin/exec_test.rs'], docs: [{ title: '快速验证', description: '运行 fork/exec 测试并记录进程行为', href: '/guide/ai-tutor' }, { title: 'Lab4 阅读理解（任务二）', description: '用实验文档【任务二】自测机制理解', href: '/labs/lab4-process' }] },
      debug: { paths: ['kernel/src/process.rs', 'kernel/src/task.rs', 'kernel/src/trap.rs'], docs: [{ title: 'Lab4 常见问题', description: '从状态转换、上下文和资源回收定位异常', href: '/labs/lab4-process' }, { title: '验证方法', description: '用最小进程测试区分故障环节', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md'], docs: [{ title: 'AI 协作记录', description: '整理进程行为与代码证据', href: '/project/ai-collaboration' }] },
    },
  },
  {
    id: 'lab5',
    label: 'Lab5',
    title: '文件系统与并发',
    shortTitle: 'FS & Sync',
    systemLayer: '文件与并发',
    buildOutcome: '让进程通过文件和管道交换数据，并用同步机制保护共享状态。',
    bridge: '承接 Lab4 的进程与资源生命周期，补齐持久数据、进程通信和并发安全。',
    focus: '理解文件抽象、管道、共享状态与同步原语如何保证并发访问的一致性。',
    documentRoute: '/labs/lab5-fs-and-sync',
    initialQuestion: '两个执行流同时访问同一份内核状态时，错误最可能出现在哪里？先描述一个竞态场景，再寻找可观察证据。',
    verificationCommand: 'cargo run -p kernel --features lab5 --release',
    commands: [
      { label: '验证运行', command: 'cargo run -p kernel --features lab5 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab5' },
      { label: '构建（release）', command: 'cargo build -p kernel --features lab5 --release' },
      { label: '构建（debug）', command: 'cargo build -p kernel --features lab5' },
      { label: '检查', command: 'cargo check -p kernel --features lab5' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab5-fs-and-sync.md', 'kernel/src/fs/mod.rs', 'kernel/src/fs/embedded.rs'], docs: [{ title: 'Lab5 实验指导', description: '建立文件、管道和同步机制的整体认识', href: '/labs/lab5-fs-and-sync' }, { title: '实验知识地图', description: '查看完整实验能力链', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/fs/mod.rs', 'kernel/src/fs/embedded.rs', 'kernel/src/sync.rs', 'kernel/src/cell.rs'], docs: [{ title: 'Lab5 机制说明', description: '沿文件操作、共享状态和同步路径阅读', href: '/labs/lab5-fs-and-sync' }, { title: '系统架构', description: '理解文件系统与进程模块的接口', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/fs_test.rs', 'user/src/bin/pipe_test.rs'], docs: [{ title: '快速验证', description: '运行文件与管道测试并记录并发行为', href: '/guide/ai-tutor' }, { title: 'Lab5 阅读理解（任务二）', description: '用实验文档【任务二】自测机制理解', href: '/labs/lab5-fs-and-sync' }] },
      debug: { paths: ['kernel/src/fs/embedded.rs', 'kernel/src/fs/mod.rs', 'kernel/src/sync.rs', 'kernel/src/process.rs'], docs: [{ title: 'Lab5 常见问题', description: '从 fd 继承、管道 refs 和锁定位异常', href: '/labs/lab5-fs-and-sync' }, { title: '验证方法', description: '用重复运行和最小并发场景检验假设', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab5-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理并发问题的证据链', href: '/project/ai-collaboration' }, { title: 'Lab5 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab5-answers' }] },
    },
  },
  {
    id: 'lab6',
    label: 'Lab6',
    title: '磁盘文件系统',
    shortTitle: 'Disk FS',
    systemLayer: '持久存储',
    buildOutcome: '让文件真正落在 VirtIO 块设备上，支持硬链接、fstat 与批量创建删除。',
    bridge: '承接 Lab5 的内嵌文件抽象，把数据从内存搬到能断电保存的磁盘布局上。',
    focus: '理解 VirtIO 块设备驱动、easy-fs 磁盘布局、inode 与硬链接的引用计数。',
    documentRoute: '/labs/lab6-disk-fs',
    initialQuestion: '内存里的文件和磁盘上的文件，本质差别是什么？先写下你认为一次 write 落盘要经过哪些层，再沿块设备接口逐层验证。',
    verificationCommand: 'make test-lab6',
    commands: [
      { label: '验证测试', command: 'make test-lab6' },
      { label: '构建', command: 'cargo build -p kernel --features lab6 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab6' },
      { label: '检查', command: 'cargo check -p kernel --features lab6' },
      { label: '全量检查', command: 'make check' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: {
        paths: ['labs/lab6-disk-fs.md', 'kernel/src/fs/disk.rs'],
        docs: [
          { title: 'Lab6 实验指导', description: '建立块设备、磁盘布局与文件系统分层的整体认识', href: '/labs/lab6-disk-fs' },
          { title: '实验知识地图', description: '查看八个 Lab 的递进关系', href: '/labs/overview' },
        ],
      },
      read: {
        paths: ['kernel/src/fs/disk.rs', 'kernel/src/virtio_block.rs', 'kernel/src/fs/mod.rs'],
        docs: [
          { title: 'Lab6 机制说明', description: '沿 VirtIO、easy-fs 与 DiskFs 硬链接路径阅读', href: '/labs/lab6-disk-fs' },
          { title: '系统架构', description: '理解 os-fs 与内核文件层的职责边界', href: '/project/architecture' },
        ],
      },
      run: {
        paths: ['user/src/bin/file_test.rs', 'user/src/bin/link_test.rs', 'user/src/bin/lab6_usertest.rs'],
        docs: [
          { title: '快速验证', description: '运行带 VirtIO 的 lab6 全链测例', href: '/guide/ai-tutor' },
          { title: 'Lab6 阅读理解（任务二）', description: '用实验文档【任务二】自测磁盘布局与硬链接', href: '/labs/lab6-disk-fs' },
        ],
      },
      debug: {
        paths: ['kernel/src/fs/disk.rs', 'kernel/src/virtio_block.rs', 'user/src/bin/link_test.rs'],
        docs: [
          { title: 'Lab6 常见问题', description: '从 DiskFs::link 的 nlink 与测例现象定位异常', href: '/labs/lab6-disk-fs' },
          { title: '验证方法', description: '用 file_test / link_test 对照缩小范围', href: '/guide/ai-tutor' },
        ],
      },
      reflect: {
        paths: ['project/ai-collaboration.md', 'kernel/src/fs/disk.rs'],
        docs: [
          { title: 'AI 协作记录', description: '整理磁盘路径的证据链', href: '/project/ai-collaboration' },
          { title: 'Lab6 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab6-answers' },
        ],
      },
    },
  },
  {
    id: 'lab7',
    label: 'Lab7',
    title: 'IPC 与信号',
    shortTitle: 'IPC & Signal',
    systemLayer: '进程通信',
    buildOutcome: '统一文件描述符抽象，支持 dup 重定向，并让进程能收发与屏蔽信号。',
    bridge: '承接 Lab6 的文件抽象，把管道、标准流和磁盘文件统一进 fd 表，再叠加异步信号。',
    focus: '理解统一 fd 表、dup 语义、信号的注册投递时机与屏蔽字。',
    documentRoute: '/labs/lab7-ipc-signal',
    initialQuestion: '内核在什么时机检查并投递信号最合适？先写下你的候选时机和理由，我们再对照 trap 返回路径验证。',
    verificationCommand: 'make test-lab7',
    commands: [
      { label: '验证测试', command: 'make test-lab7' },
      { label: '构建', command: 'cargo build -p kernel --features lab7 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab7' },
      { label: '检查', command: 'cargo check -p kernel --features lab7' },
      { label: '全量检查', command: 'make check' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: { paths: ['labs/lab7-ipc-signal.md', 'kernel/src/signal.rs'], docs: [{ title: 'Lab7 实验指导', description: '建立统一 fd 与信号机制的整体认识', href: '/labs/lab7-ipc-signal' }, { title: '实验知识地图', description: '查看 IPC 在系统能力链中的位置', href: '/labs/overview' }] },
      read: { paths: ['os-fs/src/fd_kind.rs', 'kernel/src/signal.rs', 'os-signal/src/lib.rs'], docs: [{ title: 'Lab7 机制说明', description: '沿 fd 表、dup 与信号投递路径阅读实现', href: '/labs/lab7-ipc-signal' }, { title: '系统架构', description: '理解 os-signal 组件与内核的边界', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/dup_test.rs', 'user/src/bin/signal_test.rs', 'user/src/bin/signal_mask_test.rs'], docs: [{ title: '快速验证', description: '运行 lab7 测试链并观察信号行为', href: '/guide/ai-tutor' }, { title: 'Lab7 阅读理解（任务二）', description: '用实验文档【任务二】自测 fd 与信号语义', href: '/labs/lab7-ipc-signal' }] },
      debug: { paths: ['kernel/src/signal.rs', 'kernel/src/trap.rs', 'user/src/bin/signal_mask_test.rs'], docs: [{ title: 'Lab7 常见问题', description: '从投递时机与屏蔽字定位信号异常', href: '/labs/lab7-ipc-signal' }, { title: '验证方法', description: '构造最小信号场景区分故障环节', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'kernel/src/signal.rs'], docs: [{ title: 'AI 协作记录', description: '整理信号时序的证据链', href: '/project/ai-collaboration' }] },
    },
  },
  {
    id: 'lab8',
    label: 'Lab8',
    title: '线程与同步',
    shortTitle: 'Thread & Sync',
    systemLayer: '并发同步',
    buildOutcome: '在进程内支持多线程，提供阻塞式互斥锁、信号量、条件变量与死锁检测。',
    bridge: '承接 Lab7 的进程能力，把执行流细分为线程，并让同步原语真正阻塞而非自旋。',
    focus: '理解进程/线程双层结构、finish_blocking_syscall 阻塞衔接、unlock 唤醒与死锁短路。',
    documentRoute: '/labs/lab8-thread-sync',
    initialQuestion: '自旋锁和阻塞锁在内核里的代价差在哪里？先描述一个线程拿不到锁之后应该发生什么，再沿 wait queue 验证。',
    verificationCommand: 'make test-lab8',
    commands: [
      { label: '验证测试', command: 'make test-lab8' },
      { label: '构建', command: 'cargo build -p kernel --features lab8 --release' },
      { label: '运行（debug）', command: 'cargo run -p kernel --features lab8' },
      { label: '检查', command: 'cargo check -p kernel --features lab8' },
      { label: '全量检查', command: 'make check' },
      { label: '清理', command: 'cargo clean -p kernel' },
    ],
    resources: {
      orient: {
        paths: ['labs/lab8-thread-sync.md', 'kernel/src/processor.rs', 'kernel/src/sync_syscall.rs'],
        docs: [
          { title: 'Lab8 实验指导', description: '建立线程模型与阻塞同步的整体认识', href: '/labs/lab8-thread-sync' },
          { title: '实验知识地图', description: '查看完整八层系统能力链', href: '/labs/overview' },
        ],
      },
      read: {
        paths: ['kernel/src/sync_syscall.rs', 'kernel/src/processor.rs', 'os-sync/src/mutex.rs', 'kernel/src/trap.rs'],
        docs: [
          { title: 'Lab8 机制说明', description: '沿 lock/unlock、finish_blocking_syscall 与 re_enque 阅读', href: '/labs/lab8-thread-sync' },
          { title: '系统架构', description: '理解 os-sync 与内核调度接口', href: '/project/architecture' },
        ],
      },
      run: {
        paths: [
          'kernel/src/sync_syscall.rs',
          'user/src/bin/lab8_integration_test.rs',
          'user/src/bin/threads_test.rs',
          'user/src/bin/mutex_test.rs',
          'user/src/bin/condvar_test.rs',
        ],
        docs: [
          { title: '快速验证', description: '运行 lab8 全链 make test-lab8', href: '/guide/ai-tutor' },
          { title: 'Lab8 阅读理解（任务二）', description: '用实验文档【任务二】自测阻塞与死锁', href: '/labs/lab8-thread-sync' },
        ],
      },
      debug: {
        paths: ['kernel/src/sync_syscall.rs', 'kernel/src/processor.rs', 'kernel/src/deadlock.rs', 'os-sync/src/wait_queue.rs'],
        docs: [
          { title: 'Lab8 常见问题', description: '从 unlock/re_enque 与 finish_blocking 定位卡住', href: '/labs/lab8-thread-sync' },
          { title: '验证方法', description: '用重复运行暴露唤醒丢失', href: '/guide/ai-tutor' },
        ],
      },
      reflect: {
        paths: ['answers/lab8-answers.md', 'kernel/src/sync_syscall.rs', 'project/ai-collaboration.md'],
        docs: [
          { title: 'AI 协作记录', description: '整理并发证据链', href: '/project/ai-collaboration' },
          { title: 'Lab8 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab8-answers' },
        ],
      },
    },
  },
]

export const tutorLabIds = new Set<TutorLabId>(tutorLabs.map((lab) => lab.id))

export function getTutorLab(labId: TutorLabId) {
  return tutorLabs.find((lab) => lab.id === labId) || tutorLabs[0]
}

/* --------------------------------------------------------------------------
   阶段 ↔ 手册章节
   八个 Lab 正文的 H2 结构完全一致（零、开始之前 / 一、问题场景 / 二、背景知识 /
   三、实验任务 / 四、验证 / 五、AI 提问模板 / 六、思考题与参考答案），
   因此映射用序号前缀即可，不需要逐 Lab 配置。按前缀而非全称匹配，
   是为了容忍正文标题措辞的小改动。
   -------------------------------------------------------------------------- */

export interface ManualSectionTarget {
  /** 依次尝试的序号前缀；Lab1–5 已没有「六、思考题」，reflect 回退到「四、验证」。 */
  prefixes: string[]
  label: string
}

export const stageManualSection: Record<TutorStageId, ManualSectionTarget> = {
  orient: { prefixes: ['一、'], label: '问题场景' },
  read: { prefixes: ['二、'], label: '背景知识' },
  run: { prefixes: ['三、'], label: '实验任务' },
  debug: { prefixes: ['四、'], label: '验证' },
  reflect: { prefixes: ['六、', '四、'], label: '思考题与复盘' },
  transfer: { prefixes: ['六、', '二、'], label: '迁移与反例' },
}

/** 「五、AI 提问模板」的内容已经是导师栏的快捷提问按钮，手册里默认折叠。 */
export const collapsedSectionPrefix = '五、'

/** 取标题的序号前缀，如「二、背景知识」→「二、」；无序号返回空串。 */
export function sectionPrefixOf(title: string): string {
  return /^([零一二三四五六七八九十]+、)/.exec(title.trim())?.[1] || ''
}

/** 哪些阶段需要在手册底部就地收集证据。 */
export function evidenceKindFor(stage: TutorStageId): 'verification' | 'reflection' | null {
  if (stage === 'run' || stage === 'debug') return 'verification'
  if (stage === 'reflect' || stage === 'transfer') return 'reflection'
  return null
}

/* --------------------------------------------------------------------------
   系统构建路径：逐层解锁的成长档案
   -------------------------------------------------------------------------- */

export interface LabJourneyItem {
  lab: TutorLab
  index: number
  started: boolean
  passedVerification: boolean
  reflected: boolean
  evidenceCount: number
  sessions: number
  unlocked: boolean
  completed: boolean
  current: boolean
  status: string
  /** 未解锁时给学生看的常驻文字说明，替代旧版一闪而过的 toast。 */
  lockReason: string
  /** 教师设置的开放/截止时间（ISO），学生端展示任务时间。 */
  unlockAt?: string | null
  lockAt?: string | null
}

export type FinalProjectKind = 'performance' | 'app' | 'debug' | 'open' | 'custom'

export interface FinalProjectLeaderboardMetric {
  id: string
  label: string
  unit: string
  direction: 'higher' | 'lower'
}

export interface FinalProjectLeaderboard {
  metrics: FinalProjectLeaderboardMetric[]
}

export interface FinalProjectInfo {
  id: string
  title: string
  kind: FinalProjectKind | string
  kindLabel: string
  description: string
  mechanisms: string[]
  verificationCommand: string
  rubric: string[]
  leaderboard?: FinalProjectLeaderboard
  updatedAt?: string
}

/** /learning/access 返回的期末任务状态；未发布时仍返回对象以支持锁定节点。 */
export interface FinalProjectAccess extends Partial<FinalProjectInfo> {
  unlocked: boolean
  reason: string
}

export const FINAL_PROJECT_KIND_LABELS: Record<string, string> = {
  performance: '性能画像与调优',
  app: '终端小应用',
  debug: '故障注入与排障',
  open: '开放课题',
  custom: '自定义探索',
}

export function finalProjectKindLabel(kind: string | undefined): string {
  return FINAL_PROJECT_KIND_LABELS[String(kind || '')] || '开放课题'
}

export interface LearningAccessItem {
  labId: TutorLabId
  published: boolean
  unlocked: boolean
  completed: boolean
  verified: boolean
  reviewCompleted: boolean
  legacyReflected: boolean
  reflected: boolean
  alreadyIssued: boolean
  state:
    | 'completed'
    | 'review'
    | 'current'
    | 'teacher'
    | 'waiting_teacher'
    | 'waiting_unlock'
    | 'locked'
    | 'waiting_prerequisite'
  reason: string
  unlockAt?: string | null
  lockAt?: string | null
}

export function buildLabJourney(
  events: LearningEvent[],
  activeLabId?: TutorLabId,
  serverAccess: LearningAccessItem[] = [],
): LabJourneyItem[] {
  const stats = tutorLabs.map((lab) => {
    const labEvents = events.filter((event) => event.labId === lab.id)
    return {
      lab,
      started: labEvents.some((event) => event.type === 'session_start'),
      passedVerification: labEvents.some(
        (event) => event.type === 'verification_attempt' && event.metadata?.passed === true,
      ),
      // Browser events are only local continuity data. They cannot complete the
      // Socratic lifecycle; the server access response is authoritative.
      reflected: false,
      sessions: new Set(labEvents.map((event) => event.sessionId)).size,
      evidenceCount: labEvents.filter((event) =>
        ['student_message', 'verification_attempt'].includes(event.type),
      ).length,
    }
  })

  let previousCompleted = true
  return stats.map((item, index) => {
    const trusted = serverAccess.find((access) => access.labId === item.lab.id)
    const unlocked = trusted ? trusted.unlocked : index === 0
    const passedVerification = trusted ? trusted.verified : item.passedVerification
    const reflected = trusted ? trusted.reviewCompleted || trusted.legacyReflected : false
    const completed = trusted ? trusted.completed : unlocked && passedVerification && reflected
    previousCompleted = completed
    const previousLab = tutorLabs[index - 1]
    return {
      ...item,
      passedVerification,
      reflected,
      index,
      unlocked,
      completed,
      current: item.lab.id === activeLabId,
      status: completed
        ? '已学 · 可回看'
        : trusted?.state === 'review'
          ? '已发放 · 可回看'
          : trusted?.state === 'waiting_teacher'
            ? '待教师分发'
            : trusted?.state === 'waiting_unlock'
              ? '等待开放'
              : trusted?.state === 'locked'
                ? '已截止'
            : trusted?.state === 'waiting_prerequisite'
              ? '待完成前置'
        : item.started && unlocked
          ? '学习中'
          : unlocked
            ? '当前可学习'
            : index === 0
              ? '待解锁'
              : '待教师分发',
      lockReason: unlocked
        ? ''
        : trusted?.reason || (index === 0 ? '尚未开始' : `等待老师按范围手动分发 ${item.lab.label}`),
      unlockAt: trusted?.unlockAt || null,
      lockAt: trusted?.lockAt || null,
    }
  })
}

/** 下一个该进入的 Lab：优先未完成的在学层，其次第一个可开始的层。 */
export function recommendedLabId(events: LearningEvent[]): TutorLabId {
  const journey = buildLabJourney(events)
  const inProgress = journey.find((item) => item.started && item.unlocked && !item.completed)
  if (inProgress) return inProgress.lab.id
  return journey.find((item) => item.unlocked && !item.completed)?.lab.id
    || tutorLabs[0].id
}

/** 学习记录导出为 JSONL。scope=growth 导全部 Lab，scope=session 只导当前会话。 */
export function exportEventsAsJsonl(events: LearningEvent[], filename: string) {
  const body = events.map((event) => JSON.stringify(event)).join('\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'application/jsonl;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function tutorPromptsFor(lab: TutorLab, stage: TutorStageId): TutorPrompt[] {
  const prompts: Record<TutorStageId, Array<Omit<TutorPrompt, 'id' | 'stage'>>> = {
    orient: [
      { category: 'concept', label: '先说我的判断', text: `关于${lab.title}，我当前的判断是：……。请先追问我判断依据，不要直接给结论。` },
      { category: 'comparison', label: '划清机制边界', text: `请引导我区分“${lab.focus}”中由不同模块负责的部分，并让我先说出边界。` },
    ],
    read: [
      { category: 'concept', label: '追踪代码路径', text: `请从一个入口开始追问我，让我沿代码路径解释 ${lab.title} 的核心机制；不要直接替我总结。` },
      { category: 'cause', label: '检查关键假设', text: '请让我先提出一个可能错误的实现，再用数据结构、控制流和可观察后果检查它。' },
    ],
    run: [
      { category: 'exploration', label: '设计最小实验', text: `我想用 ${lab.verificationCommand} 验证当前判断。请只给观察点、预期差异和恢复方法。` },
      { category: 'phenomenon', label: '对照运行结果', text: '请先让我写出预期输出，再引导我用实际输出中的差异定位需要继续阅读的代码。' },
    ],
    debug: [
      { category: 'phenomenon', label: '整理失败现象', text: `我在 ${lab.label} 遇到了异常。请按“精确现象、当前假设、最小验证”三步追问我。` },
      { category: 'cause', label: '寻找根因证据', text: '请不要猜修复方案，先引导我找到能证伪当前假设的一个日志、状态或代码路径。' },
    ],
    reflect: [
      { category: 'exploration', label: '整理答辩证据', text: '请追问我三个问题，帮我分别写清独立判断、AI 提醒和实际验证证据。' },
      { category: 'comparison', label: '复盘前后变化', text: `请引导我比较学习 ${lab.label} 前后的理解变化，并指出还缺少哪条可验证证据。` },
    ],
    transfer: [
      { category: 'comparison', label: '改变关键条件', text: `请改变 ${lab.label} 的一个关键前提，只问我一个迁移问题，让我先预测再设计验证。` },
      { category: 'exploration', label: '构造反例', text: '请给出一个会让原结论失效的边界条件，让我说明需要观察什么证据。' },
    ],
  }
  return prompts[stage].map((prompt, index) => ({
    ...prompt,
    id: `${lab.id}-${stage}-${index}`,
    stage,
  }))
}

const STORAGE_KEY = 'os-lab-tutor-events-v4'
const LLM_CONFIG_KEY = 'os-lab-llm-config-v1'
const AUTH_KEY = 'os-lab-auth-v2'
const RESET_STUDENT_STORAGE_KEYS = [
  'os-lab-auth-v1',
  'os-lab-tutor-events-v3',
  'os-lab-tutor-conversations-v1',
  'os-lab-run-results-v1',
]

function clearPreviousStudentStorage() {
  if (typeof localStorage === 'undefined') return
  for (const key of RESET_STUDENT_STORAGE_KEYS) localStorage.removeItem(key)
}

/** 登录会话：注册/登录后由 tutor-server 签发，工作区/报告/教师端都凭它鉴权。 */
export interface AuthSession {
  token: string
  username: string
  role: 'student' | 'teacher'
}

export function loadAuth(): AuthSession | null {
  if (typeof localStorage === 'undefined') return null
  clearPreviousStudentStorage()
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
    if (value && typeof value.token === 'string' && typeof value.username === 'string') {
      return { token: value.token, username: value.username, role: value.role === 'teacher' ? 'teacher' : 'student' }
    }
  } catch {
    /* fallthrough */
  }
  return null
}

export function saveAuth(session: AuthSession | null) {
  if (typeof localStorage === 'undefined') return
  if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  else localStorage.removeItem(AUTH_KEY)
}

export function authHeaders(): Record<string, string> {
  const auth = loadAuth()
  return auth ? { Authorization: `Bearer ${auth.token}` } : {}
}

/**
 * 模型接入配置在前端填写、存浏览器本地，随每次请求发给 tutor-server。
 * 空字段表示使用服务端默认（本机 Ollama qwen2.5:7b）。
 */
export interface LlmConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export const emptyLlmConfig: LlmConfig = { baseUrl: '', model: '', apiKey: '' }

export function loadLlmConfig(): LlmConfig {
  if (typeof localStorage === 'undefined') return { ...emptyLlmConfig }
  try {
    const value = JSON.parse(localStorage.getItem(LLM_CONFIG_KEY) || '{}')
    return {
      baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : '',
      model: typeof value?.model === 'string' ? value.model : '',
      apiKey: typeof value?.apiKey === 'string' ? value.apiKey : '',
    }
  } catch {
    return { ...emptyLlmConfig }
  }
}

export function saveLlmConfig(config: LlmConfig) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    LLM_CONFIG_KEY,
    JSON.stringify({
      baseUrl: config.baseUrl.trim(),
      model: config.model.trim(),
      apiKey: config.apiKey.trim(),
    }),
  )
}

export function hasCustomLlmConfig(config: LlmConfig) {
  return Boolean(config.baseUrl.trim() || config.model.trim() || config.apiKey.trim())
}

export function createId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${random}`
}

export function loadEvents(): LearningEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter(
          (event) =>
            (event?.version === 1 || event?.version === 2) &&
            tutorLabIds.has(event?.labId) &&
            typeof event?.sessionId === 'string' &&
            typeof event?.timestamp === 'string',
        )
      : []
  } catch {
    return []
  }
}

export function saveEvents(events: LearningEvent[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

export function appendEvent(
  events: LearningEvent[],
  input: Omit<LearningEvent, 'version' | 'id' | 'timestamp'>,
) {
  const event: LearningEvent = {
    version: 2,
    id: createId('event'),
    timestamp: new Date().toISOString(),
    ...input,
  }
  const next = [...events, event]
  saveEvents(next)
  return { event, next }
}

/** 评分唯一实现在 `learning/rubric.mjs`，此处仅转发，权重与算法不再在前端重复。 */
export function scoreEvents(events: LearningEvent[]): TutorScore {
  return scoreLearningEvents(events) as TutorScore
}

export interface GuardrailRule {
  id: string
  event?: string
  patterns?: Array<string | number>
  response?: string
}

export const guardrailRules: GuardrailRule[] = parseYaml(guardrailSource)?.rules || []

/** 与 tutor-server 同源同规则的护栏判定：小写化 + 去空白后做子串匹配。 */
export function matchGuardrailRule(text: string): GuardrailRule | undefined {
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  return guardrailRules.find((rule) =>
    rule.patterns?.some((pattern) =>
      normalized.includes(String(pattern).toLowerCase().replace(/\s+/g, '')),
    ),
  )
}

export function isDirectAnswerRequest(text: string) {
  return matchGuardrailRule(text)?.id === 'direct-answer'
}

export function inferCategory(text: string): QuestionCategory {
  return inferQuestionCategory(text) as QuestionCategory
}

export function offlineTutorReply(
  text: string,
  stage: TutorStageId,
  guarded: boolean,
  lab: TutorLab,
) {
  if (guarded) {
    return `我不能交付可直接粘贴的完整实现。先把 ${lab.label} 的任务缩小到一个机制或函数，并写出你已经确认的一条事实；我会继续用代码路径和验证问题引导你。`
  }

  const intent = inferTutorIntent(text)
  const intentReplies: Record<string, string> = {
    concept: `先回答你问到的边界：${lab.label} 里的结论需要同时区分硬件行为、内核状态变化和可观察证据。你现在最不确定的是哪一层？`,
    'code-reading': '先沿你提到的符号回答：看它接收什么状态、修改哪个不变量、把控制权交给谁。请贴出当前函数及其一个调用点，我们只核对这条路径。',
    debug: '这个现象说明当前实现与预期至少在一个可观察状态上分叉。先写出最早出现差异的一行输出，以及一个能被它证伪的原因假设。',
    verification: `验证的关键不是“能运行”，而是观察结果能否区分两个判断。先写预期差异，再运行 ${lab.verificationCommand}，只比较对应断言或 Trace。`,
    reflection: `复盘时要把结论和证据一一对应。先选 ${lab.label} 中一个你现在能解释的机制，并指出它由哪条代码路径或运行结果支持。`,
    transfer: '先分开不变量与改变的条件：条件变化后，原机制未必整体失效。请先预测一个会变化的可观察结果，再说明如何验证。',
    'direct-answer': `我不能交付可直接提交的完整实现。请给出你已有的局部代码、判断或失败现象之一，我会先解释关键机制，再引导下一步。`,
  }
  return intentReplies[intent] || intentReplies.concept
}
