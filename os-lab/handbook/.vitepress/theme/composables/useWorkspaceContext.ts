import { inject, provide, reactive, type InjectionKey } from 'vue'

/**
 * 工作台共享选择上下文：代码、终端、导师共用同一份当前文件 / 行 / 选区 / runId / 阶段。
 *
 * 纯 reactive 共享状态，不引入 pinia。LabWorkspace 在 setup 顶部 provide，子组件 inject。
 * 不写 localStorage：这些是即时态，刷新后回到初始值即可。
 */
export interface WorkspaceContext {
  /** 当前激活的源码文件相对路径（相对学生工作区根）。 */
  currentFile: string
  /** Monaco 当前光标行号（1-based）。 */
  currentLine: number
  /** Monaco 当前选区文本（截断到 200 字符，避免随提问上传过长片段）。 */
  currentSelection: string
  /** 最近一次可信运行的 runId。 */
  lastRunId: string
  /** 最近一次运行的 recipeId（自定义命令为空字符串）。 */
  lastRecipeId: string
  /** 当前导师阶段 id。 */
  currentStage: string
  /** 当前手册章节 { h2, h3 }。 */
  currentSection: { h2: string; h3: string }
}

export const WORKSPACE_CONTEXT_KEY: InjectionKey<WorkspaceContext> = Symbol('workspace-context')

export function createWorkspaceContext(): WorkspaceContext {
  return reactive<WorkspaceContext>({
    currentFile: '',
    currentLine: 0,
    currentSelection: '',
    lastRunId: '',
    lastRecipeId: '',
    currentStage: 'orient',
    currentSection: { h2: '', h3: '' },
  })
}

export function provideWorkspaceContext(context: WorkspaceContext) {
  provide(WORKSPACE_CONTEXT_KEY, context)
}

export function useWorkspaceContext(): WorkspaceContext | null {
  return inject(WORKSPACE_CONTEXT_KEY, null)
}

/** 把选区文本裁剪到上限，避免无界上传。 */
export function clampSelection(text: string, max = 200): string {
  const value = String(text || '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}
