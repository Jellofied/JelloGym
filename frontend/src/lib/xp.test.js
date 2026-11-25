// XP and levels (Levels 5a): the slow curve, the registry's gating, consistency over grinding,
// no daily cap, and history-only derivation.
import { describe, expect, it } from 'vitest'
import { XP_POINTS, XP_WEEK_BONUS_MAX, freezeBank, levelFor, weekXp, xpForLevel, xpTotals } from './xp.js'
import { weekKey } from './format.js'

const iso = n => { const d = new Date(Date.UTC(2026, 10, 14)); d.setUTCDate(d.getUTCDate() + n); const x = new Date(d.getTime() + 12 * 3600e3); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') }
const T = iso(0)                                       // '2026-11-14', a Saturday
const wkT = weekKey(T, 1)                              // Mon 2026-11-09
const S = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, routines: [], workouts: [], _ts: 1,
  waterGoal: 1000, ...over,
})
const at = (d, h = 18) => new Date(d + 'T12:00:00').setHours(h)
const session = (d, i = 0) => ({ id: 'w' + d + i, d, start: at(d), end: at(d) + 3600e3 })

describe('the curve', () => {
  it('is 50·L·(L+1) and deliberately slow', () => {
    expect(xpForLevel(1)).toBe(100)
    expect(xpForLevel(5)).toBe(1500)
    expect(xpForLevel(10)).toBe(5500)
    expect(xpForLevel(20)).toBe(21000)
    expect([levelFor(0), levelFor(99), levelFor(100), levelFor(1499), levelFor(5500)]).toEqual([0, 0, 1, 4, 10])
    expect(freezeBank(8)).toBe(2)
  })
})

describe('the registry', () => {
  it('workouts count whatever the modules say, and off modules add nothing', () => {
    const s = S({ workouts: [session(iso(-2))] })
    const w = xpTotals(s, T)
    expect(w.bySource.workouts).toMatchObject({ n: 1, xp: XP_POINTS.session })
    expect(w.bySource.water).toBeUndefined()
    const on = S({ modules: { water: true }, workouts: [session(iso(-2))], water: { a: { d: iso(-2), ml: 1000, _ts: 1 } } })
    expect(xpTotals(on, T).bySource.water).toMatchObject({ n: 1 })
  })
  it('a module switched off again stops its XP where it was: totals read the toggle each pass', () => {
    const on = S({ modules: { water: true }, water: { a: { d: T, ml: 1000, _ts: 1 } } })
    expect(xpTotals(on, T).bySource.water.xp).toBe(XP_POINTS.goalDay)
    expect(xpTotals(S({ modules: { water: false }, water: on.water }), T).bySource.water).toBeUndefined()
  })
  it('no daily cap: two sessions in one day pay twice', () => {
    const s = S({ workouts: [session(T, 1), session(T, 2)] })
    const w = weekXp(s, wkT, T)
    expect(w.bySource.workouts.xp).toBe(XP_POINTS.session * 2)
  })
  it('habit checks pay per check, skipping tombstones and skips', () => {
    const s = S({ modules: { habits: true }, habitLogs: {
      a: { h: 'h1', d: T, sec: 600, _ts: 1 }, b: { h: 'h1', d: iso(-1), skip: 1, _ts: 2 }, c: { _ts: 3 },
    } })
    const w = weekXp(s, wkT, T)
    expect(w.bySource.habits).toMatchObject({ n: 1, xp: XP_POINTS.habitCheck })
  })
})

describe('consistency beats grinding', () => {
  it('the same water drunk on one day loses to the goal met across the week', () => {
    const grind = S({ modules: { water: true }, water: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['g' + i, { d: T, ml: 250, _ts: i + 1 }])) })
    const steady = S({ modules: { water: true }, water: Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['s' + i, { d: iso(i - 6), ml: 1000, _ts: i + 1 }])) })
    const g = weekXp(grind, wkT, T)
    const w = weekXp(steady, wkT, T)
    expect(w.base).toBeGreaterThan(g.base)
    expect(w.bonus).toBeGreaterThan(g.bonus)
    expect(w.total).toBeGreaterThan(g.total)
    expect(g.bonus).toBeLessThanOrEqual(XP_WEEK_BONUS_MAX)
  })
  it('a full training week pays its bonus; a half week half of it, rounded', () => {
    const s = S({ routines: [{ id: 'r', name: 'Push' }], week: { 1: 'r', 3: 'r', 5: 'r' }, workouts: [session(iso(-5)), session(iso(-3)), session(iso(-1))] })
    expect(weekXp(s, wkT, T).bonus).toBe(XP_WEEK_BONUS_MAX)
    const half = { ...s, workouts: [session(iso(-5))] }
    expect(weekXp(half, wkT, T).bonus).toBe(Math.round(XP_WEEK_BONUS_MAX / 3))
  })
})

describe('a history of only workouts still reads a level', () => {
  it('walks from the oldest week to today', () => {
    const weeks = 12
    const workouts = []
    for (let w = 0; w < weeks; w++) for (const off of [0, 2, 4]) workouts.push(session(iso(-(weeks * 7 - 1 - w * 7 - off))))
    const x = xpTotals(S({ workouts }), T)
    expect(x.weeks.length).toBe(13)   // the oldest week through the present one
    // 12 weeks of three honest sessions: 60 xp base + the 20 bonus, week after week, less today's open one.
    expect(x.xp).toBeGreaterThan(500)
    expect(x.level).toBeGreaterThanOrEqual(3)
    expect(x.into).toBe(x.xp - xpForLevel(x.level))
    expect(x.forNext).toBe(xpForLevel(x.level + 1) - xpForLevel(x.level))
  })
  it('an empty history is level zero without a crash', () => {
    const x = xpTotals(S(), T)
    expect(x).toMatchObject({ xp: 0, level: 0, weeks: [], bySource: {} })
  })
})

describe('the week counts are only a faster way to read the same history', () => {
  it('xpTotals matches a week-by-week walk through the uncached rules', () => {
    const s = S({
      modules: { water: true, habits: true },
      workouts: [session(iso(-27)), null, { d: '' }, session(iso(-2)), session(iso(-2), 9)],
      water: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['w' + i, { d: iso(-27 + i * 2), ml: 1000, _ts: i + 1 }])),
      habitDefs: { h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 } },
      habitLogs: {
        a: { h: 'h1', d: iso(-27), _ts: 1 },
        b: { h: 'h1', d: iso(-27), skip: 1, _ts: 2 },
        c: { h: 'h1', d: iso(-1), _ts: 3 },
        d: { h: 'h1', d: iso(-1), _ts: 0 },
        e: { _ts: 4 },
        f: { h: 'h1', d: 'bad', _ts: 5 },
      },
    })
    const reference = { weeks: [], bySource: {} }
    for (let i = 0; i < 5; i++) {
      const w = weekXp(s, weekKey(iso(-28 + i * 7), 1), T)
      if (!w) continue
      reference.weeks.push(w)
      for (const [id, r] of Object.entries(w.bySource)) {
        if (!reference.bySource[id]) reference.bySource[id] = { n: 0, xp: 0, unit: r.unit }
        reference.bySource[id].n += r.n
        reference.bySource[id].xp += r.xp
      }
    }
    // The fixture has to exercise both grouped sources, or the equality test proves nothing.
    expect(reference.bySource.workouts.n).toBe(3)
    expect(reference.bySource.habits.n).toBe(2)
    const xp = reference.weeks.reduce((sum, w) => sum + w.total, 0)
    const level = levelFor(xp)
    expect(xpTotals(s, T)).toEqual({
      xp, level,
      into: xp - xpForLevel(level),
      forNext: xpForLevel(level + 1) - xpForLevel(level),
      weeks: reference.weeks,
      bySource: reference.bySource,
    })
  })

  it('a 40-week walk reads the habit log a bounded number of times, not once per week', () => {
    let walks = 0
    const logs = new Proxy({}, { ownKeys(t) { walks++; return Reflect.ownKeys(t) } })
    for (let i = 0; i < 40; i++) logs['l' + i] = { h: 'h1', d: iso(-7 * i), _ts: i + 1 }
    const s = S({
      modules: { habits: true },
      habitDefs: { h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 } },
      habitLogs: logs,
    })
    const x = xpTotals(s, T)
    expect(x.weeks.length).toBeGreaterThan(35)
    expect(x.bySource.habits.n).toBe(40)
    // The first log read finds the oldest week, the second builds the counts, the day index
    // inside the bonus uses the third. A per-week scan would be 40 or more.
    expect(walks).toBeLessThanOrEqual(3)
  })
})
