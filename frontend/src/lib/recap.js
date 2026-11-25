// "Your week" and "Your month": a small Home card on the first day of a week (the profile's week
// start) about the week before, and on the 1st about the month before. Tap it for the numbers,
// share them as a picture (components/ShareCard.jsx) or save them as the performance report's PDF
// for that stretch (lib/report-print.js). Settings → Look & Home → Week and month recap turns it
// off (S.recap === false); the card's × puts that one away for good (S.recapSeen, its key).
//
// The numbers are the performance report's own (lib/report.js reportData over the stretch), so
// the card, the sheet and the PDF never disagree. A stretch with no workout gets no card at all:
// nobody needs a recap of a week off.
import { reportData } from './report.js'
import { isoOf, todayISO, weekStartOf, weekKey } from './format.js'
import { streakWeeks } from './streak.js'
import { isOn } from './modules.js'
import { dayTotal, goalProgress } from './water.js'
import { habitsAllMet, habitsOf, todayList } from './habits.js'
import { daySteps, stepsGoalOf } from './steps.js'
import { mainSession, sleepGoalOf } from './sleep.js'
import { foodGoals, foodGoalsMet } from './food.js'
import { dayGoals, perfectDay } from './perfectday.js'
import { xpTotals, levelFor } from './xp.js'

const dateOf = iso => new Date(iso + 'T12:00:00')
const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d) }

export const recapOn = S => S?.recap !== false && isOn(S, 'motivation')

/**
 * The stretch due today, or null: `{ kind: 'month' | 'week', from, to, key }`. The 1st looks back on
 * the month before; the week's first day on the week before. A 1st that is also a Monday shows the
 * month (it is the bigger story, and the week is in it).
 */
export function recapPeriod(S, today = todayISO()) {
  const d = dateOf(today)
  if (d.getDate() === 1) {
    const to = addDays(today, -1)
    const from = to.slice(0, 8) + '01'
    return { kind: 'month', from, to, key: 'm:' + from.slice(0, 7) }
  }
  if (d.getDay() === weekStartOf(S)) {
    const from = addDays(today, -7)
    return { kind: 'week', from, to: addDays(today, -1), key: 'w:' + from }
  }
  return null
}

/** The numbers of a stretch: workouts, volume, sets, PRs, active days, the streak and the top muscle. */
export function recapOf(S, period, today = todayISO()) {
  const R = reportData(S, { range: 'custom', from: period.from, to: period.to, today })
  const top = R.muscles.worked[0] || null
  return {
    ...period,
    workouts: R.totals.workouts,
    volume: R.totals.volume,
    sets: R.totals.sets,
    prs: R.totals.prs,
    days: R.totals.days,
    ms: R.totals.ms,
    streak: streakWeeks(S, today),
    top: top ? { slug: top.slug, name: top.name, sets: top.sets } : null,
    prev: R.prev,
  }
}

/** The recap Home shows today, or null (off, nothing due, put away, or a stretch without a workout). */
export function recapDue(S, today = todayISO()) {
  if (!recapOn(S)) return null
  const p = recapPeriod(S, today)
  if (!p || S?.recapSeen === p.key) return null
  const r = recapOf(S, p, today)
  return r.workouts > 0 ? r : null
}

// ---- the life modules (docs/LIFE_MODULES.md, Recap) ----------------------------------------------
// The same card, the same period, extended: every enabled life module adds its week to the recap.
// Off modules are absent from the result entirely — not zero, absent — and a stretch where
// nothing was logged anywhere gets no card, the same "no workout, no recap" rule.

const eachDay = (from, to, fn) => {
  const out = []
  for (let d = from, guard = 0; d <= to && guard < 62; d = addDays(d, 1), guard++) out.push(fn(d))
  return out
}
const LIFE_MODULES = ['water', 'habits', 'steps', 'sleep', 'food']
// The plan fields dayGoals and the XP walk need; older or partial documents may not carry them.
// `week` is the weekday map: DEF writes it as an object (`{ 0: [...], 1: [...] }`) and a few
// copies carry the array a hand-edited or imported document can hold, so either shape is ready —
// requiring the array here quietly dropped the perfect-day and level lines from every real recap.
const planReady = S => Array.isArray(S?.routines) && !!S?.week && typeof S.week === 'object' && !!S?.dayPlan && typeof S.dayPlan === 'object'

/** The stretch per module. Only enabled modules appear; each section says what it holds. */
export function lifeRecapOf(S, period, today = todayISO()) {
  const days = eachDay(period.from, period.to, d => d)
  const out = { ...period, modules: {} }
  if (isOn(S, 'water')) {
    const logs = days.filter(d => dayTotal(S, d) > 0)
    const met = days.filter(d => { const p = goalProgress(S, d); return p.goal > 0 && p.ml >= p.goal }).length
    out.modules.water = { daysWithLogs: logs.length, met,
      avg: logs.length ? Math.round(logs.reduce((s, d) => s + dayTotal(S, d), 0) / logs.length) : 0 }
  }
  if (isOn(S, 'habits')) {
    let checks = 0, skips = 0, allMetDays = 0, dueDays = 0
    const habitIds = new Set(habitsOf(S).map(h => h.id))
    for (const d of days) {
      const due = todayList(S, d).filter(r => r.due)
      if (due.length) dueDays++
      if (due.length && habitsAllMet(S, d)) allMetDays++
    }
    for (const e of Object.values(S?.habitLogs && typeof S.habitLogs === 'object' ? S.habitLogs : {})) {
      if (!e || typeof e !== 'object' || !(Number(e._ts) > 0) || typeof e.d !== 'string' || e.d < period.from || e.d > period.to) continue
      if (!habitIds.has(e.h)) continue
      if (e.skip === 1) skips++; else checks++
    }
    out.modules.habits = { checks, skips, dueDays, allMetDays }
  }
  if (isOn(S, 'steps')) {
    const goal = stepsGoalOf(S)
    const logged = days.filter(d => daySteps(S, d) > 0)
    out.modules.steps = { met: days.filter(d => daySteps(S, d) >= goal).length,
      avg: logged.length ? Math.round(logged.reduce((s, d) => s + daySteps(S, d), 0) / logged.length) : 0 }
  }
  if (isOn(S, 'sleep')) {
    const goal = sleepGoalOf(S)
    const nights = days.map(d => mainSession(S, d)).filter(Boolean)
    out.modules.sleep = { nights: nights.length, met: nights.filter(n => n.min >= goal).length,
      avg: nights.length ? Math.round(nights.reduce((s, n) => s + n.min, 0) / nights.length) : 0 }
  }
  if (isOn(S, 'food')) {
    const logged = days.filter(d => foodGoalsMet(S, d) !== null)
    out.modules.food = { days: logged.length, met: days.filter(d => foodGoalsMet(S, d) === true).length }
  }
  // The perfect-day count spans every enabled module plus the plan: one pass over the days.
  if (planReady(S)) {
    const owed = days.map(d => dayGoals(S, d, today))
    const perfect = owed.filter(g => g.total > 0 && g.met === g.total).length
    const owedDays = owed.filter(g => g.total > 0).length
    if (owedDays) out.perfect = { perfect, owedDays }
  }
  // Level change over the stretch: derived from history at each boundary, nothing stored.
  if (planReady(S) && (LIFE_MODULES.some(m => isOn(S, m)) || isOn(S, 'levels'))) {
    const before = levelFor(xpTotals(S, addDays(period.from, -1)).xp)
    const after = levelFor(xpTotals(S, period.to).xp)
    out.level = { from: before, to: after, gained: after - before }
  }
  out.hasAny = Object.keys(out.modules).length > 0
  out.hasData = (out.modules.water && out.modules.water.daysWithLogs > 0)
    || (out.modules.habits && (out.modules.habits.checks + out.modules.habits.skips) > 0)
    || (out.modules.steps && out.modules.steps.avg > 0)
    || (out.modules.sleep && out.modules.sleep.nights > 0)
    || (out.modules.food && out.modules.food.days > 0)
    || (out.perfect && out.perfect.perfect > 0)
    || false
  return out
}

/** The life half of the Home recap: the due stretch with something in it, or null. */
export function lifeRecapDue(S, today = todayISO()) {
  if (!LIFE_MODULES.some(m => isOn(S, m))) return null
  if (S?.lifeRecap === false) return null
  const p = recapPeriod(S, today)
  if (!p || S?.lifeRecapSeen === p.key) return null
  const r = lifeRecapOf(S, p, today)
  return r.hasData ? r : null
}

/** One year, in life terms — the Wrapped extension (docs/LIFE_MODULES.md, Recap). Every module is
 *  bucketed by day in a single pass; off modules stay absent; `any` says whether there is a story. */
export function lifeOfYear(S, year, today = todayISO()) {
  const thisYear = new Date(today + 'T12:00:00').getFullYear()
  const to = year < thisYear ? `${year}-12-31` : (year > thisYear ? '' : today)
  const sum = { year, any: false, waterMet: 0, waterDays: 0, checks: 0, skips: 0, stepsMet: 0, stepsDays: 0, sleepMet: 0, sleepNights: 0, foodMet: 0, foodDays: 0, perfect: 0, owed: 0, levelGained: 0 }
  if (!to || !LIFE_MODULES.some(m => isOn(S, m))) return sum
  const inYear = d => typeof d === 'string' && d >= `${year}-01-01` && d <= to
  const liveOf = (map, ok) => Object.values(S?.[map] && typeof S[map] === 'object' ? S[map] : {})
    .filter(e => e && typeof e === 'object' && Number(e._ts) > 0 && inYear(e.d)).filter(ok)
  if (isOn(S, 'water')) {
    const water = {}
    for (const e of liveOf('water', e => Number(e.ml) > 0)) water[e.d] = (water[e.d] || 0) + Number(e.ml)
    const goal = goalProgress(S, to).goal
    for (const [d, ml] of Object.entries(water)) { sum.waterDays++; if (goal > 0 && ml >= goal) sum.waterMet++ }
  }
  if (isOn(S, 'habits')) {
    const habitIds = new Set(habitsOf(S).map(h => h.id))
    for (const e of liveOf('habitLogs', x => habitIds.has(x.h))) { if (e.skip === 1) sum.skips++; else sum.checks++ }
  }
  if (isOn(S, 'steps')) {
    const goal = stepsGoalOf(S)
    const byOrigin = {}
    for (const e of liveOf('steps', x => Number(x.n) >= 0)) {
      const k = e.d + '|' + (e.o || '')
      byOrigin[k] = (byOrigin[k] || 0) + Number(e.n)
    }
    const best = {}
    for (const [k, v] of Object.entries(byOrigin)) { const d = k.split('|')[0]; best[d] = Math.max(best[d] || 0, v) }
    for (const [d, v] of Object.entries(best)) { sum.stepsDays++; if (v >= goal) sum.stepsMet++ }
  }
  if (isOn(S, 'sleep')) {
    const goal = sleepGoalOf(S)
    const nights = {}
    for (const e of liveOf('sleep', x => Number(x.s) > 0 && Number(x.e) > Number(x.s))) {
      const min = Math.round((e.e - e.s) / 60000)
      if (nights[e.d] == null || min > nights[e.d]) nights[e.d] = min
    }
    for (const min of Object.values(nights)) { sum.sleepNights++; if (min >= goal) sum.sleepMet++ }
  }
  if (isOn(S, 'food')) {
    const g = foodGoals(S)
    const kcal = {}, prot = {}
    for (const e of liveOf('food', x => Number(x.kcal) > 0 || Number(x.protein) > 0)) {
      kcal[e.d] = (kcal[e.d] || 0) + Number(e.kcal || 0)
      prot[e.d] = (prot[e.d] || 0) + Number(e.protein || 0)
    }
    for (const d of Object.keys(kcal)) { sum.foodDays++; if (kcal[d] >= g.kcal && prot[d] >= g.protein) sum.foodMet++ }
  }
  if (planReady(S)) {
    for (let d = `${year}-01-01`, guard = 0; d <= to && guard < 400; d = addDays(d, 1), guard++) {
      const g = dayGoals(S, d, to)
      if (!g.total) continue
      sum.owed++
      if (g.met === g.total) sum.perfect++
    }
    sum.levelGained = Math.max(0, levelFor(xpTotals(S, to).xp) - levelFor(xpTotals(S, `${year - 1}-12-31`).xp))
  }
  sum.any = sum.waterDays || sum.checks || sum.skips || sum.stepsDays || sum.sleepNights || sum.foodDays || sum.owed ? true : false
  return sum
}
