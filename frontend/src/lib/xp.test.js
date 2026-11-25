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
