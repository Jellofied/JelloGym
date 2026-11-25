// Badges, streak freezes and the "what is new" diff (docs/LIFE_MODULES.md, Levels 5c), extending
// the motivation module's idea rather than replacing it: streak milestone badges stay in
// lib/streak.js, and this adds the cross-module ones on top.
//
// Eligibility is derived from history every render; only the unlock DATES are stored, written the
// first time a card notices a badge that has no date yet — the challenges' markDone pattern.
//
//   S.badges[badgeKey]      = { d: '2026-11-14', _ts }   (the day it became eligible)
//   S.freezeUsed[habitWeek] = { h, d, _ts }              (a habit-streak break a freeze covered)
//
// Streak freezes: one earned for every three whole levels (xp.js freezeBank). They apply to habit
// streaks: a due day that passed unchecked consumes a freeze from the shared pool instead of
// breaking the run, oldest break first, and the consumption is written down so every device
// agrees on the pool. The training streak keeps its own earned-every-four-weeks mechanic
// (lib/streak.js) — two economies, one name: the /level page explains both in one line.
import { todayISO, weekKey, weekStartOf, isoOf } from './format.js'
import { habitLogsOf, todayList } from './habits.js'
import { levelFor, freezeBank, xpTotals } from './xp.js'
import { perfectDay } from './perfectday.js'
import { isOn } from './modules.js'

const DAY_MS = 86400000
const addDays = (iso, n) => isoOf(new Date(new Date(iso + 'T12:00:00').getTime() + n * DAY_MS))
const liveMap = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}

/** The badge board: each entry carries an eligibility test and, when unlocked, its stored date.
 *  A badge that is eligible but has no date yet is one the popup has not shown: newUnlocks. */
export function badgesOf(S, today = todayISO()) {
  const out = []
  const push = (key, title, earned) => {
    const e = S?.badges?.[key]
    const date = e && typeof e === 'object' && Number(e._ts) > 0 && typeof e.d === 'string' ? e.d : null
    out.push({ key, title, earned, date })
  }
  const level = levelFor(xpTotals(S, today).xp)
  push('level5', 'Level 5', level >= 5)
  push('level10', 'Level 10', level >= 10)
  push('level20', 'Level 20', level >= 20)
  const sessionCount = (S?.workouts || []).filter(w => w && w.d).length
  push('sessions100', '100 sessions', sessionCount >= 100)
  const checks = Object.values(liveMap(S?.habitLogs)).filter(e => e && Number(e._ts) > 0 && e.d && e.skip !== 1).length
  push('checks100', '100 check-ins', isOn(S, 'habits') && checks >= 100)
  // A run of seven perfect days anywhere in the log.
  const dayDates = (S?.workouts || []).filter(w => w && w.d).map(w => w.d).sort()
  const minDay = dayDates[0] || null
  let run = 0, perfect7 = false
  const start = minDay || today
  for (let d = start, guard = 0; d <= today && guard < 2000; d = addDays(d, 1), guard++) {
    run = perfectDay(S, d, today) ? run + 1 : 0
    if (run >= 7) { perfect7 = true }
  }
  push('perfect7', 'Perfect week', perfect7)
  return out
}

/** Badges that just became eligible and have no unlock date stored: what the popup shows once. */
export function newUnlocks(S, today = todayISO()) {
  const x = xpTotals(S, today)
  const out = []
  if (x.level > 0 && !(Number(S?.levelSeen) >= x.level)) out.push({ kind: 'level', level: x.level })
  for (const b of badgesOf(S, today)) if (b.earned && !b.date) out.push({ kind: 'badge', key: b.key, title: b.title })
  return out
}

/** Stamp the unlock dates / seen level the popup showed (write-once, like challenges' markDone). */
export function markUnlocksSeen(state, items, today = todayISO()) {
  const badges = { ...liveMap(state.badges) }
  let wrote = false
  for (const it of items) {
    if (it.kind === 'badge' && !badges[it.key]) { badges[it.key] = { d: today, _ts: Date.now() }; wrote = true }
    if (it.kind === 'level') { state.levelSeen = it.level; wrote = true }
  }
  if (wrote) state.badges = badges
  return wrote
}

/** The freeze pool: earned by level, minus what has been used. */
export function freezePool(S) {
  const earned = freezeBank(levelFor(xpTotals(S).xp))
  const used = Object.values(liveMap(S?.freezeUsed)).filter(e => e && typeof e === 'object' && e.h && Number(e._ts) > 0).length
  return { earned, used, left: Math.max(0, earned - used) }
}

/**
 * Which breaks one habit's streak the pool can freeze, given `pool` freezes left. Already-recorded
 * consumption for this habit is history and always covered; the rest is spent oldest first.
 * Returns { missed, fresh } — fresh are the ones a render should write down via recordFreezeUses.
 */
export function freezePlan(S, habitId, pool, today = todayISO()) {
  const habit = liveMap(S.habitDefs)[habitId]
  if (!habit || !habit.name) return { missed: [], fresh: [] }
  const start = habit.createdAt ? isoOf(new Date(habit.createdAt)) : addDays(today, -365)
  const dueMissed = []
  for (let d = start, guard = 0; d < today && guard < 1500; d = addDays(d, 1), guard++) {
    if (habitLogsOf(S, habitId, d).length) continue
    const one = todayList({ ...S, habitDefs: { h: habit }, habitLogs: S.habitLogs }, d)
    if (!one.length || !one[0].due) continue
    dueMissed.push({ d, week: weekKey(d, weekStartOf(S)) })
  }
  const recorded = new Set(Object.values(liveMap(S.freezeUsed))
    .filter(e => e && e.h === habitId && Number(e._ts) > 0)
    .map(e => e.d))
  const fresh = dueMissed.filter(m => !recorded.has(m.d))
  return { missed: dueMissed, fresh: fresh.slice(0, Math.max(0, pool)) }
}

/** Persist a habit's newly spent freezes (write-once; called when a card or page renders a walk). */
export function recordFreezeUses(state, habitId, fresh, today = todayISO()) {
  if (!fresh.length) return false
  const map = { ...liveMap(state.freezeUsed) }
  const now = Date.now()
  let wrote = false
  for (const m of fresh) {
    const key = `${habitId}|${m.d}`
    if (map[key]) continue
    map[key] = { h: habitId, d: m.d, _ts: now }
    wrote = true
  }
  if (wrote) state.freezeUsed = map
  return wrote
}
