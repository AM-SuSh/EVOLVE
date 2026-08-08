import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './styles/tokens.css'
import './styles/handbook.css'
import './styles/home.css'
import './styles/workspace.css'
import Layout from './Layout.vue'
import CopyCommand from './components/CopyCommand.vue'
import MaterialsShelf from './components/MaterialsShelf.vue'
import TeacherReport from './components/TeacherReport.vue'
import TeacherReview from './components/TeacherReview.vue'
import TutorEntry from './components/TutorEntry.vue'
import HomeLanding from './components/HomeLanding.vue'
import KnowledgeManager from './components/KnowledgeManager.vue'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('CopyCommand', CopyCommand)
    app.component('MaterialsShelf', MaterialsShelf)
    app.component('TeacherReport', TeacherReport)
    app.component('TeacherReview', TeacherReview)
    app.component('TutorEntry', TutorEntry)
    app.component('HomeLanding', HomeLanding)
    app.component('KnowledgeManager', KnowledgeManager)
  },
} satisfies Theme
