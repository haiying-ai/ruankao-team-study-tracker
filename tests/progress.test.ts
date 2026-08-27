import { describe, expect, it } from 'vitest'
import type { PlanTask } from '../src/types'
import { calculateBacklog, calculateLead, todayQueue } from '../src/utils/progress'

const task = (id: string, date: string, sequence: number, policy: 'rolling' | 'fixed' = 'rolling', minutes = 30): PlanTask => ({
  id, plannedDate: date, sequence, weekIndex: 0, stage: '测试', type: policy === 'fixed' ? 'live' : 'video',
  datePolicy: policy, title: id, detail: id, estimatedMinutes: minutes, required: true
})

describe('滚动排期与偏差', () => {
  const tasks = [task('old-1', '2026-09-01', 1), task('old-2', '2026-09-02', 2), task('live', '2026-09-03', 3, 'fixed', 90), task('future', '2026-09-04', 4)]

  it('未完成滚动任务进入次日队首，固定直播不移动且优先', () => {
    expect(todayQueue(tasks, new Set(), '2026-09-03', 150).map((item) => item.id)).toEqual(['live', 'old-1', 'old-2'])
    expect(todayQueue(tasks, new Set(['old-1']), '2026-09-04', 150).map((item) => item.id)).toEqual(['old-2', 'future'])
  })

  it('欠账只计算截至今天未完成的必做任务', () => {
    expect(calculateBacklog(tasks, new Set(['old-1']), '2026-09-03')).toBe(2)
  })

  it('只有欠账清零才显示领先', () => {
    expect(calculateLead(tasks, new Set(['future']), '2026-09-03')).toBe(0)
    expect(calculateLead(tasks, new Set(['old-1', 'old-2', 'live', 'future']), '2026-09-03')).toBe(1)
  })
})
