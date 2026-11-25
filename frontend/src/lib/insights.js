// Insights (docs/LIFE_MODULES.md feature 8): plain statistics between the modules, no AI and no
// causal claims. Each comparison takes the last LOOK_BACK days, splits them (or the sessions in
// them) into two sides, and only speaks when both sides hold at least MIN_SIDE days: a pattern
// needs two handfuls of data before it is worth showing, and a week of one thing reads as luck.
//
// The wording is deliberately flat: "averaged", "went with", "on the days when". Nothing here says
// one thing caused, improved or helped another, because a log of one person cannot show that. Each
// insight also says how many days or sessions it looked at, so a thin pattern is visibly thin, and
// names its own window: the two sides are the days in the last LOOK_BACK days, not the days since
// you installed the app, so a young profile's "rest days" include the ones it never logged. Said
// out loud rather than quietly trimmed, because a window is a fact the reader can weigh.
//
// Pure read of S, like every other helper in lib/: nothing is stored, and a module that is off
// contributes no insight rather than a zero.
import { todayISO, fmtDur, fmtNum } from './format.js'
import { isOn } from './modules.js'
import { dayTotal, goalOf } from './water.js'
import { daySteps, stepsGoalOf } from './steps.js'
import { mainSession } from './sleep.js'
import { rangeOf, eachDay } from './life-stats.js'
import { workoutVolume } from './history.js'

/** Days (or sessions) needed on each side before a comparison is shown. */
export const MIN_SIDE = 14
/** How far back an insight looks. */
export const LOOK_BACK = 180
/** The sleep split, in minutes: the docs' own seven-hour line. */
export const SLEEP_SPLIT_MIN = 420

const mean = list => list.reduce((s, v) => s + v, 0) / list.length

/** Every live habit check in the window, as { d }, newest-agnostic: only habits that still exist. */
function liveChecks(S, from, to) {
  const defs = S?.habitDefs && typeof S.habitDefs === 'object' ? S.habitDefs : {}
  const logs = S?.habitLogs && typeof S.habitLogs === 'object' ? S.habitLogs : {}
  const out = []
  for (const e of Object.values(logs)) {
    if (!e || typeof e !== 'object' || !(Number(e._ts) > 0) || e.skip === 1) continue
    if (typeof e.d !== 'string' || e.d < from || e.d > to) continue
    const def = defs[e.h]
    if (!def || typeof def !== 'object' || !String(def.name || '').trim()) continue
    out.push(e)
  }
  return out
}

/** Days with a session, as a set: the split is made once, not by re-scanning the log per day. */
function trainedSet(S, from, to) {
  const out = new Set()
  for (const w of S?.workouts || []) if (w && typeof w.d === 'string' && w.d >= from && w.d <= to) out.add(w.d)
  return out
}

/**
 * Every insight this profile has enough data for: [{ id, title, detail }], the sleep-and-lifting
 * one first because it is the one people ask about. [] when nothing has two sides to compare.
 */
export function insights(S, today = todayISO()) {
  const out = []
  const from = rangeOf(LOOK_BACK, today).from
  const days = eachDay(from, today).filter(d => d <= today)
  const trainedDays = trainedSet(S, from, today)
  const trained = days.filter(d => trainedDays.has(d))
  const off = days.filter(d => !trainedDays.has(d))
  const bothSides = trained.length >= MIN_SIDE && off.length >= MIN_SIDE
  // Named in every sentence: the sides are these 180 days, not the life of the module, so a month
  // old profile's "rest days" are mostly days it had nothing to log. The reader can weigh that.
  const window = `the last ${LOOK_BACK} days`

  // 1. The night before a session against what that session lifted.
  if (isOn(S, 'sleep')) {
    const hi = [], lo = []
    for (const w of S?.workouts || []) {
      const start = Number(w?.start), end = Number(w?.end)
      if (!w?.d || w.d < from || w.d > today || !(start > 0) || !(end > start)) continue
      const night = mainSession(S, w.d)                 // the night whose wake day is the session's
      if (!night) continue
      const v = workoutVolume(w)
      if (!(v > 0)) continue
      ;(night.min >= SLEEP_SPLIT_MIN ? hi : lo).push(v)
    }
    if (hi.length >= MIN_SIDE && lo.length >= MIN_SIDE) {
      const a = Math.round(mean(hi)), b = Math.round(mean(lo))
      const diff = b > 0 ? Math.round((a / b - 1) * 100) : 0
      out.push({
        id: 'sleep-volume',
        title: 'Sleep and volume',
        detail: `Sessions after seven or more hours of sleep averaged ${fmtNum(a)} kg of volume, against ${fmtNum(b)} kg after shorter nights (${hi.length} and ${lo.length} sessions in ${window}).`
          + (diff ? ` The long-nights side ran ${Math.abs(diff)}% ${diff > 0 ? 'heavier' : 'lighter'}.` : ''),
      })
    }
  }

  // 2. The night itself on training days against days off.
  if (isOn(S, 'sleep')) {
    const on = trained.map(d => (mainSession(S, d) || {}).min || 0).filter(v => v > 0)
    const rest = off.map(d => (mainSession(S, d) || {}).min || 0).filter(v => v > 0)
    if (on.length >= MIN_SIDE && rest.length >= MIN_SIDE) {
      out.push({
        id: 'sleep-training',
        title: 'Sleep on training days',
        detail: `Nights averaged ${fmtDur(Math.round(mean(on)) * 60000)} on the days you trained and ${fmtDur(Math.round(mean(rest)) * 60000)} on the days you did not (${on.length} and ${rest.length} nights in ${window}).`,
      })
    }
  }

  // 3. The water goal on training days against days off.
  if (isOn(S, 'water') && bothSides) {
    const goal = goalOf(S)
    if (goal > 0) {
      const metOn = trained.filter(d => dayTotal(S, d) >= goal).length
      const metOff = off.filter(d => dayTotal(S, d) >= goal).length
      out.push({
        id: 'water-training',
        title: 'Water on training days',
        detail: `The ${goal} ml goal was met on ${metOn} of ${trained.length} training days, against ${metOff} of ${off.length} days off (in ${window}; a day off is any day without a session, logged or not).`,
      })
    }
  }

  // 4. Steps on training days against days off.
  if (isOn(S, 'steps') && bothSides) {
    const on = trained.map(d => daySteps(S, d)).filter(v => v > 0)
    const rest = off.map(d => daySteps(S, d)).filter(v => v > 0)
    if (on.length >= MIN_SIDE && rest.length >= MIN_SIDE) {
      out.push({
        id: 'steps-training',
        title: 'Steps on training days',
        detail: `Days with a session averaged ${fmtNum(Math.round(mean(on)))} steps, days without ${fmtNum(Math.round(mean(rest)))} (in ${window}, over ${on.length} and ${rest.length} days that had step data).`,
      })
    }
  }

  // 5. Habit checks on training days against days off.
  if (isOn(S, 'habits') && bothSides) {
    const checks = liveChecks(S, from, today)
    if (checks.length) {
      const count = new Map()                                     // one pass, then a lookup per day
      for (const e of checks) count.set(e.d, (count.get(e.d) || 0) + 1)
      const per = list => mean(list.map(d => count.get(d) || 0))
      out.push({
        id: 'habits-training',
        title: 'Habit checks on training days',
        detail: `Training days carried ${fmtNum(per(trained))} checks on average, days off ${fmtNum(per(off))} (in ${window}: ${trained.length} training days, ${off.length} rest days, and a rest day the habit never owed counts for nothing).`,
      })
    }
  }

  return out
}
