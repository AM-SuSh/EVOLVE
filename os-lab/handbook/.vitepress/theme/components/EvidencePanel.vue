<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, CircleCheck, CircleX, Copy, NotebookPen, TerminalSquare } from 'lucide-vue-next'
import type { TutorLab } from '../tutor-model'

/**
 * 学习证据的采集入口。
 *
 * 旧版把它藏在一个没有文字标签的图标后面的抽屉里——而它正是整套过程评分的
 * 唯一数据来源。这里改成内联在手册正文下方、按阶段出现：学生正读着「四、验证」，
 * 输入框就在那一段的正下方。
 */
const props = defineProps<{
  kind: 'verification' | 'reflection'
  lab: TutorLab
  verificationPassed: boolean
  reflected: boolean
}>()

const emit = defineEmits<{
  (event: 'record-verification', payload: { content: string; passed: boolean }): void
  (event: 'submit-reflection', content: string): void
}>()

const verificationNote = ref('')
const reflection = ref('')
const commandCopied = ref(false)

const reflectionPlaceholder = [
  '我独立理解了……',
  'AI 提醒了我……',
  '我用……验证了它。',
].join('\n')

const canSubmitVerification = computed(() => verificationNote.value.trim().length > 0)
const canSubmitReflection = computed(() => reflection.value.trim().length > 0)

function submitVerification(passed: boolean) {
  const content = verificationNote.value.trim()
  if (!content) return
  emit('record-verification', { content, passed })
  verificationNote.value = ''
}

function submitReflection() {
  const content = reflection.value.trim()
  if (!content) return
  emit('submit-reflection', content)
  reflection.value = ''
}

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(props.lab.verificationCommand)
    commandCopied.value = true
    window.setTimeout(() => (commandCopied.value = false), 1600)
  } catch {
    commandCopied.value = false
  }
}
</script>

<template>
  <section class="ws-evidence" :aria-label="kind === 'verification' ? '记录运行验证' : '记录学习复盘'">
    <template v-if="kind === 'verification'">
      <header>
        <h2><TerminalSquare :size="17" aria-hidden="true" />记录一次运行验证</h2>
        <p v-if="verificationPassed" class="ws-evidence-done">
          <CircleCheck :size="14" aria-hidden="true" />本层已有通过记录，可以继续补充
        </p>
        <p v-else>跑一次，把关键输出贴回来。导师说的话要用 QEMU 的输出来检验。</p>
      </header>

      <div class="ws-evidence-command">
        <code>{{ lab.verificationCommand }}</code>
        <button type="button" @click="copyCommand">
          <Check v-if="commandCopied" :size="14" aria-hidden="true" />
          <Copy v-else :size="14" aria-hidden="true" />
          {{ commandCopied ? '已复制' : '复制命令' }}
        </button>
      </div>

      <label for="ws-verification-note">关键输出或失败现象</label>
      <textarea
        id="ws-verification-note"
        v-model="verificationNote"
        rows="4"
        placeholder="只贴能支持或推翻当前判断的那几行，不用整段日志。"
      />

      <div class="ws-evidence-actions">
        <button
          type="button"
          class="pass"
          :disabled="!canSubmitVerification"
          @click="submitVerification(true)"
        >
          <CircleCheck :size="15" aria-hidden="true" />记录为通过
        </button>
        <button
          type="button"
          :disabled="!canSubmitVerification"
          @click="submitVerification(false)"
        >
          <CircleX :size="15" aria-hidden="true" />记录为失败
        </button>
      </div>
    </template>

    <template v-else>
      <header>
        <h2><NotebookPen :size="17" aria-hidden="true" />完成这一层的学习复盘</h2>
        <p v-if="reflected" class="ws-evidence-done">
          <CircleCheck :size="14" aria-hidden="true" />本层已有复盘记录，可以继续补充
        </p>
        <p v-else>分清三件事：你自己想明白的、AI 提醒你的、你亲手验证的。</p>
      </header>

      <label for="ws-reflection-note">三句话复盘</label>
      <textarea
        id="ws-reflection-note"
        v-model="reflection"
        rows="5"
        :placeholder="reflectionPlaceholder"
      />

      <div class="ws-evidence-actions">
        <button type="button" class="pass" :disabled="!canSubmitReflection" @click="submitReflection">
          <Check :size="15" aria-hidden="true" />保存复盘
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ws-evidence {
  max-width: var(--ws-reading-measure);
  margin: var(--ws-space-8) auto 0;
  padding: var(--ws-space-5);
  border: 1px solid var(--ws-accent);
  border-radius: var(--ws-radius-lg);
  background: var(--ws-surface);
  box-shadow: var(--ws-shadow-2);
}

.ws-evidence header {
  margin-bottom: var(--ws-space-4);
}

.ws-evidence h2 {
  display: flex;
  align-items: center;
  gap: var(--ws-space-2);
  margin: 0;
  padding: 0;
  color: var(--ws-ink);
  border: 0;
  font-size: var(--ws-text-lg);
  line-height: var(--ws-leading-tight);
}

.ws-evidence h2 svg {
  color: var(--ws-accent);
}

.ws-evidence header p {
  display: flex;
  align-items: center;
  gap: var(--ws-space-1);
  margin: var(--ws-space-2) 0 0;
  color: var(--ws-ink-muted);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-evidence-done {
  color: var(--ws-ok) !important;
}

.ws-evidence-command {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ws-space-2);
  margin-bottom: var(--ws-space-4);
  padding: var(--ws-space-2) var(--ws-space-2) var(--ws-space-2) var(--ws-space-3);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface-soft);
}

.ws-evidence-command code {
  min-width: 0;
  color: var(--ws-ink);
  background: transparent;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
  overflow-x: auto;
  white-space: nowrap;
}

.ws-evidence label {
  display: block;
  margin-bottom: var(--ws-space-2);
  color: var(--ws-ink);
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
}

.ws-evidence textarea {
  display: block;
  width: 100%;
  padding: var(--ws-space-3);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  resize: vertical;
  font: inherit;
  font-family: var(--ws-font-mono);
  font-size: var(--ws-text-sm);
  line-height: var(--ws-leading-normal);
}

.ws-evidence textarea::placeholder {
  color: var(--ws-ink-faint);
  font-family: var(--vp-font-family-base);
}

.ws-evidence textarea:focus-visible {
  outline: 2px solid var(--ws-accent);
  outline-offset: 1px;
}

.ws-evidence-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ws-space-2);
  margin-top: var(--ws-space-3);
}

.ws-evidence-actions button,
.ws-evidence-command button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ws-space-2);
  min-height: var(--ws-control-md);
  padding: var(--ws-space-2) var(--ws-space-4);
  color: var(--ws-ink);
  border: 1px solid var(--ws-line);
  border-radius: var(--ws-radius-md);
  background: var(--ws-surface);
  font: inherit;
  font-size: var(--ws-text-sm);
  font-weight: var(--ws-weight-semibold);
  cursor: pointer;
}

.ws-evidence-command button {
  flex: 0 0 auto;
  padding-inline: var(--ws-space-3);
  font-weight: var(--ws-weight-medium);
}

.ws-evidence-actions button.pass {
  color: var(--ws-accent-contrast);
  border-color: var(--ws-accent);
  background: var(--ws-accent);
}

.ws-evidence-actions button:hover:not(:disabled),
.ws-evidence-command button:hover {
  border-color: var(--ws-accent);
}

.ws-evidence-actions button.pass:hover:not(:disabled) {
  background: var(--ws-accent-hover);
}

.ws-evidence-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
