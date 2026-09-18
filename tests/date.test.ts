import { describe, expect, it } from 'vitest'
import { addDays, currentPlanWeek, isSunday, toDateKey } from '../src/utils/date'

describe('北京时间与默认计划周', () => {
  it.each([
    ['2026-08-20', 0], ['2026-08-27', 0], ['2026-08-30', 0],
    ['2026-08-31', 1], ['2026-09-06', 1], ['2026-09-07', 2],
    ['2026-09-14', 3], ['2026-09-18', 3], ['2026-09-20', 3],
    ['2026-09-21', 4], ['2026-10-19', 8], ['2026-11-01', 8]
  ])('%s 默认 W%s', (date, week) => expect(currentPlanWeek(date)).toBe(week))
  it('按北京时间跨天，不依赖电脑时区', () => {
    expect(toDateKey(new Date('2026-09-20T16:01:00Z'))).toBe('2026-09-21')
    expect(toDateKey(new Date('2026-09-20T15:59:00Z'))).toBe('2026-09-20')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(isSunday('2026-09-20')).toBe(true)
  })
})
