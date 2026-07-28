<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { ArrowRight, ClipboardCheck, LogIn, PencilLine, RefreshCw } from 'lucide-vue-next'
import { authHeaders, loadAuth, tutorLabs, type LearningAccessItem } from '../tutor-model'

/**
 * “引导式学习”只是一条角色分流路由：学生直接进入当前 Lab，
 * 教师保留跨 Lab 的备课入口。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const isTeacher = ref(false)
const launchState = ref<'loading' | 'login' | 'error'>('loading')
const launchMessage = ref('正在确认教师发布范围与学习进度')

function pickStudentLab(labs: LearningAccessItem[]) {
  const issued = [...labs].reverse().find((lab) => lab.unlocked && !lab.completed && lab.alreadyIssued)
  const next = labs.find((lab) => lab.unlocked && !lab.completed)
  const latest = [...labs].reverse().find((lab) => lab.unlocked)
  return issued || next || latest
}

async function launchStudent() {
  launchState.value = 'loading'
  launchMessage.value = '正在确认教师发布范围与学习进度'
  try {
    const response = await fetch(`${endpoint}/learning/access`, { headers: authHeaders() })
    const payload = await response.json().catch(() => ({}))
    if (response.status === 401) {
      launchState.value = 'login'
      launchMessage.value = '登录后才能进入教师已发布的实验'
      return
    }
    if (!response.ok || !Array.isArray(payload.labs)) {
      throw new Error(payload.error || `导师服务返回 ${response.status}`)
    }
    const target = pickStudentLab(payload.labs)
    if (!target) throw new Error('教师尚未发布可学习的实验')
    window.location.replace(withBase(`/learn/${target.labId}`))
  } catch (error) {
    launchState.value = 'error'
    launchMessage.value = error instanceof Error ? error.message : '暂时无法确认当前实验'
  }
}

function openLogin() {
  sessionStorage.removeItem('os-lab-guest')
  window.location.reload()
}

onMounted(() => {
  const auth = loadAuth()
  isTeacher.value = auth?.role === 'teacher'
  if (!isTeacher.value) void launchStudent()
})
</script>

<template>
  <div class="ws-entry">
    <template v-if="isTeacher">
      <section class="ws-entry-hero">
        <div>
          <span>教师工作区</span>
          <h2>备课、发布与验收，围绕每个实验完成</h2>
          <p>
            选择一个实验进入双栏工作台：左侧预览或编辑实验手册，右侧安排开放范围、任务类型和班级公告。
            学生提交后统一进入实验验收。
          </p>
          <div class="ws-entry-cta">
            <a class="primary" :href="withBase('/learn/lab1')">
              <PencilLine :size="16" aria-hidden="true" />进入 Lab1 工作台
            </a>
            <a :href="withBase('/teacher-review')">
              <ClipboardCheck :size="16" aria-hidden="true" />实验验收
            </a>
          </div>
        </div>

        <div class="ws-entry-progress" role="img" aria-label="8 个实验可管理">
          <strong>{{ tutorLabs.length }}<em> Labs</em></strong>
          <span>手册与教学安排</span>
          <i><b /></i>
        </div>
      </section>

      <section class="ws-teacher-labs" aria-labelledby="teacher-labs-title">
        <header>
          <div>
            <span>课程实验</span>
            <h2 id="teacher-labs-title">选择本次要处理的实验</h2>
          </div>
          <a :href="withBase('/teacher-review')">
            <ClipboardCheck :size="15" aria-hidden="true" />查看全部提交
          </a>
        </header>

        <ol>
          <li v-for="(teacherLab, index) in tutorLabs" :key="teacherLab.id">
            <span class="ws-teacher-lab-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <strong>{{ teacherLab.label }} · {{ teacherLab.systemLayer }}</strong>
              <p>{{ teacherLab.title }}</p>
            </div>
            <div class="ws-teacher-lab-actions">
              <a class="primary" :href="withBase(`/learn/${teacherLab.id}`)">
                预览、编辑与发布<ArrowRight :size="15" aria-hidden="true" />
              </a>
            </div>
          </li>
        </ol>
      </section>
    </template>

    <section v-else class="ws-launch-state" role="status" aria-live="polite" aria-label="正在恢复学习进度">
      <span v-if="launchState === 'loading'" class="ws-progress-ring" aria-hidden="true" />
      <template v-else>
        <LogIn v-if="launchState === 'login'" :size="24" aria-hidden="true" />
        <RefreshCw v-else :size="24" aria-hidden="true" />
        <strong>暂时无法进入工作台</strong>
        <span>{{ launchMessage }}</span>
        <button v-if="launchState === 'login'" type="button" @click="openLogin">登录</button>
        <button v-else type="button" @click="launchStudent">重新尝试</button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.ws-entry {
  max-width: 960px;
  margin: 0 auto;
}

.ws-launch-state {
  display: grid;
  min-height: calc(100dvh - clamp(40px, 8vw, 96px));
  align-content: center;
  justify-items: center;
  gap: var(--ws-space-2);
  color: var(--ws-ink-muted);
  text-align: center;
}

.ws-launch-state strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
}

.ws-launch-state span {
  max-width: 420px;
  font-size: var(--ws-text-sm);
}

.ws-launch-state button {
  margin-top: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-4);
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-progress-ring {
  width: 28px;
  height: 28px;
  border: 2px solid var(--ws-line-strong);
  border-top-color: var(--ws-accent);
  border-radius: 50%;
  animation: ws-entry-spin 0.72s linear infinite;
}

@keyframes ws-entry-spin {
  to { transform: rotate(360deg); }
}

.ws-entry-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  align-items: center;
  gap: var(--ws-space-6);
  padding: var(--ws-space-6);
  border: 1px solid var(--ws-line);
  border-top: 3px solid var(--ws-accent);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface-soft);
}

.ws-entry-hero > div:first-child > span,
.ws-teacher-labs > header span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-entry-hero h2,
.ws-teacher-labs > header h2 {
  margin: var(--ws-space-2) 0;
  padding: 0;
  border: 0;
  font-size: var(--ws-text-xl);
  line-height: var(--ws-leading-tight);
}

.ws-entry-hero p,
.ws-teacher-labs li p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
}

.ws-entry-cta,
.ws-teacher-lab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
}

.ws-entry-cta {
  margin-top: var(--ws-space-4);
}

.ws-entry-cta a,
.ws-teacher-labs > header > a,
.ws-teacher-lab-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
}

.ws-entry-cta a.primary,
.ws-teacher-lab-actions a.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-entry-progress {
  text-align: center;
}

.ws-entry-progress strong {
  display: block;
  color: var(--ws-accent);
  font-size: 34px;
  line-height: 1;
}

.ws-entry-progress em {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-sm);
  font-style: normal;
  text-transform: uppercase;
}

.ws-entry-progress span {
  display: block;
  margin-top: var(--ws-space-2);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
}

.ws-entry-progress i {
  display: block;
  height: 8px;
  margin-top: var(--ws-space-3);
  overflow: hidden;
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
}

.ws-entry-progress i b {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--ws-accent);
}

.ws-teacher-labs {
  margin-top: var(--ws-space-6);
}

.ws-teacher-labs > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--ws-space-4);
  padding-bottom: var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line-strong);
}

.ws-teacher-labs > header h2 {
  margin: var(--ws-space-1) 0 0;
}

.ws-teacher-labs ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-teacher-labs li {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ws-space-3);
  min-height: 76px;
  padding: var(--ws-space-3) 0;
  border-bottom: 1px solid var(--ws-line);
}

.ws-teacher-lab-index {
  color: var(--ws-ink-faint);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-bold);
}

.ws-teacher-labs li strong {
  display: block;
  color: var(--ws-ink);
  font-size: var(--ws-text-base);
}

.ws-teacher-labs li p {
  margin-top: var(--ws-space-1);
}

@media (max-width: 720px) {
  .ws-entry-hero {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ws-space-4);
  }

  .ws-teacher-labs > header {
    align-items: flex-start;
  }

  .ws-teacher-labs li {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .ws-teacher-lab-actions {
    grid-column: 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ws-progress-ring { animation-duration: 1.5s; }
}
</style>
