// Habits (Settings → Modules, docs/LIFE_MODULES.md slice 2a): routines you check in place.
//
//   S.habitDefs[habitId]  = { name, type: 'yesno' | 'count' | 'timed', target, dose, at,
//                              schedule: { kind, days?, n }, skipRest, stack, createdAt, _ts }
//   S.habitLogs[entryId]  = { h, d: '2026-11-14', n?, sec?, skip?, _ts }
//
// Both are flat stamped maps, drinks-of-water style (lib/water.js): one entry per check, totals,
// streaks and consistency are all derived, and taking anything away writes a stamped empty entry
// (`{ _ts }`), never a deleted key (lib/sync-merge.js mergeStampedMap, STAMPED_MAPS). Two devices
// that each checked in keep both checks; the same entry edited on one wins by its own `_ts`.
//
//   type 'count': target = units a day; a check adds n (1 by default).
//   type 'timed': target = minutes a day; a check adds sec (the full target by default).
//   type 'yesno': one check is the goal; n/sec are ignored.
//   schedule kinds: 'daily'; 'weekdays' with days[] of getDay(); 'perWeek' with n days a week
//   (satisfaction is weekly, like the training streak); 'everyNDays' counted from createdAt.
//   skipRest: a rest day for the plan is never a due day, so it cannot break the streak.
//   stack: 'after finishing a workout' (slice 2b wires the moment; the flag lives here).
//   dose, at: supplement/medication template extras, strings shown under the name.
import { isoOf, todayISO, uid, weekKey, weekStartOf } from './format.js'
import { effectiveRoutineIds } from './history.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const HABIT_TYPES = ['yesno', 'count', 'timed']
export const SCHEDULE_KINDS = ['daily', 'weekdays', 'perWeek', 'everyNDays']
export const DAY_MS = 86400000

export const HABIT_TEMPLATES = [
  { key: 'meditate', name: 'Meditate', type: 'timed', target: 10, schedule: { kind: 'daily' } },
  { key: 'read', name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' } },
  { key: 'stretch', name: 'Stretch', type: 'timed', target: 5, schedule: { kind: 'weekdays', days: [1, 3, 5] } },
  { key: 'nosugar', name: 'No sugar', type: 'yesno', target: 0, schedule: { kind: 'weekdays', days: [1, 2, 3, 4, 5] } },
  { key: 'vitamins', name: 'Vitamins', type: 'yesno', target: 0, schedule: { kind: 'daily' }, dose: '1 capsule', at: '08:00' },
  { key: 'supplement', name: 'Supplement or medication', type: 'yesno', target: 0, schedule: { kind: 'daily' }, dose: '', at: '08:00' },
]

const addDays = (iso, n) => isoOf(new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY_MS))
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY_MS)

function normDef(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || '').trim().slice(0, 60)
  const type = HABIT_TYPES.includes(raw.type) ? raw.type : null
  if (!name || !type) return null
  const target = type === 'yesno' ? 0 : Math.round(Number(raw.target) || 0)
  if (type !== 'yesno' && !(target > 0 && target <= 1440)) return null
  const s = isMap(raw.schedule) ? raw.schedule : {}
  const kind = SCHEDULE_KINDS.includes(s.kind) ? s.kind : 'daily'
  const days = kind === 'weekdays'
    ? [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : null
  if (kind === 'weekdays' && !days.length) return null
  const n = Math.round(Number(s.n) || 0)
  if (kind === 'perWeek' && !(n >= 1 && n <= 7)) return null
  if (kind === 'everyNDays' && !(n >= 2 && n <= 30)) return null
  return {
    name, type, target,
    schedule: kind === 'weekdays' ? { kind, days } : kind === 'daily' ? { kind } : { kind, n },
    skipRest: raw.skipRest === true,
    stack: raw.stack === true,
    remind: raw.remind === true,
    dose: String(raw.dose || '').trim().slice(0, 40) || null,
    at: /^\d{2}:\d{2}$/.test(String(raw.at || '')) ? raw.at : null,
    createdAt: Number(raw.createdAt) || 0,
  }
}

/** One stored definition read back, normalized; null for a removed or malformed one. */
export function readHabitDef(entry) { return normDef(entry) }

/** Every live habit: [{ id, ...def }], in the order they were made. */
export function habitsOf(S) {
  const map = isMap(S?.habitDefs) ? S.habitDefs : {}
  const out = []
  for (const [id, e] of Object.entries(map)) {
    const d = normDef(e)
    if (d) out.push({ id, ...d, _ts: Number(e._ts) || 0 })
  }
  return out
}

/** Makes a habit (validated). Returns its id, or 'invalid'. Mutates state for useStore.update. */
export function addHabit(state, raw, { id = uid(), now = Date.now() } = {}) {
  const def = normDef({ createdAt: now, ...raw })
  if (!def) return 'invalid'
  const map = isMap(state.habitDefs) ? state.habitDefs : {}
  if (normDef(map[id])) return 'invalid'
  state.habitDefs = { ...map, [id]: { ...def, createdAt: def.createdAt || now, _ts: now } }
  return id
}

/** Retypes a habit, keeping its id and creation moment. */
export function editHabit(state, id, raw, { now = Date.now() } = {}) {
  const map = isMap(state.habitDefs) ? state.habitDefs : {}
  const old = normDef(map[id])
  if (!old) return false
  const def = normDef({ ...old, ...raw, createdAt: old.createdAt || now })
  if (!def) return false
  state.habitDefs = { ...map, [id]: { ...def, _ts: now } }
  return true
}

/** Takes a habit away (a stamped empty definition). Its check-ins stay, harmless, for history. */
export function removeHabit(state, id, now = Date.now()) {
  const map = isMap(state.habitDefs) ? state.habitDefs : {}
  if (!normDef(map[id])) return false
  state.habitDefs = { ...map, [id]: { _ts: now } }
  return true
}

export function restoreHabit(state, id, entry, now = Date.now()) {
  const def = normDef(entry)
  if (!def) return false
  const map = isMap(state.habitDefs) ? state.habitDefs : {}
  if (normDef(map[id])) return false
  state.habitDefs = { ...map, [id]: { ...def, _ts: now } }
  return true
}

// ---- logs --------------------------------------------------------------------------------------------

/**
 * The check-ins, by habit and then by day, in one pass and memoised against the map object — the
 * same trick as lib/water.js' drinksByDay. Without it dayState() walked the whole log for every
 * habit of every day, which is what made a year of habit history (and lib/xp.js' week walk, and
 * /stats/life) quadratic. Newest first inside each day, as habitLogsOf has always been.
 */
const logsCache = new WeakMap()
function logsByHabitDay(S) {
  const map = isMap(S?.habitLogs) ? S.habitLogs : null
  if (!map) return null
  let byHabit = logsCache.get(map)
  if (!byHabit) {
    byHabit = new Map()
    for (const [id, e] of Object.entries(map)) {
      if (!isMap(e) || !ISO.test(String(e.d || '')) || typeof e.h !== 'string') continue
      let perDay = byHabit.get(e.h)
      if (!perDay) { perDay = new Map(); byHabit.set(e.h, perDay) }
      const log = { id, d: e.d, n: Number(e.n) || 0, sec: Number(e.sec) || 0, skip: e.skip === 1, _ts: Number(e._ts) || 0 }
      const list = perDay.get(e.d)
      if (list) list.push(log); else perDay.set(e.d, [log])
    }
    for (const perDay of byHabit.values()) for (const list of perDay.values()) list.sort((a, b) => b._ts - a._ts)
    logsCache.set(map, byHabit)
  }
  return byHabit
}

/** The live check-ins of one habit, newest first: [{ id, d, n?, sec?, skip? }]. */
export function habitLogsOf(S, habitId, d = null) {
  const perDay = (logsByHabitDay(S) || new Map()).get(habitId)
  if (!perDay) return []
  if (d != null) return perDay.get(d)?.slice() || []
  const out = []
  for (const list of perDay.values()) out.push(...list)
  return out.sort((a, b) => b._ts - a._ts)
}

/**
 * Checks in: a tap on a yesno or timed habit, a cup of n on a count one, or a skip. Returns the
 * entry id, 'dup' for a second yesno check on one day, or 'invalid'. Mutates state for update().
 */
export function logHabit(state, habitId, { d = todayISO(), kind = 'check', n = 1, sec = null, id = uid(), now = Date.now() } = {}) {
  if (!ISO.test(String(d || ''))) return 'invalid'
  const map = isMap(state.habitDefs) ? state.habitDefs : {}
  const def = normDef(map[habitId])
  if (!def) return 'invalid'
  if (kind !== 'check' && kind !== 'skip') return 'invalid'
  if (kind === 'check' && def.type === 'yesno' && habitLogsOf(state, habitId, d).some(l => !l.skip)) return 'dup'
  const entry = { h: habitId, d, _ts: now }
  if (kind === 'skip') entry.skip = 1
  else if (def.type === 'count') entry.n = Math.max(0, Math.round(Number(n) || 1))
  else if (def.type === 'timed') entry.sec = Math.max(0, Math.round(sec == null ? def.target * 60 : Number(sec) || 0))
  const logs = isMap(state.habitLogs) ? state.habitLogs : {}
  state.habitLogs = { ...logs, [id]: entry }
  return id
}

/** Takes the day's live check-ins of one habit away (stamped entries). Returns them for the Undo. */
export function uncheckHabit(state, habitId, d = todayISO(), now = Date.now()) {
  const map = isMap(state.habitLogs) ? state.habitLogs : {}
  const undone = []
  const next = { ...map }
  for (const [id, e] of Object.entries(map)) {
    if (!isMap(e) || e.h !== habitId || e.d !== d || !(Number(e._ts) > 0)) continue
    undone.push({ id, ...e }); next[id] = { _ts: now }
  }
  if (!undone.length) return null
  state.habitLogs = next
  return undone
}

/** The Undo of uncheckHabit: the entries as they were, stamped now, unless something live is there. */
export function restoreHabitLogs(state, undone, now = Date.now()) {
  const map = isMap(state.habitLogs) ? state.habitLogs : {}
  const next = { ...map }
  for (const { id, ...e } of undone) {
    const cur = next[id]
    if (isMap(cur) && cur.h) continue           // a live entry the day has since: leave it
    next[id] = { ...e, _ts: now }
  }
  state.habitLogs = next
  return true
}

// ---- reading a day out ------------------------------------------------------------------------------

/** Is day `iso` a rest day for this plan (nothing routine effective on it)? */
export const isRestDay = (S, iso) => effectiveRoutineIds(S, iso, iso).length === 0

/** Whether the habit's schedule expects day `iso` (skipRest habits skip rest days; perWeek has no due days). */
export function plannedOn(S, def, iso) {
  if (!def || def.schedule.kind === 'perWeek') return false
  if (def.skipRest && isRestDay(S, iso)) return false
  if (def.schedule.kind === 'weekdays') return def.schedule.days.includes(new Date(iso + 'T12:00:00').getDay())
  if (def.schedule.kind === 'everyNDays') {
    const anchor = def.createdAt ? isoOf(new Date(def.createdAt)) : iso
    const gap = daysBetween(anchor, iso)
    return gap >= 0 && gap % def.schedule.n === 0
  }
  return true
}

/** What day `iso` holds for one habit: { cur, target, done, skipped }. */
export function dayState(S, def, iso) {
  const logs = habitLogsOf(S, def.id, iso)
  const skipped = logs.some(l => l.skip)
  const has = logs.some(l => !l.skip)
  if (def.type === 'count') { const cur = logs.reduce((s, l) => (l.skip ? s : s + l.n), 0); return { cur, target: def.target, done: cur >= def.target, skipped } }
  if (def.type === 'timed') { const cur = logs.reduce((s, l) => (l.skip ? s : s + l.sec), 0); return { cur: Math.round(cur / 60), target: def.target, done: cur >= def.target * 60, skipped } }
  return { cur: has ? 1 : 0, target: 1, done: has, skipped }
}

const liveDef = (S, id) => habitsOf(S).find(h => h.id === id) || null

/**
 * The streak of one habit, whole weeks for a perWeek habit (weeks that reached their n), days for
 * the rest. A due day that has passed unchecked breaks it; a rest day under skipRest, a skip entry
 * and a future day do not. Today, when due and not done, is still counted along, not against.
 */
export function habitStreak(S, habitId, today = todayISO()) {
  const def = liveDef(S, habitId)
  if (!def) return { current: 0, best: 0 }
  const start = def.createdAt ? isoOf(new Date(def.createdAt)) : today
  if (def.schedule.kind === 'perWeek') {
    const ws = weekStartOf(S)
    const byWeek = new Map()
    for (const l of habitLogsOf(S, habitId)) {
      if (l.skip) continue
      const k = weekKey(l.d, ws)
      if (l.n || l.sec || def.type === 'yesno') byWeek.set(k, (byWeek.get(k) || 0) + 1)
    }
    const thisWk = weekKey(today, ws)
    let cur = 0, best = 0, k = start <= thisWk ? weekKey(start, ws) : thisWk
    const guard = 1500
    for (let i = 0; i < guard && k <= thisWk; i++, k = weekKey(addDays(k, 7), ws)) {
      const got = byWeek.get(k) || 0
      const now = k === thisWk
      if (got >= def.schedule.n) { cur++; if (cur > best) best = cur }
      else if (!now) cur = 0
      else if (cur === 0) { /* this week still open */ }
    }
    return { current: cur, best }
  }
  let cur = 0, best = 0
  const guard = 1500
  for (let i = 0; i < guard; i++) {
    const d = addDays(today, -i)
    if (d < start) break
    const st = dayState(S, { ...def, id: habitId }, d)
    const due = plannedOn(S, def, d)
    if (st.done || st.skipped) { cur++; if (cur > best) best = cur; continue }
    if (i === 0) continue          // today is not over yet
    if (!due) continue             // rest days and unscheduled days never break the run
    break                          // a due day passed unchecked ends the run
  }
  return { current: cur, best }
}

/**
 * The last 12 whole weeks: [{ key, done, needed }] — done days or checks against due days (2b view).
 *
 * Note on cost: the per-week habitLogsOf() below takes no day, so it rebuilds and re-sorts that
 * habit's whole list once per week it counts, and todayList() does the same for a perWeek habit on
 * every call. That is the one quadratic left in the life helpers after the day indexes landed
 * (lib/water.js, steps.js, sleep.js, food.js, and this file's habitLogsOf); it costs a few hundred
 * milliseconds on a heavy profile rather than seconds, and hoisting it out was left as its own
 * change rather than folded into that pass. See lib/xp.js' header for the measured figures.
 */
export function weeklyConsistency(S, habitId, today = todayISO(), count = 12) {
  const def = liveDef(S, habitId)
  if (!def) return []
  const ws = weekStartOf(S)
  const weeks = []
  let k = weekKey(addDays(today, -7), ws)
  for (let i = 0; i < count; i++, k = weekKey(addDays(k, -7), ws)) weeks.unshift(k)
  return weeks.map(key => {
    let due = 0, done = 0
    for (let d = 0; d < 7; d++) {
      const iso = addDays(key, d)
      if (iso > today || iso < (def.createdAt ? isoOf(new Date(def.createdAt)) : iso)) continue
      if (def.schedule.kind === 'perWeek') continue
      if (plannedOn(S, def, iso)) { due++; if (dayState(S, { ...def, id: habitId }, iso).done) done++ }
    }
    const weekChecks = habitLogsOf(S, habitId).filter(l => !l.skip && l.d >= key && l.d <= addDays(key, 6)).length
    return { key, done: def.schedule.kind === 'perWeek' ? weekChecks : done, needed: def.schedule.kind === 'perWeek' ? def.schedule.n : due }
  })
}

/** The Home card's rows for today, in habit order. */
export function todayList(S, today = todayISO()) {
  const ws = weekStartOf(S)
  const out = []
  for (const def of habitsOf(S)) {
    const st = dayState(S, def, today)
    const week = def.schedule.kind === 'perWeek'
      ? { done: habitLogsOf(S, def.id).filter(l => !l.skip && l.d >= weekKey(today, ws) && l.d <= today).length, n: def.schedule.n }
      : null
    // A per-week habit stays due for the whole week until its count is reached.
    const due = week ? !week.done || week.done < week.n : plannedOn(S, def, today)
    out.push({ def, ...st, due, rest: def.skipRest && isRestDay(S, today), week })
  }
  return out
}

/** All habits done today (and none due missed)? Perfect days read this later (slice 5b). */
export function habitsAllMet(S, today = todayISO()) {
  const rows = todayList(S, today)
  return rows.every(r => r.done || r.skipped || !r.due)
}

// ---- stacking + reminders (slice 2b) ----------------------------------------------------------------

/**
 * Habit stacking, the auto-check kind: finishing a workout checks the habits that opted in
 * (def.stack) for that day, beside any check already there. Chosen over a prompt because the
 * finish screen is already a moment of truth, lib/finish-workout.js gives the day, and a flag
 * the user set on the habit is the consent. Returns the ids newly checked. Mutates state.
 */
export function stackOnFinish(state, d = todayISO(), now = Date.now()) {
  if (!ISO.test(String(d || ''))) return []
  const done = new Set(habitsOf(state).filter(h => h.stack).map(h => h.id))
  if (!done.size) return []
  const fired = []
  for (const id of done) {
    if (habitLogsOf(state, id, d).some(l => !l.skip)) continue
    if (logHabit(state, id, { d, now }) !== 'dup') fired.push(id)
  }
  return fired
}

/** Habits that opted into a reminder and are still open on day `iso`. [{ id, name }] */
export function reminderOpenOn(S, iso = todayISO()) {
  return todayList(S, iso)
    .filter(r => r.def.remind === true && r.due && !r.done && !r.skipped)
    .map(r => ({ id: r.def.id, name: r.def.name }))
}

/** Habit by name, whatever the case: the CSV import matches its rows back to definitions. */
export function findHabitByName(S, name) {
  const key = String(name || '').trim().toLowerCase()
  return habitsOf(S).find(h => h.name.toLowerCase() === key) || null
}
