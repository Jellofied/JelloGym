// Sleep (docs/LIFE_MODULES.md): the window maths, the manual-versus-hub rule for one night,
// late arrivals, naps, and the sync registration the server must mirror.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { addSleep, lastNight, mainSession, nightTotal, overlaps, readSleepEntry, removeSleep, restoreSleep, sleepGoalOf, sleepPoints, sleepProgress, sleepSessions } from './sleep.js'
import { mergeSleep } from './health-read.js'
import { highestStamp, mergeStates, resetIdsOf, STAMPED_MAPS } from './sync-merge.js'

const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const base = (over = {}) => ({ unit: 'kg', week: {}, dayPlan: {}, workouts: [], sleep: {}, _ts: 0, ...over })

describe('sleep: entries', () => {
  it('reads a clean session; junk and removals read as none', () => {
    const e = { d: '2026-11-14', s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 7), m: 1, _ts: 5 }
    expect(readSleepEntry(e)).toMatchObject({ d: '2026-11-14', min: 480, m: 1 })
    expect(readSleepEntry({ _ts: 3 })).toBeNull()
    expect(readSleepEntry({ d: '2026-11-14', s: 10, e: 10 })).toBeNull()
    expect(readSleepEntry({ d: 'bad', s: 1, e: at(2026, 11, 14, 7) })).toBeNull()
  })

  it('files a night past midnight under the day you woke up', () => {
    const S = base()
    const id = addSleep(S, { s: at(2026, 11, 13, 23, 30), e: at(2026, 11, 14, 7, 0), now: 100 })
    expect(S.sleep[id].d).toBe('2026-11-14')
    expect(nightTotal(S, '2026-11-14')).toBe(450)
  })

  it('refuses an impossible window', () => {
    const S = base()
    expect(addSleep(S, { s: 5, e: 5 })).toBe('invalid')
    expect(addSleep(S, { s: at(2026, 11, 12, 23), e: at(2026, 11, 14, 7) })).toBe('invalid')   // 32 h > 900 min
    expect(Object.keys(S.sleep).length).toBe(0)
  })

  it('naps are their own sessions and count into the night total, not the main one', () => {
    const S = base()
    addSleep(S, { s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 6), id: 'n1', now: 1 })
    addSleep(S, { s: at(2026, 11, 14, 13), e: at(2026, 11, 14, 13, 30), id: 'n2', now: 2 })
    expect(mainSession(S, '2026-11-14').min).toBe(420)
    expect(nightTotal(S, '2026-11-14')).toBe(450)
    expect(sleepSessions(S).length).toBe(2)
  })
})

describe('sleep: one night, two writers', () => {
  const night = { s: at(2026, 11, 13, 22, 50), e: at(2026, 11, 14, 7, 10) }
  it('a typed night and an older hub night: the typed one stands, the night stays one session', () => {
    const S = base()
    addSleep(S, { ...night, id: 'm1', now: 100 })
    mergeSleep(S, [{ id: 'rec1', s: night.s + 60000, e: night.e - 60000 }], { now: 50 })
    expect(S.sleep.m1.m).toBe(1)
    expect(sleepSessions(S).filter(x => overlaps(x, { ...night }) >= 0.5).length).toBe(1)
  })
  it('a hub read newer than the typed night takes the night and tombstones the manual one', () => {
    const S = base()
    addSleep(S, { ...night, id: 'm1', now: 100 })
    const changed = mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e }], { now: 200 })
    expect(changed.length).toBe(1)
    expect(S.sleep.m1).toEqual({ _ts: 200 })
    expect(sleepSessions(S).length).toBe(1)
    expect(sleepSessions(S)[0].m).toBeFalsy()
  })
  it('re-importing the same record adds nothing; a corrected one rewrites in place', () => {
    const S = base()
    const changed = mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e }], { now: 10 })
    expect(changed.length).toBe(1)
    const id = changed[0]
    expect(mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e }], { now: 11 })).toEqual([])
    const fixed = mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e + 600000 }], { now: 12 })
    expect(fixed).toEqual([id])
    expect(Object.keys(S.sleep).length).toBe(1)
    expect(sleepSessions(S)[0].min).toBe(Math.round((night.e + 600000 - night.s) / 60000))
  })
  it('a removed night is not re-imported back to life', () => {
    const S = base()
    const id = mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e }], { now: 10 })[0]
    removeSleep(S, id, 20)
    expect(mergeSleep(S, [{ id: 'rec1', s: night.s, e: night.e }], { now: 30 })).toEqual([])
    expect(S.sleep[id]).toEqual({ _ts: 20 })
  })
})

describe('sleep: reading it back', () => {
  it('lastNight finds the newest night on or before today, so a late arrival still shows', () => {
    const S = base()
    addSleep(S, { s: at(2026, 11, 11, 23), e: at(2026, 11, 12, 7), id: 'a', now: 1 })
    addSleep(S, { s: at(2026, 11, 12, 23, 30), e: at(2026, 11, 13, 8), id: 'b', now: 2 })
    const n = lastNight(S, '2026-11-14')
    expect(n.d).toBe('2026-11-13')
    expect(n.total).toBe(510)
    const p = sleepProgress(S, '2026-11-14')
    expect(p).toEqual({ d: '2026-11-13', min: 510, goal: 480, pct: 1 })
  })
  it('points carry the main session and note a nap', () => {
    const S = base()
    addSleep(S, { s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 6), id: 'a', now: 1 })
    addSleep(S, { s: at(2026, 11, 14, 13), e: at(2026, 11, 14, 13, 30), id: 'b', now: 2 })
    const p = sleepPoints(S, 3, '2026-11-14')
    expect(p.length).toBe(1)                                        // only nights with a session show
    expect(p[0]).toMatchObject({ d: '2026-11-14', y: 420, note: '+30 nap' })
  })
  it('goal defaults to 8 hours and the picker clamps it', () => {
    expect(sleepGoalOf(base())).toBe(480)
    expect(sleepGoalOf(base({ sleepGoal: 420 }))).toBe(420)
    expect(sleepGoalOf(base({ sleepGoal: 60 }))).toBe(480)
  })
  it('overlaps is the share of the shorter window the two share', () => {
    const a = { s: 0, e: 100 }, b = { s: 80, e: 300 }
    expect(overlaps(a, b)).toBeCloseTo(0.2)
    expect(overlaps(a, { s: 200, e: 300 })).toBe(0)
  })
})

describe('sleep across devices', () => {
  it('is registered on both sides and never stamped as a setting', () => {
    expect(STAMPED_MAPS).toContain('sleep')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const doc = { _ts: 5, sleep: { a: { d: '2026-11-14', s: 1, e: 2, _ts: 77 } } }
    expect(Server.highestStamp(doc)).toBe(77)
    expect(highestStamp(doc)).toBe(77)
    const cur = { _ts: 10, unit: 'kg', workouts: [], sleep: { a: { d: '2026-11-14', s: 1, e: 2, _ts: 9 } } }
    const next = { _ts: 11, unit: 'kg', workouts: [] }
    Server.stampPut(cur, next, { overRead: true, now: 20 })
    expect(next.sleep).toEqual(cur.sleep)
    expect(next.edited?.sleep).toBeUndefined()
  })
  it('two devices typing the same night keep both sessions until sync decides per id', () => {
    const a = base({ _ts: 100, sleep: { x1: { d: '2026-11-14', s: 10, e: 20, m: 1, _ts: 90 } } })
    const b = base({ _ts: 200, sleep: { x2: { d: '2026-11-14', s: 11, e: 21, m: 1, _ts: 50 } } })
    const m = mergeStates(a, b)
    expect(Object.keys(m.sleep).sort()).toEqual(['x1', 'x2'])
  })
  it('a removal wins against the older copy and a reset wipes the names', () => {
    const gone = base({ _ts: 100, sleep: { x1: { _ts: 300 } } })
    const stale = base({ _ts: 900, sleep: { x1: { d: '2026-11-14', s: 10, e: 20, _ts: 40 } } })
    for (const m of [mergeStates(gone, stale), mergeStates(stale, gone)]) expect(m.sleep.x1).toEqual({ _ts: 300 })
    const before = base({ _ts: 1000, sleep: { x1: { d: '2026-11-14', s: 10, e: 20, _ts: 900 } } })
    const reset = base({ _ts: 2000, resetAt: 2000, resetIds: resetIdsOf(before) })
    expect(reset.resetIds.sleep).toEqual(['x1'])
  })
  it('a state that never slept merges without inventing the key', () => {
    expect('sleep' in mergeStates({ _ts: 1, workouts: [] }, { _ts: 2, workouts: [] })).toBe(false)
  })
  it('the Undo restores a removed night', () => {
    const S = base()
    const id = addSleep(S, { s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 7), id: 'u1', now: 1 })
    removeSleep(S, id, 2)
    expect(restoreSleep(S, id, { d: '2026-11-14', s: at(2026, 11, 13, 23), e: at(2026, 11, 14, 7), m: 1 }, 3)).toBe(true)
    expect(S.sleep[id].m).toBeTruthy()
  })
})
