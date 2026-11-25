// The perfect day (Levels 5a/5b groundwork): what the day's enabled modules owed and got.
import { describe, expect, it } from 'vitest'
import { dayGoals, perfectDay } from './perfectday.js'

const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const T = '2026-11-14'                                  // a Saturday
const S = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, routines: [], workouts: [], _ts: 1,
  waterGoal: 1000, stepsGoal: 8000, sleepGoal: 480, foodGoalKcal: 2000, foodGoalProtein: 100,
  ...over,
})
const lifeOn = { water: true, habits: true, steps: true, sleep: true, food: true }

describe('day goals', () => {
  it('a bare day owes only training when nothing is planned', () => {
    expect(dayGoals(S(), T, T)).toEqual({ items: [], met: 0, total: 0 })
    const trained = dayGoals(S({ workouts: [{ id: 'w', d: T }] }), T, T)
    expect(trained.items).toEqual([{ id: 'workouts', met: true }])
    expect(perfectDay(S({ workouts: [{ id: 'w', d: T }] }), T, T)).toBe(true)
  })
  it('a planned-but-skipped day owes training and is not perfect', () => {
    const s = S({ routines: [{ id: 'r', name: 'Push' }], week: { 6: 'r' } })   // today is a Saturday
    const g = dayGoals(s, T, T)
    expect(g.items).toEqual([{ id: 'workouts', met: false }])
    expect(perfectDay(s, T, T)).toBe(false)
  })
  it('each module appears only when switched on', () => {
    const s = S({ modules: { water: true }, water: { a: { d: T, ml: 1200, _ts: 1 } } })
    const g = dayGoals(s, T, T)
    expect(g.items.map(i => i.id)).toContain('water')
    expect(g.items.find(i => i.id === 'water').met).toBe(true)
    const off = dayGoals(S({ water: { a: { d: T, ml: 1200, _ts: 1 } } }), T, T)   // water module absent = off
    expect(off.items.map(i => i.id)).not.toContain('water')
  })
  it('steps and sleep weigh what arrived; food only counts days with something logged', () => {
    const s = S({ modules: lifeOn, steps: { a: { d: T, n: 9000, o: 'x', _ts: 1 } }, sleep: {}, food: {} })
    const ids = dayGoals(s, T, T).items.map(i => i.id)
    expect(ids).toContain('steps')
    expect(ids).not.toContain('sleep')          // no session on the night: nothing owed
    expect(ids).not.toContain('food')
    const full = dayGoals(S({ modules: lifeOn, steps: { a: { d: T, n: 9000, _ts: 1 } }, food: { f: { d: T, kcal: 2100, protein: 110, _ts: 1 } }, sleep: { n: { d: T, s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 7), _ts: 1 } } }), T, T)
    expect(full.items.filter(i => i.met).map(i => i.id).sort()).toEqual(['food', 'sleep', 'steps'])
  })
  it('a future day owes nothing at all', () => {
    expect(dayGoals(S({ modules: lifeOn }), '2026-12-01', T)).toEqual({ items: [], met: 0, total: 0 })
    expect(perfectDay(S(), '2026-12-01', T)).toBe(false)
  })
  it('habits drop out on days nothing is due, and gate on rest days', () => {
    const s = S({ modules: { habits: true }, habitDefs: { h1: { name: 'Read', type: 'timed', target: 10, schedule: { kind: 'weekdays', days: [1] }, createdAt: at(2026, 11, 1, 12), _ts: 1 } } })
    expect(dayGoals(s, T, T).items.map(i => i.id)).not.toContain('habits')    // nothing due Saturday
    const due = S({ modules: { habits: true }, habitDefs: { h1: { name: 'Read', type: 'yesno', schedule: { kind: 'daily' }, skipRest: true, createdAt: at(2026, 11, 1, 12), _ts: 1 } } })
    // empty plan → every day is a rest day → the skipRest habit owes nothing
    expect(dayGoals(due, T, T).items.map(i => i.id)).not.toContain('habits')
  })
})
