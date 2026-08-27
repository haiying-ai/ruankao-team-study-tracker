<script setup lang="ts">
import { computed } from 'vue'
import ProgressRing from '../components/ProgressRing.vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const myCompletions = computed(() => store.snapshot?.completions.filter((item) => item.memberId === store.member?.id) || [])
const taskTypeProgress = (type: string) => {
  const tasks = store.snapshot?.tasks.filter((item) => item.type === type) || []
  const done = tasks.filter((item) => store.doneIds.has(item.id)).length
  return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 }
}
const caseProgress = computed(() => taskTypeProgress('case'))
const videoProgress = computed(() => taskTypeProgress('video'))
const attempts = computed(() => (store.snapshot?.attempts || []).filter((item) => item.memberId === store.member?.id).sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt)))
const tagCounts = computed(() => {
  const counts = new Map<string, number>()
  attempts.value.flatMap((item) => item.errorTags).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})
const weekProgress = computed(() => Array.from({ length: 9 }, (_, index) => {
  const tasks = store.snapshot?.tasks.filter((item) => item.weekIndex === index && item.required) || []
  const done = tasks.filter((item) => store.doneIds.has(item.id)).length
  return { index, done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 }
}))
const checkinDates = computed(() => new Set((store.snapshot?.checkins || []).filter((item) => item.memberId === store.member?.id).map((item) => item.date)))
const recentDays = computed(() => Array.from({ length: 28 }, (_, index) => {
  const date = new Date(); date.setDate(date.getDate() - (27 - index)); const key = date.toISOString().slice(0, 10)
  return { key, done: checkinDates.value.has(key) }
}))
</script>

<template>
  <div class="page-stack">
    <section class="page-intro"><span class="eyebrow">LEARNING ANALYTICS</span><h2>你的掌握度，不只是一条进度条</h2><p>题量、视频、案例和套卷成绩分别记录，便于快速定位薄弱项。</p></section>
    <section class="progress-overview">
      <ProgressRing :value="store.percent" label="必做任务" :size="132" />
      <div class="progress-facts">
        <div><span>章节题</span><strong>{{ store.questions.completed }}/{{ store.questions.target }}</strong></div>
        <div><span>视频</span><strong>{{ videoProgress.done }}/{{ videoProgress.total }}</strong></div>
        <div><span>案例</span><strong>{{ caseProgress.done }}/{{ caseProgress.total }}</strong></div>
        <div><span>已记录</span><strong>{{ myCompletions.length }}项</strong></div>
      </div>
    </section>

    <section class="panel-card">
      <div class="section-heading"><div><span class="eyebrow">W0—W8</span><h2>周进度</h2></div></div>
      <div class="week-progress-list"><div v-for="week in weekProgress" :key="week.index"><span>W{{ week.index }}</span><div class="linear-progress"><i :style="{ width: `${week.percent}%` }"></i></div><strong>{{ week.done }}/{{ week.total }}</strong></div></div>
    </section>

    <section class="panel-card">
      <div class="section-heading"><div><span class="eyebrow">SCORE TREND</span><h2>套卷成绩趋势</h2></div><span class="target-legend">目标 ≥ 50/75</span></div>
      <div v-if="attempts.length" class="score-list">
        <div v-for="attempt in attempts" :key="attempt.id" class="score-row">
          <div><strong>{{ attempt.paperKey }}</strong><small>{{ attempt.mode === 'continuous' ? '连续计时' : '拆分完成' }} · {{ attempt.durationMinutes || 0 }}分钟</small></div>
          <span v-if="attempt.selectionScore !== undefined" :class="attempt.selectionScore < 45 ? 'score-red' : attempt.selectionScore >= 50 ? 'score-green' : 'score-amber'">选 {{ attempt.selectionScore }}</span>
          <span v-if="attempt.caseScore !== undefined" :class="attempt.caseScore < 45 ? 'score-red' : attempt.caseScore >= 50 ? 'score-green' : 'score-amber'">案 {{ attempt.caseScore }}</span>
        </div>
      </div>
      <div v-else class="empty-state">完成真题或模考后，这里会形成成绩趋势。</div>
    </section>

    <section class="two-panel-grid">
      <div class="panel-card"><span class="eyebrow">ERROR TAGS</span><h2>高频错题标签</h2><div v-if="tagCounts.length" class="tag-cloud"><span v-for="tag in tagCounts" :key="tag[0]">{{ tag[0] }} · {{ tag[1] }}</span></div><p v-else class="muted">暂无标签，录入套卷时可添加。</p></div>
      <div class="panel-card"><span class="eyebrow">28 DAYS</span><h2>打卡热力图</h2><div class="heatmap"><i v-for="day in recentDays" :key="day.key" :class="{ active: day.done }" :title="day.key"></i></div></div>
    </section>
  </div>
</template>
