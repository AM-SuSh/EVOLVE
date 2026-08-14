export const REVIEW_GATE_VERSION = 'review-gates-v1.0.0'

function gate(code, severity, reason, evidenceRefs = []) {
  return { code, severity, reason, evidenceRefs: [...new Set(evidenceRefs)] }
}

export function evaluateReviewGates(assessment, context = {}) {
  const gates = []
  const allRefs = assessment.items.flatMap((item) => item.evidenceRefs)
  const ruleScore = Number(assessment.fusion?.ruleScore)
  const agentScore = Number(assessment.fusion?.agentScore)
  if (assessment.fusion?.mode === 'rule-agent' && Number.isFinite(ruleScore) && Number.isFinite(agentScore) &&
      Math.abs(ruleScore - agentScore) >= 30) {
    gates.push(gate('H1', 'hard', '规则基线与 Agent 评价差异较大', [
      ...allRefs,
      ...(assessment.agentAssessment?.evidenceRefs || []),
    ]))
  }
  const reflectionItems = assessment.items.filter((item) =>
    item.dimension === 'reflection' && item.score !== null,
  )
  if (reflectionItems.length && reflectionItems.every((item) => item.score === 2) && reflectionItems.every((item) => item.evidenceRefs.every((ref) => !ref.startsWith('run:')))) {
    gates.push(gate('H3', 'hard', '反思满分但没有直接运行引用', reflectionItems.flatMap((item) => item.evidenceRefs)))
  }
  if (Number(context.guardrailCount || 0) >= 3 && assessment.dimensions.process >= 70) {
    gates.push(gate('H4', 'hard', '多次触发答案护栏但过程分仍较高', context.guardrailRefs || []))
  }
  if (context.variant && context.variant !== 'default' && context.sampledMismatch) {
    gates.push(gate('H5', 'hard', '变体任务自动分与教师抽检不一致', context.sampleRefs || []))
  }
  if (context.appeal) gates.push(gate('H6', 'hard', '学生提出系统错判申诉', context.appealRefs || []))
  if (context.transferConflict) gates.push(gate('S1', 'soft', '迁移回答与本 Lab 证据矛盾', context.transferRefs || []))
  if (context.suddenSuccess) gates.push(gate('S2', 'soft', '长期停滞后突然满分', allRefs))
  if (context.similarReport) gates.push(gate('S3', 'soft', '报告与同班样本高度相似', context.reportRefs || []))
  return {
    version: REVIEW_GATE_VERSION,
    requiresReview: gates.some((item) => item.severity === 'hard'),
    gates,
  }
}
