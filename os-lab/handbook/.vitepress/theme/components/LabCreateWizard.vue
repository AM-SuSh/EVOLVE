<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import {
  CheckCircle2,
  ChevronRight,
  Factory,
  FlaskConical,
  RefreshCw,
  Save,
  ShieldAlert,
  Upload,
} from 'lucide-vue-next'
import { authHeaders, loadAuth, tutorLabs, type TutorLabId } from '../tutor-model'

/**
 * Lab 工厂向导（Day6）：对接仓库内已有 Lab 包，
 * 元数据 → validate(lint+dry-run) → 隔离测试 → 批准发布。
 * 不做在线新建/改写 lab.yaml；班级下发仍用 TeacherPublishPanel。
 */
const endpoint = String(
  import.meta.env.VITE_OS_LAB_TUTOR_ENDPOINT || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

type WizardStep = 1 | 2 | 3 | 4

interface LabSpec {
  id?: string
  title?: string
  version?: string
  status?: string
  feature?: string
  verification?: { recipe?: string; assertions?: Array<{ id?: string }> }
  variants?: Record<string, unknown>
}

interface InspectedPackage {
  ok: boolean
  labId?: string
  version?: string
  specHash?: string
  specPath?: string
  spec?: LabSpec
  errors?: string[]
}

interface DryRunVariant {
  variant: string
  target?: string
  fileCount?: number
  manifestHash?: string
}

interface ValidateResult {
  ok: boolean
  stage?: string
  labId?: string
  version?: string
  specHash?: string
  variants?: DryRunVariant[]
  errors?: string[]
  error?: string
}

interface AssertionItem {
  id?: string
  ok?: boolean
  passed?: boolean
  kind?: string
}

interface TestCommand {
  kind?: string
  command?: string
  exitCode?: number
  outputTail?: string
}

interface TestResult {
  ok: boolean
  stage?: string
  runId?: string
  labId?: string
  version?: string
  variant?: string
  status?: string
  isolated?: boolean
  commands?: TestCommand[]
  baselineAssertions?: AssertionItem[]
  variantAssertions?: AssertionItem[]
  negativeMatched?: boolean
  errors?: string[]
  error?: string
  author?: string
}

interface PublishResult {
  ok: boolean
  labId?: string
  version?: string
  publishedAt?: string
  release?: string
  error?: string
  errors?: string[]
}

interface PublishedCatalog {
  schemaVersion?: number
  labs?: Record<
    string,
    {
      version?: string
      title?: string
      status?: string
      release?: string
    }
  >
}

interface SavedPublish {
  labId: TutorLabId
  variant: string
  version?: string
  release?: string
  publishedAt?: string
  savedAt: string
}

const LAB_IDS = tutorLabs.map((lab) => lab.id as TutorLabId)
const PUBLISH_SAVE_KEY = 'os-lab-factory-publish-saved-v1'

const authed = ref(false)
const denied = ref(false)
const loading = ref(false)
const busy = ref(false)
const note = ref('')
const savedFlash = ref(false)
const step = ref<WizardStep>(1)

const labId = ref<TutorLabId>('lab2')
const variant = ref('')
const savedPublish = ref<SavedPublish | null>(null)
const published = ref<PublishedCatalog>({ labs: {} })
const inspected = ref<InspectedPackage | null>(null)
const validateResult = ref<ValidateResult | null>(null)
const testResult = ref<TestResult | null>(null)
const publishResult = ref<PublishResult | null>(null)

const approved = ref(false)
const approvalNote = ref('')
const formError = ref('')

const selectedLab = computed(() => tutorLabs.find((lab) => lab.id === labId.value) || tutorLabs[1])
const variantNames = computed(() => Object.keys(inspected.value?.spec?.variants || {}))
const publishedEntry = computed(() => published.value.labs?.[labId.value] || null)

function workspaceHrefFor(labIdValue: TutorLabId, variantValue: string) {
  const basePath = withBase(`/learn/${labIdValue}`)
  const query = new URLSearchParams({ view: 'teaching', variant: variantValue })
  return `${basePath}?${query.toString()}`
}

const workspaceHref = computed(() => workspaceHrefFor(selectedLab.value.id, variant.value))
const savedLab = computed(
  () => tutorLabs.find((lab) => lab.id === savedPublish.value?.labId) || null,
)
const savedWorkspaceHref = computed(() => {
  const record = savedPublish.value
  return record ? workspaceHrefFor(record.labId, record.variant) : workspaceHref.value
})
const savedPublishCurrent = computed(
  () =>
    savedPublish.value?.labId === labId.value &&
    savedPublish.value?.variant === variant.value,
)

const validateOk = computed(() => validateResult.value?.ok === true)
const testOk = computed(() => testResult.value?.ok === true && testResult.value?.status === 'passed' && !!testResult.value?.runId)
const publishOk = computed(() => publishResult.value?.ok === true)

const canGoStep2 = computed(() => !!inspected.value?.ok && !!variant.value)
const canGoStep3 = computed(() => validateOk.value)
const canGoStep4 = computed(() => testOk.value)

const steps = [
  { id: 1 as WizardStep, label: '元数据' },
  { id: 2 as WizardStep, label: '校验' },
  { id: 3 as WizardStep, label: '隔离测试' },
  { id: 4 as WizardStep, label: '批准发布' },
]

function shortHash(value?: string) {
  if (!value) return '—'
  return value.length > 12 ? `${value.slice(0, 12)}…` : value
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN')
}

function assertionPassed(item: AssertionItem) {
  return item.passed === true || item.ok === true
}

function assertionSummary(items?: AssertionItem[]) {
  if (!items?.length) return '无'
  const passed = items.filter((item) => assertionPassed(item)).length
  return `${passed}/${items.length} 通过`
}

const failedCommands = computed(() =>
  (testResult.value?.commands || []).filter((item) => item.exitCode !== 0),
)

function resetDownstream(from: WizardStep) {
  if (from <= 1) {
    validateResult.value = null
  }
  if (from <= 2) {
    testResult.value = null
  }
  if (from <= 3) {
    publishResult.value = null
    approved.value = false
    // keep approvalNote for convenience when retrying publish
  }
  formError.value = ''
}

function loadSavedPublish() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(PUBLISH_SAVE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      LAB_IDS.includes(parsed.labId as TutorLabId) &&
      typeof parsed.variant === 'string'
    ) {
      savedPublish.value = {
        labId: parsed.labId,
        variant: parsed.variant,
        version: parsed.version ? String(parsed.version) : undefined,
        release: parsed.release ? String(parsed.release) : undefined,
        publishedAt: parsed.publishedAt ? String(parsed.publishedAt) : undefined,
        savedAt: String(parsed.savedAt || new Date().toISOString()),
      }
    }
  } catch {
    savedPublish.value = null
  }
}

function savePublishRecord() {
  if (!publishOk.value) return
  const record: SavedPublish = {
    labId: labId.value,
    variant: variant.value,
    version: publishResult.value?.version,
    release: publishResult.value?.release,
    publishedAt: publishResult.value?.publishedAt,
    savedAt: new Date().toISOString(),
  }
  savedPublish.value = record
  savedFlash.value = true
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PUBLISH_SAVE_KEY, JSON.stringify(record))
  }
}

function clearSavedPublish() {
  savedPublish.value = null
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(PUBLISH_SAVE_KEY)
  }
}

async function loadFactory() {
  loading.value = true
  note.value = ''
  denied.value = false
  try {
    const auth = loadAuth()
    if (!auth?.token) {
      denied.value = true
      authed.value = false
      inspected.value = null
      return
    }
    const response = await fetch(
      `${endpoint}/teacher/lab-factory?labId=${encodeURIComponent(labId.value)}`,
      { headers: authHeaders() },
    )
    if (response.status === 401) {
      denied.value = true
      authed.value = false
      inspected.value = null
      return
    }
    if (!response.ok) throw new Error(`导师服务返回 ${response.status}`)
    const payload = await response.json()
    authed.value = true
    published.value = payload.published || { labs: {} }
    inspected.value = payload.inspected || null
    const names = Object.keys(payload.inspected?.spec?.variants || {})
    if (!names.includes(variant.value)) {
      variant.value = names.includes('remedial')
        ? 'remedial'
        : names.includes('debug')
          ? 'debug'
          : names[0] || ''
    }
  } catch (err) {
    note.value = err instanceof Error ? err.message : '无法连接导师服务（npm run tutor）'
    inspected.value = null
  } finally {
    loading.value = false
  }
}

async function runValidate() {
  if (busy.value || !canGoStep2.value) return
  busy.value = true
  formError.value = ''
  note.value = ''
  resetDownstream(2)
  try {
    const response = await fetch(`${endpoint}/teacher/lab-factory/validate`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: labId.value, variant: variant.value }),
    })
    const payload = (await response.json().catch(() => ({}))) as ValidateResult
    validateResult.value = payload
    if (!response.ok || !payload.ok) {
      formError.value = payload.error
        || (payload.errors?.length ? payload.errors.join('；') : `校验失败（HTTP ${response.status}）`)
      return
    }
    step.value = 2
  } catch {
    formError.value = '无法连接导师服务（npm run tutor）'
  } finally {
    busy.value = false
  }
}

async function runTest() {
  if (busy.value || !validateOk.value) return
  busy.value = true
  formError.value = ''
  note.value = ''
  resetDownstream(3)
  try {
    const response = await fetch(`${endpoint}/teacher/lab-factory/test`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId: labId.value, variant: variant.value }),
    })
    const payload = (await response.json().catch(() => ({}))) as TestResult
    testResult.value = payload
    if (!response.ok || !payload.ok) {
      formError.value = payload.error
        || (payload.errors?.length ? payload.errors.join('；') : `隔离测试未通过（HTTP ${response.status}）`)
      step.value = 3
      return
    }
    step.value = 3
  } catch {
    formError.value = '无法连接导师服务（npm run tutor）'
  } finally {
    busy.value = false
  }
}

async function runPublish() {
  if (busy.value || !testOk.value) return
  formError.value = ''
  const reason = approvalNote.value.trim()
  if (!approved.value) {
    formError.value = '发布必须勾选「明确批准」。'
    return
  }
  if (!reason) {
    formError.value = '发布必须填写审批说明。'
    return
  }
  busy.value = true
  note.value = ''
  try {
    const response = await fetch(`${endpoint}/teacher/lab-factory/publish`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: labId.value,
        testRunId: testResult.value?.runId,
        approved: true,
        approvalNote: reason,
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as PublishResult
    publishResult.value = payload
    if (!response.ok || !payload.ok) {
      formError.value = payload.error
        || (payload.errors?.length ? payload.errors.join('；') : `发布失败（HTTP ${response.status}）`)
      step.value = 4
      return
    }
    step.value = 4
    savePublishRecord()
    await loadFactory()
  } catch {
    formError.value = '无法连接导师服务（npm run tutor）'
  } finally {
    busy.value = false
  }
}

function goStep(target: WizardStep) {
  if (target === 1) {
    step.value = 1
    return
  }
  if (target === 2 && canGoStep2.value && validateResult.value) {
    step.value = 2
    return
  }
  if (target === 3 && canGoStep3.value && testResult.value) {
    step.value = 3
    return
  }
  if (target === 4 && canGoStep4.value) {
    step.value = 4
  }
}

watch(labId, () => {
  resetDownstream(1)
  step.value = 1
  void loadFactory()
})

watch(variant, () => {
  if (validateResult.value || testResult.value || publishResult.value) {
    resetDownstream(1)
    step.value = 1
  }
})

onMounted(() => {
  loadSavedPublish()
  void loadFactory()
})
</script>

<template>
  <main class="lab-factory">
    <header class="lab-factory-header">
      <div>
        <span>os-lab · 教师端 · Lab 工厂</span>
        <h1>LabCreateWizard</h1>
        <p>
          对接仓库内已有 Lab 包：选元数据 → schema/dry-run → 隔离测试 → 批准发布。
          不会在线改写 lab.yaml；发布后请到工作台「教学安排」下发变体。
        </p>
      </div>
      <div class="lab-factory-actions">
        <button type="button" :disabled="loading || busy" title="刷新包状态" @click="loadFactory">
          <RefreshCw :size="15" aria-hidden="true" />刷新
        </button>
      </div>
    </header>

    <p v-if="note" class="lab-factory-note" role="alert">{{ note }}</p>

    <section
      v-if="savedPublish && savedLab"
      class="lab-factory-saved"
      aria-label="已保存的工厂发布记录"
    >
      <Save :size="18" aria-hidden="true" />
      <div>
        <strong>上次发布待下发</strong>
        <p>
          {{ savedPublish.labId }} / <code>{{ savedPublish.variant }}</code>
          <template v-if="savedPublish.version"> · {{ savedPublish.version }}</template>
          ，已保存，尚未在教学安排中下发。
        </p>
        <a :href="savedWorkspaceHref">打开工作台并下发变体</a>
      </div>
      <button type="button" class="ghost" @click="clearSavedPublish">清除记录</button>
    </section>

    <section v-if="denied" class="lab-factory-empty">
      <ShieldAlert :size="28" aria-hidden="true" />
      <h2>需要教师账号</h2>
      <p>请先在引导式学习登录教师账号，再打开本页使用 Lab 工厂。</p>
      <a :href="withBase('/guide/ai-tutor')">返回引导式学习</a>
    </section>

    <template v-else>
      <nav class="lab-factory-steps" aria-label="发布步骤">
        <button
          v-for="item in steps"
          :key="item.id"
          type="button"
          class="lab-factory-step"
          :class="{
            active: step === item.id,
            done:
              (item.id === 1 && canGoStep2) ||
              (item.id === 2 && validateOk) ||
              (item.id === 3 && testOk) ||
              (item.id === 4 && publishOk),
          }"
          :disabled="
            item.id === 2 ? !validateResult : item.id === 3 ? !testResult : item.id === 4 ? !canGoStep4 : false
          "
          @click="goStep(item.id)"
        >
          <span>{{ item.id }}</span>
          {{ item.label }}
        </button>
      </nav>

      <details class="lab-factory-guide" open>
        <summary>教师操作流程</summary>
        <ol>
          <li>先用教师账号（例如 admin）登录，再打开本页。</li>
          <li>在“01 元数据”选择要发布的 Lab 与变体，点击「运行 schema / dry-run」。</li>
          <li>校验通过后进入隔离测试；测试通过并填写审批说明后，点击「批准并发布」。</li>
          <li>发布成功会自动保存「上次发布待下发」记录；即使没有马上下发，下次打开本页也能从顶部卡片继续。</li>
          <li>点击「打开工作台并下发变体」，在教学安排面板点击「开放并下发」，学生刷新后即可领取新变体。</li>
          <li>若提示“该 Lab 版本已经发布”，说明同版本已存在：直接到教学安排下发已有版本，或提升 <code>lab.yaml</code> 的 version 后重新发布。</li>
        </ol>
        <p class="lab-factory-guide-note">
          工厂发布只更新内容包，不会自动修改学生的开放进度和变体；教学安排下发才是学生端生效的最后一步。
        </p>
      </details>

      <section v-if="step === 1" class="lab-factory-panel" aria-label="元数据">
        <header>
          <Factory :size="18" aria-hidden="true" />
          <div>
            <h2>01 · 元数据</h2>
            <p>选择仓库中的 Lab 包与变体；字段只读，来自 lab.yaml inspect。</p>
          </div>
        </header>

        <div class="lab-factory-fields">
          <label>
            <span>Lab</span>
            <select v-model="labId" :disabled="loading || busy" aria-label="选择 Lab">
              <option v-for="id in LAB_IDS" :key="id" :value="id">
                {{ tutorLabs.find((lab) => lab.id === id)?.label || id }} ·
                {{ tutorLabs.find((lab) => lab.id === id)?.title || id }}
              </option>
            </select>
          </label>
          <label>
            <span>变体</span>
            <select v-model="variant" :disabled="loading || busy || !variantNames.length" aria-label="选择变体">
              <option value="" disabled>选择变体</option>
              <option v-for="name in variantNames" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
        </div>

        <p v-if="loading" class="lab-factory-muted">正在读取 Lab 包…</p>
        <p v-else-if="!inspected" class="lab-factory-muted">未能读取包状态。</p>
        <p v-else-if="!inspected.ok" class="lab-factory-error" role="alert">
          Schema 未通过：{{ (inspected.errors || []).join('；') || '未知错误' }}
        </p>

        <dl v-if="inspected?.spec" class="lab-factory-meta">
          <div>
            <dt>标题</dt>
            <dd>{{ inspected.spec.title || '—' }}</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{{ inspected.version || inspected.spec.version || '—' }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ inspected.spec.status || '—' }}</dd>
          </div>
          <div>
            <dt>Feature</dt>
            <dd>{{ inspected.spec.feature || '—' }}</dd>
          </div>
          <div>
            <dt>Recipe</dt>
            <dd><code>{{ inspected.spec.verification?.recipe || '—' }}</code></dd>
          </div>
          <div>
            <dt>Spec hash</dt>
            <dd><code>{{ shortHash(inspected.specHash) }}</code></dd>
          </div>
          <div>
            <dt>已声明变体</dt>
            <dd>{{ variantNames.join(', ') || '—' }}</dd>
          </div>
          <div>
            <dt>已发布</dt>
            <dd v-if="publishedEntry">
              {{ publishedEntry.version }} ·
              <code>{{ publishedEntry.release || '—' }}</code>
            </dd>
            <dd v-else>尚未发布到 catalog</dd>
          </div>
        </dl>

        <p v-if="formError && step === 1" class="lab-factory-error" role="alert">{{ formError }}</p>

        <footer class="lab-factory-foot">
          <button
            type="button"
            :disabled="busy || loading || !canGoStep2"
            @click="runValidate"
          >
            <FlaskConical :size="15" aria-hidden="true" />
            {{ busy ? '校验中…' : '运行 schema / dry-run' }}
            <ChevronRight :size="15" aria-hidden="true" />
          </button>
        </footer>
      </section>

      <section v-else-if="step === 2" class="lab-factory-panel" aria-label="校验结果">
        <header>
          <FlaskConical :size="18" aria-hidden="true" />
          <div>
            <h2>02 · 校验（lint + dry-run）</h2>
            <p>临时目录生成脚手架，不改动学生工作区。</p>
          </div>
        </header>

        <div v-if="validateResult" class="lab-factory-result" :class="{ ok: validateOk }">
          <strong>{{ validateOk ? '通过' : '未通过' }}</strong>
          <span>stage · {{ validateResult.stage || '—' }}</span>
          <span>{{ labId }} / {{ variant }} · {{ validateResult.version || '—' }}</span>
        </div>

        <ul v-if="validateResult?.errors?.length" class="lab-factory-errors">
          <li v-for="(err, index) in validateResult.errors" :key="`${index}-${err}`">{{ err }}</li>
        </ul>

        <table v-if="validateResult?.variants?.length" class="lab-factory-table">
          <thead>
            <tr>
              <th>变体</th>
              <th>目标文件</th>
              <th>文件数</th>
              <th>manifestHash</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in validateResult.variants" :key="item.variant">
              <td><code>{{ item.variant }}</code></td>
              <td><code>{{ item.target || '—' }}</code></td>
              <td>{{ item.fileCount ?? '—' }}</td>
              <td><code>{{ shortHash(item.manifestHash) }}</code></td>
            </tr>
          </tbody>
        </table>

        <p v-if="formError" class="lab-factory-error" role="alert">{{ formError }}</p>

        <footer class="lab-factory-foot">
          <button type="button" class="ghost" :disabled="busy" @click="step = 1">返回元数据</button>
          <button type="button" class="ghost" :disabled="busy" @click="runValidate">
            {{ busy ? '重跑中…' : '重新校验' }}
          </button>
          <button type="button" :disabled="busy || !validateOk" @click="runTest">
            {{ busy ? '测试中…' : '运行隔离测试' }}
            <ChevronRight :size="15" aria-hidden="true" />
          </button>
        </footer>
      </section>

      <section v-else-if="step === 3" class="lab-factory-panel" aria-label="隔离测试">
        <header>
          <FlaskConical :size="18" aria-hidden="true" />
          <div>
            <h2>03 · 隔离测试</h2>
            <p>必须拿到通过的 testRunId，发布才会接受。</p>
          </div>
        </header>

        <div v-if="testResult" class="lab-factory-result" :class="{ ok: testOk }">
          <strong>{{ testOk ? '测试通过' : '测试未通过' }}</strong>
          <span>status · {{ testResult.status || '—' }}</span>
          <span>runId · <code>{{ testResult.runId || '—' }}</code></span>
          <span>isolated · {{ testResult.isolated === true ? '是' : '否' }}</span>
          <span>baseline · {{ assertionSummary(testResult.baselineAssertions) }}</span>
          <span>variant · {{ assertionSummary(testResult.variantAssertions) }}</span>
          <span>负向命中 · {{ testResult.negativeMatched === true ? '是' : testResult.negativeMatched === false ? '否' : '—' }}</span>
        </div>

        <details v-if="failedCommands.length" class="lab-factory-cmd-fail" open>
          <summary>失败命令（{{ failedCommands.length }}）</summary>
          <div v-for="(cmd, index) in failedCommands" :key="`${cmd.kind || 'cmd'}-${index}`" class="lab-factory-cmd-item">
            <strong>{{ cmd.kind || 'command' }} · exit {{ cmd.exitCode }}</strong>
            <code>{{ cmd.command || '—' }}</code>
            <pre>{{ cmd.outputTail || '（无输出）' }}</pre>
          </div>
        </details>

        <p v-if="formError" class="lab-factory-error" role="alert">{{ formError }}</p>

        <footer class="lab-factory-foot">
          <button type="button" class="ghost" :disabled="busy" @click="step = 2">返回校验</button>
          <button type="button" class="ghost" :disabled="busy" @click="runTest">
            {{ busy ? '重跑中…' : '重新测试' }}
          </button>
          <button type="button" :disabled="busy || !testOk" @click="step = 4">
            进入批准发布
            <ChevronRight :size="15" aria-hidden="true" />
          </button>
        </footer>
      </section>

      <section v-else class="lab-factory-panel" aria-label="批准发布">
        <header>
          <Upload :size="18" aria-hidden="true" />
          <div>
            <h2>04 · 批准发布</h2>
            <p>引用成功测试并显式批准；同版本不可覆盖。</p>
          </div>
        </header>

        <dl class="lab-factory-meta compact">
          <div>
            <dt>Lab / 变体</dt>
            <dd>{{ labId }} / {{ variant }}</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{{ testResult?.version || inspected?.version || '—' }}</dd>
          </div>
          <div>
            <dt>testRunId</dt>
            <dd><code>{{ testResult?.runId || '—' }}</code></dd>
          </div>
        </dl>

        <fieldset class="lab-factory-approve" :disabled="busy || publishOk">
          <label class="lab-factory-check">
            <input v-model="approved" type="checkbox">
            我确认教学与工程检查已完成，明确批准发布本版本
          </label>
          <label class="lab-factory-field">
            <span>审批说明（必填）</span>
            <textarea
              v-model="approvalNote"
              rows="3"
              maxlength="2000"
              placeholder="例如：Lab2 remedial 教师验收通过，发布到测试班。"
            />
          </label>
        </fieldset>

        <div v-if="publishResult" class="lab-factory-result" :class="{ ok: publishOk }">
          <strong>{{ publishOk ? '已发布' : '发布失败' }}</strong>
          <template v-if="publishOk">
            <span>version · {{ publishResult.version }}</span>
            <span>publishedAt · {{ formatTime(publishResult.publishedAt) }}</span>
            <span>release · <code>{{ publishResult.release || '—' }}</code></span>
          </template>
          <span v-else>{{ publishResult.error || (publishResult.errors || []).join('；') || '未知错误' }}</span>
        </div>

        <p v-if="formError" class="lab-factory-error" role="alert">{{ formError }}</p>

        <div v-if="publishOk" class="lab-factory-success">
          <CheckCircle2 :size="18" aria-hidden="true" />
          <div>
            <strong>发布完成</strong>
            <p>
              内容同步会优先读 published catalog。下一步请到工作台「教学安排」为班级/学生下发
              <code>{{ variant }}</code> 变体。
            </p>
            <div class="lab-factory-success-actions">
              <a :href="workspaceHref">打开 {{ selectedLab.label }} 工作台并下发变体</a>
              <button type="button" class="ghost" @click="savePublishRecord">
                <Save :size="15" aria-hidden="true" />
                {{ savedPublishCurrent ? '已保存发布记录' : '保存发布记录' }}
              </button>
              <p v-if="savedFlash" class="lab-factory-saved-note">
                已保存，下次打开本页可直接进入教学安排下发。
              </p>
            </div>
          </div>
        </div>

        <footer class="lab-factory-foot">
          <button type="button" class="ghost" :disabled="busy" @click="step = 3">返回测试</button>
          <button type="button" :disabled="busy || !testOk || publishOk" @click="runPublish">
            <Upload :size="15" aria-hidden="true" />
            {{ busy ? '发布中…' : '批准并发布' }}
          </button>
        </footer>
      </section>
    </template>
  </main>
</template>

<style scoped>
.lab-factory {
  width: min(960px, calc(100vw - 2 * var(--ws-space-5)));
  margin: 0 auto;
  padding: var(--ws-space-8) 0;
  color: var(--ws-ink);
}

.lab-factory :where(h1, h2) {
  padding: 0;
  border: 0;
}

.lab-factory-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ws-space-6);
  padding-bottom: var(--ws-space-5);
  border-bottom: 1px solid var(--ws-line);
}

.lab-factory-header > div:first-child > span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.lab-factory-header h1 {
  margin: 6px 0 8px;
  font-size: clamp(1.4rem, 2vw, 1.85rem);
  line-height: 1.25;
}

.lab-factory-header p {
  margin: 0;
  max-width: 52rem;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: 1.55;
}

.lab-factory-actions button,
.lab-factory-foot button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--ws-control-sm);
  padding: 6px 12px;
  color: var(--ws-accent-contrast);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  text-decoration: none;
}

.lab-factory-foot button.ghost,
.lab-factory-actions button {
  color: var(--ws-ink-muted);
  border-color: var(--ws-line);
  background: var(--ws-surface);
}

.lab-factory-foot button:not(.ghost) {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.lab-factory button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.lab-factory-note,
.lab-factory-error {
  margin: var(--ws-space-3) 0 0;
  color: var(--ws-danger, #c0392b);
  font-size: var(--ws-text-sm);
}

.lab-factory-saved {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ws-space-3);
  margin-top: var(--ws-space-4);
  padding: var(--ws-space-4);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent-soft);
}

.lab-factory-saved > svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--ws-accent);
}

.lab-factory-saved > div {
  flex: 1 1 auto;
  min-width: 0;
}

.lab-factory-saved strong,
.lab-factory-saved p {
  margin: 0;
}

.lab-factory-saved p {
  margin: 4px 0 8px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: 1.5;
}

.lab-factory-saved a {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
}

.lab-factory-saved button.ghost {
  display: inline-flex;
  align-items: center;
  min-height: var(--ws-control-sm);
  padding: 6px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.lab-factory-empty {
  display: grid;
  gap: var(--ws-space-2);
  justify-items: start;
  margin-top: var(--ws-space-8);
  padding: var(--ws-space-6);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.lab-factory-empty h2 {
  margin: 0;
  font-size: var(--ws-text-lg);
}

.lab-factory-empty p {
  margin: 0;
  color: var(--ws-ink-muted);
}

.lab-factory-empty a,
.lab-factory-success a {
  color: var(--ws-accent);
  font-weight: var(--ws-weight-semibold);
  text-decoration: none;
}

.lab-factory-empty a:hover,
.lab-factory-success a:hover {
  text-decoration: underline;
}

.lab-factory-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ws-space-2);
  margin: var(--ws-space-5) 0;
}

.lab-factory-guide {
  margin: 0 0 var(--ws-space-5);
  padding: var(--ws-space-4);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.lab-factory-guide summary {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.lab-factory-guide ol {
  display: grid;
  gap: var(--ws-space-2);
  margin: var(--ws-space-3) 0 0;
  padding-left: 1.2rem;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: 1.6;
}

.lab-factory-guide code {
  color: var(--ws-accent);
}

.lab-factory-guide-note {
  margin: var(--ws-space-3) 0 0;
  padding-top: var(--ws-space-3);
  color: var(--ws-ink-faint);
  border-top: 1px solid var(--ws-line);
  font-size: var(--ws-text-xs);
  line-height: 1.5;
}

.lab-factory-step {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 8px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
  text-align: left;
}

.lab-factory-step span {
  display: grid;
  width: 22px;
  height: 22px;
  color: var(--ws-accent);
  border: 1px solid var(--ws-line);
  border-radius: 999px;
  background: var(--ws-surface-alt);
  font-family: var(--ws-font-mono);
  place-items: center;
}

.lab-factory-step.active {
  color: var(--ws-ink);
  border-color: var(--ws-accent);
  background: var(--ws-surface-alt);
}

.lab-factory-step.done span {
  color: var(--ws-ok, #1a7f37);
  border-color: var(--ws-ok, #1a7f37);
}

.lab-factory-panel {
  display: grid;
  gap: var(--ws-space-4);
  padding: var(--ws-space-5);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.lab-factory-panel > header {
  display: flex;
  gap: var(--ws-space-3);
  align-items: flex-start;
}

.lab-factory-panel > header h2,
.lab-factory-panel > header p {
  margin: 0;
}

.lab-factory-panel > header h2 {
  font-size: var(--ws-text-md);
}

.lab-factory-panel > header p {
  margin-top: 4px;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.lab-factory-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ws-space-3);
}

.lab-factory-fields label,
.lab-factory-field {
  display: grid;
  gap: 4px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.lab-factory-fields select,
.lab-factory-field textarea {
  width: 100%;
  padding: 8px 10px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font: inherit;
  font-size: var(--ws-text-sm);
}

.lab-factory-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ws-space-3);
  margin: 0;
}

.lab-factory-meta.compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.lab-factory-meta > div {
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.lab-factory-meta dt {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.lab-factory-meta dd {
  margin: 4px 0 0;
  font-size: var(--ws-text-sm);
  word-break: break-word;
}

.lab-factory-meta code,
.lab-factory-table code,
.lab-factory-result code {
  font-family: var(--ws-font-mono);
  font-size: 12px;
}

.lab-factory-muted {
  margin: 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-sm);
}

.lab-factory-result {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 12px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
  color: var(--ws-ink-muted);
}

.lab-factory-result.ok {
  border-color: color-mix(in srgb, var(--ws-ok, #1a7f37) 45%, var(--ws-line));
}

.lab-factory-result strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.lab-factory-result.ok strong {
  color: var(--ws-ok, #1a7f37);
}

.lab-factory-errors {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--ws-danger, #c0392b);
  font-size: var(--ws-text-xs);
}

.lab-factory-cmd-fail {
  padding: 10px 12px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
}

.lab-factory-cmd-fail summary {
  cursor: pointer;
  color: var(--ws-danger, #c0392b);
  font-weight: var(--ws-weight-semibold);
}

.lab-factory-cmd-item {
  display: grid;
  gap: 4px;
  margin-top: 10px;
}

.lab-factory-cmd-item strong {
  color: var(--ws-ink);
}

.lab-factory-cmd-item code,
.lab-factory-cmd-item pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--ws-font-mono);
  font-size: 11px;
  line-height: 1.45;
}

.lab-factory-cmd-item pre {
  max-height: 180px;
  overflow: auto;
  padding: 8px;
  border-radius: 6px;
  background: var(--ws-surface);
  color: var(--ws-ink-muted);
}

.lab-factory-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ws-text-xs);
}

.lab-factory-table th,
.lab-factory-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ws-line);
  text-align: left;
}

.lab-factory-table th {
  color: var(--ws-ink-faint);
  font-weight: var(--ws-weight-semibold);
}

.lab-factory-approve {
  display: grid;
  gap: var(--ws-space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.lab-factory-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
}

.lab-factory-success {
  display: flex;
  gap: var(--ws-space-3);
  padding: var(--ws-space-4);
  border: 1px solid color-mix(in srgb, var(--ws-ok, #1a7f37) 45%, var(--ws-line));
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.lab-factory-success strong,
.lab-factory-success p {
  margin: 0;
}

.lab-factory-success p {
  margin: 6px 0 10px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: 1.5;
}

.lab-factory-success-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.lab-factory-success-actions button.ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--ws-control-sm);
  padding: 6px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.lab-factory-saved-note {
  color: var(--ws-ok, #1a7f37) !important;
  font-size: var(--ws-text-xs) !important;
}

.lab-factory-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 720px) {
  .lab-factory-header,
  .lab-factory-fields,
  .lab-factory-meta,
  .lab-factory-meta.compact,
  .lab-factory-steps {
    grid-template-columns: 1fr;
    display: grid;
  }

  .lab-factory-header {
    align-items: stretch;
  }

  .lab-factory-steps {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
