// Water (Settings → Modules, docs/LIFE_MODULES.md): a daily hydration log as one flat stamped map.
//
//   S.water[entryId] = { d: '2026-11-14', ml: 250, _ts }, …
//
// One entry per drink, each carrying its own edit time, the way day photos are kept
// (lib/day-photos.js): two devices that each logged a drink keep both, and every total is derived
// from the entries, never stored. Taking one away writes a stamped empty entry (`{ _ts }`), never
// a deleted key: a deleted key would come straight back from the other device's copy on the next
// sync (lib/sync-merge.js mergeStampedMap, STAMPED_MAPS). The field is optional: a profile that
// never drank has no S.water at all, and nothing else in it changes.
//
// The daily goal and the quick-add cup sizes are plain settings (S.waterGoal, S.waterCups):
// absent here, they fall back to the constants below and to the body-weight suggestion.
import { todayISO, uid, isoOf, startOfWeek, weekStartOf } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const CUPS_DEFAULT = [250, 500, 750]
export const GOAL_FALLBACK = 2000
export const GOAL_ML_PER_KG = 33
export const ML_MAX = 2000
const LB = 0.45359237

/** One stored entry read back: { d, ml } or null for a removed or malformed one. */
export function readWaterEntry(entry) {
  if (!isMap(entry) || !ISO.test(String(entry.d || ''))) return null
  const ml = Number(entry.ml)
  if (!Number.isFinite(ml) || ml <= 0 || ml > ML_MAX) return null
  return { d: entry.d, ml }
}

/**
 * Every drink by day, newest first inside each day: Map<iso, [{ id, d, ml, _ts }]>.
 *
 * Built in one pass and memoised against the map object, because every per-day reader below used
 * to walk the whole log: a year of daily drinks turned lib/xp.js' week walk, /stats/life and the
 * recap into quadratic scans (measured: dayGoals cost 11-17 ms a day at three years of history,
 * and xpTotals with it). update() copy-on-writes a top-level field the moment a producer touches
 * it (store/useStore.js), so a new object always means new content and a cached day list cannot go
 * stale; an empty stand-in for a missing map is never cached.
 */
const dayCache = new WeakMap()
function drinksByDay(S) {
  const map = isMap(S?.water) ? S.water : null
  if (!map) return null
  let byDay = dayCache.get(map)
  if (!byDay) {
    byDay = new Map()
    for (const [id, e] of Object.entries(map)) {
      const v = readWaterEntry(e)
      if (!v) continue
      const list = byDay.get(v.d)
      if (list) list.push({ id, ...v, _ts: Number(e._ts) || 0 }); else byDay.set(v.d, [{ id, ...v, _ts: Number(e._ts) || 0 }])
    }
    for (const list of byDay.values()) list.sort((a, b) => b._ts - a._ts)
    dayCache.set(map, byDay)
  }
  return byDay
}

/** Every live drink logged on day `d`, newest first: [{ id, d, ml }]. */
export function drinksOn(S, d) {
  return (drinksByDay(S) || new Map()).get(d)?.slice() || []
}

/** Litres drunk on day `d`. */
export function dayTotal(S, d = todayISO()) {
  let ml = 0
  for (const e of drinksOn(S, d)) ml += e.ml
  return ml
}

/** The amount of the most recently touched live entry, for the last-used quick-add chip. */
export function lastUsed(S) {
  const map = isMap(S?.water) ? S.water : {}
  let best = null
  for (const e of Object.values(map)) {
    const v = readWaterEntry(e)
    if (!v) continue
    if (!best || Number(e._ts) > best.ts) best = { ml: v.ml, ts: Number(e._ts) || 0 }
  }
  return best ? best.ml : null
}

/**
 * Logs `ml` on day `d`. 'invalid' for a bad day or amount (whole ml, 1…ML_MAX); else the new
 * entry id. Mutates `state`, made for useStore's update().
 */
export function addWater(state, ml, { d = todayISO(), id = uid(), now = Date.now() } = {}) {
  if (!ISO.test(String(d || ''))) return 'invalid'
  const n = Math.round(Number(ml))
  if (!Number.isFinite(n) || n <= 0 || n > ML_MAX) return 'invalid'
  const map = isMap(state.water) ? state.water : {}
  state.water = { ...map, [id]: { d, ml: n, _ts: now } }
  return id
}

/** Takes the entry `id` away (a stamped empty entry). Returns whether it was there. */
export function removeWater(state, id, now = Date.now()) {
  const map = isMap(state.water) ? state.water : {}
  if (!readWaterEntry(map[id])) return false
  state.water = { ...map, [id]: { _ts: now } }
  return true
}

/** The Undo of a removal: the entry as it was, stamped now. Returns whether it changed anything. */
export function restoreWater(state, id, entry, now = Date.now()) {
  const v = readWaterEntry(entry)
  if (!v || id !== String(id)) return false
  const map = isMap(state.water) ? state.water : {}
  if (readWaterEntry(map[id])) return false
  state.water = { ...map, [id]: { d: v.d, ml: v.ml, _ts: now } }
  return true
}

/** The entry `id`'s amount and day retyped (keeps its id; a stamped rewrite). */
export function editWater(state, id, ml, { now = Date.now() } = {}) {
  const map = isMap(state.water) ? state.water : {}
  const v = readWaterEntry(map[id])
  const n = Math.round(Number(ml))
  if (!v || !Number.isFinite(n) || n <= 0 || n > ML_MAX) return false
  state.water = { ...map, [id]: { d: v.d, ml: n, _ts: now } }
  return true
}

/** The quick-add cup sizes, as chosen, else the defaults. Clamped and sorted, junk dropped. */
export function cupsOf(S) {
  const cups = Array.isArray(S?.waterCups) && S.waterCups.length
    ? [...new Set(S.waterCups.map(c => Math.round(Number(c))).filter(c => c > 0 && c <= ML_MAX))]
    : null
  return (cups || CUPS_DEFAULT).sort((a, b) => a - b)
}

/** The profile's latest weigh-in in kg, or null. */
function lastWeightKg(S) {
  const days = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  const last = days.length ? days[days.length - 1] : null
  const w = Number(last && last.w)
  if (!Number.isFinite(w) || w <= 0) return null
  return S?.unit === 'lb' ? w * LB : w
}

/** The daily goal in ml: the chosen one, or ~33 ml/kg from the latest weigh-in, or the fallback. */
export function goalOf(S) {
  const g = Math.round(Number(S?.waterGoal))
  if (Number.isFinite(g) && g > 0 && g <= 20000) return g
  const kg = lastWeightKg(S)
  if (kg) return Math.round(kg * GOAL_ML_PER_KG / 50) * 50
  return GOAL_FALLBACK
}

/** Day `d` against its goal: { d, ml, goal, pct } — pct clamped to 0..1 for the ring. */
export function goalProgress(S, d = todayISO()) {
  const ml = dayTotal(S, d)
  const goal = goalOf(S)
  return { d, ml, goal, pct: goal > 0 ? Math.min(1, ml / goal) : 0 }
}

/** Every day with a drink, oldest first: [{ d, ml }] — the totals behind the chart and the CSV. */
export function waterDays(S) {
  const byDay = drinksByDay(S)
  if (!byDay) return []
  return [...byDay]
    .map(([d, list]) => ({ d, ml: list.reduce((s, e) => s + e.ml, 0) }))
    .sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1))
}

/** The spreadsheet's rows, one per drink inside the range: [date, ml]. */
export function waterRows(S, { from = null, to = null } = {}) {
  const map = isMap(S?.water) ? S.water : {}
  const rows = []
  for (const e of Object.values(map)) {
    const v = readWaterEntry(e)
    if (!v || (from && v.d < from) || (to && v.d > to)) continue
    rows.push([v.d, String(v.ml)])
  }
  return rows.sort((a, b) => (a[0] === b[0] ? Number(a[1]) - Number(b[1]) : a[0] < b[0] ? -1 : 1))
}

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

/**
 * The /water chart, bucketed: 'day' is the last 14 days of totals, 'week' the last 12 weeks and
 * 'month' the last 12 months as a daily average inside each — so the one goal line means "per
 * day" in every view, the way the weight charts average a week. Every bucket shows, empty ones at
 * zero: a gap in drinking is the point of the chart. { points: [{ t, y, d }], goal }.
 */
export function waterSeries(S, mode = 'day', today = todayISO()) {
  const goal = goalOf(S)
  const days = new Map(waterDays(S).map(x => [x.d, x.ml]))
  const buckets = []
  if (mode === 'week') {
    const ws = weekStartOf(S)
    for (let i = 11; i >= 0; i--) {
      const start = isoOf(startOfWeek(addDays(today, -7 * i), ws))
      let ml = 0
      for (let d = 0; d < 7; d++) ml += days.get(addDays(start, d)) || 0
      buckets.push({ start, y: Math.round(ml / 7) })
    }
  } else if (mode === 'month') {
    for (let i = 11; i >= 0; i--) {
      const anchor = new Date(today + 'T12:00:00')
      anchor.setMonth(anchor.getMonth() - i, 1)
      const y = anchor.getFullYear(), m = anchor.getMonth()
      const nDays = new Date(y, m + 1, 0).getDate()
      let ml = 0
      for (let d = 0; d < nDays; d++) {
        const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d + 1).padStart(2, '0')
        ml += days.get(iso) || 0
      }
      buckets.push({ start: anchor.getFullYear() + '-' + String(anchor.getMonth() + 1).padStart(2, '0') + '-01', y: Math.round(ml / nDays) })
    }
  } else {
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i)
      buckets.push({ start: d, y: days.get(d) || 0 })
    }
  }
  return { points: buckets.map(b => ({ t: new Date(b.start + 'T12:00:00').getTime(), y: b.y, d: b.start })), goal }
}
