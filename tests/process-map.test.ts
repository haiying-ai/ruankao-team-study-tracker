import { describe, expect, it } from 'vitest'
import data from '../src/data/memory-cards.json'
import type { MemoryCard } from '../src/types/memory'
import { memoryQueue } from '../src/utils/memory'

const cards = data as MemoryCard[]
const processes = cards.filter((card) => card.category === 'process').map((card) => ({
  ...card,
  name: card.prompt.split('：')[0]!,
  group: card.answer.split(' · ')[0]!,
  area: card.answer.split(' · ')[1]!.split('。')[0]!
}))
const maps = cards.filter((card) => card.category === 'process-map')
const namesIn = (card: MemoryCard) => [...card.answer.matchAll(/^\d+\. (.+)$/gm)].map((match) => match[1]!)
const groups = ['启动过程组', '规划过程组', '执行过程组', '监控过程组', '收尾过程组']
const areas = ['项目整合管理', '项目范围管理', '项目进度管理', '项目成本管理', '项目质量管理', '项目资源管理', '项目沟通管理', '项目风险管理', '项目采购管理', '项目干系人管理']

describe('49过程横纵背图题', () => {
  it('原四类题目数量不变，追加独立的15张背图题，全部ID唯一', () => {
    expect(cards).toHaveLength(234)
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length)
    expect(Object.fromEntries(['concept', 'formula', 'process', 'tool', 'process-map'].map((category) => [category, cards.filter((card) => card.category === category).length]))).toEqual({ concept: 78, formula: 41, process: 49, tool: 51, 'process-map': 15 })
    expect(cards.slice(0, 219).some((card) => card.category === 'process-map')).toBe(false)
  })

  it('5道纵向题严格按2/24/10/12/1归属覆盖全部49个过程', () => {
    const vertical = maps.filter((card) => card.tags.includes('纵向背图'))
    expect(vertical).toHaveLength(5)
    expect(vertical.map((card) => namesIn(card).length)).toEqual([2, 24, 10, 12, 1])
    groups.forEach((group, index) => {
      const card = vertical[index]!
      expect(card.prompt).toContain(group)
      expect(namesIn(card)).toEqual(processes.filter((process) => process.group === group).map((process) => process.name))
    })
    const names = vertical.flatMap(namesIn)
    expect(new Set(names).size).toBe(49)
    expect([...names].sort()).toEqual(processes.map((process) => process.name).sort())
  })

  it('10道横向题严格按知识领域归属覆盖49个过程并标明5个过程组', () => {
    const horizontal = maps.filter((card) => card.tags.includes('横向背图'))
    expect(horizontal).toHaveLength(10)
    expect(horizontal.map((card) => namesIn(card).length)).toEqual([7, 6, 6, 4, 3, 6, 3, 7, 3, 4])
    areas.forEach((area, index) => {
      const card = horizontal[index]!
      expect(card.prompt).toContain(area)
      expect(namesIn(card)).toEqual(processes.filter((process) => process.area === area).map((process) => process.name))
      groups.forEach((group) => {
        const count = processes.filter((process) => process.area === area && process.group === group).length
        expect(card.answer).toContain(`【${group} · ${count}个】`)
      })
    })
    const names = horizontal.flatMap(namesIn)
    expect(new Set(names).size).toBe(49)
    expect([...names].sort()).toEqual(processes.map((process) => process.name).sort())
  })

  it('新卡ID稳定、答案和出处完整且来源沿用既有过程卡', () => {
    expect(maps.map((card) => card.id)).toEqual([
      ...['initiation', 'planning', 'execution', 'monitoring', 'closing'].map((id) => `mem-process-map-group-${id}`),
      ...['integration', 'scope', 'schedule', 'cost', 'quality', 'resource', 'communication', 'risk', 'procurement', 'stakeholder'].map((id) => `mem-process-map-area-${id}`)
    ])
    const knownSources = new Set(processes.flatMap((card) => card.sources.map((source) => `${source.document}:${source.page}`)))
    for (const card of maps) {
      expect(card.prompt.trim()).not.toBe('')
      expect(card.answer).toContain(`共 ${namesIn(card).length} 个过程`)
      expect(card.explanation).toBeTruthy()
      expect(card.sources.length).toBeGreaterThan(0)
      card.sources.forEach((source) => expect(knownSources.has(`${source.document}:${source.page}`)).toBe(true))
    }
  })

  it('背图模块可单独全量检测15张，混合模式包含新增卡且无重复', () => {
    const onlyMaps = memoryQueue(maps, [], '2026-09-18', 'all')
    expect(onlyMaps).toHaveLength(15)
    expect(onlyMaps.every((card) => card.category === 'process-map')).toBe(true)
    const all = memoryQueue(cards, [], '2026-09-18', 'all')
    expect(all).toHaveLength(234)
    expect(new Set(all.map((card) => card.id)).size).toBe(234)
  })
})
