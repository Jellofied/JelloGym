// Levels 5c: badge eligibility is derived, dates are stored once, the freeze pool is earned by
// level and spent on habit breaks oldest-first, and the two new maps hold their sync registration.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { badgesOf, freezePlan, freezePool, markUnlocksSeen, newUnlocks, recordFreezeUses } from './levels.js'
import { STAMPED_MAPS, mergeStates } from './sync-merge.js'
import { addHabit, logHabit } from './habits.js'
import { xpForLevel } from './xp.js'

const iso = n => { const d = new Date(Date.UTC(2026, 10, 14)); d.setUTCDate(d.getUTCDate() + n); return new Date(d.getTime() + 12 * 3600e3).toISOString().slice(0, 10) }
const T = iso(0)
const base = (over = {}) => ({ unit: 'kg', week: {}, dayPlan: {}, routines: [], workouts: [], _ts: 1, ...over })
const at = d => new Date(d + 'T12:00:00').setHours(18)
const session = (d, i = 0) => ({ id: 'w' + d + i, d, start: at(d), end: at(d) + 3600e3 })

// Enough honest weeks to reach level five.
const veteran = () => {
  const S = base({ workouts: [] })
  for (let w = 0; w < 26; w++) for (const off of [0, 2, 4]) S.workouts.push(session(iso(-(25 - w) * 7 - off)))
  return S
}

describe('badges', () => {
  it('eligibility is derived; dates exist only once stored', () => {
    const S = veteran()
    const b = badgesOf(S, T)
    const l5 = b.find(x => x.key === 'level5')
    expect(l5.earned).toBe(true)
    expect(l5.date).toBe(null)
    const stored = { ...S, badges: { level5: { d: '2026-09-01', _ts: 5 } } }
    expect(badgesOf(stored, T).find(x => x.key === 'level5').date).toBe('2026-09-01')
    expect(badgesOf(base(), T).find(x => x.key === 'level5').earned).toBe(false)
  })
  it('a fresh unlock shows up once, and marking it seen stamps the date and clears the diff', () => {
    const S = veteran()
    const items = newUnlocks(S, T)
    expect(items.some(i => i.kind === 'level' && i.level >= 1)).toBe(true)
    expect(items.some(i => i.kind === 'badge' && i.key === 'level5')).toBe(true)
    markUnlocksSeen(S, items, T)
    expect(newUnlocks(S, T)).toEqual([])
    expect(S.badges.level5.d).toBe(T)
    expect(S.levelSeen).toBeGreaterThanOrEqual(1)
  })
  it('100 sessions and the perfect week light only when they really happened', () => {
    const many = base({ workouts: Array.from({ length: 100 }, (_, i) => session(iso(-(100 - i)))) })
    expect(badgesOf(many, T).find(x => x.key === 'sessions100').earned).toBe(true)
    expect(badgesOf(base(), T).find(x => x.key === 'sessions100').earned).toBe(false)
    // perfect days need something owed and kept: a trained week with every owed day trained
    const s = base({ workouts: Array.from({ length: 8 }, (_, i) => session(iso(-(7 - i)))) })
    expect(badgesOf(s, T).find(x => x.key === 'perfect7').earned).toBe(true)
    expect(badgesOf(base({ workouts: [session(T)] }), T).find(x => x.key === 'perfect7').earned).toBe(false)
  })
  it('both new maps are registered on both sides of the sync', () => {
    expect(STAMPED_MAPS).toContain('badges')
    expect(STAMPED_MAPS).toContain('freezeUsed')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const m = mergeStates({ _ts: 1, workouts: [], badges: { level5: { d: '2026-09-01', _ts: 5 } } }, { _ts: 2, workouts: [] })
    expect(m.badges.level5).toEqual({ d: '2026-09-01', _ts: 5 })
  })
})

describe('streak freezes', () => {
  const withGaps = () => {
    const S = base({ modules: { habits: true, levels: true }, habitDefs: {}, habitLogs: {}, freezeUsed: {} })
    addHabit(S, { name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' } }, { id: 'h1', now: new Date(iso(-10) + 'T12:00:00').getTime() })
    for (const d of [iso(-9), iso(-8), iso(-7)]) logHabit(S, 'h1', { d, sec: 1200, id: 'l' + d, now: 1 })
    // iso(-6), iso(-5) missed; iso(-4) checked; iso(-3..-1) missed; today T open.
    logHabit(S, 'h1', { d: iso(-4), sec: 1200, id: 'x', now: 2 })
    return S
  }
  it('the pool is earned by level, minus the uses', () => {
    const S = base({ levelSeen: 0 })
    expect(freezePool(S)).toEqual({ earned: 0, used: 0, left: 0 })
    const rich = base({ workouts: Array.from({ length: 60 }, (_, i) => session(iso(-(60 - i)))), freezeUsed: { 'h1|d': { h: 'h1', d: iso(-6), _ts: 1 } } })
    const p = freezePool(rich)
    expect(p.earned).toBeGreaterThanOrEqual(1)
    expect(p.used).toBe(1)
    expect(p.left).toBe(Math.max(0, p.earned - 1))
  })
  it('breaks are frozen oldest-first, only as many as the pool allows', () => {
    const S = withGaps()
    const noPool = freezePlan(S, 'h1', 0, T)
    expect(noPool.missed.length).toBeGreaterThan(0)
    expect(noPool.fresh).toEqual([])
    const two = freezePlan(S, 'h1', 2, T)
    expect(two.fresh.length).toBe(2)
    expect(two.fresh[0].d < two.fresh[1].d).toBe(true)
  })
  it('a recorded use is history: it stays covered even when the pool is spent', () => {
    const S = withGaps()
    const two = freezePlan(S, 'h1', 2, T)
    recordFreezeUses(S, 'h1', two.fresh)
    expect(Object.keys(S.freezeUsed).length).toBe(2)
    const none = freezePlan(S, 'h1', 0, T)
    expect(none.fresh).toEqual([])
    // re-recording changes nothing
    expect(recordFreezeUses(S, 'h1', two.fresh)).toBe(false)
  })
  it('devices agree: two recorded uses merge to both, newest stamp wins per key', () => {
    const a = base({ _ts: 1, freezeUsed: { 'h1|2026-11-08': { h: 'h1', d: '2026-11-08', _ts: 10 } } })
    const b = base({ _ts: 2, freezeUsed: { 'h1|2026-11-07': { h: 'h1', d: '2026-11-07', _ts: 20 } } })
    expect(Object.keys(mergeStates(a, b).freezeUsed).sort()).toEqual(['h1|2026-11-07', 'h1|2026-11-08'])
  })
})
