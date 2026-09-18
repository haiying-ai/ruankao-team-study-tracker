import { chinaDay } from './memory-schedule.mjs'

const count = () => ({ total: 0, reviewed: 0, stable: 0 })
const hasReview = (state) => state && typeof state.memberId === 'string'
  && Number.isSafeInteger(state.reviews) && state.reviews > 0
  && typeof state.lastCorrect === 'boolean'
  && Number.isFinite(Date.parse(state.lastReviewedAt))

/** Only expose aggregates of active members and cards present in this release. */
export function buildMemoryTeamSummary(members, cards, states, now = new Date()) {
  const generatedAt = new Date(now).toISOString()
  const today = chinaDay(now)
  const catalog = new Map(cards.filter((card) => card && typeof card.id === 'string' && card.id).map((card) => [card.id, card]))
  const processTotal = [...catalog.values()].filter((card) => card.category === 'process').length
  const processMapTotal = [...catalog.values()].filter((card) => card.category === 'process-map').length
  const summaries = new Map()
  for (const member of members) {
    const memberId = member?.id || member?._id
    if (!member?.active || typeof memberId !== 'string' || !memberId || summaries.has(memberId)) continue
    summaries.set(memberId, {
      memberId, total: catalog.size, reviewed: 0, stable: 0, due: 0,
      needsWork: 0, reviews: 0, lastReviewedAt: null,
      process: { ...count(), total: processTotal },
      processMap: { ...count(), total: processMapTotal }
    })
  }

  // A duplicated database row must not double the count or overwrite a newer
  // review. Keep each member/card pair independent, even for identical IDs.
  const latest = new Map()
  for (const state of states) {
    if (!hasReview(state) || !summaries.has(state.memberId) || !catalog.has(state.cardId)) continue
    const key = JSON.stringify([state.memberId, state.cardId])
    const previous = latest.get(key)
    const timestamp = Date.parse(state.lastReviewedAt)
    if (!previous || timestamp > Date.parse(previous.lastReviewedAt)
      || (timestamp === Date.parse(previous.lastReviewedAt) && state.reviews > previous.reviews)) latest.set(key, state)
  }
  for (const state of latest.values()) {
    const summary = summaries.get(state.memberId)
    const stable = state.lastCorrect === true && Number.isFinite(state.streak) && state.streak >= 3
    summary.reviewed += 1
    summary.stable += Number(stable)
    summary.reviews += state.reviews
    summary.needsWork += Number(state.lastCorrect === false)
    summary.due += Number(typeof state.nextReviewAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.nextReviewAt) && state.nextReviewAt <= today)
    const reviewedAt = new Date(state.lastReviewedAt).toISOString()
    if (!summary.lastReviewedAt || reviewedAt > summary.lastReviewedAt) summary.lastReviewedAt = reviewedAt
    const category = catalog.get(state.cardId).category
    const section = category === 'process' ? summary.process : category === 'process-map' ? summary.processMap : null
    if (section) { section.reviewed += 1; section.stable += Number(stable) }
  }
  return { generatedAt, summaries: [...summaries.values()] }
}
