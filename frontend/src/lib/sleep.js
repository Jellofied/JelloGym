// Sleep (docs/LIFE_MODULES.md): sessions read from Health Connect, keyed by the day you woke up,
// with a manual entry as the fallback.
//
//   S.sleep[entryId] = { d: '2026-11-14', s: <start ms>, e: <end ms>, m?: 1, _ts }, …
//
// The same stamped-entry rules as water (lib/water.js): one entry per session, removals are
// stamped empty entries, and every total is derived. The id of a read session is derived from the
// hub's record id, so the same night imported on two devices lands on one entry. `m` marks a
// hand-typed session. A hand-typed night and a hub night that overlap are the same sleep: the
// one edited last wins and the other is tombstoned (the weigh-ins' manual-beats-imported rule,
// made symmetric because sleep arrives after the fact). v1 keeps the session window only —
// stage data (deep/REM) is not stored; it arrives with the /sleep stage chart, later.
import { isoOf, todayISO, uid } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const SLEEP_GOAL_DEFAULT = 480

/** One stored session read back: { d, s, e, m } or null for a removed or malformed one. */
export function readSleepEntry(entry) {
  if (!isMap(entry) || !ISO.test(String(entry.d || ''))) return null
  const s = Number(entry.s), e = Number(entry.e)
  if (!(s > 0) || !(e > s)) return null
  const min = Math.round((e - s) / 60000)
  if (min < 5 || min > 900) return null
  return { d: entry.d, s, e, m: entry.m === 1 ? 1 : 0, min }
}

/**
 * Every live session, by wake day, in one pass and memoised against the map object (the same
 * trick as lib/water.js' drinksByDay: per-day readers that each rebuilt the whole list turned the
 * week walks into quadratic scans). Newest night first inside each day, as sleepSessions has
 * always been.
 */
const dayCache = new WeakMap()
function sessionsByDay(S) {
  const map = isMap(S?.sleep) ? S.sleep : null
  if (!map) return null
  let byDay = dayCache.get(map)
  if (!byDay) {
    byDay = new Map()
    for (const [id, e] of Object.entries(map)) {
      const v = readSleepEntry(e)
      if (!v) continue
      const list = byDay.get(v.d)
      if (list) list.push({ id, ...v, _ts: Number(e._ts) || 0 }); else byDay.set(v.d, [{ id, ...v, _ts: Number(e._ts) || 0 }])
    }
    for (const list of byDay.values()) list.sort((a, b) => (b.e || b._ts) - (a.e || a._ts))
    dayCache.set(map, byDay)
  }
  return byDay
}

/** Every live session: [{ id, d, s, e, m, min }], newest night first. */
export function sleepSessions(S) {
  const out = []
  for (const list of (sessionsByDay(S) || new Map()).values()) out.push(...list)
  return out.sort((a, b) => (b.e || b._ts) - (a.e || a._ts))
}

/** Minutes asleep on the night whose wake day is `d` (naps included; 0 when nothing). */
export function nightTotal(S, d) {
  return (sessionsByDay(S) || new Map()).get(d)?.reduce((s, x) => s + x.min, 0) || 0
}

/** The main session of a night: the longest one, or null. */
export function mainSession(S, d) {
  const day = (sessionsByDay(S) || new Map()).get(d)
  if (!day || !day.length) return null
  return day.reduce((a, b) => (b.min > a.min ? b : a))
}

/** The last night before or on `today`, so a session that arrives late still shows. */
export function lastNight(S, today = todayISO()) {
  const days = [...new Set(sleepSessions(S).map(x => x.d).filter(d => d <= today))]
  if (!days.length) return null
  const d = days.sort()[days.length - 1]
  const main = mainSession(S, d)
  return main ? { d, main, total: nightTotal(S, d) } : null
}

/** The /sleep chart: minutes of the main session per night, the last `days` windows. */
export function sleepPoints(S, days = 14, today = todayISO()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = isoOf(new Date(new Date(today + 'T12:00:00').getTime() - i * 86400000))
    const main = mainSession(S, d)
    if (main) out.push({ t: main.e, y: main.min, d, note: nightTotal(S, d) !== main.min ? `+${nightTotal(S, d) - main.min} nap` : undefined })
  }
  return out
}

/** Sessions whose window straddles [a1,a2] by at least this share of the shorter one. */
export function overlaps(e1, e2) {
  const lo = Math.max(e1.s, e2.s), hi = Math.min(e1.e, e2.e)
  if (hi <= lo) return 0
  const shorter = Math.min(e1.e - e1.s, e2.e - e2.s)
  return shorter > 0 ? (hi - lo) / shorter : 0
}

/**
 * Types a night by hand (or fixes an imported one). `s`/`e` are instants; the wake day is e's
 * local day, so a night past midnight files under the day you got up. Mutates state.
 */
export function addSleep(state, { s, e, manual = true, id = uid(), now = Date.now() } = {}) {
  const a = Number(s), b = Number(e)
  if (!(a > 0) || !(b > a)) return 'invalid'
  const min = Math.round((b - a) / 60000)
  if (min < 5 || min > 900) return 'invalid'
  const map = isMap(state.sleep) ? state.sleep : {}
  const entry = { d: isoOf(new Date(b)), s: a, e: b, _ts: now }
  if (manual) entry.m = 1
  state.sleep = { ...map, [id]: entry }
  // The manual-vs-imported rule, decided where the data is written: the copy edited last owns
  // the night, the other becomes a stamped empty entry. Two hand-typed overlapping nights are
  // one night: the newest replaces the older outright.
  for (const [otherId, oe] of Object.entries(state.sleep)) {
    if (otherId === id) continue
    const v = readSleepEntry(oe)
    if (!v || v.d !== entry.d) continue
    if (overlaps(v, entry) < 0.5) continue
    if (manual && v.m) { state.sleep[otherId] = { _ts: now }; continue }
    const mineNewer = now >= (Number(oe._ts) || 0)
    if (mineNewer) state.sleep[otherId] = { _ts: now }
    else { state.sleep[id] = { _ts: Number(oe._ts) }; delete state.sleep[id]; return 'dup' }
  }
  return id
}

/** Takes one session away (a stamped empty entry). Returns whether it was there. */
export function removeSleep(state, id, now = Date.now()) {
  const map = isMap(state.sleep) ? state.sleep : {}
  if (!readSleepEntry(map[id])) return false
  state.sleep = { ...map, [id]: { _ts: now } }
  return true
}

/** The Undo of a removal. */
export function restoreSleep(state, id, entry, now = Date.now()) {
  const v = readSleepEntry(entry)
  if (!v) return false
  const map = isMap(state.sleep) ? state.sleep : {}
  if (readSleepEntry(map[id])) return false
  state.sleep = { ...map, [id]: { d: v.d, s: v.s, e: v.e, ...(v.m ? { m: 1 } : {}), _ts: now } }
  return true
}

/** The sleep goal: the chosen minutes, else eight hours. */
export function sleepGoalOf(S) {
  const g = Math.round(Number(S?.sleepGoal))
  return Number.isFinite(g) && g >= 240 && g <= 720 ? g : SLEEP_GOAL_DEFAULT
}

/** Last night against the goal, for the Home ring: { d, min, goal, pct } or null. */
export function sleepProgress(S, today = todayISO()) {
  const night = lastNight(S, today)
  if (!night) return null
  const goal = sleepGoalOf(S)
  return { d: night.d, min: night.total, goal, pct: Math.min(1, night.total / goal) }
}
