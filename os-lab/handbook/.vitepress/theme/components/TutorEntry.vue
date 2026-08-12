<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { ArrowRight, LogIn, RefreshCw } from 'lucide-vue-next'
import { authHeaders, loadAuth, tutorLabs, type LearningAccessItem } from '../tutor-model'
import TeacherBatchOpen from './TeacherBatchOpen.vue'

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
  window.location.reload()
}

onMounted(() => {
  const auth = loadAuth()
  isTeacher.value = auth?.role === 'teacher'
  // 教师与学生共用本路由，页面标签按角色区分。
  if (isTeacher.value) document.title = '教师工作台 | EVOLVE'
  if (!isTeacher.value) void launchStudent()
})
</script>

<template>
  <div class="ws-entry">
    <template v-if="isTeacher">
      <TeacherBatchOpen />

      <section class="ws-teacher-labs" aria-labelledby="teacher-labs-title">
        <header>
          <div>
            <span>课程实验</span>
            <h2 id="teacher-labs-title">选择本次要处理的实验</h2>
          </div>
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

.ws-teacher-labs > header span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-teacher-labs > header h2 {
  margin: var(--ws-space-2) 0;
  padding: 0;
  border: 0;
  font-size: var(--ws-text-xl);
  line-height: var(--ws-leading-tight);
}

.ws-teacher-labs li p {
  margin: 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-relaxed);
}

.ws-teacher-lab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
}

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
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.ws-teacher-lab-actions a.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-teacher-lab-actions a.primary:hover {
  border-color: var(--ws-accent-hover);
  background: var(--ws-accent-hover);
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
  margin: 0 calc(-1 * var(--ws-space-2));
  padding: var(--ws-space-3) var(--ws-space-2);
  border-bottom: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  transition: background-color 0.15s ease;
}

.ws-teacher-labs li:hover {
  background: var(--ws-surface-soft);
}

.ws-teacher-labs li:hover .ws-teacher-lab-index {
  color: var(--ws-accent);
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
