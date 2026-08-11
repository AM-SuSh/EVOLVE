import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveConfigFor, normalizeFinalProject } from './scaffold.mjs'

test('normalizeFinalProject keeps required fields and defaults kind', () => {
  const project = normalizeFinalProject({
    title: ' 我的内核探索 ',
    kind: 'performance',
    description: '对系统调用、调度与管道做性能画像。',
    mechanisms: ['fork/exec', '', 'pipe', 'threads/mutex'],
    verificationCommand: 'make test-lab8',
    rubric: ['提案质量', '机制运用', '可信证据', '反思与迁移'],
    leaderboard: {
      metrics: [
        { id: 'pipe-mbps', label: '管道吞吐', unit: 'MB/s', direction: 'higher' },
        { id: 'lock-wait-us', label: '锁等待', unit: 'us', direction: 'lower' },
      ],
    },
  })
  assert.equal(project.title, '我的内核探索')
  assert.equal(project.kind, 'performance')
  assert.equal(project.kindLabel, '性能画像与调优')
  assert.deepEqual(project.mechanisms, ['fork/exec', 'pipe', 'threads/mutex'])
  assert.equal(project.verificationCommand, 'make test-lab8')
  assert.equal(project.rubric.length, 4)
  assert.equal(project.leaderboard.metrics.length, 2)
  assert.equal(project.leaderboard.metrics[0].direction, 'higher')
})

test('normalizeFinalProject rejects empty task and falls back to open kind', () => {
  assert.equal(normalizeFinalProject(null), null)
  assert.equal(normalizeFinalProject({ title: '', description: '' }), null)
  const fallback = normalizeFinalProject({ title: '开放题', description: '自己提出一个问题。', kind: 'unknown' })
  assert.equal(fallback.kind, 'open')
})

test('effectiveConfigFor resolves final project from student > class > global', () => {
  const config = {
    openLab: 'lab8',
    assignments: {},
    notice: '',
    finalProject: { title: '全局任务', description: '全局描述' },
    classes: {
      '计科2301': {
        finalProject: { title: '班级任务', description: '班级描述' },
      },
    },
    students: {
      stu: {
        finalProject: { title: '个人任务', description: '个人描述' },
      },
    },
  }
  assert.equal(effectiveConfigFor(config, 'stu', '计科2301').finalProject.title, '个人任务')
  assert.equal(effectiveConfigFor(config, 'other', '计科2301').finalProject.title, '班级任务')
  assert.equal(effectiveConfigFor(config, 'other', '').finalProject.title, '全局任务')
})
