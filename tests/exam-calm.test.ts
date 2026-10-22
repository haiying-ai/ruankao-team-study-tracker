import { describe, expect, it } from 'vitest'
import { CALM_HIDDEN_ROUTE_NAMES, EXAM_CALM_MESSAGES, EXAM_CALM_MODE } from '../src/config/exam-calm'

describe('考前安心模式', () => {
  it('默认开启，并隐藏会产生计划、比较和管理压力的入口', () => {
    expect(EXAM_CALM_MODE).toBe(true)
    expect([...CALM_HIDDEN_ROUTE_NAMES].sort()).toEqual(['admin', 'plan', 'progress', 'team'])
  })

  it('为每位进入系统的成员提供多条非空祝福', () => {
    expect(EXAM_CALM_MESSAGES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(EXAM_CALM_MESSAGES).size).toBe(EXAM_CALM_MESSAGES.length)
    expect(EXAM_CALM_MESSAGES.every((message) => message.trim().length >= 12)).toBe(true)
  })
})
