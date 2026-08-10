const CONCEPT_ITEMS_V2 = Object.freeze({
  'os.trap.syscall-abi': ['R1', 'R2', 'P5'],
  'os.sched.context-switch': ['R3', 'R4', 'P6'],
  'os.debug.evidence-chain': ['P3', 'P5', 'P6'],
  'os.learning.transfer': ['F1', 'F2', 'T1', 'T2'],
})

const CONCEPT_ITEMS_V3 = Object.freeze({
  'os.trap.syscall-abi': ['R1', 'R2', 'V1'],
  'os.sched.context-switch': ['R3', 'R4', 'I1'],
  'os.debug.evidence-chain': ['E1', 'H1', 'V1', 'I1'],
  'os.learning.transfer': ['F1', 'F2', 'T1', 'T2'],
})

export function deriveMasteryUpdates(assessment) {
  const conceptItems = String(assessment.version || '').startsWith('rubric-v3')
    ? CONCEPT_ITEMS_V3
    : CONCEPT_ITEMS_V2
  return Object.entries(conceptItems).map(([conceptId, itemIds]) => {
    const items = assessment.items.filter((item) => itemIds.includes(item.id) && item.score !== null)
    const average = items.length ? items.reduce((sum, item) => sum + item.score, 0) / items.length : 0
    const independent = assessment.trajectory.independentSuccess ? 1 : 0
    const status = average >= 1.6 && independent ? 'proficient' : average >= 0.8 ? 'developing' : 'needs-support'
    const confidence = Math.min(0.95, Number((0.25 + items.length * 0.1 + average * 0.15).toFixed(2)))
    return {
      conceptId,
      status,
      evidenceRefs: [...new Set(items.flatMap((item) => item.evidenceRefs))],
      independentSuccess: independent,
      hintLevelUsed: assessment.trajectory.maxHintLevel,
      misconceptions: items.filter((item) => item.score === 0).map((item) => item.label),
      confidence,
    }
  })
}
