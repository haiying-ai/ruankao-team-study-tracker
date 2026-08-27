<script setup lang="ts">
import { computed, ref } from 'vue'
import ProgressRing from '../components/ProgressRing.vue'
import TaskCard from '../components/TaskCard.vue'
import { useAppStore } from '../stores/app'
import { daysBetween, formatDate } from '../utils/date'

const store = useAppStore()
const checkinMinutes = ref(120)
const checkinNote = ref('')
const checkinOpen = ref(false)
const countdown = computed(() => Math.max(0, daysBetween(store.today, store.snapshot?.config.examDate || '2026-10-24')))
const todayMinutes = computed(() => store.queue.reduce((sum, task) => sum + task.estimatedMinutes, 0))
const fixedLive = computed(() => store.queue.find((task) => task.type === 'live'))
const nextTask = computed(() => {
  if (!store.snapshot) return undefined
  const currentIndex = store.currentTask ? store.snapshot.tasks.findIndex((item) => item.id === store.currentTask?.id) : -1
  return store.snapshot.tasks.slice(currentIndex + 1).find((item) => !store.doneIds.has(item.id))
})

async function checkin() {
  await store.checkin(checkinMinutes.value, checkinNote.value)
  checkinOpen.value = false
  checkinNote.value = ''
}
</script>

<template>
  <div v-if="store.snapshot" class="page-stack">
    <section class="hero-card">
      <div>
        <span class="eyebrow">{{ formatDate(store.today, true) }}</span>
        <h2>离考试还有 <em>{{ countdown }}</em> 天</h2>
        <p>今日安排 {{ todayMinutes }} 分钟 · 标准120分钟＋30分钟弹性</p>
      </div>
      <ProgressRing :value="store.percent" label="必做进度" :size="96" />
    </section>

    <section class="metric-grid">
      <div class="metric-card"><span>当前欠账</span><strong :class="store.backlog >= 7 ? 'danger' : store.backlog >= 3 ? 'warning' : ''">{{ store.backlog }}</strong><small>项必做任务</small></div>
      <div class="metric-card"><span>章节题</span><strong>{{ store.questions.completed }}</strong><small>/ {{ store.questions.target }} 题</small></div>
      <div class="metric-card"><span>今日容量</span><strong>{{ todayMinutes }}</strong><small>/ 150 分钟</small></div>
    </section>

    <div v-if="store.backlog >= 3" class="alert-card" :class="{ danger: store.backlog >= 7 }">
      <strong>{{ store.backlog >= 7 ? '红色追赶' : '黄色追赶' }}</strong>
      <span>当前有 {{ store.backlog }} 项计划内任务未完成，今日先从最早欠账开始。</span>
    </div>
    <div v-else-if="store.lead" class="alert-card success"><strong>领先 {{ store.lead }} 项</strong><span>欠账已清零，提前完成值得保持。</span></div>

    <section v-if="fixedLive" class="live-banner"><span class="live-dot"></span><div><strong>今天有固定直播</strong><p>{{ fixedLive.title }} · 不随滚动任务顺延</p></div></section>

    <section>
      <div class="section-heading"><div><span class="eyebrow">TODAY</span><h2>今日队列</h2></div><span class="count-chip">{{ store.queue.length }}项</span></div>
      <div v-if="store.queue.length" class="task-list"><TaskCard v-for="task in store.queue" :key="task.id" :task="task" /></div>
      <div v-else class="empty-state"><strong>今日任务已清空</strong><p>可以休息，或提前完成下一项。</p></div>
    </section>

    <section class="current-next-grid">
      <div><span class="eyebrow">第一个未完成</span><h3>{{ store.currentTask?.title || '全部完成' }}</h3><p>{{ store.currentTask?.detail }}</p></div>
      <div><span class="eyebrow">下一个任务</span><h3>{{ nextTask?.title || '等待计划更新' }}</h3><p>{{ nextTask ? formatDate(nextTask.plannedDate) : '' }}</p></div>
    </section>

    <button class="floating-checkin" @click="checkinOpen = true">＋ 今日打卡</button>
    <div v-if="checkinOpen" class="modal-backdrop" @click.self="checkinOpen = false">
      <form class="modal-card" @submit.prevent="checkin">
        <div class="section-heading"><div><span class="eyebrow">CHECK IN</span><h2>记录今日投入</h2></div><button class="icon-button" type="button" @click="checkinOpen = false">×</button></div>
        <label>学习分钟<input v-model.number="checkinMinutes" type="number" min="1" max="600" required /></label>
        <label>一句复盘<textarea v-model="checkinNote" rows="3" placeholder="今天掌握了什么？"></textarea></label>
        <button class="primary-button">确认打卡</button>
      </form>
    </div>
  </div>
  <div v-else class="loading-state">正在载入今日计划…</div>
</template>
