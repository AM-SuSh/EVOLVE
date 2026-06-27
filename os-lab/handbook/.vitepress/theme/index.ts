import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'
import CopyCommand from './components/CopyCommand.vue'
import LabProgress from './components/LabProgress.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CopyCommand', CopyCommand)
    app.component('LabProgress', LabProgress)
  },
} satisfies Theme
