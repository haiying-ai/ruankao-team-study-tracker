import type { MemoryCard, MemoryReviewState } from '../types/memory'

export type MemoryMode = 'daily' | 'all'

/** A round is a snapshot: grading must never remove or reorder its remaining cards. */
export function memoryQueue(cards: MemoryCard[], states: MemoryReviewState[], today: string, mode: MemoryMode, newLimit = 20): MemoryCard[] {
  if (mode === 'all') return [...cards]
  const byId = new Map(states.map((state) => [state.cardId, state]))
  const due = cards.filter((card) => {
    const state = byId.get(card.id)
    return state && state.nextReviewAt <= today
  }).sort((a, b) => {
    const x = byId.get(a.id)!, y = byId.get(b.id)!
    return Number(x.lastCorrect) - Number(y.lastCorrect)
      || x.nextReviewAt.localeCompare(y.nextReviewAt)
      || y.lapses - x.lapses
      || a.id.localeCompare(b.id)
  })
  return [...due, ...cards.filter((card) => !byId.has(card.id)).slice(0, newLimit)]
}
