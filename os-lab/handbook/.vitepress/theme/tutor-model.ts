import { parse as parseYaml } from 'yaml'
// @ts-expect-error 评分唯一实现（前端与 tutor-server 共用，避免两处漂移）
import { scoreLearningEvents } from '../../../learning/rubric.mjs'
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
  'request-evidence-linked-reflection': '提交含「我 / AI / 验证」的复盘',
  'ask-transfer-question': '尝试一条迁移问题并说明如何验证',
  'cite-server-evidence': '引用本次可信 run / 断言，勿凭空声称已通过',
  'apply-answer-guardrail': '不要索要完整代码；先给出判断或观察',
}

const TUTOR_GATE_NEXT: Record<string, string> = {
  'missing-initial-judgment': '缺初始判断：先说出实验要解决的系统问题',
  'missing-source-evidence': '缺源码证据：打开 trap/调度相关文件并指出位置',
  'missing-trusted-run': '缺可信运行：先发起工作台里的可信验证',
  'missing-debug-hypothesis': '缺可证伪假设：先写现象与下一步观察',
  'missing-reflection-evidence': '缺复盘证据：提交含「我 / AI / 验证」的反思',
  'answer-guardrail': '请求被护栏拦截：改为描述判断或观察',
  'diagnostic-available': '已有诊断：先定位问题再改代码',
  'trusted-run-failed': '验证未通过：用最小实验区分失败原因',
  'trusted-run-passed': '已有通过的可信 run：解释断言各证明什么',
  'change-awaits-regression': '已改代码：再跑一次回归验证',
  'initial-judgment-observed': '继续：打开源码核对机制路径',
  'source-evidence-observed': '继续：发起可信验证',
  'regression-passed': '回归已过：进入因果解释与复盘',
  'reflection-evidence-complete': '复盘证据齐：尝试迁移检验',
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
      debug: { paths: ['kernel/src/trap.rs', 'kernel/src/task.rs', 'kernel/src/console.rs'], docs: [{ title: '最小实验排错', description: '区分双栈 / 调度状态 / ABI；变体见任务四', href: '/labs/lab2-trap-and-task' }, { title: '验证断言', description: '不要只用退出码 0 判断通过', href: '/guide/ai-tutor' }] },
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
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab4-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理进程行为与代码证据', href: '/project/ai-collaboration' }, { title: 'Lab4 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab4-answers' }] },
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
      orient: { paths: ['labs/lab5-fs-and-sync.md', 'kernel/src/fs.rs'], docs: [{ title: 'Lab5 实验指导', description: '建立文件、管道和同步机制的整体认识', href: '/labs/lab5-fs-and-sync' }, { title: '实验知识地图', description: '查看完整实验能力链', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/fs.rs', 'kernel/src/sync.rs', 'kernel/src/cell.rs'], docs: [{ title: 'Lab5 机制说明', description: '沿文件操作、共享状态和同步路径阅读', href: '/labs/lab5-fs-and-sync' }, { title: '系统架构', description: '理解文件系统与进程模块的接口', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/fs_test.rs', 'user/src/bin/pipe_test.rs'], docs: [{ title: '快速验证', description: '运行文件与管道测试并记录并发行为', href: '/guide/ai-tutor' }, { title: 'Lab5 阅读理解（任务二）', description: '用实验文档【任务二】自测机制理解', href: '/labs/lab5-fs-and-sync' }] },
      debug: { paths: ['kernel/src/fs.rs', 'kernel/src/sync.rs', 'kernel/src/process.rs'], docs: [{ title: 'Lab5 常见问题', description: '从共享状态、锁和资源生命周期定位异常', href: '/labs/lab5-fs-and-sync' }, { title: '验证方法', description: '用重复运行和最小并发场景检验假设', href: '/guide/ai-tutor' }] },
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
      orient: { paths: ['labs/lab6-disk-fs.md', 'kernel/src/virtio_block.rs'], docs: [{ title: 'Lab6 实验指导', description: '建立块设备、磁盘布局与文件系统分层的整体认识', href: '/labs/lab6-disk-fs' }, { title: '实验知识地图', description: '查看八个 Lab 的递进关系', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/fs/disk.rs', 'os-fs/src/disk.rs', 'kernel/src/virtio_block.rs'], docs: [{ title: 'Lab6 机制说明', description: '沿块缓存、inode 和目录项阅读磁盘文件系统', href: '/labs/lab6-disk-fs' }, { title: '系统架构', description: '理解 os-fs 与内核文件层的职责边界', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/file_test.rs', 'user/src/bin/link_test.rs'], docs: [{ title: '快速验证', description: '运行带 VirtIO 的 lab6 测试链', href: '/guide/ai-tutor' }, { title: 'Lab6 阅读理解（任务二）', description: '用实验文档【任务二】自测磁盘布局与硬链接', href: '/labs/lab6-disk-fs' }] },
      debug: { paths: ['kernel/src/fs/disk.rs', 'user/src/bin/mass_unlink_test.rs', 'scripts/check-fs-img.ps1'], docs: [{ title: 'Lab6 常见问题', description: '从块缓存一致性和引用计数定位异常', href: '/labs/lab6-disk-fs' }, { title: '验证方法', description: '用最小文件操作序列复现问题', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab6-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理磁盘路径的证据链', href: '/project/ai-collaboration' }, { title: 'Lab6 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab6-answers' }] },
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
      run: { paths: ['user/src/bin/dup_test.rs', 'user/src/bin/signal_test.rs'], docs: [{ title: '快速验证', description: '运行 lab7 测试链并观察信号行为', href: '/guide/ai-tutor' }, { title: 'Lab7 阅读理解（任务二）', description: '用实验文档【任务二】自测 fd 与信号语义', href: '/labs/lab7-ipc-signal' }] },
      debug: { paths: ['kernel/src/signal.rs', 'kernel/src/trap.rs', 'user/src/bin/signal_mask_test.rs'], docs: [{ title: 'Lab7 常见问题', description: '从投递时机与屏蔽字定位信号异常', href: '/labs/lab7-ipc-signal' }, { title: '验证方法', description: '构造最小信号场景区分故障环节', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab7-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理信号时序的证据链', href: '/project/ai-collaboration' }, { title: 'Lab7 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab7-answers' }] },
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
    focus: '理解进程/线程双层结构、阻塞唤醒队列与银行家式死锁检测。',
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
      orient: { paths: ['labs/lab8-thread-sync.md', 'kernel/src/processor.rs'], docs: [{ title: 'Lab8 实验指导', description: '建立线程模型与同步原语的整体认识', href: '/labs/lab8-thread-sync' }, { title: '实验知识地图', description: '查看完整八层系统能力链', href: '/labs/overview' }] },
      read: { paths: ['kernel/src/processor.rs', 'kernel/src/sync_syscall.rs', 'os-sync/src/mutex.rs'], docs: [{ title: 'Lab8 机制说明', description: '沿线程创建、阻塞唤醒与死锁检测阅读实现', href: '/labs/lab8-thread-sync' }, { title: '系统架构', description: '理解 os-sync 组件与内核调度的接口', href: '/project/architecture' }] },
      run: { paths: ['user/src/bin/threads_test.rs', 'user/src/bin/mutex_test.rs'], docs: [{ title: '快速验证', description: '运行 lab8 集成测试链', href: '/guide/ai-tutor' }, { title: 'Lab8 阅读理解（任务二）', description: '用实验文档【任务二】自测线程与死锁检测', href: '/labs/lab8-thread-sync' }] },
      debug: { paths: ['kernel/src/deadlock.rs', 'os-sync/src/wait_queue.rs', 'user/src/bin/deadlock_mutex_test.rs'], docs: [{ title: 'Lab8 常见问题', description: '从唤醒丢失与资源计数定位并发异常', href: '/labs/lab8-thread-sync' }, { title: '验证方法', description: '用重复运行暴露时序问题', href: '/guide/ai-tutor' }] },
      reflect: { paths: ['project/ai-collaboration.md', 'answers/lab8-answers.md'], docs: [{ title: 'AI 协作记录', description: '整理并发证据链', href: '/project/ai-collaboration' }, { title: 'Lab8 参考答案', description: '完成复盘后再核对关键结论', href: '/answers/lab8-answers' }] },
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
}

export interface LearningAccessItem {
  labId: TutorLabId
  published: boolean
  unlocked: boolean
  completed: boolean
  verified: boolean
  reflected: boolean
  alreadyIssued: boolean
  state: 'completed' | 'review' | 'current' | 'teacher' | 'waiting_teacher' | 'waiting_prerequisite'
  reason: string
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
      reflected: labEvents.some((event) => event.type === 'reflection_submitted'),
      sessions: new Set(labEvents.map((event) => event.sessionId)).size,
      evidenceCount: labEvents.filter((event) =>
        ['student_message', 'verification_attempt', 'reflection_submitted'].includes(event.type),
      ).length,
    }
  })

  let previousCompleted = true
  return stats.map((item, index) => {
    const trusted = serverAccess.find((access) => access.labId === item.lab.id)
    const unlocked = trusted ? trusted.unlocked : index === 0 || previousCompleted
    const passedVerification = trusted ? trusted.verified : item.passedVerification
    const reflected = trusted ? trusted.reflected : item.reflected
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
            ? '待教师开放'
            : trusted?.state === 'waiting_prerequisite'
              ? '待完成前置'
        : item.started && unlocked
          ? '学习中'
          : unlocked
            ? '当前可学习'
            : item.started
              ? '有记录 · 待解锁'
              : '待解锁',
      lockReason: unlocked ? '' : trusted?.reason || `完成 ${previousLab.label} 的一次通过验证和一次学习复盘后解锁`,
    }
  })
}

/** 下一个该进入的 Lab：优先未完成的在学层，其次第一个可开始的层。 */
export function recommendedLabId(events: LearningEvent[]): TutorLabId {
  const journey = buildLabJourney(events)
  const inProgress = journey.find((item) => item.started && item.unlocked && !item.completed)
  if (inProgress) return inProgress.lab.id
  return journey.find((item) => item.unlocked && !item.completed)?.lab.id
    || tutorLabs[tutorLabs.length - 1].id
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

const STORAGE_KEY = 'os-lab-tutor-events-v3'
const LLM_CONFIG_KEY = 'os-lab-llm-config-v1'
const AUTH_KEY = 'os-lab-auth-v1'

/** 登录会话：注册/登录后由 tutor-server 签发，工作区/报告/教师端都凭它鉴权。 */
export interface AuthSession {
  token: string
  username: string
  role: 'student' | 'teacher'
}

export function loadAuth(): AuthSession | null {
  if (typeof localStorage === 'undefined') return null
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
  if (isDirectAnswerRequest(text)) return 'direct_answer'
  if (/(区别|对比|相比|迁移|类似)/.test(text)) return 'comparison'
  if (/(现象|乱码|报错|失败|崩溃|panic|卡住|输出)/i.test(text)) return 'phenomenon'
  if (/(为什么|原因|必须|导致|根因|怎么会)/.test(text)) return 'cause'
  if (/(实验|验证|尝试|观察|运行|QEMU|cargo)/i.test(text)) return 'exploration'
  return 'concept'
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

  if (lab.id === 'lab2' && /(sepc|ecall)/i.test(text)) {
    return '沿控制流想：trap 发生后 sepc 指向哪条指令？如果 sret 回到同一地址，CPU 下一步又会做什么？先回答这两个问题，再定位 advance_sepc 的调用位置。'
  }

  if (lab.id === 'lab2' && /(sscratch|csrrw|栈|sp)/i.test(text)) {
    return '设想不用 sscratch：trap 刚发生时 sp 仍属于谁？在保存任何通用寄存器前，你还能借用哪个寄存器而不破坏用户现场？先用这两个问题检查栈交换的必要性。'
  }

  const stageReplies: Record<TutorStageId, string> = {
    orient: `先不急着看实现。围绕“${lab.focus}”，写下你认为最关键的一个系统边界，以及这个判断的依据。`,
    read: `从右侧建议路径任选一个入口，沿调用或数据流追到核心实现。每经过一层，分别写下输入、状态变化和输出。`,
    run: `先写下你预测的三个关键输出，再运行 ${lab.verificationCommand}。完成后只贴与预测不同的部分，我们用差异定位环节。`,
    debug: '把排错拆成证据链：精确现象、当前假设、能证伪它的最小实验。先补齐这三项，我再给下一层提示。',
    reflect: `用三句话收束 ${lab.label}：你能独立解释什么？AI 提醒了哪个关键点？你用哪条运行结果或代码路径验证了它？`,
    transfer: `改变一个关键条件后，${lab.label} 的原结论还成立吗？先写预测，再说明你会用什么代码路径或运行证据验证。`,
  }
  return stageReplies[stage]
}
