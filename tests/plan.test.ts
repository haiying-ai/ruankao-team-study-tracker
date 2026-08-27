import { describe, expect, it } from 'vitest'
import { CHAPTER_QUESTION_BANK, M_COURSES, PLAN_SUMMARY, STUDY_PLAN, Z_COURSES } from '../src/data/plan'

describe('完整学习计划', () => {
  it('保持老师Excel中的M/Z条目与原始时长', () => {
    expect(M_COURSES).toHaveLength(78)
    expect(Z_COURSES).toHaveLength(23)
    expect(PLAN_SUMMARY.mOriginalMinutes).toBeCloseTo(851.5)
    expect(PLAN_SUMMARY.zOriginalMinutes).toBeCloseTo(288.5)
    expect(STUDY_PLAN.filter((task) => task.series === 'M')).toHaveLength(78)
    expect(STUDY_PLAN.filter((task) => task.series === 'Z')).toHaveLength(23)
  })

  it('1003道章节题全部进入计划且不重不漏', () => {
    expect(CHAPTER_QUESTION_BANK.reduce((sum, chapter) => sum + chapter.count, 0)).toBe(1003)
    expect(PLAN_SUMMARY.chapterQuestionCount).toBe(1003)
    expect(STUDY_PLAN.filter((task) => task.type === 'quiz').every((task) => (task.questionCount || 0) > 0)).toBe(true)
  })

  it('包含五套近期真题、两套模拟和固定直播6–10', () => {
    expect(PLAN_SUMMARY.fullPaperCount).toBe(7)
    expect(STUDY_PLAN.filter((task) => task.type === 'paper' && /^202[345]/.test(task.paperKey || ''))).toHaveLength(5)
    expect(STUDY_PLAN.filter((task) => task.type === 'mock')).toHaveLength(2)
    expect(STUDY_PLAN.filter((task) => task.type === 'live').map((task) => [task.id, task.plannedDate, task.datePolicy])).toEqual([
      ['live-6', '2026-09-09', 'fixed'], ['live-7', '2026-09-23', 'fixed'], ['live-8', '2026-10-07', 'fixed'],
      ['live-9', '2026-10-14', 'fixed'], ['live-10', '2026-10-21', 'fixed']
    ])
  })

  it('所有ID和顺序唯一，10月23日以后不安排新知识', () => {
    expect(new Set(STUDY_PLAN.map((task) => task.id)).size).toBe(STUDY_PLAN.length)
    expect(STUDY_PLAN.map((task) => task.sequence)).toEqual(Array.from({ length: STUDY_PLAN.length }, (_, index) => index + 1))
    expect(STUDY_PLAN.filter((task) => task.plannedDate > '2026-10-23').map((task) => task.type)).toEqual(['exam'])
  })

  it('视频按1.5倍速向上折算到分钟', () => {
    for (const task of STUDY_PLAN.filter((item) => ['M', 'Z'].includes(item.series || ''))) {
      expect(task.estimatedMinutes).toBe(Math.ceil((task.originalMinutes || 0) / 1.5))
    }
  })

  it('每个周日都有可选追赶任务', () => {
    const catchups = STUDY_PLAN.filter((task) => task.type === 'catchup')
    expect(catchups.length).toBeGreaterThanOrEqual(7)
    expect(catchups.every((task) => task.required === false && new Date(`${task.plannedDate}T00:00:00+08:00`).getDay() === 0)).toBe(true)
  })
})
