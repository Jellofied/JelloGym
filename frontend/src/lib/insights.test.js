// Insights (lib/insights.js): the two-sides rule, the module gating, and the wording. The numbers
// come from the modules' own helpers, so what is pinned here is when a comparison is worth showing,
// how many days it counted, and that it never claims a cause.
import { describe, expect, it } from 'vitest'
import { insights, LOOK_BACK, MIN_SIDE, SLEEP_SPLIT_MIN } from './insights.js'
import { addDays } from './life-stats.js'
import { workoutVolume } from './history.js'
import { fmtNum } from './format.js'

const T = '2026-11-14'                                  // a Saturday
const D = n => addDays(T, -n)
const at = (iso, hours) => Date.parse(iso + 'T12:00:00Z') + hours * 3600000

const base = (over = {}) => ({
  unit: 'kg', weekStart: 1, week: {}, dayPlan: {}, routines: [], workouts: [], bodyweight: [],
  water: {}, habitDefs: {}, habitLogs: {}, steps: {}, sleep: {}, food: {}, modules: {}, _ts: 0, ...over,
})

// One session: a single barbell exercise, one working set at `kg`.
const session = (d, kg) => ({
  id: 'w' + d, d, start: at(d, 17), end: at(d, 18), name: 'Push',
  entries: [{ id: '0025', target: { id: '0025', sets: 1, reps: 5 }, sets: [{ w: kg, r: 5, done: true }] }],
})

/**
 * Sixty days: 40 trained (the first 20 after eight hours, the next 20 after six) and 20 off days
 * with seven hours each, so every comparison has both sides. Water, steps and one habit run the
 * whole way; checks are denser on training days, which is what the habits insight counts.
 */
const fixture = (over = {}) => {
  const S = base(over)
  S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }]
  S.week = { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }
  S.habitDefs.h1 = { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 }
  for (let i = 60; i >= 1; i--) {
    const d = D(i)
    const trained = i <= 40
    const hours = i <= 20 ? 8 : i <= 40 ? 6 : 7
    S.sleep['n' + d] = { d, s: at(d, -8), e: at(d, -8 + hours), _ts: 1 }
    S.water['w' + d] = { d, ml: 1200, _ts: 1 }
    S.water['v' + d] = { d, ml: 1000, _ts: 1 }         // 2 200 a day over the 2 000 default
    S.steps['s' + d] = { d, n: trained ? 11000 : 6000, o: 'com.x', _ts: 1 }
    if (trained && i % 2 === 0) S.habitLogs['c' + d] = { h: 'h1', d, _ts: 1 }
    if (trained) S.workouts.push(session(d, hours === 8 ? 100 : 60))
  }
  return S
}

describe('sleep and volume', () => {
  it('compares the two sides by their mean volume and says how many it looked at', () => {
    const list = insights(fixture({ modules: { sleep: true } }), T)
    const hit = list.find(i => i.id === 'sleep-volume')
    expect(hit.title).toBe('Sleep and volume')
    const hi = workoutVolume({ entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] })
    const lo = workoutVolume({ entries: [{ id: '0025', sets: [{ w: 60, r: 5, done: true }] }] })
    expect(hit.detail).toContain(fmtNum(hi))
    expect(hit.detail).toContain(fmtNum(lo))
    expect(hit.detail).toContain('20 and 20 sessions')
  })

  it('says nothing until both sides hold MIN_SIDE sessions', () => {
    const withSides = hi => {
      const S = base({ modules: { sleep: true } })
      for (let i = 1; i <= hi; i++) {
        const d = D(i)
        S.sleep['a' + d] = { d, s: at(d, -8), e: at(d, 0), _ts: 1 }        // eight hours
        S.workouts.push({ ...session(d, 100), id: 'ha' + d })
      }
      for (let i = 1; i <= MIN_SIDE; i++) {
        const d = D(hi + i)
        S.sleep['b' + d] = { d, s: at(d, -6), e: at(d, 0), _ts: 1 }        // six hours
        S.workouts.push({ ...session(d, 60), id: 'hb' + d })
      }
      return S
    }
    expect(insights(withSides(MIN_SIDE), T).map(i => i.id)).toContain('sleep-volume')
    expect(insights(withSides(MIN_SIDE - 1), T).map(i => i.id)).not.toContain('sleep-volume')
  })

  it('leaves a session whose night is missing out of both sides', () => {
    const S = fixture({ modules: { sleep: true } })
    S.sleep = {}
    expect(insights(S, T).map(i => i.id)).not.toContain('sleep-volume')
  })

  it('the documented lines: 180 days back, 14 a side, seven hours', () => {
    expect(LOOK_BACK).toBe(180)
    expect(MIN_SIDE).toBe(14)
    expect(SLEEP_SPLIT_MIN).toBe(420)
  })
})

describe('the modules decide', () => {
  it('a module that is off contributes no insight', () => {
    const ids = insights(fixture({ modules: { water: true, steps: true } }), T).map(i => i.id)
    expect(ids).toContain('water-training')
    expect(ids).toContain('steps-training')
    expect(ids).not.toContain('sleep-volume')
    expect(ids).not.toContain('sleep-training')
    expect(ids).not.toContain('habits-training')
  })

  it('Everything on gives the sleep, water, steps and habit comparisons', () => {
    const all = insights(fixture({ modules: { sleep: true, water: true, steps: true, habits: true } }), T)
    expect(all.map(i => i.id)).toEqual(expect.arrayContaining(
      ['sleep-volume', 'sleep-training', 'water-training', 'steps-training', 'habits-training']))
    expect(all.find(i => i.id === 'water-training').detail).toContain('40 of 40 training days')
    expect(all.find(i => i.id === 'steps-training').detail).toMatch(/11,000 steps/)
  })

  it('a habit that was deleted takes its old checks with it', () => {
    const S = fixture({ modules: { habits: true, water: true } })
    delete S.habitDefs.h1
    expect(insights(S, T).map(i => i.id)).not.toContain('habits-training')
  })

  it('a day with nothing logged anywhere gives no comparisons at all', () => {
    expect(insights(base({ modules: { sleep: true, water: true, steps: true, habits: true } }), T)).toEqual([])
  })
})

describe('patterns, not causes', () => {
  it('nothing says one thing made another happen', () => {
    const list = insights(fixture({ modules: { sleep: true, water: true, steps: true, habits: true } }), T)
    expect(list.length).toBeGreaterThan(0)
    for (const i of list) {
      expect(`${i.title} ${i.detail}`.toLowerCase()).not.toMatch(/because|caus|leads to|makes you|improv|helps|due to|results in|driven by|thanks to/)
    }
  })

  it('every insight counts its own days or sessions out loud', () => {
    for (const i of insights(fixture({ modules: { sleep: true, water: true, steps: true, habits: true } }), T)) {
      expect(i.detail).toMatch(/\d+\s*(sessions|days|nights|of)/)
    }
  })

  // The window is said in the sentence rather than assumed: the two sides are the days in the last
  // 180, not the days the module has existed, so a young profile's rest days include days it had
  // nothing to log. Wording is the honest fix, not a trimmed denominator.
  it('every insight names the window it counted, and what a rest day means', () => {
    const list = insights(fixture({ modules: { sleep: true, water: true, steps: true, habits: true } }), T)
    expect(list.length).toBeGreaterThan(0)
    for (const i of list) expect(i.detail, i.id).toContain(`the last ${LOOK_BACK} days`)
    const water = list.find(i => i.id === 'water-training')
    expect(water.detail).toMatch(/a day off is any day without a session/)
    expect(list.find(i => i.id === 'habits-training').detail).toMatch(/rest days/)
  })
})
