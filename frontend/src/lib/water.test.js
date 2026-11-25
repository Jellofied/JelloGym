// Water (docs/LIFE_MODULES.md): the pure helpers, how two devices merge their drinks, and that
// the server's copy of the sync rules (api/sync-stamps.js) treats the map the same way.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { addWater, cupsOf, dayTotal, drinksOn, editWater, goalOf, goalProgress, lastUsed, ML_MAX, readWaterEntry, removeWater, restoreWater, waterDays, waterRows, waterSeries } from './water.js'
import { highestStamp, mergeStates, resetIdsOf, stampChange, STAMPED_MAPS } from './sync-merge.js'

const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))
const D = '2026-11-14'

describe('water: reading and writing', () => {
  it('logs a whole-ml entry with its own stamp and returns its id', () => {
    const S = base()
    const id = addWater(S, 250, { d: D, id: 'a1', now: 10 })
    expect(id).toBe('a1')
    expect(S.water.a1).toEqual({ d: D, ml: 250, _ts: 10 })
    expect(dayTotal(S, D)).toBe(250)
  })

  it('refuses a bad day, a bad amount and an over-full cup', () => {
    const S = base()
    expect(addWater(S, 250, { d: 'nope' })).toBe('invalid')
    expect(addWater(S, 0, { d: D })).toBe('invalid')
    expect(addWater(S, -5, { d: D })).toBe('invalid')
    expect(addWater(S, ML_MAX + 1, { d: D })).toBe('invalid')
    expect('water' in S).toBe(false)
    expect(addWater(S, 'x', { d: D })).toBe('invalid')
  })

  it('reads back a clean entry; a removed or junk one reads as none', () => {
    expect(readWaterEntry({ d: D, ml: 500, _ts: 1 })).toEqual({ d: D, ml: 500 })
    expect(readWaterEntry({ _ts: 5 })).toBeNull()
    for (const junk of [null, undefined, 'x', 3, [], { d: 'nope', ml: 1 }, { d: D, ml: 0 }, { d: D, ml: ML_MAX + 1 }, { d: D, ml: 'x' }]) {
      expect(readWaterEntry(junk), String(junk)).toBeNull()
    }
  })

  it('removes with a stamped empty entry and restores for the Undo', () => {
    const S = base({ water: { a1: { d: D, ml: 250, _ts: 10 } } })
    expect(removeWater(S, 'a1', 20)).toBe(true)
    expect(S.water.a1).toEqual({ _ts: 20 })
    expect(dayTotal(S, D)).toBe(0)
    expect(removeWater(S, 'a1', 21)).toBe(false)
    expect(restoreWater(S, 'a1', { d: D, ml: 250, _ts: 5 }, 30)).toBe(true)
    expect(S.water.a1).toEqual({ d: D, ml: 250, _ts: 30 })
    expect(restoreWater(S, 'a1', { d: D, ml: 250 }, 31)).toBe(false)
    expect(dayTotal(S, D)).toBe(250)
  })

  it('edits the amount on the spot, keeping the day', () => {
    const S = base({ water: { a1: { d: D, ml: 250, _ts: 10 }, gone: { _ts: 3 } } })
    expect(editWater(S, 'a1', 750, { now: 40 })).toBe(true)
    expect(S.water.a1).toEqual({ d: D, ml: 750, _ts: 40 })
    expect(editWater(S, 'gone', 500)).toBe(false)
    expect(editWater(S, 'nope', 500)).toBe(false)
    expect(editWater(S, 'a1', 0)).toBe(false)
  })

  it('lists the day newest first', () => {
    const S = base({ water: { a1: { d: D, ml: 250, _ts: 10 }, a2: { d: D, ml: 500, _ts: 30 }, a3: { d: '2026-11-13', ml: 300, _ts: 25 } } })
    expect(drinksOn(S, D).map(e => e.id)).toEqual(['a2', 'a1'])
    expect(dayTotal(S, '2026-11-13')).toBe(300)
  })

  it('the last used is the newest live amount, ignoring removals and junk', () => {
    const S = base({ water: { a1: { d: D, ml: 250, _ts: 10 }, a2: { _ts: 40 }, a3: { d: D, ml: 330, _ts: 20 } } })
    expect(lastUsed(S)).toBe(330)
    removeWater(S, 'a3', 50)
    expect(lastUsed(S)).toBe(250)
    expect(lastUsed(base())).toBe(null)
  })

  it('the cups are the chosen ones cleaned, or 250/500/750', () => {
    expect(cupsOf(base())).toEqual([250, 500, 750])
    expect(cupsOf(base({ waterCups: [300, 300, 500, 'x', -2, ML_MAX + 5] }))).toEqual([300, 500])
  })

  it('the goal is the chosen one, else ~33 ml/kg from the last weigh-in, else 2000', () => {
    expect(goalOf(base({ waterGoal: 2500 }))).toBe(2500)
    expect(goalOf(base({ unit: 'kg', bodyweight: [{ d: D, w: 80.4 }] }))).toBe(2650)
    expect(goalOf(base({ unit: 'lb', bodyweight: [{ d: D, w: 176 }], waterGoal: 0 }))).toBe(2650)
    expect(goalOf(base())).toBe(2000)
    expect(goalOf(base({ waterGoal: -5, bodyweight: [] }))).toBe(2000)
  })

  it('the day progress carries totals and a clamped pct for the ring', () => {
    const S = base({ water: { a1: { d: D, ml: 750, _ts: 1 } }, waterGoal: 1500 })
    expect(goalProgress(S, D)).toEqual({ d: D, ml: 750, goal: 1500, pct: 0.5 })
    const more = clone(S); more.water.a2 = { d: D, ml: 1200, _ts: 2 }
    expect(goalProgress(more, D).pct).toBe(1)
  })

  it('days and rows: grouped totals, one row per live drink, range honoured', () => {
    const S = base({ water: { a1: { d: '2026-11-12', ml: 500, _ts: 1 }, a2: { d: D, ml: 250, _ts: 2 }, a3: { _ts: 3 }, a4: { d: 'bad', ml: 250, _ts: 4 } } })
    expect(waterDays(S)).toEqual([{ d: '2026-11-12', ml: 500 }, { d: D, ml: 250 }])
    expect(waterRows(S)).toEqual([['2026-11-12', '500'], ['2026-11-14', '250']])
    expect(waterRows(S, { from: '2026-11-13' })).toEqual([['2026-11-14', '250']])
  })


  it('the chart buckets: 14 days, 12 weekly and 12 monthly daily averages, gaps at zero', () => {
    const S = base({ waterGoal: 2000, water: { a1: { d: D, ml: 1000, _ts: 1 }, a2: { d: '2026-11-12', ml: 1800, _ts: 2 } } })
    const day = waterSeries(S, 'day', D)
    expect(day.goal).toBe(2000)
    expect(day.points.map(p => p.d).length).toBe(14)
    expect(day.points.at(-1).y).toBe(1000)
    expect(day.points.at(-2).y).toBe(0)          // a day without drinks shows as a gap, not a skip
    const wk = waterSeries(S, 'week', D)          // D is a Saturday; the Monday-first week starts 11-09
    expect(wk.points.length).toBe(12)
    expect(wk.points.at(-1).d).toBe('2026-11-09')
    expect(wk.points.at(-1).y).toBe(400)          // 2800 ml / 7 days
    expect(wk.points.at(-2).y).toBe(0)
    const mo = waterSeries(S, 'month', D)
    expect(mo.points.length).toBe(12)
    expect(mo.points.at(-1).d).toBe('2026-11-01')
    expect(mo.points.at(-1).y).toBe(93)           // 2800 ml / 30 days
  })
})

describe('water across devices', () => {
  it('two devices each adding a drink on the same day keep both', () => {
    const phone = base({ _ts: 100, water: { p1: { d: D, ml: 250, _ts: 90 } } })
    const desk = base({ _ts: 200, water: { d1: { d: D, ml: 500, _ts: 20 } } })
    for (const m of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      expect(Object.keys(m.water).sort()).toEqual(['d1', 'p1'])
      expect(dayTotal(m, D)).toBe(750)
    }
  })

  it('a removed drink stays removed against the other device’s older copy', () => {
    const removed = base({ _ts: 100 })
    removeWater(removed, 'p1', 300)
    removed.water = { p1: { _ts: 300 } }
    const stale = base({ _ts: 900, water: { p1: { d: D, ml: 250, _ts: 40 } } })
    for (const m of [mergeStates(removed, stale), mergeStates(stale, removed)]) {
      expect(m.water.p1).toEqual({ _ts: 300 })
      expect(dayTotal(m, D)).toBe(0)
    }
    const addedLater = base({ _ts: 50, water: { p2: { d: D, ml: 300, _ts: 350 } } })
    expect(dayTotal(mergeStates(removed, addedLater), D)).toBe(300)
  })

  it('a drink restored by the Undo beats the older removal', () => {
    const undone = base({ _ts: 100, water: { p1: { d: D, ml: 250, _ts: 95 } } })
    const stale = base({ _ts: 900, water: { p1: { _ts: 40 } } })
    for (const m of [mergeStates(undone, stale), mergeStates(stale, undone)]) expect(dayTotal(m, D)).toBe(250)
  })

  it('a copy from before water existed (no S.water at all) loses none of it', () => {
    const mine = base({ _ts: 100, water: { p1: { d: D, ml: 250, _ts: 90 } } })
    const old = base({ _ts: 500 })
    for (const m of [mergeStates(mine, old), mergeStates(old, mine)]) {
      expect(dayTotal(m, D)).toBe(250)
      expect(m.water.p1).toEqual({ d: D, ml: 250, _ts: 90 })
    }
    expect('water' in mergeStates(base({ _ts: 500 }), base({ _ts: 600 }))).toBe(false)
  })

  it('a change that logs a drink stamps it after everything the copy has seen', () => {
    const prev = base({ _ts: 1000, water: { p1: { d: D, ml: 250, _ts: 900 } } })
    const next = clone(prev)
    addWater(next, 300, { d: D, id: 'p2', now: 5 })
    const at = stampChange(prev, next, 5)
    expect(at).toBeGreaterThan(1000)
    expect(next.water.p2._ts).toBe(at)
    expect(next.water.p1._ts).toBe(900)
    expect(highestStamp(next)).toBe(at)
  })

  it('“Reset everything” wipes the drinks of a copy that has not seen the reset', () => {
    const before = base({ _ts: 1000, water: { p1: { d: D, ml: 250, _ts: 900 } } })
    const reset = base({ _ts: 2000, resetAt: 2000, resetIds: resetIdsOf(before) })
    expect(reset.resetIds.water).toEqual(['p1'])
    const stale = clone(before); stale._ts = 2100
    for (const m of [mergeStates(reset, stale), mergeStates(stale, reset)]) {
      expect(m.water && m.water.p1 ? dayTotal(m, D) : 0).toBe(0)
    }
  })

  it('the server’s sync rules know the map: same list, same highest stamp, never stamped as a setting', () => {
    expect(STAMPED_MAPS).toContain('water')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const doc = { _ts: 5, water: { p1: { d: D, ml: 250, _ts: 77 } } }
    expect(Server.highestStamp(doc)).toBe(77)
    expect(highestStamp(doc)).toBe(77)
    const cur = { _ts: 10, unit: 'kg', workouts: [], water: { p1: { d: D, ml: 250, _ts: 9 } } }
    const next = { _ts: 11, unit: 'kg', workouts: [], restSec: 60 }
    Server.stampPut(cur, next, { overRead: true, now: 20 })
    expect(next.water).toEqual(cur.water)
    expect(next.edited?.water).toBeUndefined()
  })
})
