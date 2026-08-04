<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import AuthGate from './components/AuthGate.vue'
import LabWorkspace from './components/LabWorkspace.vue'
import TeacherNav from './components/TeacherNav.vue'
import UserNav from './components/UserNav.vue'
import type { TutorLabId } from './tutor-model'

/**
 * /learn/labN 走自有工作台外壳，其余页面走默认文档主题。
 *
 * 工作台不复用 VPNav / VPContent，因此旧版 `--vp-nav-height`、`height:100vh`
 * 和 `overflow:hidden` 三方互抢的问题不再存在。正文由 VitePress 构建期通过
 * @include 并入壳页，这里以 <Content /> 原样传给工作台，
 * shiki 高亮、mermaid、锚点全部沿用官方管线。
 */
const DefaultLayout = DefaultTheme.Layout
const { frontmatter } = useData()
</script>

<template>
  <!-- 站点入口登录门：进入即登录（学生注册带班级；教师用 admin）。 -->
  <AuthGate />
  <LabWorkspace
    v-if="frontmatter.workspace"
    :key="frontmatter.labId as string"
    :lab-id="frontmatter.labId as TutorLabId"
  >
    <Content />
  </LabWorkspace>
  <main v-else-if="frontmatter.launch" class="launch-layout">
    <Content />
  </main>
  <div v-else-if="frontmatter.teacherReview" class="teacher-review-layout">
    <Content />
  </div>
  <DefaultLayout v-else>
    <!-- 教师管理入口 + 当前用户（点击可退出）。 -->
    <template #nav-bar-content-after>
      <TeacherNav />
      <UserNav />
    </template>
  </DefaultLayout>
</template>

<style scoped>
.teacher-review-layout {
  height: 100dvh;
  min-height: 620px;
  overflow: hidden;
}

.launch-layout {
  min-height: 100dvh;
  padding: clamp(20px, 4vw, 48px);
  overflow-y: auto;
  background: var(--ws-surface);
}
</style>
