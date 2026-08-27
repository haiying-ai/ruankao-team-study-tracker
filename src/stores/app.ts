import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { clearStoredSession, studyApi } from '../services/api'
import type { AppSnapshot, ExamAttempt, LoginPayload, Member, MemberAdminInput, PlanTask, TaskProgressInput } from '../types'
import {
  calculateBacklog,
  calculateLead,
  completedTaskIds,
  completionPercent,
  firstIncompleteTask,
  questionProgress,
  todayQueue
} from '../utils/progress'
import { toDateKey } from '../utils/date'

export const useAppStore = defineStore('app', () => {
  const snapshot = ref<AppSnapshot | null>(null)
  const publicMembers = ref<Member[]>([])
  const loading = ref(false)
  const error = ref('')
  const teamToken = ref('')
  const verifiedTeamCode = ref('')
  const previewDate = ref(localStorage.getItem('ruankao.preview-date') || '')

  const today = computed(() => previewDate.value || toDateKey())
  const member = computed(() => snapshot.value?.currentMember)
  const doneIds = computed(() => snapshot.value && member.value ? completedTaskIds(snapshot.value.completions, member.value.id) : new Set<string>())
  const backlog = computed(() => snapshot.value ? calculateBacklog(snapshot.value.tasks, doneIds.value, today.value) : 0)
  const lead = computed(() => snapshot.value ? calculateLead(snapshot.value.tasks, doneIds.value, today.value) : 0)
  const currentTask = computed(() => snapshot.value ? firstIncompleteTask(snapshot.value.tasks, doneIds.value) : undefined)
  const queue = computed(() => snapshot.value ? todayQueue(snapshot.value.tasks, doneIds.value, today.value, snapshot.value.config.dailyMinutes + snapshot.value.config.flexMinutes) : [])
  const percent = computed(() => snapshot.value ? completionPercent(snapshot.value.tasks, doneIds.value) : 0)
  const questions = computed(() => snapshot.value && member.value ? questionProgress(snapshot.value.tasks, snapshot.value.completions, member.value.id) : { target: 0, completed: 0, percent: 0 })
  const isAdmin = computed(() => member.value?.role === 'admin')

  async function verifyTeam(teamCode: string) {
    loading.value = true
    error.value = ''
    try {
      const verified = await studyApi.verifyTeam(teamCode)
      teamToken.value = verified.teamToken
      verifiedTeamCode.value = teamCode
      publicMembers.value = verified.members
      return verified
    } catch (reason) {
      teamToken.value = ''
      verifiedTeamCode.value = ''
      publicMembers.value = []
      error.value = reason instanceof Error ? reason.message : '团队口令验证失败'
      throw reason
    } finally {
      loading.value = false
    }
  }

  function resetTeamVerification() {
    teamToken.value = ''
    verifiedTeamCode.value = ''
    publicMembers.value = []
    error.value = ''
  }

  async function login(payload: LoginPayload) {
    loading.value = true
    error.value = ''
    try {
      await studyApi.login(payload)
      await refresh()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '登录失败'
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await studyApi.logout()
    snapshot.value = null
    resetTeamVerification()
  }

  async function refresh() {
    loading.value = true
    try {
      snapshot.value = await studyApi.snapshot()
      error.value = ''
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'UNAUTHORIZED') clearStoredSession()
      throw reason
    } finally {
      loading.value = false
    }
  }

  async function setTaskProgress(input: TaskProgressInput) {
    if (!snapshot.value || !member.value) return
    const existing = snapshot.value.completions.find((item) => item.memberId === member.value!.id && item.taskId === input.taskId)
    snapshot.value.completions = snapshot.value.completions.filter((item) => item !== existing)
    if (input.done || input.completedQuestions || input.actualMinutes) {
      snapshot.value.completions.push({
        memberId: member.value.id,
        taskId: input.taskId,
        status: input.done ? 'done' : 'partial',
        completedAt: new Date().toISOString(),
        completedQuestions: input.completedQuestions,
        actualMinutes: input.actualMinutes,
        note: input.note
      })
    }
    await studyApi.setTaskProgress(input)
    if (studyApi.remote) await refresh()
  }

  async function checkin(minutes: number, note?: string) {
    await studyApi.addCheckin(minutes, note)
    await refresh()
  }

  async function addAttempt(input: Omit<ExamAttempt, 'id' | 'memberId' | 'attemptedAt'>) {
    await studyApi.addAttempt(input)
    await setTaskProgress({ taskId: input.taskId, done: true, actualMinutes: input.durationMinutes })
    await refresh()
  }

  async function saveTask(task: PlanTask) {
    await studyApi.saveTask(task)
    await refresh()
  }

  async function deleteTask(taskId: string) {
    await studyApi.deleteTask(taskId)
    await refresh()
  }

  async function saveMember(input: MemberAdminInput, refreshAfter = true) {
    await studyApi.saveMember(input)
    if (refreshAfter) await refresh()
  }

  function setPreviewDate(date: string) {
    previewDate.value = date
    if (date) localStorage.setItem('ruankao.preview-date', date)
    else localStorage.removeItem('ruankao.preview-date')
  }

  return {
    snapshot, publicMembers, loading, error, teamToken, verifiedTeamCode, previewDate, today, member, doneIds, backlog, lead,
    currentTask, queue, percent, questions, isAdmin, remote: studyApi.remote,
    verifyTeam, resetTeamVerification, login, logout, refresh, setTaskProgress, checkin, addAttempt,
    saveTask, deleteTask, saveMember, setPreviewDate,
    exportData: () => studyApi.exportData(),
    importPlan: (tasks: PlanTask[]) => studyApi.importPlan(tasks).then(refresh),
    testNotification: () => studyApi.testNotification()
  }
})
