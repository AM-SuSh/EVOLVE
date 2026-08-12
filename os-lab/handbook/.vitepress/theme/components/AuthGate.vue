<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { authHeaders, loadAuth, saveAuth } from '../tutor-model'

/**
 * 站点入口登录门：进入本系统先登录/注册（学生注册需选择老师创建的班级），
 * 教师直接用管理员账号（预置 admin / admin123）。
 * 未登录不能浏览站点，登录后由访问判定决定可读内容。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const locked = ref(false)
const mode = ref<'login' | 'register'>('login')
const form = ref({ username: '', password: '', className: '' })
const classNames = ref<string[]>([])
const classNamesLoading = ref(false)
const busy = ref(false)
const error = ref('')
const serverDown = ref(false)

async function loadClasses() {
  classNamesLoading.value = true
  try {
    const response = await fetch(`${endpoint}/auth/classes`)
    const payload = await response.json().catch(() => ({}))
    classNames.value = response.ok && Array.isArray(payload.classes) ? payload.classes : []
  } catch {
    classNames.value = []
  } finally {
    classNamesLoading.value = false
  }
}

async function verifyExisting() {
  try {
    const response = await fetch(`${endpoint}/auth/me`, { headers: authHeaders() })
    if (response.ok) return true
    if (response.status === 401) saveAuth(null)
    return false
  } catch {
    // 导师服务未启动时也无法登录，必须启动服务后才能进入。
    serverDown.value = true
    return false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
  form.value.className = ''
  if (mode.value === 'register') void loadClasses()
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

onMounted(async () => {
  void loadClasses()
  const existingAuth = loadAuth()
  if (existingAuth && (await verifyExisting())) return
  locked.value = true
})
</script>

<template>
  <div v-if="locked" class="ag-overlay">
    <div class="ag-card">
      <p class="ag-brand"><img :src="withBase('/logo.svg')" alt="" />EVOLVE 操作系统学习平台</p>
      <h1>{{ mode === 'login' ? '登录' : '学生注册' }}</h1>

      <p v-if="serverDown" class="ag-warn">
        未连接到导师服务（<code>npm run tutor</code>）。必须启动服务并登录后才能进入系统。
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
        <select v-model="form.className" required :disabled="!classNames.length">
          <option value="" disabled>{{ classNamesLoading ? '正在加载班级…' : classNames.length ? '请选择班级' : '老师尚未创建班级' }}</option>
          <option v-for="c in classNames" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <p v-if="mode === 'register' && !classNamesLoading && !classNames.length" class="ag-warn">
        请先联系老师创建班级后再注册。
      </p>

      <p v-if="error" class="ag-error">{{ error }}</p>

      <button
        class="ag-primary"
        type="button"
        :disabled="busy || (mode === 'register' && !form.className.trim())"
        @click="submit"
      >
        {{ busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并进入' }}
      </button>

      <p class="ag-foot">
        <a href="javascript:void 0" @click="switchMode">
          {{ mode === 'login' ? '学生首次使用？注册账号' : '已有账号？去登录' }}
        </a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.ag-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--vp-c-bg);
}

/* 背景：左上角一抹品牌色辉光 + 淡网格，延续首页“图纸”语言 */
.ag-overlay::before {
  position: absolute;
  inset: 0;
  content: '';
  background:
    radial-gradient(60% 55% at 16% 4%, color-mix(in srgb, var(--vp-c-brand-1) 10%, transparent), transparent 70%),
    linear-gradient(to right, color-mix(in srgb, var(--vp-c-divider) 55%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--vp-c-divider) 45%, transparent) 1px, transparent 1px);
  background-size: 72px 72px, 100% 100%;
  mask-image: radial-gradient(90% 90% at 30% 0, #000, transparent 78%);
  pointer-events: none;
}

.ag-card {
  position: relative;
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

.ag-brand img {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--vp-c-brand-1) 34%, transparent);
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

.ag-card input,
.ag-card select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background-color: var(--ws-surface-soft);
  font: inherit;
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out;
}

.ag-card input:focus,
.ag-card select:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 16%, transparent);
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
  color: var(--ws-accent-contrast);
  border: 0;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--vp-c-brand-2) 0%, var(--vp-c-brand-1) 60%);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 160ms ease-out, transform 160ms ease-out, box-shadow 160ms ease-out;
}

.ag-primary:hover:not(:disabled) {
  filter: brightness(1.04);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent);
  transform: translateY(-1px);
}

.ag-primary:active:not(:disabled) {
  transform: translateY(0);
}

.ag-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ag-foot {
  display: flex;
  justify-content: space-between;
  margin: 14px 0 0;
  font-size: 13px;
}
</style>
