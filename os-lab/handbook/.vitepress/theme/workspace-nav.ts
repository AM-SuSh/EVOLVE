import { reactive } from 'vue'
import type { LabJourneyItem, TutorLabId } from './tutor-model'

export type WorkspacePanelKey = 'manual' | 'practice' | 'terminal'

export const WORKSPACE_OPEN_LLM_SETTINGS_EVENT = 'os-lab:open-llm-settings'

interface WorkspaceNavState {
  active: boolean
  teacher: boolean
  panels: Record<WorkspacePanelKey, boolean>
  journey: LabJourneyItem[]
  appliedLabs: TutorLabId[]
  togglePanel?: (key: WorkspacePanelKey) => void
  enterLab?: (labId: TutorLabId) => void
  exportGrowth?: () => void
}

export const workspaceNavState = reactive<WorkspaceNavState>({
  active: false,
  teacher: false,
  panels: { manual: true, practice: true, terminal: true },
  journey: [],
  appliedLabs: [],
})

export function updateWorkspaceNav(next: Omit<WorkspaceNavState, 'active'>) {
  workspaceNavState.active = true
  workspaceNavState.teacher = next.teacher
  workspaceNavState.panels = next.panels
  workspaceNavState.journey = next.journey
  workspaceNavState.appliedLabs = next.appliedLabs
  workspaceNavState.togglePanel = next.togglePanel
  workspaceNavState.enterLab = next.enterLab
  workspaceNavState.exportGrowth = next.exportGrowth
}

export function clearWorkspaceNav() {
  workspaceNavState.active = false
  workspaceNavState.teacher = false
  workspaceNavState.panels = { manual: true, practice: true, terminal: true }
  workspaceNavState.journey = []
  workspaceNavState.appliedLabs = []
  workspaceNavState.togglePanel = undefined
  workspaceNavState.enterLab = undefined
  workspaceNavState.exportGrowth = undefined
}

export function requestWorkspaceLlmSettings() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACE_OPEN_LLM_SETTINGS_EVENT))
}
