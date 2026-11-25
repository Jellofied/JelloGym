// The perfect day (docs/LIFE_MODULES.md, Levels): what the day's enabled modules owed, and what
// they got. Everything derived — entries in, booleans out. A module that is off contributes
// nothing at all, not even a miss; a module with nothing owed today (no habits due, a day with no
// session planned and none taken) drops out of the count instead of banking a free win.
import { isOn } from './modules.js'
import { todayISO } from './format.js'
import { effectiveRoutineIds } from './history.js'
import { goalProgress } from './water.js'
import { habitsAllMet, todayList } from './habits.js'
import { daySteps, stepsGoalOf } from './steps.js'
import { mainSession, sleepGoalOf } from './sleep.js'
import { foodGoalsMet } from './food.js'

/**
 * The day's items: [{ id, met }], with the met/total counts. Training logging is core, so a
 * planned or trained day always owes its item; the read-only and logging modules appear only
 * while switched on. `d` beyond `today` owes nothing (no future predictions).
 */
export function dayGoals(S, d = todayISO(), today = todayISO()) {
  const items = []
  if (d > today) return { items, met: 0, total: 0 }
  const trained = (S?.workouts || []).some(w => w && w.d === d)
  if (trained || effectiveRoutineIds(S, d, d).length) items.push({ id: 'workouts', met: trained })
  if (isOn(S, 'water')) { const w = goalProgress(S, d); items.push({ id: 'water', met: w.ml >= w.goal }) }
  if (isOn(S, 'habits')) {
    const due = todayList(S, d).filter(r => r.due)
    if (due.length) items.push({ id: 'habits', met: habitsAllMet(S, d) })
  }
  if (isOn(S, 'steps')) items.push({ id: 'steps', met: daySteps(S, d) >= stepsGoalOf(S) })
  if (isOn(S, 'sleep')) {
    const night = mainSession(S, d)
    if (night) items.push({ id: 'sleep', met: night.min >= sleepGoalOf(S) })
  }
  if (isOn(S, 'food')) {
    const met = foodGoalsMet(S, d)
    if (met !== null) items.push({ id: 'food', met })
  }
  return { items, met: items.filter(i => i.met).length, total: items.length }
}

/** Did the day meet every item it owed? A day with nothing owed is not "perfect". */
export function perfectDay(S, d = todayISO(), today = todayISO()) {
  const g = dayGoals(S, d, today)
  return g.total > 0 && g.met === g.total
}
