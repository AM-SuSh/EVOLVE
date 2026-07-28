export const LEARNING_LABS = [
  'lab1',
  'lab2',
  'lab3',
  'lab4',
  'lab5',
  'lab6',
  'lab7',
  'lab8',
]

function evidenceMap(rows) {
  return new Map(
    LEARNING_LABS.map((labId) => {
      const row = rows.find((item) => item.labId === labId) || {}
      return [
        labId,
        {
          verified: Boolean(row.verified),
          reflected: Boolean(row.reflected),
        },
      ]
    }),
  )
}

/**
 * Manual access is derived only from trusted server-side state. Browser events
 * are intentionally excluded because students can edit localStorage.
 */
export function buildLearningAccess({ role = 'student', openLab = 'lab1', applied = [], evidence = [] }) {
  const teacher = role === 'teacher'
  const openIndex = LEARNING_LABS.includes(openLab) ? LEARNING_LABS.indexOf(openLab) : 0
  const appliedSet = new Set(applied.filter((labId) => LEARNING_LABS.includes(labId)))
  const byLab = evidenceMap(evidence)

  const labs = LEARNING_LABS.map((labId, index) => {
    const own = byLab.get(labId)
    const previousId = LEARNING_LABS[index - 1]
    const previous = previousId ? byLab.get(previousId) : null
    const completed = own.verified && own.reflected
    const published = index <= openIndex
    const alreadyIssued = appliedSet.has(labId)
    const prerequisiteComplete = index === 0 || Boolean(previous?.verified && previous?.reflected)
    const unlocked = teacher || (published && (prerequisiteComplete || alreadyIssued))

    let state = 'current'
    let reason = ''
    if (teacher) state = completed ? 'completed' : 'teacher'
    else if (!published) {
      state = 'waiting_teacher'
      reason = `教师当前开放到 ${openLab.toUpperCase()}`
    } else if (!unlocked) {
      state = 'waiting_prerequisite'
      reason = `先完成 ${previousId.toUpperCase()} 的可信验证与学习复盘`
    } else if (completed) state = 'completed'
    else if (alreadyIssued && index < applied.length - 1) state = 'review'

    return {
      labId,
      published,
      unlocked,
      completed,
      verified: own.verified,
      reflected: own.reflected,
      alreadyIssued,
      state,
      reason,
    }
  })

  const highestUnlocked = [...labs].reverse().find((item) => item.unlocked)?.labId || null
  return { labs, highestUnlocked, openLab }
}

export function accessForLab(access, labId) {
  return access.labs.find((item) => item.labId === labId) || null
}
