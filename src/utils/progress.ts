import type { Completion, PlanTask } from '../types'

export const completedTaskIds = (completions: Completion[], memberId: string) =>
  new Set(completions.filter((item) => item.memberId === memberId && item.status === 'done').map((item) => item.taskId))

export const calculateBacklog = (tasks: PlanTask[], doneIds: Set<string>, today: string) =>
  tasks.filter((task) => task.required && task.plannedDate <= today && !doneIds.has(task.id)).length

export const calculateLead = (tasks: PlanTask[], doneIds: Set<string>, today: string) => {
  if (calculateBacklog(tasks, doneIds, today) > 0) return 0
  return tasks.filter((task) => task.required && task.plannedDate > today && doneIds.has(task.id)).length
}

export const firstIncompleteTask = (tasks: PlanTask[], doneIds: Set<string>) =>
  [...tasks].sort((a, b) => a.sequence - b.sequence).find((task) => task.required && !doneIds.has(task.id))

export const todayQueue = (tasks: PlanTask[], doneIds: Set<string>, today: string, capacity: number) => {
  const fixed = tasks.filter((task) => task.datePolicy === 'fixed' && task.plannedDate === today && !doneIds.has(task.id))
  const overdueRolling = tasks
    .filter((task) => task.datePolicy === 'rolling' && task.plannedDate <= today && !doneIds.has(task.id))
    .sort((a, b) => a.sequence - b.sequence)

  const queue = [...fixed]
  let used = fixed.reduce((sum, task) => sum + task.estimatedMinutes, 0)
  for (const task of overdueRolling) {
    if (queue.some((item) => item.id === task.id)) continue
    if (used >= capacity && queue.length > 0) break
    queue.push(task)
    used += task.estimatedMinutes
  }
  return queue.sort((a, b) => {
    if (a.datePolicy !== b.datePolicy) return a.datePolicy === 'fixed' ? -1 : 1
    return a.sequence - b.sequence
  })
}

export const completionPercent = (tasks: PlanTask[], doneIds: Set<string>) => {
  const required = tasks.filter((task) => task.required)
  return required.length ? Math.round((required.filter((task) => doneIds.has(task.id)).length / required.length) * 100) : 0
}

export const questionProgress = (tasks: PlanTask[], completions: Completion[], memberId: string) => {
  const target = tasks.reduce((sum, task) => sum + (task.questionCount ?? 0), 0)
  const completed = completions
    .filter((item) => item.memberId === memberId)
    .reduce((sum, item) => sum + (item.completedQuestions ?? 0), 0)
  return { target, completed: Math.min(completed, target), percent: target ? Math.round((completed / target) * 100) : 0 }
}
