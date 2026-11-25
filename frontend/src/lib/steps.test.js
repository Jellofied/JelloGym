// Steps (docs/LIFE_MODULES.md): the derivation from hub records (including the phone-and-watch
// double-count case and the preferred source), and the sync rules the server must mirror.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { daySteps, readStepEntry, stepEntriesOn, stepOrigins, stepsGoalOf, stepsPoints, stepsProgress, stepsDays } from './steps.js'
import { highestStamp, mergeStates, resetIdsOf, STAMPED_MAPS } from './sync-merge.js'

const base = (over = {}) => ({ unit: 'kg', week: {}, dayPlan: {}, workouts: [], _ts: 0, ...over })
const D = '2026-11-14'

describe('steps: reading', () => {
  it('reads a clean entry; junk and removals read as none', () => {
    expect(readStepEntry({ d: D, n: 8123, o: 'com.x', _ts: 1 })).toEqual({ d: D, n: 8123, o: 'com.x' })
    expect(readStepEntry({ _ts: 3 })).toBeNull()
    expect(readStepEntry({ d: 'bad', n: 5 })).toBeNull()
    expect(readStepEntry({ d: D, n: -2 })).toBeNull()
    expect(readStepEntry(null)).toBeNull()
  })

  it('without a preferred source the biggest single origin wins, so a watch mirroring the phone never doubles the day', () => {
    const S = base({ steps: {
      a: { d: D, n: 9000, o: 'com.nothing.x', _ts: 1 },
      b: { d: D, n: 9000, o: 'com.android.healthfit', _ts: 1 },
      c: { d: D, n: 2000, o: 'com.samsung', _ts: 1 },
    } })
    expect(daySteps(S, D)).toBe(9000)
    expect(stepOrigins(S)).toEqual([{ o: 'com.nothing.x', days: 1 }, { o: 'com.android.healthfit', days: 1 }, { o: 'com.samsung', days: 1 }])
  })

  it('with a preferred source only that origin counts, even when it is the smaller one', () => {
    const S = base({ steps: {
      a: { d: D, n: 9000, o: 'com.nothing.x', _ts: 1 },
      b: { d: D, n: 4000, o: 'com.android.healthfit', _ts: 1 },
    }, stepsSource: 'com.android.healthfit' })
    expect(daySteps(S, D)).toBe(4000)
  })

  it('records from several origins on one day add inside their own origin only', () => {
    const S = base({ steps: {
      a: { d: D, n: 5000, o: 'com.x', _ts: 1 },
      b: { d: D, n: 3000, o: 'com.x', _ts: 2 },   // two batches, one watch: sums
      c: { d: D, n: 7800, o: 'com.y', _ts: 3 },   // the phone mirror: still counts alone
    } })
    expect(daySteps(S, D)).toBe(8000)   // one origin's own batches sum; the phone mirror never adds on top
  })

  it('goal defaults to 8000; progress clamps at one', () => {
    expect(stepsGoalOf(base())).toBe(8000)
    expect(stepsGoalOf(base({ stepsGoal: 12000 }))).toBe(12000)
    expect(stepsGoalOf(base({ stepsGoal: 7 }))).toBe(8000)
    const S = base({ steps: { a: { d: D, n: 20000, o: null, _ts: 1 } }, stepsGoal: 10000 })
    expect(stepsProgress(S, D)).toEqual({ d: D, n: 20000, goal: 10000, pct: 1 })
  })

  it('points fill every day of the window, empty ones at zero; days lists only what exists', () => {
    const S = base({ steps: { a: { d: '2026-11-12', n: 6000, o: null, _ts: 1 } } })
    const p = stepsPoints(S, 4, D)
    expect(p.map(x => [x.d, x.y])).toEqual([['2026-11-11', 0], ['2026-11-12', 6000], ['2026-11-13', 0], ['2026-11-14', 0]])
    expect(stepsDays(S)).toEqual([{ d: '2026-11-12', n: 6000 }])
    expect(stepEntriesOn(S, '2026-11-12').length).toBe(1)
  })
})

describe('steps across devices', () => {
  it('is registered on both sides and never stamped as a setting', () => {
    expect(STAMPED_MAPS).toContain('steps')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const doc = { _ts: 5, steps: { a: { d: D, n: 8000, o: 'x', _ts: 77 } } }
    expect(Server.highestStamp(doc)).toBe(77)
    expect(highestStamp(doc)).toBe(77)
    const cur = { _ts: 10, unit: 'kg', workouts: [], steps: { a: { d: D, n: 8000, _ts: 9 } } }
    const next = { _ts: 11, unit: 'kg', workouts: [] }
    Server.stampPut(cur, next, { overRead: true, now: 20 })
    expect(next.steps).toEqual(cur.steps)
    expect(next.edited?.steps).toBeUndefined()
  })

  it('late-arriving watch records from both devices merge into one set by their hub-derived ids', () => {
    const phoneA = base({ _ts: 100, steps: { h1: { d: D, n: 9000, o: 'com.nothing', _ts: 90 } } })
    const phoneB = base({ _ts: 200, steps: { h1: { d: D, n: 9000, o: 'com.nothing', _ts: 95 } } })
    const m = mergeStates(phoneA, phoneB)
    expect(Object.keys(m.steps)).toEqual(['h1'])
    expect(daySteps(m, D)).toBe(9000)
  })

  it('a removed record stays removed against the other copy', () => {
    const gone = base({ _ts: 100, steps: { h1: { _ts: 300 } } })
    const stale = base({ _ts: 900, steps: { h1: { d: D, n: 9000, o: 'x', _ts: 40 } } })
    for (const m of [mergeStates(gone, stale), mergeStates(stale, gone)]) expect(m.steps.h1).toEqual({ _ts: 300 })
  })

  it('a reset takes the steps down with it', () => {
    const before = base({ _ts: 1000, steps: { h1: { d: D, n: 9000, o: 'x', _ts: 900 } } })
    const reset = base({ _ts: 2000, resetAt: 2000, resetIds: resetIdsOf(before) })
    expect(reset.resetIds.steps).toEqual(['h1'])
    const stale = clone(before); stale._ts = 2100
    for (const m of [mergeStates(reset, stale), mergeStates(stale, reset)]) expect(daySteps(m, D)).toBe(0)
  })
})

const clone = o => JSON.parse(JSON.stringify(o))
