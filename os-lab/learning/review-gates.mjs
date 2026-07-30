export const REVIEW_GATE_VERSION = 'review-gates-v1.0.0'

function gate(code, severity, reason, evidenceRefs = []) {
  return { code, severity, reason, evidenceRefs: [...new Set(evidenceRefs)] }
}

export function evaluateReviewGates(assessment, context = {}) {
  const gates = []
  const items = new Map(assessment.items.map((item) => [item.id, item]))
  const allRefs = assessment.items.flatMap((item) => item.evidenceRefs)
  if (assessment.dimensions.result === 100 && assessment.dimensions.process < 35) {
    gates.push(gate('H1', 'hard', '结果满分但过程证据极低', allRefs))
  }
  const yieldItem = items.get('R3')
  if (yieldItem?.status === 'unobserved' || context.outputTruncated) {
    gates.push(gate('H2', 'hard', 'Yield 断言缺失或输出被截断', yieldItem?.evidenceRefs || []))
  }
  const reflectionItems = ['F1', 'F2'].map((id) => items.get(id)).filter(Boolean)
  if (reflectionItems.every((item) => item.score === 2) && reflectionItems.every((item) => item.evidenceRefs.every((ref) => !ref.startsWith('run:')))) {
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
