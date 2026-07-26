<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { authHeaders, loadAuth, saveAuth } from '../tutor-model'

/**
 * 站点入口登录门：进入本系统先登录/注册（学生注册需填班级），
 * 教师直接用管理员账号（预置 admin / admin123）。
 * 「游客浏览」仅本次会话有效，全站只读（工作台不可用个人功能）。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const locked = ref(false)
const mode = ref<'login' | 'register'>('login')
const form = ref({ username: '', password: '', className: '' })
const busy = ref(false)
const error = ref('')
const serverDown = ref(false)

function unlockAsGuest() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('os-lab-guest', '1')
  locked.value = false
}

async function verifyExisting() {
  try {
    const response = await fetch(`${endpoint}/auth/me`, { headers: authHeaders() })
    if (response.ok) return true
    if (response.status === 401) saveAuth(null)
    return false
  } catch {
    // 导师服务未启动：不锁死站点，允许先阅读文档。
    serverDown.value = true
    return false
  }
}

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(`${endpoint}/auth/${mode.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.token) throw new Error(payload?.error || `服务返回 ${response.status}`)
    saveAuth({ token: payload.token, username: payload.username, role: payload.role })
    // 教师和学生共用「引导式学习」入口，再按角色呈现各自工作流。
    if (payload.role === 'teacher') location.href = withBase('/guide/ai-tutor')
    else location.reload()
  } catch (err) {
    error.value =
      err instanceof Error && err.message
        ? err.message
        : '无法连接导师服务：先在 os-lab/handbook 运行 npm run tutor'
  } finally {
    busy.value = false
  }
}

const isTeacher = ref(false)
const onTeacherPage = ref(false)

onMounted(async () => {
  onTeacherPage.value =
    location.pathname.includes('/guide/ai-tutor') ||
    location.pathname.includes('/learn/') ||
    location.pathname.includes('/teacher-review')
  const auth = loadAuth()
  isTeacher.value = auth?.role === 'teacher'
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('os-lab-guest')) return
  if (auth && (await verifyExisting())) return
  locked.value = true
  isTeacher.value = false
})
</script>

<template>
  <!-- 教师常驻入口：回到与学生同名的引导式学习入口。 -->
  <a v-if="!locked && isTeacher && !onTeacherPage" class="ag-teacher-fab" :href="withBase('/guide/ai-tutor')">
    引导式学习
  </a>

  <div v-if="locked" class="ag-overlay">
    <div class="ag-card">
      <p class="ag-brand"><span>OS</span> os-lab 操作系统学习平台</p>
      <h1>{{ mode === 'login' ? '登录' : '学生注册' }}</h1>

      <p v-if="serverDown" class="ag-warn">
        未连接到导师服务（<code>npm run tutor</code>）。可先游客浏览文档，登录相关功能暂不可用。
      </p>

      <label>
        <span>用户名</span>
        <input v-model="form.username" type="text" spellcheck="false" autocomplete="username" placeholder="学号 / 姓名拼音；教师使用 admin" />
      </label>
      <label>
        <span>密码</span>
        <input v-model="form.password" type="password" autocomplete="current-password" @keydown.enter="submit" />
      </label>
      <label v-if="mode === 'register'">
        <span>班级</span>
        <input v-model="form.className" type="text" spellcheck="false" placeholder="例如 计科2301" @keydown.enter="submit" />
      </label>

      <p v-if="error" class="ag-error">{{ error }}</p>

      <button class="ag-primary" type="button" :disabled="busy" @click="submit">
        {{ busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并进入' }}
      </button>

      <p class="ag-foot">
        <a href="javascript:void 0" @click="mode = mode === 'login' ? 'register' : 'login'; error = ''">
          {{ mode === 'login' ? '学生首次使用？注册账号' : '已有账号？去登录' }}
        </a>
        <a href="javascript:void 0" @click="unlockAsGuest">游客浏览</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.ag-teacher-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 90;
  padding: 9px 16px;
  color: #fff;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.2);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.ag-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--vp-c-bg);
}

.ag-card {
  width: min(400px, 100%);
  padding: 32px 30px 22px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.12);
}

.ag-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 6px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 600;
}

.ag-brand span {
  display: grid;
  width: 34px;
  height: 34px;
  color: #fff;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  place-items: center;
  font-size: 13px;
  font-weight: 700;
}

.ag-card h1 {
  margin: 0 0 18px;
  font-size: 22px;
}

.ag-card label {
  display: block;
  margin-bottom: 12px;
}

.ag-card label span {
  display: block;
  margin-bottom: 4px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.ag-card input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  font: inherit;
}

.ag-card input:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}

.ag-warn {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-yellow-1, #b7791f);
  font-size: 13px;
}

.ag-error {
  color: var(--vp-c-danger-1, #c0392b);
  font-size: 13px;
}

.ag-primary {
  width: 100%;
  margin-top: 6px;
  padding: 10px;
  color: #fff;
  border: 0;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.ag-primary:disabled {
  opacity: 0.6;
}

.ag-foot {
  display: flex;
  justify-content: space-between;
  margin: 14px 0 0;
  font-size: 13px;
}
</style>
