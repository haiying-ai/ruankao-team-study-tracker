const DAY_MS = 86_400_000

export const toDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parseDateKey = (key: string) => new Date(`${key}T00:00:00+08:00`)

export const daysBetween = (from: string, to: string) =>
  Math.ceil((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS)

export const addDays = (key: string, days: number) => {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export const formatDate = (key: string, withYear = false) => {
  const date = parseDateKey(key)
  return new Intl.DateTimeFormat('zh-CN', {
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(date)
}

export const isSunday = (key: string) => parseDateKey(key).getDay() === 0

export const dateRange = (start: string, end: string) => {
  const result: string[] = []
  let cursor = start
  while (cursor <= end) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}
