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
          reviewCompleted: Boolean(row.reviewCompleted),
          legacyReflected: Boolean(row.legacyReflected),
          reportSubmitted: Boolean(row.reportSubmitted),
          reflected: Boolean(row.reflected),
        },
      ]
    }),
  )
}

function scheduleText(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/**
 * Manual access is derived only from trusted server-side state. Browser events
 * are intentionally excluded because students can edit localStorage.
 */
export function buildLearningAccess({
  role = 'student',
  openLab = 'lab1',
  applied = [],
  evidence = [],
  schedules = {},
  now = Date.now(),
} = {}) {
  const teacher = role === 'teacher'
  const openIndex = LEARNING_LABS.includes(openLab) ? LEARNING_LABS.indexOf(openLab) : 0
  const appliedSet = new Set(applied.filter((labId) => LEARNING_LABS.includes(labId)))
  const byLab = evidenceMap(evidence)

  const labs = LEARNING_LABS.map((labId, index) => {
    const own = byLab.get(labId)
    const previousId = LEARNING_LABS[index - 1]
    const previous = previousId ? byLab.get(previousId) : null
    const reviewSatisfied = own.reviewCompleted || own.legacyReflected
    const completed = own.verified && reviewSatisfied && own.reportSubmitted
    const published = index <= openIndex
    const alreadyIssued = appliedSet.has(labId)
    const prerequisiteComplete = index === 0 || Boolean(
      previous?.verified
        && (previous.reviewCompleted || previous.legacyReflected)
        && previous.reportSubmitted,
    )
    const schedule = schedules[labId] || {}
    const unlockAt = schedule.unlockAt || null
    const lockAt = schedule.lockAt || null
    const notYetUnlocked = unlockAt ? now < Date.parse(unlockAt) : false
    const alreadyLocked = lockAt ? now >= Date.parse(lockAt) : false
    const scheduleBlocks = Boolean(notYetUnlocked || alreadyLocked)
    const unlocked = teacher || (!scheduleBlocks && published && (prerequisiteComplete || alreadyIssued))

    let state = 'current'
    let reason = ''
    if (teacher) state = completed ? 'completed' : 'teacher'
    else if (!published) {
      state = 'waiting_teacher'
      reason = `教师尚未手动分发该实验（当前分发到 ${openLab.toUpperCase()}）`
    } else if (notYetUnlocked) {
      state = 'waiting_unlock'
      reason = `教师已开放，尚未到解锁时间（${scheduleText(unlockAt)}）`
    } else if (alreadyLocked) {
      state = 'locked'
      reason = `任务已截止（${scheduleText(lockAt)}），已自动加锁`
    } else if (!unlocked) {
      state = 'waiting_prerequisite'
      reason = `先完成 ${previousId.toUpperCase()} 的可信验证，并提交实验报告与复盘`
    } else if (completed) state = 'completed'
    else if (alreadyIssued && index < applied.length - 1) state = 'review'

    return {
      labId,
      published,
      unlocked,
      completed,
      verified: own.verified,
      reviewCompleted: own.reviewCompleted,
      legacyReflected: own.legacyReflected,
      reportSubmitted: own.reportSubmitted,
      // Compatibility for existing consumers. It indicates either completed
      // Socratic review or an explicitly grandfathered legacy reflection.
      reflected: reviewSatisfied,
      alreadyIssued,
      state,
      reason,
      unlockAt,
      lockAt,
    }
  })

  const highestUnlocked = [...labs].reverse().find((item) => item.unlocked)?.labId || null
  return { labs, highestUnlocked, openLab }
}

export function accessForLab(access, labId) {
  return access.labs.find((item) => item.labId === labId) || null
}
