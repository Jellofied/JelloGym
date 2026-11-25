// Steps (docs/LIFE_MODULES.md): daily totals read from Health Connect, never logged by hand.
//
//   S.steps[entryId] = { d: '2026-11-14', n: 8123, o: 'hc', _ts }, …
//
// One entry per local day, its id derived from the day so two devices importing the same day land
// on one entry (lib/water.js' stamped-map rules apply; the sync registration lives in
// lib/sync-merge.js STAMPED_MAPS). The native side asks Health Connect to aggregate, which dedupes
// the phone's and the watch's overlapping step records; summing the raw ones double counted. A
// preferred source still wins if an older hand-imported day carries one. Totals are always
// derived; a removal writes a stamped empty entry.
import { isoOf, todayISO } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const STEPS_GOAL_DEFAULT = 8000

/** One stored entry read back: { d, n, o } or null for a removed or malformed one. */
export function readStepEntry(entry) {
  if (!isMap(entry) || !ISO.test(String(entry.d || ''))) return null
  const n = Math.round(Number(entry.n))
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null
  return { d: entry.d, n, o: typeof entry.o === 'string' ? entry.o : null }
}

/**
 * The day's records, grouped in one pass and memoised against the map object — the same rule as
 * lib/water.js' drinksByDay, for the same reason: day-by-day readers that each walked the whole
 * log made the week walks quadratic.
 */
const dayCache = new WeakMap()
function entriesByDay(S) {
  const map = isMap(S?.steps) ? S.steps : null
  if (!map) return null
  let byDay = dayCache.get(map)
  if (!byDay) {
    byDay = new Map()
    for (const [id, e] of Object.entries(map)) {
      const v = readStepEntry(e)
      if (!v) continue
      const list = byDay.get(v.d)
      if (list) list.push({ id, ...v }); else byDay.set(v.d, [{ id, ...v }])
    }
    dayCache.set(map, byDay)
  }
  return byDay
}

/** Every live entry for day `d`. */
export function stepEntriesOn(S, d) {
  return (entriesByDay(S) || new Map()).get(d)?.slice() || []
}

/** The day's number: preferred origin only if it has records there, else the biggest single origin. */
export function daySteps(S, d = todayISO()) {
  const preferred = typeof S?.stepsSource === 'string' && S.stepsSource ? S.stepsSource : null
  const byOrigin = new Map()
  for (const e of stepEntriesOn(S, d)) {
    const key = e.o || ''
    byOrigin.set(key, (byOrigin.get(key) || 0) + e.n)
  }
  if (!byOrigin.size) return 0
  if (preferred && byOrigin.has(preferred)) return byOrigin.get(preferred)
  return Math.max(...byOrigin.values())
}

/** Days with at least one entry, oldest first: [{ d, n }] using the derivation above. */
export function stepsDays(S) {
  const byDay = entriesByDay(S)
  if (!byDay) return []
  return [...byDay.keys()].sort().map(d => ({ d, n: daySteps(S, d) }))
}

/** The /steps chart line: points for the last `days` calendar days, gaps at zero. */
export function stepsPoints(S, days = 14, today = todayISO()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = isoOf(new Date(new Date(today + 'T12:00:00').getTime() - i * 86400000))
    out.push({ t: new Date(d + 'T12:00:00').getTime(), y: daySteps(S, d), d })
  }
  return out
}

/** The step goal: the chosen one, else 8 000. */
export function stepsGoalOf(S) {
  const g = Math.round(Number(S?.stepsGoal))
  return Number.isFinite(g) && g >= 1000 && g <= 100000 ? g : STEPS_GOAL_DEFAULT
}

/** Day `d` against its goal: { d, n, goal, pct } — pct clamped for the ring. */
export function stepsProgress(S, d = todayISO()) {
  const n = daySteps(S, d)
  const goal = stepsGoalOf(S)
  return { d, n, goal, pct: goal > 0 ? Math.min(1, n / goal) : 0 }
}

/** The origins seen in the data, with their package names for the picker: [{ o, days }]. */
export function stepOrigins(S) {
  const map = isMap(S?.steps) ? S.steps : {}
  const out = new Map()
  for (const e of Object.values(map)) {
    const v = readStepEntry(e)
    if (!v?.o) continue
    out.set(v.o, (out.get(v.o) || 0) + 1)
  }
  return [...out].map(([o, days]) => ({ o, days })).sort((a, b) => b.days - a.days)
}

const ORIGIN_NAMES = {
  'com.android.healthconnect.controller': 'Health Connect',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.motorola.services': 'Moto Wearable',
  'com.nothing.health': 'Nothing Health',
  'com.samsung.android.healthwise.dataimport': 'Samsung Health',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.xiaomi.wearable': 'Xiaomi Wear',
  'com.huawei.health': 'Huawei Health',
  'com.google.android.apps.fitness': 'Google Fit',
}

/** Who wrote a record, as a person would name it. */
export const originName = o => ORIGIN_NAMES[o] || (typeof o === 'string' ? o.split('.').reverse()[0] : '')
