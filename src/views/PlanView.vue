<script setup lang="ts">
import { computed, ref } from 'vue'
import TaskCard from '../components/TaskCard.vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const activeWeek = ref(0)
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
    <div class="week-tabs horizontal-scroll"><button v-for="(label, index) in weekLabels" :key="label" :class="{ active: activeWeek === index }" @click="activeWeek = index">{{ label }}</button></div>
    <section class="week-summary"><div><span>本周完成</span><strong>{{ weekDone }}/{{ weekTotal }}</strong></div><div class="linear-progress"><span :style="{ width: `${weekTotal ? weekDone / weekTotal * 100 : 0}%` }"></span></div></section>
    <div class="filter-row horizontal-scroll"><button v-for="filter in typeFilters" :key="filter[0]" :class="[`type-filter-${filter[0]}`, { active: typeFilter === filter[0] }]" @click="typeFilter = filter[0]">{{ filter[1] }}</button></div>
    <div class="task-list"><TaskCard v-for="task in tasks" :key="task.id" :task="task" /></div>
    <div v-if="!tasks.length" class="empty-state">当前筛选没有任务</div>
  </div>
</template>
