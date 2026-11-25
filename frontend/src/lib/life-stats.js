// The Life half of Stats (docs/LIFE_MODULES.md, Navigation/IA: "/stats/life is new"): one stretch
// of days, every enabled module's chart and its plain numbers. Nothing is stored: every figure here
// is read back from the entry logs through the modules' own helpers (lib/water.js, habits.js,
// steps.js, sleep.js, food.js, perfectday.js, xp.js), so /stats/life, the Home cards, /life and the
// recap can never disagree.
//
// Off modules are absent from the result (null), never zero: a module switched off hides every
// trace of itself, and a zero would read as "you did none of it" rather than "you do not track it".
//
// The denominators are the days of the stretch that have passed, not the days a module has
// existed: a calendar month picked on a profile that started last week owes every day of it up
// to today. Upcoming days show in the charts as empties but never in a denominator. The page
// says so in words ("in this stretch", and lib/insights.js names its 180-day window in every
// sentence) rather than quietly narrowing the maths, so the reader can weigh the thinness
// themselves.
//
// Cost: one pass per module per render, because the per-day readers below hit the day indexes in
// their own modules (lib/water.js, steps.js, sleep.js, food.js, habits.js). Before those indexes
// this file's own month summary cost 4.7 s at a year of daily entries and 44 s at three; the
// numbers are in lib/xp.js' header and the contract is tested in lib/day-cache.test.js.
//
// Bucketing: the charts keep one meaning for the goal line - per day, whatever the grain. Each
// calendar stretch carries its own bucket through stretchOf: a day for the month, a week for the
// quarter, a month for the year and all time (whose months the page draws as bars through
// monthsOf). A size heuristic stays for rolling windows, so "longer stretches average a week,
// then a month" still describes what is left of it.
import { todayISO, isoOf, weekStartOf, weekKey } from './format.js'
import { isOn } from './modules.js'
import { dayTotal, goalOf } from './water.js'
import { daySteps, stepsGoalOf } from './steps.js'
import { mainSession, sleepGoalOf } from './sleep.js'
import { dayFood, foodGoals } from './food.js'
import { dayGoals } from './perfectday.js'
import { habitsOf, habitsAllMet, plannedOn, dayState, todayList } from './habits.js'
import { xpTotals, levelFor } from './xp.js'

const dateOf = iso => new Date(iso + 'T12:00:00')
export const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d) }

/** The stretches the page offers, short to long. The values are keys for stretchOf, not day
 *  counts, and each brings its own layout: squares for the month, a weekly line for the
 *  quarter, month bars for the year and all time. */
export const LIFE_RANGES = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3 Months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]

/** { from, to, days } — the `days` stretch ending today, rolling. Insights' fixed look-back
 *  uses this; the Life page's calendar stretches use stretchOf. */
export function rangeOf(days, today = todayISO()) {
  const n = Math.max(1, Math.min(400, Math.round(Number(days) || 30)))
  const to = today
  const from = addDays(to, -(n - 1))
  return { from, to, days: n }
}

/**
 * { from, to, days, bucket } — the whole calendar stretch `today` sits in, from its first day
 * to its last, days ahead of today included. The charts draw the upcoming days as empties
 * (seriesOf); the numbers judge only the days that have passed (owedDays), so a day that has
 * not happened yet can never miss a goal. `all` runs from the profile's earliest life entry
 * (earliestDataDay) to the end of this month.
 * The bucket is the chart's grain: a day per point for the month, a week for the quarter, a
 * month for the year and all time (where the page draws the months as bars through monthsOf).
 */
export function stretchOf(key, today = todayISO(), S = null) {
  const d = dateOf(today)
  const monthEnd = m => isoOf(new Date(d.getFullYear(), m + 1, 0))
  let from, to, bucket
  if (key === 'all') { from = earliestDataDay(S, today); to = monthEnd(d.getMonth()); bucket = 'month' }
  else if (key === 'year') { from = isoOf(new Date(d.getFullYear(), 0, 1)); to = isoOf(new Date(d.getFullYear(), 11, 31)); bucket = 'month' }
  else if (key === 'quarter') { from = isoOf(new Date(d.getFullYear(), d.getMonth() - 2, 1)); to = monthEnd(d.getMonth()); bucket = 'week' }
  else { from = isoOf(new Date(d.getFullYear(), d.getMonth(), 1)); to = monthEnd(d.getMonth()); bucket = 'day' }
  return { from, to, days: eachDay(from, to).length, bucket }
}

/** The earliest day any life module holds, or today for a profile with nothing logged. */
export function earliestDataDay(S, today = todayISO()) {
  let out = null
  const see = v => { if (typeof v === 'string' && v.length === 10 && (out === null || v < out)) out = v }
  for (const map of [S?.water, S?.steps, S?.sleep, S?.food, S?.habitLogs]) {
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const e of Object.values(map)) if (e && typeof e === 'object') see(e.d)
    }
  }
  return out || today
}

/** Every iso day from `from` to `to`, both ends in. The guard is for a malformed date, not for
 *  a long stretch: All time walks a profile's whole life, decades included. */
export function eachDay(from, to) {
  const out = []
  for (let d = from, guard = 0; d <= to && guard < 20000; d = addDays(d, 1), guard++) out.push(d)
  return out
}

// A stretch this long shows a day per point; longer ones a week; a year months.
const DAY_BUCKET = 62, WEEK_BUCKET = 200
const bucketOf = days => (days <= DAY_BUCKET ? 'day' : days <= WEEK_BUCKET ? 'week' : 'month')

const mean = list => (list.length ? Math.round(list.reduce((s, v) => s + v, 0) / list.length) : 0)

/** Days whose totals count towards the numbers: every day of the stretch that has passed.
 *  A calendar stretch runs past today, so the walk stops at today rather than enumerating
 *  the days ahead and filtering them - All time would otherwise build a list out to month
 *  end for nothing. */
const owedDays = (period, today) => eachDay(period.from, period.to < today ? period.to : today)

/** What a day holds for each kind of chart, always through that module's own reader. */
const DAY_VALUE = {
  water: (S, d) => dayTotal(S, d),
  steps: (S, d) => daySteps(S, d),
  sleep: (S, d) => (mainSession(S, d) || {}).min || 0,
  kcal: (S, d) => dayFood(S, d).kcal,
  protein: (S, d) => dayFood(S, d).protein,
}

/** The DAILY goal of each kind, which is what the chart's line means in every bucket. */
const DAY_GOAL = {
  water: S => goalOf(S),
  steps: S => stepsGoalOf(S),
  sleep: S => sleepGoalOf(S),
  kcal: S => foodGoals(S).kcal,
  protein: S => foodGoals(S).protein,
}

/**
 * One chart series: { points: [{ t, y, d, note? }], goal, bucket }. `kind` is a key of the two
 * tables above. Empty buckets still show, at zero: a gap in drinking is the point of a chart.
 * The walk covers the whole stretch, so the days ahead of today in a calendar stretch draw as
 * empties too - the month you can see running out. The partial bucket around today averages
 * those zero days in, which is what makes the last bar read as progress through the period.
 */
export function seriesOf(S, kind, period) {
  const days = eachDay(period.from, period.to)
  const value = DAY_VALUE[kind]
  const goal = DAY_GOAL[kind](S)
  const bucket = period.bucket || bucketOf(period.days)
  if (bucket === 'day') return { bucket, goal, points: days.map(d => ({ t: dateOf(d).getTime(), y: value(S, d), d })) }
  // A longer stretch: one point per bucket, its height the daily average inside it, stamped on
  // the bucket's first day. Same walk, only the key changes - week by the profile's week start,
  // month by its yyyy-mm.
  const keyOf = bucket === 'week'
    ? (d => weekKey(d, weekStartOf(S)))
    : (d => d.slice(0, 7))
  const groups = []
  for (const d of days) {
    const key = keyOf(d)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.vals.push(value(S, d))
    else groups.push({ key, start: d, vals: [value(S, d)] })
  }
  return { bucket, goal, points: groups.map(g => ({ t: dateOf(g.start).getTime(), y: mean(g.vals), d: g.start })) }
}

/**
 * One row per calendar month for the Year and All-time views: { key: 'yyyy-mm', d, avg,
 * logged }, from the stretch's first month through today's. The current month averages its
 * passed days only - bars do not run out the way a chart line does - and months wholly ahead
 * of today draw no empty bar.
 */
export function monthsOf(S, kind, period, today = todayISO()) {
  const value = DAY_VALUE[kind]
  const out = []
  const endKey = today.slice(0, 7)
  const m = dateOf(period.from)
  m.setDate(1)
  while (out.length < 240) {                                  // a century of monthly rows: enough
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    if (key > endKey) break
    const first = key > period.from.slice(0, 7) ? key + '-01' : period.from
    const lastDay = isoOf(new Date(m.getFullYear(), m.getMonth() + 1, 0))
    const days = eachDay(first, lastDay < today ? lastDay : today)
    const vals = days.map(d => value(S, d))
    out.push({ key, d: first, avg: mean(vals), logged: vals.filter(v => v > 0).length })
    m.setMonth(m.getMonth() + 1)
  }
  return out
}

/**
 * The month-squares ramp keyed to the daily goal: l4 is at goal, the steps below it are the
 * fraction of it, and a day with nothing is l0. Without a goal the squares can only say
 * "some, or none" (l1), never a fake near-miss.
 */
export const ratioLevel = goal => v => (!v ? 0 : !(goal > 0) ? 1 : v >= goal ? 4 : v >= goal * 0.66 ? 3 : v >= goal * 0.33 ? 2 : 1)

/** Whether the plan fields dayGoals and the XP walk need are there (an older or partial copy).
 *  `week` is the weekday map: DEF keeps it an object, a hand-edited copy can hold an array, and
 *  both read the same through S.week[wd] (lib/history.js). */
const planReady = S => Array.isArray(S?.routines) && !!S?.week && typeof S.week === 'object' && !!S?.dayPlan && typeof S.dayPlan === 'object'

/** { d: 2 perfect | 1 half kept | 0 } for the calendar grid, over the stretch. */
export function perfectValues(S, period, today = todayISO()) {
  const out = {}
  if (!planReady(S)) return out
  for (const d of owedDays(period, today)) {
    const g = dayGoals(S, d, today)
    out[d] = !g.total ? 0 : g.met === g.total ? 2 : g.met > 0 ? 1 : 0
  }
  return out
}

/** One row per habit: its name, checks and due days in the stretch, and its current streak. */
export function habitRows(S, period, today = todayISO()) {
  const rows = []
  const days = owedDays(period, today)
  for (const def of habitsOf(S)) {
    let due = 0, done = 0
    for (const d of days) {
      if (!plannedOn(S, def, d)) continue
      due++
      if (dayState(S, def, d).done) done++
    }
    rows.push({ id: def.id, name: def.name, due, done, pct: due ? done / due : 0 })
  }
  return rows
}

/**
 * The stretch's numbers for every enabled module. Each section is null when its module is off.
 * { days, water, habits, steps, sleep, food, perfect, levels }
 *
 * `xp` is the page's one xpTotals walk: the level the stretch starts on is read out of that same
 * week list (summing the weeks before it) rather than by walking the whole history a second time.
 * Without it a profile with three years of logs paid three full walks per render - measured at
 * ~20 s each before the per-day caches in lib/water.js, lib/habits.js and friends existed.
 */
export function lifeSummary(S, period, today = todayISO(), xp = null) {
  const days = owedDays(period, today)
  const out = { days: days.length, water: null, habits: null, steps: null, sleep: null, food: null, perfect: null, levels: null }
  const x = xp || xpTotals(S, today)
  if (isOn(S, 'water')) {
    const goal = goalOf(S)
    const ml = days.map(d => dayTotal(S, d))
    out.water = { goal, logged: ml.filter(v => v > 0).length, met: goal > 0 ? ml.filter(v => v >= goal).length : 0, avg: mean(ml.filter(v => v > 0)) }
  }
  if (isOn(S, 'habits')) {
    const rows = habitRows(S, period, today)
    let checks = 0, skips = 0
    for (const e of Object.values(S?.habitLogs && typeof S.habitLogs === 'object' ? S.habitLogs : {})) {
      if (!e || typeof e !== 'object' || !(Number(e._ts) > 0) || typeof e.d !== 'string') continue
      if (e.d < period.from || e.d > period.to) continue
      if (e.skip === 1) skips++; else checks++
    }
    // A day counts as fully kept only when it owed something: the recap's rule (lib/recap.js).
    let dueDays = 0, allMetDays = 0
    for (const d of days) {
      if (!todayList(S, d).filter(r => r.due).length) continue
      dueDays++
      if (habitsAllMet(S, d)) allMetDays++
    }
    out.habits = { habits: rows.length, checks, skips, dueDays, allMetDays }
  }
  if (isOn(S, 'steps')) {
    const goal = stepsGoalOf(S)
    const n = days.map(d => daySteps(S, d))
    out.steps = { goal, logged: n.filter(v => v > 0).length, met: n.filter(v => v >= goal).length, avg: mean(n.filter(v => v > 0)) }
  }
  if (isOn(S, 'sleep')) {
    const goal = sleepGoalOf(S)
    const nights = days.map(d => (mainSession(S, d) || {}).min || 0).filter(v => v > 0)
    out.sleep = { goal, nights: nights.length, met: nights.filter(v => v >= goal).length, avg: mean(nights) }
  }
  if (isOn(S, 'food')) {
    const g = foodGoals(S)
    const list = days.map(d => dayFood(S, d)).filter(t => t.kcal > 0 || t.protein > 0)
    out.food = { kcalGoal: g.kcal, proteinGoal: g.protein, days: list.length, met: list.filter(t => t.kcal >= g.kcal && t.protein >= g.protein).length, kcal: mean(list.map(t => t.kcal)), protein: mean(list.map(t => t.protein)) }
  }
  if (planReady(S)) {
    const owed = days.map(d => dayGoals(S, d, today))
    const withDebt = owed.filter(g => g.total)
    out.perfect = { owed: withDebt.length, done: withDebt.filter(g => g.met === g.total).length }
  }
  // The level change across the stretch, read out of the one walk (lib/recap.js' rule, but from
  // the weeks it already has rather than by walking the whole history twice more). The stretch's
  // first week counts whole, so the "from" level is the level the stretch starts the week on.
  if (isOn(S, 'levels') || ['water', 'habits', 'steps', 'sleep', 'food'].some(m => isOn(S, m))) {
    const from = levelFor(x.weeks.reduce((s, w) => s + (w.key < period.from ? w.total : 0), 0))
    const to = levelFor(x.xp)
    out.levels = { from, to, gained: Math.max(0, to - from) }
  }
  out.hasAny = isOn(S, 'water') || isOn(S, 'habits') || isOn(S, 'steps') || isOn(S, 'sleep') || isOn(S, 'food') || isOn(S, 'levels')
  return out
}
