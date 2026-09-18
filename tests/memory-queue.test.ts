import { describe, expect, it } from 'vitest'
import { memoryQueue } from '../src/utils/memory'
import type { MemoryCard, MemoryReviewState } from '../src/types/memory'
import cardData from '../src/data/memory-cards.json'

const cards = cardData as MemoryCard[]
const state = (cardId: string, nextReviewAt: string, lastCorrect = true): MemoryReviewState => ({
  cardId, memberId: 'test', nextReviewAt, lastCorrect, streak: lastCorrect ? 1 : 0,
  lapses: lastCorrect ? 0 : 1, reviews: 1, intervalDays: 1, lastReviewedAt: '2026-09-17T00:00:00Z'
})

describe('背书轮次', () => {
  it('每日模式先错卡，再其他到期卡，再20张新卡；不包含未来复习卡', () => {
    const states = [state(cards[0]!.id, '2026-09-17'), state(cards[1]!.id, '2026-09-18', false), state(cards[2]!.id, '2026-09-19')]
    const queue = memoryQueue(cards, states, '2026-09-18', 'daily')
    expect(queue).toHaveLength(22)
    expect(queue.slice(0, 2).map((card) => card.id)).toEqual([cards[1]!.id, cards[0]!.id])
    expect(queue.some((card) => card.id === cards[2]!.id)).toBe(false)
  })
  it('全量模式不按复习日期过滤，每卡仅出现一次，不修改原卡库', () => {
    const states = cards.map((card) => state(card.id, '2027-01-01'))
    const queue = memoryQueue(cards, states, '2026-09-18', 'all')
    expect(queue).toEqual(cards)
    expect(queue).not.toBe(cards)
    expect(new Set(queue.map((card) => card.id)).size).toBe(cards.length)
  })
  it('49过程可单独全量自测', () => {
    expect(memoryQueue(cards.filter((card) => card.category === 'process'), [], '2026-09-18', 'all')).toHaveLength(49)
  })
})

describe('教材卡库完整性', () => {
  const pages: Record<string, number> = {
    '【冲刺资料】软考中级-M类-2605.pdf': 9,
    '【讲义】【M】中级第9~18章.pdf': 358,
    '【讲义】【Q】强化突破-案例计算-张立台.pdf': 53,
    '【讲义】【Y】运筹学-中级-张立台.pdf': 17,
    '【讲义】【Z】应试专题-中级-张立台.pdf': 92
  }
  it('每张卡有有效出处，题目、答案、标签、ID齐全，五份PDF均有使用', () => {
    const used = new Set<string>()
    expect(cards.length).toBeGreaterThanOrEqual(160)
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length)
    for (const card of cards) {
      expect(['concept', 'formula', 'process', 'process-map', 'tool']).toContain(card.category)
      expect(card.prompt.trim().length).toBeGreaterThan(2)
      expect(card.answer.trim().length).toBeGreaterThan(2)
      expect(card.tags.length).toBeGreaterThan(0)
      expect(card.sources.length).toBeGreaterThan(0)
      for (const source of card.sources) {
        used.add(source.document)
        expect(pages[source.document], source.document).toBeDefined()
        expect(Number.isInteger(source.page)).toBe(true)
        expect(source.page).toBeGreaterThan(0)
        expect(source.page).toBeLessThanOrEqual(pages[source.document]!)
      }
    }
    expect(used.size).toBe(5)
  })
  it('包含用户点名的概念与高频计算工具', () => {
    const prompts = cards.map((card) => card.prompt).join('\n')
    for (const keyword of ['PV', 'EV', '自由', '总浮动', '挣值', '关键路径']) expect(prompts).toContain(keyword)
  })
})
