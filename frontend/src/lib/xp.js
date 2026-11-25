// XP and levels (docs/LIFE_MODULES.md, Levels slice 5a): derived from history, never stored, so
// years of existing training logs land their owner at an honest starting level the day the module
// goes on — and the Levels module switched off simply stops counting.
//
// THE RULES
//   - Sources are a registry. Each enabled module plugs its own rule; a module that is off
//     contributes nothing, and there is nothing to remove later except the toggle. Workouts are
//     core, so they count whatever the modules say.
//   - Weekly consistency beats daily grinding: each week adds a bonus by how many of its owed
//     daily goals were met, on top of the per-entry points. No daily cap — a long weekend is
//     real history and counts real XP.
//   - The curve is deliberately slow and steady: a level costs 50·L·(L+1) in total (level 1 at
//     100, level 5 at 1 500, level 10 at 5 500, level 20 at 21 000). A person training three
//     times a week and keeping the rings honest rises about one level every two to three weeks,
//     and slows from there.
//   - Everything here is a pure read of S, week by week, keyed by the profile's own week start
//     (lib/streak.js' idiom). Nothing is written; the only stored numbers in the feature are the
//     badge unlock dates and the freezes used (slice 5c).
//
// WHAT THE WALK COSTS (measured, synthetic 3 drinks + 6 habits + sessions every other day, node)
//   one dayGoals   11-17 ms   before the per-day indexes in lib/water.js, steps.js, sleep.js,
//   food.js, habits.js; a fraction of a millisecond after, because those readers now look a day
//   up in an index built in one pass per map instead of re-walking the log.
//   xpTotals       used to scan the workout list and the habit log once per week, so a cold
//   three-year walk (157 weeks) paid for the whole history 157 times over. The walk now groups
//   both into week-keyed counts in one pass each; the memo below still makes that one walk per
//   committed state, and a direct weekXp call keeps its original per-week reads.
//   /stats/life's month summary was 4.7 s at one year and 44 s at three before the indexes; it is
//   now a few milliseconds (lib/life-stats.js, and lib/day-cache.test.js holds that contract).
import { weekKey, weekStartOf, todayISO, isoOf } from './format.js'
import { isOn } from './modules.js'
import { goalProgress } from './water.js'
import { daySteps, stepsGoalOf } from './steps.js'
import { mainSession, sleepGoalOf } from './sleep.js'
import { foodGoalsMet } from './food.js'
import { dayGoals } from './perfectday.js'

const DAY_MS = 86400000

export const XP_POINTS = { session: 20, goalDay: 2, habitCheck: 5 }
export const XP_WEEK_BONUS_MAX = 20

// The registry, and what each rule costs. The day readers below are index lookups now
// (lib/water.js, steps.js, sleep.js, food.js). Workouts and habits used to scan a whole collection
// per week; the walk hands them a week-keyed count built once, while a direct weekXp call without
// that count keeps the original scan and the same answer.

const wkOf = (S, iso) => weekKey(iso, weekStartOf(S))
const addDays = (iso, n) => isoOf(new Date(new Date(iso + 'T12:00:00').getTime() + n * DAY_MS))

/**
 * The two per-week sources as counts by week key, each built in one pass. Pure and short-lived:
 * the walk owns the result, so nothing derived is stored and no cache can outlive an edit.
 */
function weeklyCounts(S) {
  const workouts = new Map()
  for (const w of S?.workouts || []) {
    if (!w || !w.d) continue
    const k = wkOf(S, w.d)
    workouts.set(k, (workouts.get(k) || 0) + 1)
  }
  const habits = new Map()
  const map = (S?.habitLogs && typeof S.habitLogs === 'object') ? S.habitLogs : {}
  for (const e of Object.values(map)) {
    if (!e || typeof e !== 'object' || e.skip === 1 || typeof e.d !== 'string') continue
    if (!(Number(e._ts) > 0)) continue
    const k = wkOf(S, e.d)
    habits.set(k, (habits.get(k) || 0) + 1)
  }
  return { workouts, habits }
}

/** A count from the walk's index, or null when weekXp was called on its own. */
const indexedCount = (index, wk) => index ? index.get(wk) || 0 : null

/** The registry. Every source: { id, unit, week(S, wk, today, counts) -> { n, xp } }. */
export const XP_SOURCES = [
  {
    id: 'workouts', unit: 'sessions', always: true,
    week(S, wk, today, counts) {
      const n = indexedCount(counts?.workouts, wk) ?? (S?.workouts || []).filter(w => w && w.d && wkOf(S, w.d) === wk).length
      return { n, xp: n * XP_POINTS.session }
    },
  },
  {
    id: 'water', unit: 'goal days',
    week(S, wk) {
      let n = 0
      for (let i = 0; i < 7; i++) { const d = addDays(wk, i); if (goalProgress(S, d).ml >= goalProgress(S, d).goal) n++ }
      return { n, xp: n * XP_POINTS.goalDay }
    },
  },
  {
    id: 'habits', unit: 'checks',
    week(S, wk, today, counts) {
      const indexed = indexedCount(counts?.habits, wk)
      if (indexed !== null) return { n: indexed, xp: indexed * XP_POINTS.habitCheck }
      const map = (S?.habitLogs && typeof S.habitLogs === 'object') ? S.habitLogs : {}
      let n = 0
      for (const e of Object.values(map)) {
        if (!e || typeof e !== 'object' || e.skip === 1 || typeof e.d !== 'string') continue
        if (!(Number(e._ts) > 0)) continue
        if (wkOf(S, e.d) === wk) n++
      }
      return { n, xp: n * XP_POINTS.habitCheck }
    },
  },
  {
    id: 'steps', unit: 'goal days',
    week(S, wk) {
      let n = 0
      for (let i = 0; i < 7; i++) { const d = addDays(wk, i); if (daySteps(S, d) >= stepsGoalOf(S)) n++ }
      return { n, xp: n * XP_POINTS.goalDay }
    },
  },
  {
    id: 'sleep', unit: 'goal nights',
    week(S, wk) {
      let n = 0
      for (let i = 0; i < 7; i++) {
        const d = addDays(wk, i)
        const night = mainSession(S, d)
        if (night && night.min >= sleepGoalOf(S)) n++
      }
      return { n, xp: n * XP_POINTS.goalDay }
    },
  },
  {
    id: 'food', unit: 'goal days',
    week(S, wk) {
      let n = 0
      for (let i = 0; i < 7; i++) { if (foodGoalsMet(S, addDays(wk, i)) === true) n++ }
      return { n, xp: n * XP_POINTS.goalDay }
    },
  },
]

/** XP for one week: the sources' points plus the consistency bonus. Returns null for empty weeks. */
export function weekXp(S, wk, today = todayISO(), counts = null) {
  const bySource = {}
  let base = 0
  for (const src of XP_SOURCES) {
    if (!src.always && !isOn(S, src.id)) continue
    const r = src.week(S, wk, today, counts)
    if (!r.n) continue
    bySource[src.id] = { n: r.n, xp: r.xp, unit: src.unit }
    base += r.xp
  }
  // The bonus reads the perfect-day maths over the week's days that have passed.
  let owed = 0, met = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(wk, i)
    if (d > today) break
    const g = dayGoals(S, d, today)
    owed += g.total
    met += g.met
  }
  const f = owed ? met / owed : 0
  const bonus = owed ? Math.round(XP_WEEK_BONUS_MAX * f) : 0
  const total = base + bonus
  if (!total) return null
  return { key: wk, base, bonus, consistency: f, total, bySource }
}

/** A level's price in total XP: 50·L·(L+1). */
export const xpForLevel = L => 50 * L * (L + 1)
export function levelFor(xp) {
  let L = 0
  while (xpForLevel(L + 1) <= xp) L++
  return L
}

/** The first week any module has data in, oldest-first walk start. */
function earliestWeek(S) {
  let min = null
  const note = iso => { if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && (!min || iso < min)) min = iso }
  for (const w of S?.workouts || []) note(w?.d)
  for (const e of Object.values(S?.water || {})) if (e && Number(e._ts) > 0 && Number(e.ml) > 0) note(e.d)
  for (const e of Object.values(S?.habitLogs || {})) if (e && Number(e._ts) > 0) note(e.d)
  for (const e of Object.values(S?.steps || {})) if (e && Number(e._ts) > 0 && Number(e.n) >= 0) note(e.d)
  for (const e of Object.values(S?.sleep || {})) if (e && Number(e._ts) > 0 && Number(e.s) > 0) note(e.d)
  for (const e of Object.values(S?.food || {})) if (e && Number(e._ts) > 0 && (Number(e.kcal) > 0 || Number(e.protein) > 0)) note(e.d)
  return min ? weekKey(min, weekStartOf(S)) : null
}

/**
 * Everything the Level card and /level show, walked from the first logged week to this one:
 * { xp, level, into, forNext, weeks:[…newest last], bySource:{ totals } }.
 *
 * The walk reads the whole history, so its result is memoised against the state object: the Home
 * level card, /level, /stats/life's summary and its Levels card all ask for the same committed
 * copy in one render, and update() hands out a new object on every write (store/useStore.js), so
 * a cached walk can never be served after an edit. The week-keyed counts below are built once per
 * walk and handed to weekXp, not cached, so an edit cannot leave an old count behind.
 */
const walkCache = new WeakMap()
export function xpTotals(S, today = todayISO()) {
  if (S && typeof S === 'object') {
    const hit = walkCache.get(S)
    if (hit && hit.today === today) return hit.out
    const out = walkXp(S, today)
    walkCache.set(S, { today, out })
    return out
  }
  return walkXp(S, today)
}

function walkXp(S, today) {
  const first = earliestWeek(S)
  const thisWk = weekKey(today, weekStartOf(S))
  const weeks = []
  const bySource = {}
  if (first) {
    const counts = weeklyCounts(S)
    let wk = first
    for (let guard = 0; guard < 1200 && wk <= thisWk; guard++, wk = weekKey(addDays(wk, 7), weekStartOf(S))) {
      const w = weekXp(S, wk, today, counts)
      if (!w) continue
      weeks.push(w)
      for (const [id, r] of Object.entries(w.bySource)) {
        bySource[id] = bySource[id] || { n: 0, xp: 0, unit: r.unit }
        bySource[id].n += r.n
        bySource[id].xp += r.xp
      }
    }
  }
  const xp = weeks.reduce((s, w) => s + w.total, 0)
  const level = levelFor(xp)
  return {
    xp, level,
    into: xp - xpForLevel(level),
    forNext: xpForLevel(level + 1) - xpForLevel(level),
    weeks, bySource,
  }
}

/** Streak freezes earned by levelling: one for every three whole levels. */
export const freezeBank = level => Math.floor(level / 3)
