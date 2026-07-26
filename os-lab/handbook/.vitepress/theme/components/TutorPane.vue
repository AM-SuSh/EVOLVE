<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Plus,
  RefreshCw,
  Send,
  Server,
  Target,
} from 'lucide-vue-next'
import TutorMessage from './TutorMessage.vue'
import {
  tutorPromptsFor,
  tutorStages,
  type TutorLab,
  type TutorMessage as TutorMessageType,
  type TutorPrompt,
  type TutorStageId,
} from '../tutor-model'

const props = defineProps<{
  lab: TutorLab
  activeStage: TutorStageId
  messages: TutorMessageType[]
  completedStages: Set<TutorStageId>
  sending: boolean
  streamingId: string
  connection: 'checking' | 'remote' | 'offline'
  connectionLabel: string
  currentSection: { h2: string; h3: string }
}>()

const emit = defineEmits<{
  (event: 'send', text: string): void
  (event: 'choose-stage', stage: TutorStageId): void
  (event: 'new-session'): void
  (event: 'check-connection'): void
  (event: 'use-prompt', prompt: TutorPrompt): void
}>()

const draft = ref('')
const composer = ref<HTMLTextAreaElement>()
const messageList = ref<HTMLElement>()
const resourcesOpen = ref(false)

const activeStageData = computed(
  () => tutorStages.find((stage) => stage.id === props.activeStage) || tutorStages[0],
)
const stagePrompts = computed(() => tutorPromptsFor(props.lab, props.activeStage))
const resources = computed(() => props.lab.resources[props.activeStage])
const readingHint = computed(() => {
  const { h2, h3 } = props.currentSection
  if (!h2) return ''
  return h3 ? `${h2} › ${h3}` : h2
})

function submit() {
  const text = draft.value.trim()
  if (!text || props.sending) return
  emit('send', text)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}

function usePrompt(prompt: TutorPrompt) {
  draft.value = prompt.text
  emit('use-prompt', prompt)
  nextTick(() => composer.value?.focus())
}

async function scrollToLatest() {
  await nextTick()
  const list = messageList.value
  if (list) list.scrollTop = list.scrollHeight
}

watch(() => props.messages.length, scrollToLatest)
watch(
  () => props.messages[props.messages.length - 1]?.content,
  () => {
    // 流式输出时贴着底部跟随；学生往上翻看历史时不打断。
    const list = messageList.value
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    if (nearBottom) scrollToLatest()
  },
)

defineExpose({ scrollToLatest })
</script>

<template>
  <section class="ws-tutor-pane" aria-label="AI 引导导师">
    <nav class="ws-stage-strip" aria-label="学习阶段">
      <button
        v-for="stage in tutorStages"
        :key="stage.id"
        type="button"
        :class="{ active: activeStage === stage.id, done: completedStages.has(stage.id) }"
        :aria-current="activeStage === stage.id ? 'step' : undefined"
        @click="emit('choose-stage', stage.id)"
      >
        <Check v-if="completedStages.has(stage.id) && activeStage !== stage.id" :size="13" aria-hidden="true" />
        <span>{{ stage.shortTitle }}</span>
      </button>
    </nav>

    <header class="ws-stage-brief">
      <div class="ws-stage-brief-head">
        <div>
          <span>阶段 {{ activeStageData.index }} · {{ activeStageData.shortTitle }}</span>
          <h2>{{ activeStageData.title }}</h2>
        </div>
        <div class="ws-tutor-actions">
          <button
            class="ws-connection"
            :class="connection"
            type="button"
            :title="`重新检查模型连接（当前：${connectionLabel}）`"
            @click="emit('check-connection')"
          >
            <Server :size="14" aria-hidden="true" />
            <span>{{ connectionLabel }}</span>
            <RefreshCw :size="12" aria-hidden="true" />
          </button>
          <button
            class="ws-new-session"
            type="button"
            title="开始一次新的学习对话"
            @click="emit('new-session')"
          >
            <Plus :size="15" aria-hidden="true" /><span>新对话</span>
          </button>
        </div>
      </div>

      <p class="ws-stage-goal"><Target :size="14" aria-hidden="true" />{{ activeStageData.goal }}</p>
      <p class="ws-stage-checkpoint">
        过关标准：{{ activeStageData.checkpoint }}（留下{{ activeStageData.evidence }}）
      </p>
      <p v-if="readingHint" class="ws-stage-reading">导师已知道你在读：{{ readingHint }}</p>

      <div class="ws-resources" :class="{ open: resourcesOpen }">
        <button type="button" :aria-expanded="resourcesOpen" @click="resourcesOpen = !resourcesOpen">
          <FileCode2 :size="14" aria-hidden="true" />
          本阶段该看的代码与资料
          <ChevronDown v-if="resourcesOpen" :size="15" aria-hidden="true" />
          <ChevronRight v-else :size="15" aria-hidden="true" />
        </button>
        <div v-if="resourcesOpen" class="ws-resources-body">
          <ul class="ws-resource-paths">
            <li v-for="path in resources.paths" :key="path"><code>{{ path }}</code></li>
          </ul>
          <ul class="ws-resource-docs">
            <li v-for="doc in resources.docs" :key="doc.href">
              <a :href="doc.href" target="_blank" rel="noopener">
                <strong>{{ doc.title }}</strong>
                <small>{{ doc.description }}</small>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </header>

    <div ref="messageList" class="ws-message-list" aria-live="polite">
      <div class="ws-message-inner">
        <TutorMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :streaming="message.id === streamingId"
        />
        <div v-if="sending && !streamingId" class="ws-thinking" role="status">
          <div class="ws-thinking-avatar" aria-hidden="true">OS</div>
          <span /><span /><span />
          <em class="ws-visually-hidden">导师正在思考</em>
        </div>
      </div>
    </div>

    <div class="ws-composer-dock">
      <div class="ws-prompt-row" aria-label="快捷提问">
        <button v-for="prompt in stagePrompts" :key="prompt.id" type="button" @click="usePrompt(prompt)">
          {{ prompt.label }}
        </button>
      </div>
      <form class="ws-composer" @submit.prevent="submit">
        <label class="ws-visually-hidden" for="ws-tutor-input">向引导导师提问</label>
        <textarea
          id="ws-tutor-input"
          ref="composer"
          v-model="draft"
          rows="3"
          :placeholder="`说说你在「${activeStageData.shortTitle}」阶段的判断、现象或假设…`"
          @keydown="onKeydown"
        />
        <div class="ws-composer-foot">
          <span>匿名会话 · 记录保存在本机 · Ctrl+Enter 发送</span>
          <button type="submit" :disabled="!draft.trim() || sending">
            <Send :size="16" aria-hidden="true" /><span>发送</span>
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.ws-tutor-pane {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--ws-surface);
}

.ws-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* -- 阶段条 ---------------------------------------------------------------- */
.ws-stage-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--ws-space-1);
  padding: var(--ws-space-2) var(--ws-space-3);
  border-bottom: 1px solid var(--ws-line);
  background: var(--ws-surface-alt);
}

.ws-stage-strip button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-1);
  min-width: 0;
  min-height: var(--ws-control-md);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid transparent;
  border-radius: var(--ws-radius-md);
  background: transparent;
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}

.ws-stage-strip button:hover {
  color: var(--ws-ink);
  background: var(--ws-surface);
}

.ws-stage-strip button.done {
  color: var(--ws-ok);
}

.ws-stage-strip button.active {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

/* -- 阶段说明 -------------------------------------------------------------- */
.ws-stage-brief {
  padding: var(--ws-space-3) var(--ws-space-4);
  border-bottom: 1px solid var(--ws-line);
}

.ws-stage-brief-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ws-space-3);
}

.ws-stage-brief-head > div:first-child {
  min-width: 0;
}

.ws-stage-brief span {
  color: var(--ws-accent);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-stage-brief h2 {
  margin: 2px 0 0;
  color: var(--ws-ink);
  font-size: var(--ws-text-lg);
  line-height: var(--ws-leading-tight);
}

.ws-stage-brief p {
  margin: var(--ws-space-2) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-stage-goal {
  display: flex;
  align-items: flex-start;
  gap: var(--ws-space-2);
  color: var(--ws-ink) !important;
}

.ws-stage-goal svg {
  flex: 0 0 auto;
  margin-top: 3px;
  color: var(--ws-accent);
}

.ws-stage-checkpoint {
  font-size: var(--ws-text-xs) !important;
}

.ws-stage-reading {
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-accent) !important;
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent-soft);
  font-size: var(--ws-text-xs) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-tutor-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-connection,
.ws-new-session {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-connection.remote {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-connection.offline {
  color: var(--ws-warn);
  border-color: var(--ws-warn);
  background: var(--ws-warn-soft);
}

.ws-connection:hover,
.ws-new-session:hover {
  border-color: var(--ws-accent);
}

/* -- 资料 ------------------------------------------------------------------ */
.ws-resources {
  margin-top: var(--ws-space-3);
}

.ws-resources > button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-2);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-xs);
  cursor: pointer;
}

.ws-resources > button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
}

.ws-resources-body {
  margin-top: var(--ws-space-2);
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
}

.ws-resource-paths,
.ws-resource-docs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ws-resource-paths {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-1);
  margin-bottom: var(--ws-space-3);
}

.ws-resource-paths code {
  padding: 2px var(--ws-space-2);
  color: var(--ws-ink);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-surface);
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
}

.ws-resource-docs a {
  display: block;
  padding: var(--ws-space-2);
  border-radius: var(--ws-radius-sm);
  text-decoration: none;
}

.ws-resource-docs a:hover {
  background: var(--ws-surface);
}

.ws-resource-docs strong {
  display: block;
  color: var(--ws-accent);
  font-size: var(--ws-text-sm);
}

.ws-resource-docs small {
  display: block;
  margin-top: 2px;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-xs);
  line-height: var(--ws-leading-normal);
}

/* -- 消息 ------------------------------------------------------------------ */
.ws-message-list {
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.ws-message-inner {
  padding: var(--ws-space-6) var(--ws-space-5) var(--ws-space-4);
}

.ws-thinking {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
}

.ws-thinking-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--ws-accent-contrast);
  border-radius: var(--ws-radius-sm);
  background: var(--ws-accent);
  place-items: center;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-xs);
  font-weight: var(--ws-weight-bold);
}

.ws-thinking > span {
  width: 6px;
  height: 6px;
  border-radius: var(--ws-radius-full);
  background: var(--ws-accent);
  animation: ws-thinking 1s ease-in-out infinite;
}

.ws-thinking > span:nth-of-type(2) {
  animation-delay: 120ms;
}

.ws-thinking > span:nth-of-type(3) {
  animation-delay: 240ms;
}

@keyframes ws-thinking {
  0%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* -- 输入区 ---------------------------------------------------------------- */
.ws-composer-dock {
  padding: var(--ws-space-2) var(--ws-space-5) var(--ws-space-4);
  border-top: 1px solid var(--ws-line);
  background: var(--ws-surface);
}

.ws-prompt-row {
  display: flex;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-2);
  padding-bottom: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.ws-prompt-row::-webkit-scrollbar {
  display: none;
}

.ws-prompt-row button {
  flex: 0 0 auto;
  min-height: var(--ws-control-sm);
  padding: var(--ws-space-1) var(--ws-space-3);
  color: var(--ws-ink-muted);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-full);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  white-space: nowrap;
  cursor: pointer;
}

.ws-prompt-row button:hover {
  color: var(--ws-accent);
  border-color: var(--ws-accent);
  background: var(--ws-accent-soft);
}

.ws-composer {
  padding: var(--ws-space-3);
  border: 1px solid var(--ws-line-strong);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-2);
}

.ws-composer:focus-within {
  border-color: var(--ws-accent);
}

.ws-composer textarea {
  display: block;
  width: 100%;
  min-height: 60px;
  color: var(--ws-ink);
  border: 0;
  outline: 0;
  background: transparent;
  resize: none;
  font: inherit;
  font-size: var(--ws-text-base);
  line-height: var(--ws-leading-normal);
}

.ws-composer textarea::placeholder {
  color: var(--ws-ink-faint);
}

.ws-composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-3);
  margin-top: var(--ws-space-2);
}

.ws-composer-foot > span {
  color: var(--ws-ink-faint);
  font-size: var(--ws-text-xs);
}

.ws-composer-foot button {
  display: inline-flex;
  align-items: center;
  gap: var(--ws-space-1);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-accent-contrast);
  border: 0;
  border-radius: var(--ws-radius-md);
  background: var(--ws-accent);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-composer-foot button:hover:not(:disabled) {
  background: var(--ws-accent-hover);
}

.ws-composer-foot button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 900px) {
  .ws-message-inner,
  .ws-composer-dock {
    padding-inline: var(--ws-space-4);
  }

  .ws-connection span {
    display: none;
  }

  .ws-composer-foot > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
