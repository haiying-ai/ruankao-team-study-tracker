<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TaskCard from '../components/TaskCard.vue'
import { useAppStore } from '../stores/app'
import { currentPlanWeek, toDateKey } from '../utils/date'

const store = useAppStore()
const calendarDate = ref(toDateKey())
const currentWeek = computed(() => currentPlanWeek(store.previewDate || calendarDate.value, store.snapshot?.config.planStartDate))
let dateTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { dateTimer = setInterval(() => { calendarDate.value = toDateKey() }, 60_000) })
onBeforeUnmount(() => { if (dateTimer) clearInterval(dateTimer) })
const activeWeek = ref(currentWeek.value)
const weekTabs = ref<HTMLElement | null>(null)
watch(currentWeek, (week) => { activeWeek.value = week })
watch([activeWeek, weekTabs], async () => {
  await nextTick()
  const tab = weekTabs.value?.querySelector<HTMLElement>('.active')
  if (tab && weekTabs.value) {
    weekTabs.value.scrollTo({ left: Math.max(0, tab.offsetLeft - weekTabs.value.offsetLeft - 16), behavior: 'smooth' })
  }
}, { immediate: true })
const typeFilter = ref('all')
const weekLabels = ['W0 预备', 'W1 基础一', 'W2 基础二', 'W3 基础三', 'W4 收口', 'W5 强化一', 'W6 强化二', 'W7 模考', 'W8 考前']
const typeFilters = [
  ['all', '全部'], ['video', '视频'], ['quiz', '章节题'], ['case', '案例'], ['paper', '真题'],
  ['mock', '模考'], ['live', '直播'], ['error', '错题'], ['catchup', '追赶']
]
const tasks = computed(() => (store.snapshot?.tasks || [])
  .filter((task) => task.weekIndex === activeWeek.value)
  .filter((task) => typeFilter.value === 'all' || task.type === typeFilter.value))
const weekDone = computed(() => (store.snapshot?.tasks || []).filter((task) => task.weekIndex === activeWeek.value && store.doneIds.has(task.id)).length)
const weekTotal = computed(() => (store.snapshot?.tasks || []).filter((task) => task.weekIndex === activeWeek.value).length)
</script>

<template>
  <div class="page-stack">
    <section class="page-intro"><span class="eyebrow">2026.08.27—10.24</span><h2>预备期＋8周时间轴</h2><p>老师的M/Z计划保持原顺序；固定直播不移动，滚动任务未完成会进入次日队首。</p></section>
    <div ref="weekTabs" class="week-tabs horizontal-scroll" aria-label="计划周"><button v-for="(label, index) in weekLabels" :key="label" :class="{ active: activeWeek === index }" :aria-pressed="activeWeek === index" @click="activeWeek = index">{{ label }}{{ currentWeek === index ? ' · 本周' : '' }}</button></div>
    <section class="week-summary"><div><span>本周完成</span><strong>{{ weekDone }}/{{ weekTotal }}</strong></div><div class="linear-progress"><span :style="{ width: `${weekTotal ? weekDone / weekTotal * 100 : 0}%` }"></span></div></section>
    <div class="filter-row horizontal-scroll"><button v-for="filter in typeFilters" :key="filter[0]" :class="[`type-filter-${filter[0]}`, { active: typeFilter === filter[0] }]" @click="typeFilter = filter[0]">{{ filter[1] }}</button></div>
    <div class="task-list"><TaskCard v-for="task in tasks" :key="task.id" :task="task" /></div>
    <div v-if="!tasks.length" class="empty-state">当前筛选没有任务</div>
  </div>
</template>
