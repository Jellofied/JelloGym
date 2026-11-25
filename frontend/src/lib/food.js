// Food (docs/LIFE_MODULES.md tier 1): the plainest possible log — a entry is calories and protein
// for a day, with an optional label — plus the two goals and the suggestion.
//
//   S.food[entryId] = { d: '2026-11-14', kcal: 620, protein: 34, label?: '...', _ts }
//
// Same stamped-entry rules as water (lib/water.js): totals are derived, removals are tombstones,
// and two devices each logging a meal keep both. Goals: S.foodGoalKcal / S.foodGoalProtein;
// without them the suggestion is 33 kcal per kg of body weight and 1.6 g protein per kg — a
// starting point for a maintainer who moves like the plan says, not a diet verdict.
import { isoOf, todayISO, uid } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const KCAL_DEFAULT = 2200
export const PROTEIN_DEFAULT = 140
const LB = 0.45359237

/** One stored entry read back: { d, kcal, protein, label } or null for a removed or junk one. */
export function readFoodEntry(entry) {
  if (!isMap(entry) || !ISO.test(String(entry.d || ''))) return null
  const kcal = Math.round(Number(entry.kcal))
  const protein = Math.round(Number(entry.protein))
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 20000) return null
  if (!Number.isFinite(protein) || protein < 0 || protein > 1000) return null
  if (kcal === 0 && protein === 0) return null
  return { d: entry.d, kcal, protein, label: typeof entry.label === 'string' ? entry.label.slice(0, 60) : '' }
}

/**
 * Logs a meal. Returns the entry id, or 'invalid'. Mutates state for useStore.update().
 * Saved-food one-taps pass `fid` (kept as provenance only — the values are a snapshot, so
 * editing the saved item later never rewrites history, the way logged workouts keep their sets).
 */
export function addFood(state, { d = todayISO(), kcal, protein, label = '', fid = null }, { id = uid(), now = Date.now() } = {}) {
  if (!ISO.test(String(d || ''))) return 'invalid'
  const k = Math.round(Number(kcal) || 0), p = Math.round(Number(protein) || 0)
  if (!(k >= 0 && k <= 20000) || !(p >= 0 && p <= 1000) || (k === 0 && p === 0)) return 'invalid'
  const map = isMap(state.food) ? state.food : {}
  const entry = { d, kcal: k, protein: p, _ts: now }
  const lab = String(label || '').trim().slice(0, 60)
  if (lab) entry.label = lab
  if (fid) entry.fid = String(fid)
  state.food = { ...map, [id]: entry }
  return id
}

/** Takes the entry `id` away (a stamped empty entry). Returns whether it was there. */
export function removeFood(state, id, now = Date.now()) {
  const map = isMap(state.food) ? state.food : {}
  if (!readFoodEntry(map[id])) return false
  state.food = { ...map, [id]: { _ts: now } }
  return true
}

/** The Undo of a removal. */
export function restoreFood(state, id, entry, now = Date.now()) {
  const v = readFoodEntry(entry)
  if (!v) return false
  const map = isMap(state.food) ? state.food : {}
  if (readFoodEntry(map[id])) return false
  state.food = { ...map, [id]: { d: v.d, kcal: v.kcal, protein: v.protein, ...(v.label ? { label: v.label } : {}), ...(entry.fid ? { fid: entry.fid } : {}), _ts: now } }
  return true
}

/**
 * The day's totals, grouped in one pass and memoised against the map object — the same rule as
 * lib/water.js' drinksByDay, so a day's reader costs a lookup instead of a walk of the whole log.
 * A day with no live entry is absent, which is what "the module owes nothing today" means below.
 */
const dayCache = new WeakMap()
function totalsByDay(S) {
  const map = isMap(S?.food) ? S.food : null
  if (!map) return null
  let byDay = dayCache.get(map)
  if (!byDay) {
    byDay = new Map()
    for (const e of Object.values(map)) {
      const v = readFoodEntry(e)
      if (!v) continue
      const t = byDay.get(v.d)
      if (t) { t.kcal += v.kcal; t.protein += v.protein } else byDay.set(v.d, { kcal: v.kcal, protein: v.protein })
    }
    dayCache.set(map, byDay)
  }
  return byDay
}

/** Day `d`'s totals: { kcal, protein }, live entries only. */
export function dayFood(S, d = todayISO()) {
  const t = (totalsByDay(S) || new Map()).get(d)
  return t ? { kcal: t.kcal, protein: t.protein } : { kcal: 0, protein: 0 }
}

/** The two goals: chosen when sane, else the body-weight suggestion, else the plain defaults. */
export function foodGoals(S) {
  const kg = (() => {
    const days = Array.isArray(S?.bodyweight) ? S.bodyweight : []
    const last = days.length ? days[days.length - 1] : null
    const w = Number(last && last.w)
    if (!(Number.isFinite(w) && w > 0)) return null
    return S?.unit === 'lb' ? w * LB : w
  })()
  const kcal = Math.round(Number(S?.foodGoalKcal))
  const protein = Math.round(Number(S?.foodGoalProtein))
  return {
    kcal: Number.isFinite(kcal) && kcal >= 800 && kcal <= 20000 ? kcal : (kg ? Math.round(kg * 33 / 50) * 50 : KCAL_DEFAULT),
    protein: Number.isFinite(protein) && protein >= 20 && protein <= 1000 ? protein : (kg ? Math.round(kg * 1.6 / 5) * 5 : PROTEIN_DEFAULT),
    suggested: !(Number.isFinite(kcal) && kcal >= 800 && kcal <= 20000) && !(Number.isFinite(protein) && protein >= 20 && protein <= 1000),
  }
}

/** Did the day meet both goals? Null when there is nothing logged yet (the module owes nothing). */
export function foodGoalsMet(S, d = todayISO()) {
  const t = (totalsByDay(S) || new Map()).get(d)
  if (!t) return null                                  // nothing logged: the day owes nothing
  const g = foodGoals(S)
  return t.kcal >= g.kcal && t.protein >= g.protein
}

/** The chart's points: kcal per day with food, oldest first, with the protein riding as note. */
export function foodPoints(S, days = 14, today = todayISO()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = isoOf(new Date(new Date(today + 'T12:00:00').getTime() - i * 86400000))
    const t = dayFood(S, d)
    if (t.kcal || t.protein) out.push({ t: new Date(d + 'T12:00:00').getTime(), y: t.kcal, d, note: `${t.protein} g protein` })
  }
  return out
}

/** The one-tap list: the most recent distinct labels (or plain amounts), newest first. */
export function recentFoods(S, count = 6) {
  const map = isMap(S?.food) ? S.food : {}
  const live = Object.entries(map).map(([id, e]) => ({ id, ...readFoodEntry(e), _ts: Number(e?._ts) || 0 })).filter(x => x.d)
  live.sort((a, b) => b._ts - a._ts)
  const seen = new Set(), out = []
  for (const e of live) {
    const key = `${e.kcal}|${e.protein}|${e.label}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
    if (out.length >= count) break
  }
  return out
}

// ---- saved foods and meals (tier 2, slice 6b) -----------------------------------------------
// S.savedFoods[id] = { n, kcal, protein, serving?, meal?, _ts } — the same stamped-map rules,
// modelled on the user-defined exercises' fields but keyed like everything else here. Entries
// keep a snapshot of the values; `fid` says where a one-tap came from for provenance only.

export function readSavedFood(entry) {
  if (!isMap(entry)) return null
  const n = String(entry.n || '').trim().slice(0, 60)
  const kcal = Math.round(Number(entry.kcal)), protein = Math.round(Number(entry.protein))
  if (!n || !Number.isFinite(kcal) || kcal < 0 || kcal > 20000 || !Number.isFinite(protein) || protein < 0 || protein > 1000) return null
  return { n, kcal, protein, serving: String(entry.serving || '').trim().slice(0, 40) || null, meal: entry.meal === true }
}

export function savedFoodsOf(S) {
  const map = isMap(S?.savedFoods) ? S.savedFoods : {}
  const out = []
  for (const [id, e] of Object.entries(map)) {
    const v = readSavedFood(e)
    if (v) out.push({ id, ...v, _ts: Number(e._ts) || 0 })
  }
  return out.sort((a, b) => a.n.localeCompare(b.n))
}

export function addSavedFood(state, raw, { id = uid(), now = Date.now() } = {}) {
  const v = readSavedFood(raw)
  if (!v) return 'invalid'
  const map = isMap(state.savedFoods) ? state.savedFoods : {}
  state.savedFoods = { ...map, [id]: { ...v, _ts: now } }
  return id
}

export function editSavedFood(state, id, raw, { now = Date.now() } = {}) {
  const map = isMap(state.savedFoods) ? state.savedFoods : {}
  if (!readSavedFood(map[id])) return false
  const v = readSavedFood({ ...readSavedFood(map[id]), ...raw })
  if (!v) return false
  state.savedFoods = { ...map, [id]: { ...v, _ts: now } }
  return true
}

export function removeSavedFood(state, id, now = Date.now()) {
  const map = isMap(state.savedFoods) ? state.savedFoods : {}
  if (!readSavedFood(map[id])) return false
  state.savedFoods = { ...map, [id]: { _ts: now } }
  return true
}

/** Logging a saved item: a normal entry with the item's snapshot values and its name as label. */
export function logSavedFood(state, savedId, { d = todayISO(), now = Date.now() } = {}) {
  const map = isMap(state.savedFoods) ? state.savedFoods : {}
  const f = readSavedFood(map[savedId])
  if (!f) return 'invalid'
  return addFood(state, { d, kcal: f.kcal, protein: f.protein, label: f.n, fid: savedId }, { now })
}

/** The CSV's rows, one per live entry, in day order. */
export function foodRows(S, { from = null, to = null } = {}) {
  const map = isMap(S?.food) ? S.food : {}
  const rows = []
  for (const e of Object.values(map)) {
    const v = readFoodEntry(e)
    if (!v || (from && v.d < from) || (to && v.d > to)) continue
    rows.push([v.d, String(v.kcal), String(v.protein), v.label || ''])
  }
  return rows.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1))
}
