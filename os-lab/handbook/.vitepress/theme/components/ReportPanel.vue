<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  Download,
  Eye,
  FilePlus2,
  FileText,
  ImagePlus,
  Images,
  MessageSquareQuote,
  Paperclip,
  Pencil,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import type { TutorLab } from '../tutor-model'
import { createReportMarkdown, renderReportHtml } from '../report-markdown'
import {
  DEFAULT_REPORT_TEMPLATE,
  FIXED_REFLECTION,
  cloneTemplate,
  formatSectionMarkdown,
  studentSections,
  type ReportTemplate,
} from '../report-template'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  type ReportAttachmentMeta,
  blobToBase64,
  compressImageFile,
  createAttachmentId,
  deleteAttachmentBlob,
  getAttachmentBlob,
  isAllowedAttachment,
  putAttachmentBlob,
} from '../report-attachments'

/**
 * 实验报告面板：模板 / Markdown 下拉选择；提交以当前格式为准。
 * 图片先进图片库（可浏览/改名），模板勾选插入当前段；Markdown 可见插入结果；预览看完整稿。
 */
const props = defineProps<{
  lab: TutorLab
  insertPayload: { id: number; text: string } | null
  teacherFeedback?: string
  reportTemplate?: ReportTemplate | null
}>()

const emit = defineEmits<{
  (event: 'reflect', content: string): void
  (event: 'review', content: string): void
  (event: 'submit-teacher', payload: {
    content: string
    attachments: Array<{ name: string; mime: string; dataBase64: string }>
  }): void
  (event: 'notice', text: string): void
}>()

type ReportMode = 'template' | 'markdown'
type EditorView = 'edit' | 'preview'

interface ReportDraft {
  mode: ReportMode
  sections: Record<string, string>
  markdownBody: string
}

const template = computed(() => cloneTemplate(props.reportTemplate || DEFAULT_REPORT_TEMPLATE))
const allSections = computed(() => studentSections(template.value))
const bodySections = computed(() => allSections.value.filter((s) => s.id !== FIXED_REFLECTION.id))

function emptySections(): Record<string, string> {
  return Object.fromEntries(allSections.value.map((section) => [section.id, '']))
}

function emptyDraft(): ReportDraft {
  return { mode: 'template', sections: emptySections(), markdownBody: '' }
}

const draft = ref<ReportDraft>(emptyDraft())
const isMarkdownMode = computed(() => draft.value.mode === 'markdown')

const savedAt = ref('')
const editorView = ref<EditorView>('edit')
const attachments = ref<ReportAttachmentMeta[]>([])
const attachmentUrls = ref<Record<string, string>>({})
const freeEditor = ref<HTMLTextAreaElement | null>(null)
const sectionEditors = ref<Record<string, HTMLTextAreaElement>>({})
const activeSection = ref(bodySections.value[0]?.id || 'goal')
const imageInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const busyAttach = ref(false)
/** 图片库改名草稿（始终可见输入框）。 */
const renameDrafts = ref<Record<string, string>>({})
/** 模板/Markdown 勾选待插入的图片 id。 */
const selectedImageIds = ref<string[]>([])
/** 大图浏览。 */
const lightboxId = ref<string | null>(null)
const libraryCollapsed = ref(false)

const storageKey = computed(() => `os-lab-report-${props.lab.id}-v2`)
const legacyKey = computed(() => `os-lab-report-${props.lab.id}-v1`)

const imageLibrary = computed(() =>
  attachments.value.filter((item) => item.mime.startsWith('image/')),
)
const documentAttachments = computed(() =>
  attachments.value.filter((item) => !item.mime.startsWith('image/')),
)
const lightboxMeta = computed(() =>
  imageLibrary.value.find((item) => item.id === lightboxId.value) || null,
)
const lightboxUrl = computed(() =>
  lightboxMeta.value ? attachmentUrls.value[lightboxMeta.value.id] || '' : '',
)

function syncRenameDrafts() {
  const next: Record<string, string> = { ...renameDrafts.value }
  for (const item of imageLibrary.value) {
    if (next[item.id] === undefined) next[item.id] = item.name
  }
  for (const id of Object.keys(next)) {
    if (!imageLibrary.value.some((item) => item.id === id)) delete next[id]
  }
  renameDrafts.value = next
}

watch(imageLibrary, syncRenameDrafts, { immediate: true, deep: true })

/** 从正文里解析已插入的图片（按出现顺序）。 */
function imagesReferencedIn(text: string): ReportAttachmentMeta[] {
  const list: ReportAttachmentMeta[] = []
  const seen = new Set<string>()
  const re = /!\[[^\]]*\]\(attachment:([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text || ''))) {
    const key = String(match[1] || '').trim()
    let decoded = key
    try {
      decoded = decodeURIComponent(key)
    } catch {
      decoded = key
    }
    const meta = imageLibrary.value.find(
      (item) => item.id === key || item.id === decoded || item.name === key || item.name === decoded,
    )
    if (!meta || seen.has(meta.id)) continue
    seen.add(meta.id)
    list.push(meta)
  }
  return list
}

const markdownInsertedImages = computed(() => imagesReferencedIn(draft.value.markdownBody))

function sectionInsertedImages(sectionId: string) {
  return imagesReferencedIn(draft.value.sections[sectionId] || '')
}

function resolveAttachmentUrl(ref: string) {
  let decoded = ref
  try {
    decoded = decodeURIComponent(ref)
  } catch {
    decoded = ref
  }
  const byId = attachments.value.find((item) => item.id === ref || item.id === decoded)
  if (byId && attachmentUrls.value[byId.id]) return attachmentUrls.value[byId.id]

  const candidates = [ref, decoded, encodeURIComponent(decoded)]
  for (const candidate of candidates) {
    const meta = attachments.value.find((item) => item.name === candidate)
    if (meta && attachmentUrls.value[meta.id]) return attachmentUrls.value[meta.id]
  }
  const fuzzy = attachments.value.find(
    (item) => item.name === decoded || item.name.endsWith(decoded) || decoded.endsWith(item.name),
  )
  return fuzzy ? attachmentUrls.value[fuzzy.id] || null : null
}

const reportMarkdown = createReportMarkdown()
const finalMarkdown = computed(() => assembleMarkdown())
const previewHtml = computed(() => {
  void attachmentUrls.value
  void attachments.value
  void draft.value
  return renderReportHtml(finalMarkdown.value, resolveAttachmentUrl, reportMarkdown)
})

function rewriteLegacyAttachmentRefs(text: string) {
  return text.replace(/!\[([^\]]*)\]\(attachment:([^)]+)\)/g, (all, alt, ref) => {
    const key = String(ref || '').trim()
    let decoded = key
    try {
      decoded = decodeURIComponent(key)
    } catch {
      decoded = key
    }
    const meta = attachments.value.find(
      (item) => item.id === key || item.id === decoded || item.name === key || item.name === decoded,
    )
    if (!meta || meta.id === key) return all
    const label = String(alt || meta.name).replace(/[[\]]/g, '')
    return `![${label}](attachment:${meta.id})`
  })
}

function setSectionEditor(key: string, el: unknown) {
  if (el instanceof HTMLTextAreaElement) sectionEditors.value[key] = el
  else delete sectionEditors.value[key]
}

function ensureSectionValues() {
  const next = { ...emptySections(), ...draft.value.sections }
  draft.value.sections = next
  if (!allSections.value.some((s) => s.id === activeSection.value)) {
    activeSection.value = bodySections.value[0]?.id || FIXED_REFLECTION.id
  }
}

let hydrateGeneration = 0

function revokeUrls() {
  for (const url of Object.values(attachmentUrls.value)) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  attachmentUrls.value = {}
}

/**
 * 从 IndexedDB 补齐预览 URL。
 * 必须合并已有 URL：刚上传的图若被整表覆盖，会表现为「上传不成功」。
 */
async function hydrateAttachmentUrls(labId: string, metas: ReportAttachmentMeta[]) {
  const gen = ++hydrateGeneration
  const next: Record<string, string> = {}
  for (const meta of metas) {
    if (gen !== hydrateGeneration) return
    const existing = attachmentUrls.value[meta.id]
    if (existing) {
      next[meta.id] = existing
      continue
    }
    try {
      const blob = await getAttachmentBlob(labId, meta.id)
      if (!blob) continue
      // 预览用 blob URL 即可（renderReportHtml 已不依赖 Markdown 解析 URL）。
      next[meta.id] = URL.createObjectURL(blob)
    } catch {
      /* 单附件损坏时跳过 */
    }
  }
  if (gen !== hydrateGeneration) return
  for (const [id, url] of Object.entries(attachmentUrls.value)) {
    if (!next[id] && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  attachmentUrls.value = next
}

function load() {
  if (typeof localStorage === 'undefined') return
  // 取消进行中的 hydrate，避免旧请求覆盖新上传的 URL
  hydrateGeneration += 1
  revokeUrls()
  try {
    let raw = localStorage.getItem(storageKey.value)
    if (!raw) {
      const legacy = localStorage.getItem(legacyKey.value)
      if (legacy) raw = legacy
    }
    const value = JSON.parse(raw || '{}')
    const next = emptyDraft()
    if (value?.mode === 'template' || value?.mode === 'markdown') {
      next.mode = value.mode
    } else if (value?.mode === 'free' || value?.mode === 'word') {
      next.mode = 'markdown'
    }
    if (typeof value?.markdownBody === 'string') next.markdownBody = value.markdownBody
    else if (typeof value?.freeBody === 'string') next.markdownBody = value.freeBody
    // 旧 Word 正文并入 Markdown（若 Markdown 为空）
    if (!next.markdownBody.trim() && typeof value?.wordBody === 'string' && value.wordBody.trim()) {
      next.markdownBody = value.wordBody
    }
    if (value?.sections && typeof value.sections === 'object') {
      for (const [id, text] of Object.entries(value.sections)) {
        if (typeof text === 'string') next.sections[id] = text
      }
    } else {
      for (const id of ['goal', 'process', 'problems', 'findings', 'reflection']) {
        if (typeof value?.[id] === 'string') next.sections[id] = value[id]
      }
    }
    draft.value = next
    ensureSectionValues()
    activeSection.value = bodySections.value[0]?.id || FIXED_REFLECTION.id
    savedAt.value = typeof value?.savedAt === 'string' ? value.savedAt : ''
    attachments.value = Array.isArray(value?.attachments)
      ? value.attachments.filter(
          (item: ReportAttachmentMeta) =>
            item && typeof item.id === 'string' && typeof item.name === 'string',
        )
      : []
    draft.value.markdownBody = rewriteLegacyAttachmentRefs(draft.value.markdownBody)
    for (const sectionId of Object.keys(draft.value.sections)) {
      draft.value.sections[sectionId] = rewriteLegacyAttachmentRefs(
        draft.value.sections[sectionId] || '',
      )
    }
    void hydrateAttachmentUrls(props.lab.id, attachments.value).then(() => {
      persist(false)
    })
  } catch {
    draft.value = emptyDraft()
    attachments.value = []
  }
}

watch(() => props.lab.id, load, { immediate: true })
watch(
  () => props.reportTemplate,
  () => {
    ensureSectionValues()
  },
)

onBeforeUnmount(() => revokeUrls())

watch(
  () => props.insertPayload?.id,
  () => {
    const text = props.insertPayload?.text
    if (!text) return
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const block = `\n\n[${stamp} 终端输出]\n\`\`\`text\n${text}\n\`\`\`\n`
    if (isMarkdownMode.value) {
      draft.value.markdownBody = `${draft.value.markdownBody.trimEnd()}${block}`.trimStart()
    } else {
      let id = activeSection.value
      if (!allSections.value.some((s) => s.id === id)) {
        id = bodySections.value[0]?.id || FIXED_REFLECTION.id
      }
      draft.value.sections[id] = `${(draft.value.sections[id] || '').trimEnd()}${block}`.trimStart()
      activeSection.value = id
    }
    persist(false)
    emit('notice', '终端输出已写进当前正在编辑的位置。')
  },
)

function persist(announce = true) {
  if (typeof localStorage === 'undefined') return
  savedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
  try {
    localStorage.setItem(
      storageKey.value,
      JSON.stringify({
        mode: draft.value.mode,
        sections: draft.value.sections,
        markdownBody: draft.value.markdownBody,
        attachments: attachments.value,
        savedAt: savedAt.value,
      }),
    )
  } catch (err) {
    // 配额满不应导致「上传失败」；附件二进制已在 IndexedDB。
    console.warn('[ReportPanel] persist failed', err)
    if (announce) {
      emit('notice', '本机草稿缓存已满，图片仍在图片库；可删掉旧附件后再保存。')
    }
    return
  }
  if (announce) emit('notice', '已保存到本机，刷新页面也不会丢。')
}

function reflectionText() {
  return (draft.value.sections[FIXED_REFLECTION.id] || '').trim()
}

function save() {
  persist(false)
  const reflection = reflectionText()
  if (reflection) {
    emit('reflect', reflection)
  } else {
    emit('notice', `已保存。补上「${FIXED_REFLECTION.title}」后再点保存，才能完成本层复盘。`)
  }
}

function referencedAttachmentKeys(source: string) {
  const keys = new Set<string>()
  const re = /!?\[([^\]]*)\]\(attachment:([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const raw = String(match[2] || '').trim()
    keys.add(raw)
    try {
      keys.add(decodeURIComponent(raw))
    } catch {
      /* ignore */
    }
  }
  return keys
}

/** 始终按当前下拉选中的格式组装，提交/预览/导出同一份。 */
function buildBodyMarkdown() {
  const tpl = template.value
  const withPrompt = tpl.includePromptsInMarkdown !== false
  const lines: string[] = [`# ${props.lab.label} ${props.lab.title} · 实验报告`, '']
  if (tpl.intro.trim()) {
    if (withPrompt) lines.push(`> **老师布置：** ${tpl.intro.trim()}`, '')
    else lines.push(tpl.intro.trim(), '')
  }
  if (draft.value.mode === 'markdown') {
    lines.push(draft.value.markdownBody.trim() || '（正文未填写）', '')
    lines.push(
      formatSectionMarkdown(
        FIXED_REFLECTION.title,
        FIXED_REFLECTION.prompt,
        reflectionText(),
        withPrompt,
      ),
    )
  } else {
    for (const section of allSections.value) {
      lines.push(
        formatSectionMarkdown(
          section.title,
          section.prompt,
          draft.value.sections[section.id] || '',
          withPrompt,
        ),
      )
    }
  }
  return lines.join('\n')
}

function assembleMarkdown() {
  const body = buildBodyMarkdown()
  const referenced = referencedAttachmentKeys(body)
  const dangling = attachments.value.filter(
    (item) => !referenced.has(item.id) && !referenced.has(item.name),
  )
  const lines = [body.trimEnd(), '']
  if (dangling.length) {
    lines.push('## 附件', '')
    for (const item of dangling) {
      if (item.mime.startsWith('image/')) {
        lines.push(`![${item.name.replace(/[[\]]/g, '')}](attachment:${item.id})`, '')
      } else {
        lines.push(`- [${item.name.replace(/[[\]]/g, '')}](attachment:${item.id})（${formatSize(item.size)}）`)
      }
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function rewriteAttachmentRefsForExport(source: string) {
  return source.replace(/\(attachment:([^)]+)\)/g, (_all, ref) => {
    const key = String(ref || '').trim()
    let decoded = key
    try {
      decoded = decodeURIComponent(key)
    } catch {
      decoded = key
    }
    const meta = attachments.value.find(
      (item) => item.id === key || item.id === decoded || item.name === key || item.name === decoded,
    )
    if (!meta) return `(attachment:${ref})`
    return `(attachment:${encodeURIComponent(meta.name)})`
  })
}

function exportMarkdown() {
  const content = rewriteAttachmentRefsForExport(assembleMarkdown())
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${props.lab.id}-report.md`
  anchor.click()
  URL.revokeObjectURL(url)
  emit('notice', '已导出当前格式下的报告。')
}

function askReview() {
  persist(false)
  const content = rewriteAttachmentRefsForExport(assembleMarkdown())
  emit('review', content.length > 3200 ? `${content.slice(0, 3200)}\n…（已截断）` : content)
}

async function submitToTeacher() {
  persist(false)
  busyAttach.value = true
  try {
    const files: Array<{ name: string; mime: string; dataBase64: string }> = []
    for (const meta of attachments.value) {
      const blob = await getAttachmentBlob(props.lab.id, meta.id)
      if (!blob) continue
      files.push({
        name: meta.name,
        mime: meta.mime || blob.type || 'application/octet-stream',
        dataBase64: await blobToBase64(blob),
      })
    }
    emit('submit-teacher', {
      content: rewriteAttachmentRefsForExport(assembleMarkdown()),
      attachments: files,
    })
  } catch (err) {
    emit('notice', err instanceof Error ? err.message : '附件准备失败，请稍后重试。')
  } finally {
    busyAttach.value = false
  }
}

function setMode(mode: ReportMode) {
  if (draft.value.mode === mode) return
  if (mode === 'markdown' && !draft.value.markdownBody.trim()) {
    const withPrompt = template.value.includePromptsInMarkdown !== false
    draft.value.markdownBody = bodySections.value
      .map((section) => {
        const body = (draft.value.sections[section.id] || '').trim()
        if (withPrompt && section.prompt.trim()) {
          return `## ${section.title}\n\n> **填写提示：** ${section.prompt.trim()}\n\n${body}`
        }
        return `## ${section.title}\n\n${body}`
      })
      .join('\n\n')
  }
  draft.value.mode = mode
  editorView.value = 'edit'
  persist(false)
  emit(
    'notice',
    mode === 'markdown'
      ? '已切换到 Markdown：提交将按此格式。需要调图片位置可直接改正文里的 ![]()。'
      : '已切换到模板填写：提交将按此格式。',
  )
}

function onModeSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'template' || value === 'markdown') setMode(value)
}

function currentSectionId() {
  let id = activeSection.value
  if (!allSections.value.some((s) => s.id === id)) {
    id = bodySections.value[0]?.id || FIXED_REFLECTION.id
  }
  return id
}

/** 模板：写到当前段末尾；Markdown：追加到正文末尾（可再手调位置）。 */
function placeImageMarkdown(meta: ReportAttachmentMeta) {
  const safeAlt = meta.name.replace(/[[\]]/g, '')
  const block = `\n\n![${safeAlt}](attachment:${meta.id})\n\n`
  if (draft.value.mode === 'markdown') {
    draft.value.markdownBody = `${draft.value.markdownBody.trimEnd()}${block}`.trimStart()
  } else {
    const id = currentSectionId()
    draft.value.sections[id] = `${(draft.value.sections[id] || '').trimEnd()}${block}`.trimStart()
    activeSection.value = id
  }
}

function placeDocMarkdown(meta: ReportAttachmentMeta) {
  const safeLabel = meta.name.replace(/[[\]]/g, '')
  const block = `\n\n[附件：${safeLabel}](attachment:${meta.id})\n\n`
  if (draft.value.mode === 'markdown') {
    draft.value.markdownBody = `${draft.value.markdownBody.trimEnd()}${block}`.trimStart()
  } else {
    const id = currentSectionId()
    draft.value.sections[id] = `${(draft.value.sections[id] || '').trimEnd()}${block}`.trimStart()
    activeSection.value = id
  }
}

function uniqueName(name: string) {
  let finalName = name
  let n = 1
  while (attachments.value.some((item) => item.name === finalName)) {
    const dot = name.lastIndexOf('.')
    finalName = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`
    n += 1
  }
  return finalName
}

async function storeFile(file: File, options?: { asImage?: boolean }) {
  const treatAsImage = Boolean(
    options?.asImage || file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name),
  )
  if (!treatAsImage && !isAllowedAttachment(file)) {
    emit('notice', `暂时不支持这个文件类型：${file.name || '未命名'}`)
    return null
  }
  if (treatAsImage && !isAllowedAttachment(file) && !file.type.startsWith('image/')) {
    // 无扩展名的截图等：仍按图片收
    if (!options?.asImage) {
      emit('notice', `暂时不支持这个文件类型：${file.name || '未命名'}`)
      return null
    }
  }

  let blob: Blob = file
  let mime = file.type || 'application/octet-stream'
  let name = (file.name || '').trim() || (treatAsImage ? `image-${Date.now()}.png` : `file-${Date.now()}`)

  if (treatAsImage) {
    blob = await compressImageFile(file)
    mime = blob.type || mime
    if (!mime.startsWith('image/')) {
      mime = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg'
    }
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
      name = `${name}${mime === 'image/png' ? '.png' : '.jpg'}`
    }
  }

  if (blob.size > MAX_ATTACHMENT_BYTES) {
    emit('notice', `${name} 太大了（超过 ${formatSize(MAX_ATTACHMENT_BYTES)}），换一张小一点的试试。`)
    return null
  }
  if (!props.lab?.id) {
    emit('notice', '当前实验未就绪，请刷新页面后再上传。')
    return null
  }

  const finalName = uniqueName(name)
  const id = createAttachmentId()
  try {
    await putAttachmentBlob(props.lab.id, id, blob)
  } catch (err) {
    emit('notice', err instanceof Error ? `保存图片失败：${err.message}` : '保存图片失败，请重试。')
    return null
  }

  const meta: ReportAttachmentMeta = {
    id,
    name: finalName,
    mime,
    size: blob.size,
    addedAt: new Date().toISOString(),
  }
  // 先挂 URL 再写 attachments，避免列表渲染时缩略图空白
  const url = URL.createObjectURL(blob)
  attachmentUrls.value = { ...attachmentUrls.value, [id]: url }
  attachments.value = [...attachments.value, meta]
  renameDrafts.value = { ...renameDrafts.value, [id]: finalName }
  return meta
}

async function addImages(fileList: FileList | File[]) {
  const files = Array.from(fileList)
  if (!files.length) return
  if (attachments.value.length >= MAX_ATTACHMENTS) {
    emit('notice', `图片与附件合计最多 ${MAX_ATTACHMENTS} 个，请先删掉不用的。`)
    return
  }
  const room = MAX_ATTACHMENTS - attachments.value.length
  const batch = files.slice(0, room)
  if (files.length > room) {
    emit('notice', `还能再传 ${room} 个，已只处理前 ${room} 个。`)
  }
  busyAttach.value = true
  libraryCollapsed.value = false
  emit('notice', `正在上传 ${batch.length} 张图片…`)
  try {
    let count = 0
    const addedIds: string[] = []
    for (const file of batch) {
      try {
        const meta = await storeFile(file, { asImage: true })
        if (!meta) continue
        addedIds.push(meta.id)
        count += 1
      } catch (err) {
        emit('notice', err instanceof Error ? `「${file.name}」上传失败：${err.message}` : '有一张图片上传失败。')
      }
    }
    selectedImageIds.value = [...new Set([...selectedImageIds.value, ...addedIds])]
    persist(false)
    if (count) {
      emit(
        'notice',
        `已加入图片库 ${count} 张。请勾选后点「插入选中到当前段/正文」。`,
      )
    } else if (!batch.length) {
      emit('notice', '没有可上传的文件。')
    }
  } catch (err) {
    emit('notice', err instanceof Error ? err.message : '上传失败，请稍后重试。')
  } finally {
    busyAttach.value = false
  }
}

async function addDocuments(fileList: FileList | File[]) {
  const files = Array.from(fileList)
  if (!files.length) return
  if (attachments.value.length + files.length > MAX_ATTACHMENTS) {
    emit('notice', `图片与附件合计最多 ${MAX_ATTACHMENTS} 个。`)
    return
  }
  busyAttach.value = true
  try {
    let count = 0
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        emit('notice', `「${file.name}」是图片，请用「上传到图片库」。`)
        continue
      }
      const meta = await storeFile(file)
      if (!meta) continue
      placeDocMarkdown(meta)
      count += 1
    }
    persist(false)
    if (count) emit('notice', `已上传 ${count} 个附件（Word/PDF 等），并在正文加入链接。`)
  } catch (err) {
    emit('notice', err instanceof Error ? err.message : '上传失败，请稍后重试。')
  } finally {
    busyAttach.value = false
  }
}

function rewriteImageAlt(text: string, id: string, newAlt: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(
    new RegExp(`!\\[[^\\]]*\\]\\(attachment:${escaped}\\)`, 'g'),
    `![${newAlt}](attachment:${id})`,
  )
}

function renameImage(meta: ReportAttachmentMeta) {
  const trimmed = String(renameDrafts.value[meta.id] ?? meta.name).trim()
  if (!trimmed) {
    renameDrafts.value = { ...renameDrafts.value, [meta.id]: meta.name }
    emit('notice', '名字不能为空。')
    return
  }
  if (trimmed === meta.name) {
    emit('notice', '名字没有变化。')
    return
  }
  const extMatch = meta.name.match(/\.[a-z0-9]+$/i)
  let finalName = trimmed
  if (extMatch && !/\.[a-z0-9]+$/i.test(finalName)) finalName = `${finalName}${extMatch[0]}`
  const others = attachments.value.filter((item) => item.id !== meta.id)
  let n = 1
  const base = finalName
  while (others.some((item) => item.name === finalName)) {
    const dot = base.lastIndexOf('.')
    finalName = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`
    n += 1
  }
  const safeAlt = finalName.replace(/[[\]]/g, '')
  attachments.value = attachments.value.map((item) =>
    item.id === meta.id ? { ...item, name: finalName } : item,
  )
  renameDrafts.value = { ...renameDrafts.value, [meta.id]: finalName }
  draft.value.markdownBody = rewriteImageAlt(draft.value.markdownBody, meta.id, safeAlt)
  for (const sectionId of Object.keys(draft.value.sections)) {
    draft.value.sections[sectionId] = rewriteImageAlt(
      draft.value.sections[sectionId] || '',
      meta.id,
      safeAlt,
    )
  }
  persist(false)
  emit('notice', `图片已改名为「${finalName}」。`)
}

function isImageSelected(id: string) {
  return selectedImageIds.value.includes(id)
}

function toggleImageSelect(id: string) {
  if (selectedImageIds.value.includes(id)) {
    selectedImageIds.value = selectedImageIds.value.filter((x) => x !== id)
  } else {
    selectedImageIds.value = [...selectedImageIds.value, id]
  }
}

function selectAllImages() {
  selectedImageIds.value = imageLibrary.value.map((item) => item.id)
}

function clearImageSelection() {
  selectedImageIds.value = []
}

function insertSelectedImages() {
  const items = imageLibrary.value.filter((item) => selectedImageIds.value.includes(item.id))
  if (!items.length) {
    emit('notice', '请先在图片库勾选要插入的图片。')
    return
  }
  for (const meta of items) placeImageMarkdown(meta)
  persist(false)
  const where =
    draft.value.mode === 'markdown'
      ? 'Markdown 正文末尾（可在下方「插入结果」查看，也可剪切 ![]() 调整位置）'
      : `「${allSections.value.find((s) => s.id === currentSectionId())?.title || '当前段落'}」末尾`
  emit('notice', `已把 ${items.length} 张图插入到${where}。`)
  clearImageSelection()
}

function insertOneImage(meta: ReportAttachmentMeta) {
  placeImageMarkdown(meta)
  persist(false)
  emit(
    'notice',
    draft.value.mode === 'markdown'
      ? `已插入「${meta.name}」到正文末尾，下方可看插入结果。`
      : `已插入「${meta.name}」到当前段末尾。`,
  )
}

function openLightbox(id: string) {
  lightboxId.value = id
}

function closeLightbox() {
  lightboxId.value = null
}

async function removeAttachment(id: string) {
  const meta = attachments.value.find((item) => item.id === id)
  if (!meta) return
  await deleteAttachmentBlob(props.lab.id, id)
  if (attachmentUrls.value[id]) {
    const url = attachmentUrls.value[id]
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    const { [id]: _, ...rest } = attachmentUrls.value
    attachmentUrls.value = rest
  }
  attachments.value = attachments.value.filter((item) => item.id !== id)
  selectedImageIds.value = selectedImageIds.value.filter((x) => x !== id)
  if (lightboxId.value === id) lightboxId.value = null
  const { [id]: _name, ...restNames } = renameDrafts.value
  renameDrafts.value = restNames
  const refs = [meta.id, meta.name, encodeURIComponent(meta.name)]
  const strip = (text: string) => {
    let next = text
    for (const ref of refs) {
      const escaped = `attachment:${ref}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      next = next
        .replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, 'g'), '')
        .replace(new RegExp(`\\[[^\\]]*\\]\\(${escaped}\\)`, 'g'), '')
    }
    return next
  }
  draft.value.markdownBody = strip(draft.value.markdownBody)
  for (const sectionId of Object.keys(draft.value.sections)) {
    draft.value.sections[sectionId] = strip(draft.value.sections[sectionId] || '')
  }
  persist(false)
}

async function downloadAttachment(meta: ReportAttachmentMeta) {
  const blob = await getAttachmentBlob(props.lab.id, meta.id)
  if (!blob) {
    emit('notice', '找不到这个文件了，可能需要重新上传。')
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = meta.name
  anchor.click()
  URL.revokeObjectURL(url)
}

async function onImportMarkdown(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  // 先取出再清空，避免 FileList 被同步清空
  input.value = ''
  if (!file) return
  const lower = file.name.toLowerCase()
  if (/\.(docx?|pdf)$/i.test(lower)) {
    await addDocuments([file])
    return
  }
  const text = await file.text()
  draft.value.mode = 'markdown'
  draft.value.markdownBody = text
  editorView.value = 'edit'
  persist(false)
  emit('notice', `已导入「${file.name}」到 Markdown；提交将按 Markdown 格式。`)
}

function onImagePick(event: Event) {
  const input = event.target as HTMLInputElement
  // 必须先拷贝：清空 value 会把仍引用的 FileList 变成空，表现为「上传没反应」。
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) {
    emit('notice', '没有选到图片，请再试一次。')
    return
  }
  void addImages(files)
}

function onFilePick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) {
    emit('notice', '没有选到文件，请再试一次。')
    return
  }
  void addDocuments(files)
}

function openImagePicker() {
  busyAttach.value = false
  libraryCollapsed.value = false
  const el = imageInput.value
  if (!el) {
    emit('notice', '图片选择器未就绪，请刷新页面后再试。')
    return
  }
  el.click()
}

const modeLabel = computed(() =>
  draft.value.mode === 'markdown' ? 'Markdown 自由编写' : '模板填写',
)
</script>

<template>
  <section class="ws-report" aria-label="实验报告">
    <header class="ws-report-head">
      <div>
        <strong>{{ lab.label }} 实验报告</strong>
        <small v-if="savedAt">上次保存：{{ savedAt }} · 当前：{{ modeLabel }}</small>
        <small v-else>写在本机浏览器里；提交以当前下拉格式为准</small>
      </div>
      <div class="ws-report-actions">
        <button type="button" title="把当前报告发给 AI 导师" @click="askReview">
          <MessageSquareQuote :size="14" aria-hidden="true" /><span>请导师点评</span>
        </button>
        <button type="button" title="导出当前格式的报告" @click="exportMarkdown">
          <Download :size="14" aria-hidden="true" /><span>导出报告</span>
        </button>
        <button type="button" title="按当前格式提交给老师" :disabled="busyAttach" @click="submitToTeacher">
          <Send :size="14" aria-hidden="true" /><span>{{ busyAttach ? '准备中…' : '提交给老师' }}</span>
        </button>
        <button type="button" class="primary" @click="save">
          <Save :size="14" aria-hidden="true" /><span>保存</span>
        </button>
      </div>
    </header>

    <div class="ws-report-body">
      <div v-if="teacherFeedback" class="ws-report-feedback">
        <strong>老师批语</strong>
        <p>{{ teacherFeedback }}</p>
      </div>

      <div class="ws-report-modes">
        <label class="ws-report-mode-select">
          <span>编写格式</span>
          <select
            :value="draft.mode"
            :disabled="editorView === 'preview'"
            title="提交、预览、导出都以这里选中的格式为准"
            @change="onModeSelect"
          >
            <option value="template">模板填写</option>
            <option value="markdown">Markdown 自由编写</option>
          </select>
        </label>
        <span class="ws-report-toolbar-sep" />
        <button
          type="button"
          :class="{ active: editorView === 'edit' }"
          title="继续改内容"
          @click="editorView = 'edit'"
        >
          <Pencil :size="14" aria-hidden="true" />编辑
        </button>
        <button
          type="button"
          :class="{ active: editorView === 'preview' }"
          title="预览当前格式下老师会看到的样子"
          @click="editorView = 'preview'"
        >
          <Eye :size="14" aria-hidden="true" />预览最终稿
        </button>
        <div class="ws-report-modes-extra">
          <button
            type="button"
            title="导入 .md / .txt；Word/PDF 请用「上传附件」"
            :disabled="editorView === 'preview'"
            @click="importInput?.click()"
          >
            <Upload :size="14" aria-hidden="true" />导入 Markdown
          </button>
          <button
            type="button"
            title="上传图片到图片库（不自动插入正文，勾选后再插入）"
            @click="openImagePicker"
          >
            <ImagePlus :size="14" aria-hidden="true" />{{ busyAttach ? '上传中…' : '上传到图片库' }}
          </button>
          <button
            type="button"
            title="展开/收起图片库"
            @click="libraryCollapsed = !libraryCollapsed"
          >
            <Images :size="14" aria-hidden="true" />{{ libraryCollapsed ? '打开图片库' : '收起图片库' }}
          </button>
          <button
            type="button"
            title="上传 Word / PDF 等附件（不再提供 Word 编辑页）"
            :disabled="editorView === 'preview' || busyAttach"
            @click="fileInput?.click()"
          >
            <Paperclip :size="14" aria-hidden="true" />上传附件
          </button>
        </div>
      </div>

      <input
        id="os-lab-report-import"
        ref="importInput"
        class="ws-report-file-input"
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        @change="onImportMarkdown"
      />
      <input
        id="os-lab-report-images"
        ref="imageInput"
        class="ws-report-file-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
        multiple
        @change="onImagePick"
      />
      <input
        id="os-lab-report-files"
        ref="fileInput"
        class="ws-report-file-input"
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        @change="onFilePick"
      />

      <div v-show="!libraryCollapsed" class="ws-report-library" aria-label="图片库">
        <header class="ws-report-library-head">
          <Images :size="14" aria-hidden="true" />
          <strong>图片库</strong>
          <small>
            {{ imageLibrary.length }} 张 · 先上传/改名，勾选后插入
            {{ draft.mode === 'template' ? '当前段' : '正文' }}
          </small>
          <div class="ws-report-library-tools">
            <button type="button" @click="openImagePicker">
              <Upload :size="13" aria-hidden="true" />{{ busyAttach ? '上传中…' : '上传' }}
            </button>
            <button type="button" :disabled="!imageLibrary.length" @click="selectAllImages">全选</button>
            <button type="button" :disabled="!selectedImageIds.length" @click="clearImageSelection">清空勾选</button>
            <button
              type="button"
              class="primary"
              :disabled="!selectedImageIds.length || editorView === 'preview'"
              :title="draft.mode === 'template' ? '插入到当前正在编辑的段落末尾' : '插入到 Markdown 正文末尾'"
              @click="insertSelectedImages"
            >
              <FilePlus2 :size="13" aria-hidden="true" />
              插入选中（{{ selectedImageIds.length }}）到{{ draft.mode === 'template' ? '当前段' : '正文' }}
            </button>
          </div>
        </header>

        <p v-if="!imageLibrary.length" class="ws-report-library-empty">
          还没有图片。点「上传到图片库」添加；上传后可改名、点缩略图浏览大图，再勾选插入。
        </p>

        <div v-else class="ws-report-lib-grid">
          <article v-for="item in imageLibrary" :key="item.id" class="ws-report-lib-card">
            <label class="ws-report-lib-check">
              <input
                type="checkbox"
                :checked="isImageSelected(item.id)"
                :disabled="editorView === 'preview'"
                @change="toggleImageSelect(item.id)"
              />
              <span>选中</span>
            </label>
            <button
              type="button"
              class="ws-report-lib-thumb-btn"
              title="浏览大图"
              @click="openLightbox(item.id)"
            >
              <img
                v-if="attachmentUrls[item.id]"
                class="ws-report-lib-thumb"
                :src="attachmentUrls[item.id]"
                :alt="item.name"
              />
              <span v-else class="ws-report-lib-thumb-miss">加载中…</span>
            </button>
            <div class="ws-report-lib-meta">
              <input
                v-model="renameDrafts[item.id]"
                class="ws-report-lib-rename"
                :disabled="editorView === 'preview'"
                :title="'当前文件名：' + item.name"
                @keydown.enter.prevent="renameImage(item)"
              />
              <small>{{ formatSize(item.size) }}</small>
            </div>
            <div class="ws-report-lib-actions">
              <button type="button" title="保存新名字" :disabled="editorView === 'preview'" @click="renameImage(item)">
                改名
              </button>
              <button
                type="button"
                title="插入这一张"
                :disabled="editorView === 'preview'"
                @click="insertOneImage(item)"
              >
                插入
              </button>
              <button type="button" title="浏览大图" @click="openLightbox(item.id)">
                <Eye :size="13" aria-hidden="true" />
              </button>
              <button type="button" title="下载" @click="downloadAttachment(item)">
                <Download :size="13" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="从图片库删除"
                :disabled="editorView === 'preview'"
                @click="removeAttachment(item.id)"
              >
                <Trash2 :size="13" aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>
      </div>

      <div
        v-if="lightboxMeta"
        class="ws-report-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="浏览图片"
        @click.self="closeLightbox"
      >
        <div class="ws-report-lightbox-panel">
          <header>
            <strong>{{ lightboxMeta.name }}</strong>
            <button type="button" title="关闭" @click="closeLightbox">
              <X :size="16" aria-hidden="true" />
            </button>
          </header>
          <img v-if="lightboxUrl" :src="lightboxUrl" :alt="lightboxMeta.name" />
          <p v-else>图片暂时无法显示，请重新上传。</p>
        </div>
      </div>

      <div v-if="documentAttachments.length" class="ws-report-attachments" aria-label="文档附件">
        <header class="ws-report-library-head">
          <Paperclip :size="14" aria-hidden="true" />
          <strong>文档附件</strong>
          <small>Word / PDF 等</small>
        </header>
        <div v-for="item in documentAttachments" :key="item.id" class="ws-report-att">
          <Paperclip :size="13" aria-hidden="true" />
          <span class="ws-report-att-name" :title="item.name">{{ item.name }}</span>
          <small>{{ formatSize(item.size) }}</small>
          <button type="button" title="下载" @click="downloadAttachment(item)">
            <Download :size="13" aria-hidden="true" />
          </button>
          <button
            v-if="editorView === 'edit'"
            type="button"
            title="移除"
            @click="removeAttachment(item.id)"
          >
            <Trash2 :size="13" aria-hidden="true" />
          </button>
        </div>
      </div>

      <article v-if="editorView === 'preview'" class="ws-report-final" aria-label="最终提交预览">
        <header class="ws-report-final-banner">
          <Eye :size="14" aria-hidden="true" />
          <span>预览的是「{{ modeLabel }}」——与点「提交给老师」时一致。</span>
        </header>
        <div class="ws-report-preview" v-html="previewHtml" />
      </article>

      <template v-else-if="draft.mode === 'template'">
        <p v-if="template.intro" class="ws-report-intro">
          <strong>老师布置</strong>
          <span>{{ template.intro }}</span>
        </p>
        <p class="ws-report-insert-hint">
          <ImagePlus :size="13" aria-hidden="true" />
          点进某一段 → 在图片库勾选图片 →「插入选中到当前段」。段落下会显示已插入的图；完整版式看「预览最终稿」。
        </p>
        <section
          v-for="section in bodySections"
          :key="section.id"
          class="ws-report-section"
          :class="{ 'is-active-section': activeSection === section.id }"
        >
          <h3>
            {{ section.title }}
            <small v-if="activeSection === section.id">（当前段 · 插入目标）</small>
          </h3>
          <p v-if="section.prompt" class="ws-report-prompt">填写提示：{{ section.prompt }}</p>
          <textarea
            :ref="(el) => setSectionEditor(section.id, el)"
            v-model="draft.sections[section.id]"
            :rows="section.rows || 4"
            :placeholder="section.prompt || '在这里填写…'"
            spellcheck="false"
            @focus="activeSection = section.id"
            @blur="persist(false)"
          />
          <div v-if="sectionInsertedImages(section.id).length" class="ws-report-inline-imgs">
            <span class="ws-report-inline-label">本段已插入</span>
            <button
              v-for="img in sectionInsertedImages(section.id)"
              :key="`${section.id}-${img.id}`"
              type="button"
              class="ws-report-inline-chip"
              :title="img.name"
              @click="openLightbox(img.id)"
            >
              <img v-if="attachmentUrls[img.id]" :src="attachmentUrls[img.id]" :alt="img.name" />
              <em>{{ img.name }}</em>
            </button>
          </div>
        </section>
        <section
          class="ws-report-section ws-report-reflect"
          :class="{ 'is-active-section': activeSection === FIXED_REFLECTION.id }"
        >
          <h3>
            {{ FIXED_REFLECTION.title }}（写完再保存，才能解锁下一层）
            <small v-if="activeSection === FIXED_REFLECTION.id">（当前段 · 插入目标）</small>
          </h3>
          <p class="ws-report-prompt">填写提示：{{ FIXED_REFLECTION.prompt }}</p>
          <textarea
            :ref="(el) => setSectionEditor(FIXED_REFLECTION.id, el)"
            v-model="draft.sections[FIXED_REFLECTION.id]"
            :rows="FIXED_REFLECTION.rows"
            :placeholder="FIXED_REFLECTION.prompt"
            spellcheck="false"
            @focus="activeSection = FIXED_REFLECTION.id"
            @blur="persist(false)"
          />
          <div v-if="sectionInsertedImages(FIXED_REFLECTION.id).length" class="ws-report-inline-imgs">
            <span class="ws-report-inline-label">本段已插入</span>
            <button
              v-for="img in sectionInsertedImages(FIXED_REFLECTION.id)"
              :key="`reflect-${img.id}`"
              type="button"
              class="ws-report-inline-chip"
              :title="img.name"
              @click="openLightbox(img.id)"
            >
              <img v-if="attachmentUrls[img.id]" :src="attachmentUrls[img.id]" :alt="img.name" />
              <em>{{ img.name }}</em>
            </button>
          </div>
        </section>
      </template>

      <template v-else>
        <p class="ws-report-insert-hint">
          <FileText :size="13" aria-hidden="true" />
          Markdown：在图片库勾选后插入正文。下方「插入结果」可直接看到图；完整排版用「预览最终稿」。也可手改
          <code>![名字](attachment:…)</code> 调整位置。
        </p>
        <textarea
          ref="freeEditor"
          v-model="draft.markdownBody"
          class="ws-report-free"
          rows="18"
          placeholder="在这里用 Markdown 写报告。从图片库插入的图片会出现在下方「插入结果」。"
          spellcheck="false"
          @blur="persist(false)"
        />

        <div class="ws-report-md-result" aria-label="Markdown 插入结果">
          <header>
            <Eye :size="14" aria-hidden="true" />
            <strong>插入结果</strong>
            <small>{{ markdownInsertedImages.length }} 张图已写入正文</small>
          </header>
          <p v-if="!markdownInsertedImages.length" class="ws-report-library-empty">
            还没有插入图片。在上方图片库勾选后点「插入选中到正文」。
          </p>
          <div v-else class="ws-report-md-result-grid">
            <button
              v-for="img in markdownInsertedImages"
              :key="`md-${img.id}`"
              type="button"
              class="ws-report-md-result-item"
              @click="openLightbox(img.id)"
            >
              <img v-if="attachmentUrls[img.id]" :src="attachmentUrls[img.id]" :alt="img.name" />
              <span>{{ img.name }}</span>
            </button>
          </div>
        </div>

        <section class="ws-report-section ws-report-reflect">
          <h3>{{ FIXED_REFLECTION.title }}（写完再保存，才能解锁下一层）</h3>
          <p class="ws-report-prompt">填写提示：{{ FIXED_REFLECTION.prompt }}</p>
          <textarea
            :ref="(el) => setSectionEditor(FIXED_REFLECTION.id, el)"
            v-model="draft.sections[FIXED_REFLECTION.id]"
            :rows="FIXED_REFLECTION.rows"
            :placeholder="FIXED_REFLECTION.prompt"
            spellcheck="false"
            @focus="activeSection = FIXED_REFLECTION.id"
            @blur="persist(false)"
          />
        </section>
      </template>

      <p class="ws-report-hint">
        <FilePlus2 :size="13" aria-hidden="true" />
        图片库可随时浏览；模板勾选插入当前段；自由编写看「插入结果」；预览看完整报告。Word/PDF 用「上传附件」。
      </p>
    </div>
  </section>
</template>

<style scoped>
.ws-report {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

/* 不用 hidden：部分环境下 programmatic click 打不开；用视觉隐藏保留可选中。 */
.ws-report-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ws-report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-report-head strong {
  display: block;
  font-size: var(--ws-text-sm);
}

.ws-report-head small {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-report-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ws-space-2);
}

.ws-report-actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-report-actions button:hover:not(:disabled) {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-report-actions button.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-report-actions button.primary:hover:not(:disabled) {
  color: var(--ws-accent-contrast);
  background: var(--ws-accent-hover);
}

.ws-report-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ws-report-body {
  min-height: 0;
  padding: var(--ws-space-3) var(--ws-space-4) var(--ws-space-5);
  overflow-y: auto;
}

.ws-report-feedback {
  margin-bottom: var(--ws-space-3);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-left: 3px solid var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
}

.ws-report-feedback strong {
  display: block;
  margin-bottom: 2px;
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
}

.ws-report-feedback p {
  margin: 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
  white-space: pre-wrap;
}

.ws-report-modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-3);
}

.ws-report-mode-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-semibold);
}

.ws-report-mode-select select {
  min-height: var(--ws-control-sm);
  padding: 2px 10px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-report-mode-select select:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-report-modes > button,
.ws-report-modes-extra button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--ws-control-sm);
  padding: 2px 10px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-report-modes > button:disabled,
.ws-report-modes-extra button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ws-report-modes > button.active {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-report-modes-extra {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin-left: auto;
}

.ws-report-toolbar-sep {
  width: 1px;
  margin: 0 4px;
  align-self: stretch;
  background: var(--ws-line);
}

.ws-report-intro {
  display: grid;
  gap: 4px;
  margin: 0 0 var(--ws-space-3);
  padding: 8px 12px;
  border-left: 3px solid var(--ws-accent);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-sm);
  line-height: 1.5;
}

.ws-report-intro strong {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
}

.ws-report-prompt {
  margin: 0 0 var(--ws-space-1);
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: 1.45;
}

.ws-report-insert-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 var(--ws-space-3);
  padding: 6px 10px;
  color: var(--ws-ink-muted);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface-alt);
  font-size: var(--ws-text-xs);
  line-height: 1.45;
}

.ws-report-insert-hint code {
  font-size: 11px;
}

.ws-report-final {
  min-width: 0;
}

.ws-report-final-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--ws-space-2);
  padding: 6px 10px;
  color: var(--ws-accent);
  border: 1px solid color-mix(in srgb, var(--ws-accent) 35%, var(--ws-line));
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-xs);
}

.ws-report-library,
.ws-report-attachments {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: var(--ws-space-3);
  padding: var(--ws-space-2);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.ws-report-library-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-report-library-head strong {
  color: var(--ws-ink);
}

.ws-report-library-head small {
  color: var(--ws-ink-faint);
}

.ws-report-library-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.ws-report-library-tools button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 2px 8px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ws-report-library-tools button.primary {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-report-library-tools button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ws-report-library-empty {
  margin: 0;
  padding: 10px;
  color: var(--ws-ink-faint);
  border: 1px dashed var(--ws-line);
  border-radius: var(--ws-radius-sm);
  font-size: var(--ws-text-xs);
  line-height: 1.45;
}

.ws-report-lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.ws-report-lib-card {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
}

.ws-report-lib-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ws-ink-muted);
  font-size: 11px;
  cursor: pointer;
}

.ws-report-lib-thumb-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface-alt);
  cursor: zoom-in;
  overflow: hidden;
}

.ws-report-lib-thumb {
  display: block;
  width: 100%;
  height: 110px;
  object-fit: cover;
}

.ws-report-lib-thumb-miss {
  display: grid;
  place-items: center;
  height: 110px;
  color: var(--ws-ink-faint);
  font-size: 11px;
}

.ws-report-lib-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ws-report-lib-rename {
  width: 100%;
  padding: 4px 6px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
}

.ws-report-lib-rename:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-report-lib-meta small,
.ws-report-att small {
  color: var(--ws-ink-faint);
  font-size: 11px;
}

.ws-report-lib-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ws-report-lib-actions button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 24px;
  padding: 2px 6px;
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: transparent;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ws-report-lib-actions button:hover:not(:disabled) {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-report-lib-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ws-report-lightbox {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
}

.ws-report-lightbox-panel {
  display: grid;
  gap: 10px;
  width: min(920px, 100%);
  max-height: min(90vh, 900px);
  padding: 12px;
  overflow: auto;
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.ws-report-lightbox-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ws-report-lightbox-panel header strong {
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  overflow-wrap: anywhere;
}

.ws-report-lightbox-panel header button {
  display: inline-flex;
  padding: 4px;
  color: var(--ws-ink-muted);
  border: none;
  background: transparent;
  cursor: pointer;
}

.ws-report-lightbox-panel img {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  background: var(--ws-surface-alt);
}

.ws-report-att {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 6px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-report-att-name {
  overflow: hidden;
  color: var(--ws-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-report-att button {
  display: inline-flex;
  padding: 2px;
  color: var(--ws-ink-muted);
  border: none;
  background: transparent;
  cursor: pointer;
}

.ws-report-att button:hover {
  color: var(--ws-accent);
}

.ws-report-section.is-active-section {
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--ws-accent) 40%, var(--ws-line));
  border-radius: var(--ws-radius-md);
  background: color-mix(in srgb, var(--ws-accent-soft) 55%, transparent);
}

.ws-report-section h3 small {
  margin-left: 6px;
  color: var(--ws-accent);
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-report-inline-imgs,
.ws-report-md-result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-alt);
}

.ws-report-inline-label {
  color: var(--ws-ink-muted);
  font-size: 11px;
  font-weight: var(--ws-weight-semibold);
}

.ws-report-inline-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 3px 6px 3px 3px;
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: 999px;
  background: var(--ws-surface);
  font: inherit;
  font-size: 11px;
  cursor: zoom-in;
}

.ws-report-inline-chip img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 50%;
}

.ws-report-inline-chip em {
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-report-md-result {
  display: grid;
  gap: 8px;
  margin: 10px 0 var(--ws-space-3);
}

.ws-report-md-result header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
}

.ws-report-md-result header strong {
  color: var(--ws-ink);
}

.ws-report-md-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.ws-report-md-result-item {
  display: grid;
  gap: 4px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  cursor: zoom-in;
  text-align: left;
}

.ws-report-md-result-item img {
  display: block;
  width: 100%;
  height: 96px;
  object-fit: cover;
}

.ws-report-md-result-item span {
  padding: 4px 8px 8px;
  color: var(--ws-ink);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.ws-report-section h3 {
  margin: var(--ws-space-3) 0 var(--ws-space-1);
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-report-section:first-child h3,
.ws-report-reflect h3 {
  margin-top: var(--ws-space-3);
}

.ws-report-section textarea,
.ws-report-free {
  width: 100%;
  padding: var(--ws-space-2) var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
  resize: vertical;
}

.ws-report-free {
  min-height: 280px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
}

.ws-report-section textarea:focus,
.ws-report-free:focus {
  border-color: var(--ws-accent);
  outline: none;
}

.ws-report-section textarea::placeholder,
.ws-report-free::placeholder {
  color: var(--ws-ink-faint);
}

.ws-report-preview {
  min-height: 320px;
  padding: clamp(16px, 3vw, 28px);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.ws-report-preview :deep(h1) {
  margin: 0 0 0.75em;
  padding-bottom: 0.4em;
  border-bottom: 1px solid var(--ws-line);
  font-size: 1.35rem;
  line-height: 1.35;
}

.ws-report-preview :deep(h2) {
  margin: 1.4em 0 0.55em;
  font-size: 1.1rem;
  line-height: 1.35;
}

.ws-report-preview :deep(h3) {
  margin: 1em 0 0.4em;
  font-size: 1rem;
}

.ws-report-preview :deep(p),
.ws-report-preview :deep(ul),
.ws-report-preview :deep(ol),
.ws-report-preview :deep(blockquote) {
  margin: 0.55em 0;
}

.ws-report-preview :deep(blockquote) {
  padding: 0.2em 0 0.2em 0.9em;
  color: var(--ws-ink-muted);
  border-left: 3px solid var(--ws-line);
}

.ws-report-preview :deep(p:empty) {
  display: none;
}

.ws-report-preview :deep(.ws-report-img),
.ws-report-preview :deep(img) {
  display: block !important;
  max-width: min(100%, 720px);
  width: auto;
  height: auto !important;
  margin: 0.75em auto;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface-alt);
  visibility: visible !important;
  opacity: 1 !important;
}

.ws-report-preview :deep(.ws-report-code) {
  margin: 0.8em 0;
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-sm);
  overflow: hidden;
}

.ws-report-preview :deep(.ws-report-code-head) {
  padding: 4px 8px;
  background: var(--ws-surface-alt);
  font-size: 11px;
  color: var(--ws-ink-faint);
}

.ws-report-preview :deep(pre) {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.5;
}

.ws-report-preview :deep(a) {
  color: var(--ws-accent);
}

.ws-report-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: var(--ws-space-4) 0 0;
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
  line-height: 1.45;
}
</style>
