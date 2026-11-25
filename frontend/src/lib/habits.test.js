// Habits (docs/LIFE_MODULES.md slice 2a): the schedule maths, the streaks, and how the two maps
// survive the sync — including two devices checking in the same day and a delete-versus-add race.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import {
  HABIT_TYPES, SCHEDULE_KINDS, addHabit, dayState, editHabit, habitsAllMet, habitsOf, habitLogsOf,
  habitStreak, isRestDay, logHabit, plannedOn, readHabitDef, removeHabit, restoreHabit,
  restoreHabitLogs, todayList, uncheckHabit, weeklyConsistency,
} from './habits.js'
import { highestStamp, mergeStates, resetIdsOf, stampChange, STAMPED_MAPS } from './sync-merge.js'

const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], habitDefs: {}, habitLogs: {}, _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))
const T = '2026-11-14'                                // a Saturday
const D = n => new Date(Date.parse(T + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const mk = (state, raw, opts = {}) => addHabit(state, raw, { id: 'h1', now: Date.parse(T + 'T12:00:00Z'), ...opts })

describe('habits: definitions', () => {
  it('validates type, name, target and schedule', () => {
    const S = base()
    expect(mk(S, { name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' } })).toBe('h1')
    expect(readHabitDef(S.habitDefs.h1)).toMatchObject({ name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' } })
    const s2 = base()
    expect(addHabit(s2, { name: '', type: 'count', target: 8 })).toBe('invalid')
    expect(addHabit(s2, { name: 'x', type: 'nonsense', target: 8 })).toBe('invalid')
    expect(addHabit(s2, { name: 'x', type: 'count', target: 0 })).toBe('invalid')
    expect(addHabit(s2, { name: 'x', type: 'yesno', schedule: { kind: 'weekdays', days: [] } })).toBe('invalid')
    expect(addHabit(s2, { name: 'x', type: 'yesno', schedule: { kind: 'perWeek', n: 9 } })).toBe('invalid')
    expect(addHabit(s2, { name: 'x', type: 'yesno', schedule: { kind: 'everyNDays', n: 1 } })).toBe('invalid')
    expect(habitsOf(s2)).toEqual([])
  })
  it('edits keep the id and the creation moment; a removal is a stamped empty entry; the Undo restores', () => {
    const S = base()
    mk(S, { name: 'Read', type: 'timed', target: 20 })
    expect(editHabit(S, 'h1', { target: 30 }, { now: 500 })).toBe(true)
    expect(S.habitDefs.h1.target).toBe(30)
    expect(S.habitDefs.h1._ts).toBe(500)
    const made = S.habitDefs.h1.createdAt
    expect(editHabit(S, 'nope', {})).toBe(false)
    expect(removeHabit(S, 'h1', 600)).toBe(true)
    expect(S.habitDefs.h1).toEqual({ _ts: 600 })
    expect(removeHabit(S, 'h1', 601)).toBe(false)
    expect(habitsOf(S)).toEqual([])
    expect(restoreHabit(S, 'h1', { name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' }, createdAt: made }, 700)).toBe(true)
    expect(habitsOf(S).map(h => h.name)).toEqual(['Read'])
  })
})

describe('habits: schedules and rest days', () => {
  it('daily is due every day; weekdays only its own days', () => {
    const S = base()
    mk(S, { name: 'Stretch', type: 'timed', target: 5, schedule: { kind: 'weekdays', days: [1, 3, 5] } })
    const def = habitsOf(S)[0]
    expect(plannedOn(S, def, '2026-11-16')).toBe(true)    // Monday
    expect(plannedOn(S, def, '2026-11-17')).toBe(false)   // Tuesday
    expect(plannedOn(S, def, '2026-11-18')).toBe(true)    // Wednesday
    expect(plannedOn(S, def, '2026-11-14')).toBe(false)   // Saturday
  })
  it('everyNDays counts from creation, perWeek is never due on a day', () => {
    const createdAt = Date.parse('2026-11-10T12:00:00Z')
    const S = base()
    mk(S, { name: 'Legs', type: 'yesno', schedule: { kind: 'everyNDays', n: 3 } }, { now: createdAt })
    const def = habitsOf(S)[0]
    expect([def.createdAt]).toEqual([createdAt])
    expect(plannedOn(S, def, '2026-11-13')).toBe(true)
    expect(plannedOn(S, def, '2026-11-14')).toBe(false)
    const S2 = base()
    mk(S2, { name: 'Sauna', type: 'yesno', schedule: { kind: 'perWeek', n: 2 } })
    expect(plannedOn(S2, habitsOf(S2)[0], T)).toBe(false)
  })
  it('skipRest habits are not due on plan rest days, and a rest day is the plan saying nothing', () => {
    const S = base({ routines: [{ id: 'r', name: 'Push', ex: [] }], week: { 1: 'r' }, dayPlan: { '2026-11-17': 'rest' } })
    expect(isRestDay(S, '2026-11-16')).toBe(false)   // Monday holds the routine
    expect(isRestDay(S, '2026-11-17')).toBe(true)    // pinned rest
    expect(isRestDay(S, '2026-11-18')).toBe(true)    // Tuesday: nothing planned
    const S2 = base({ routines: [{ id: 'r', name: 'Push', ex: [] }], week: { 1: 'r' } })
    mk(S2, { name: 'Vitamins', type: 'yesno', schedule: { kind: 'daily' }, skipRest: true })
    const def = habitsOf(S2)[0]
    expect(plannedOn(S2, def, '2026-11-16')).toBe(true)    // a training day
    expect(plannedOn(S2, def, '2026-11-17')).toBe(false)   // rest → never due, never a break
  })
})

describe('habits: checking in', () => {
  const withHabit = (raw, over = {}) => {
    const S = base(over)
    mk(S, raw)
    return S
  }
  it('yesno takes one check and refuses a second; skip is its own entry', () => {
    const S = withHabit({ name: 'No sugar', type: 'yesno' })
    expect(logHabit(S, 'h1', { d: T, id: 'l1', now: 10 })).toBe('l1')
    expect(logHabit(S, 'h1', { d: T, id: 'l2', now: 11 })).toBe('dup')
    expect(dayState(S, habitsOf(S)[0], T)).toMatchObject({ done: true, cur: 1 })
    const S2 = withHabit({ name: 'No sugar', type: 'yesno' })
    expect(logHabit(S2, 'h1', { d: T, kind: 'skip', id: 's1', now: 10 })).toBe('s1')
    expect(dayState(S2, habitsOf(S2)[0], T)).toMatchObject({ done: false, skipped: true })
  })
  it('count sums the cups of the day, timed the seconds shown as minutes', () => {
    const S = withHabit({ name: 'Water pills', type: 'count', target: 8 })
    logHabit(S, 'h1', { d: T, n: 3, id: 'l1', now: 10 })
    logHabit(S, 'h1', { d: T, n: 4, id: 'l2', now: 11 })
    expect(dayState(S, habitsOf(S)[0], T)).toMatchObject({ cur: 7, target: 8, done: false })
    logHabit(S, 'h1', { d: T, n: 1, id: 'l3', now: 12 })
    expect(dayState(S, habitsOf(S)[0], T).done).toBe(true)
    const S2 = withHabit({ name: 'Meditate', type: 'timed', target: 10 })
    logHabit(S2, 'h1', { d: T, id: 't1', now: 10 })          // default = the whole target
    expect(dayState(S2, habitsOf(S2)[0], T)).toMatchObject({ cur: 10, done: true })
    const S3 = withHabit({ name: 'Meditate', type: 'timed', target: 10 })
    logHabit(S3, 'h1', { d: T, sec: 240, id: 't1', now: 10 })
    expect(dayState(S3, habitsOf(S3)[0], T)).toMatchObject({ cur: 4, done: false })
  })
  it('uncheck tombstones the day and the Undo list brings it all back', () => {
    const S = withHabit({ name: 'Water pills', type: 'count', target: 8 })
    logHabit(S, 'h1', { d: T, n: 3, id: 'l1', now: 10 })
    logHabit(S, 'h1', { d: T, n: 2, id: 'l2', now: 11 })
    const undone = uncheckHabit(S, 'h1', T, 20)
    expect(undone.map(u => u.id).sort()).toEqual(['l1', 'l2'])
    expect(S.habitLogs.l1).toEqual({ _ts: 20 })
    expect(dayState(S, habitsOf(S)[0], T).cur).toBe(0)
    expect(uncheckHabit(S, 'h1', T, 21)).toBe(null)
    restoreHabitLogs(S, undone, 22)
    expect(dayState(S, habitsOf(S)[0], T).cur).toBe(5)
    expect(S.habitLogs.l1.n).toBe(3)
  })
  it('refuses unknown habits, bad days and junk kinds', () => {
    const S = withHabit({ name: 'x', type: 'yesno' })
    expect(logHabit(S, 'nope', { d: T })).toBe('invalid')
    expect(logHabit(S, 'h1', { d: 'bad' })).toBe('invalid')
    expect(logHabit(S, 'h1', { d: T, kind: 'weird' })).toBe('invalid')
  })
})

describe('habits: streaks and consistency', () => {
  it('a daily run counts consecutive due days; today unchecked does not break it', () => {
    const S = base()
    mk(S, { name: 'Read', type: 'timed', target: 20 }, { now: Date.parse(D(-9) + 'T12:00:00Z') })
    for (let i = 1; i <= 9; i++) logHabit(S, 'h1', { d: D(-i), id: 'l' + i, now: i })
    expect(habitStreak(S, 'h1', T).current).toBe(9)
    expect(habitStreak(S, 'h1', D(0)).best).toBe(9)
    logHabit(S, 'h1', { d: T, id: 'ltoday', now: 99 })
    expect(habitStreak(S, 'h1', T).current).toBe(10)
  })
  it('a due day passed unchecked breaks the run; a skip entry keeps it', () => {
    const S = base()
    mk(S, { name: 'Read', type: 'timed', target: 20 }, { now: Date.parse(D(-6) + 'T12:00:00Z') })
    logHabit(S, 'h1', { d: D(-1), id: 'a', now: 1 })
    logHabit(S, 'h1', { d: D(-2), id: 'b', now: 2 })
    // D(-3) missed
    logHabit(S, 'h1', { d: D(-4), id: 'c', now: 3 })
    expect(habitStreak(S, 'h1', T).current).toBe(2)
    logHabit(S, 'h1', { d: D(-3), kind: 'skip', id: 's', now: 4 })
    expect(habitStreak(S, 'h1', T).current).toBe(4)
  })
  it('rest days never break a skipRest run; a due day passed unchecked always breaks the plain one', () => {
    // Week: Push on Mondays only → Tue–Sun are rest days for the plan.
    const S = base({ routines: [{ id: 'r', name: 'Push', ex: [] }], week: { 1: 'r' } })
    mk(S, { name: 'Vitamins', type: 'yesno', skipRest: true }, { id: 'a', now: Date.parse('2026-11-02T12:00:00Z') })
    addHabit(S, { name: 'Stretch', type: 'yesno' }, { id: 'b', now: Date.parse('2026-11-02T12:00:00Z') })
    logHabit(S, 'a', { d: '2026-11-11', id: 'x', now: 1 })    // Wed, a rest day: checked anyway
    logHabit(S, 'a', { d: '2026-11-10', id: 'y', now: 2 })    // Tue, a rest day: checked
    // Mon 11-09 is a due training day with nothing logged → it ends the walk either way.
    expect(habitStreak(S, 'a', '2026-11-14').current).toBe(2)   // the Wed+Tue checks, rests not breaking it
    expect(habitStreak(S, 'a', '2026-11-14').best).toBe(2)
    logHabit(S, 'b', { d: '2026-11-13', id: 'm', now: 3 })      // Fri: a rest day, but Stretch is not skipRest
    expect(habitStreak(S, 'b', '2026-11-14').current).toBe(1)   // Thu passed unchecked → broken at 1
  })
  it('perWeek habits streak in whole weeks reached; the open week does not break them', () => {
    const S = base()
    mk(S, { name: 'Sauna', type: 'yesno', schedule: { kind: 'perWeek', n: 2 } }, { now: Date.parse('2026-11-02T12:00:00Z') })
    logHabit(S, 'h1', { d: '2026-11-03', id: 'a', now: 1 })
    logHabit(S, 'h1', { d: '2026-11-04', id: 'b', now: 2 })   // week of Mon 11-02: reached
    logHabit(S, 'h1', { d: '2026-11-10', id: 'c', now: 3 })
    logHabit(S, 'h1', { d: '2026-11-11', id: 'd', now: 4 })   // week of 11-09: reached
    expect(habitStreak(S, 'h1', T).current).toBe(2)            // T sits inside the reached 11-09 week
    logHabit(S, 'h1', { d: '2026-11-17', id: 'e', now: 5 })   // week of 11-16: only one of two
    expect(habitStreak(S, 'h1', '2026-11-19').current).toBe(2) // the open week is neither counted nor a break
    logHabit(S, 'h1', { d: '2026-11-18', id: 'f', now: 6 })
    expect(habitStreak(S, 'h1', '2026-11-19').current).toBe(3) // reached, and it lands
  })
  it('weeklyConsistency reports the twelve closed weeks against their due days', () => {
    const S = base()
    mk(S, { name: 'Read', type: 'timed', target: 20, schedule: { kind: 'weekdays', days: [1, 3, 5] } }, { now: Date.parse('2026-11-02T12:00:00Z') })
    logHabit(S, 'h1', { d: '2026-11-04', id: 'a', now: 1 })   // Wed in the last closed week
    const w = weeklyConsistency(S, 'h1', T)
    expect(w.length).toBe(12)
    expect(w.at(-1)).toEqual({ key: '2026-11-02', done: 1, needed: 3 })  // Mon 2, Wed 4, Fri 6
    expect(w.at(-2).needed).toBe(0)                                      // nothing before creation
  })
})

describe('habits: the Home list', () => {
  it('rows carry done/due/rest and the week target for perWeek habits', () => {
    const S = base({ routines: [{ id: 'r', name: 'Push', ex: [] }], week: { 1: 'r' } })
    addHabit(S, { name: 'Vitamins', type: 'yesno', skipRest: true }, { id: 'a', now: Date.parse(T + 'T12:00:00Z') })
    addHabit(S, { name: 'Sauna', type: 'yesno', schedule: { kind: 'perWeek', n: 3 } }, { id: 'b', now: Date.parse(T + 'T12:00:00Z') })
    addHabit(S, { name: 'Water pills', type: 'count', target: 3 }, { id: 'c', now: Date.parse(T + 'T12:00:00Z') })
    logHabit(S, 'b', { d: T, id: 'x', now: 1 })
    logHabit(S, 'c', { d: T, n: 2, id: 'y', now: 2 })
    const rows = todayList(S, T)
    expect(rows.map(r => r.def.name)).toEqual(['Vitamins', 'Sauna', 'Water pills'])
    expect(rows[0]).toMatchObject({ rest: true, due: false, done: false })  // Saturday: no routine → skipRest exempts it
    expect(rows[1].week).toEqual({ done: 1, n: 3 })
    expect(rows[1].due).toBe(true)                                      // due all week until its count is reached
    expect(rows[2]).toMatchObject({ cur: 2, target: 3, done: false, due: true })
    expect(habitsAllMet(S, T)).toBe(false)
    logHabit(S, 'c', { d: T, n: 1, id: 'z', now: 3 })
    expect(habitsAllMet(S, T)).toBe(true)
  })
})

describe('habits across devices', () => {
  it('the maps are registered on both sides and never stamped as settings', () => {
    expect(STAMPED_MAPS).toContain('habitDefs')
    expect(STAMPED_MAPS).toContain('habitLogs')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const doc = { _ts: 5, habitLogs: { l1: { h: 'h1', d: T, n: 2, _ts: 77 } }, habitDefs: { h1: { name: 'x', type: 'yesno', _ts: 60 } } }
    expect(Server.highestStamp(doc)).toBe(77)
    expect(highestStamp(doc)).toBe(77)
    const cur = { _ts: 10, unit: 'kg', workouts: [], habitLogs: { l1: { h: 'h1', d: T, n: 2, _ts: 9 } } }
    const next = { _ts: 11, unit: 'kg', workouts: [] }
    Server.stampPut(cur, next, { overRead: true, now: 20 })
    expect(next.habitLogs).toEqual(cur.habitLogs)
    expect(next.edited?.habitLogs).toBeUndefined()
  })
  it('two devices checking in on the same day keep both entries', () => {
    const phone = base({ _ts: 100, habitLogs: { p1: { h: 'h1', d: T, n: 1, _ts: 90 } } })
    const desk = base({ _ts: 200, habitLogs: { d1: { h: 'h1', d: T, n: 2, _ts: 20 } } })
    for (const m of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      expect(Object.keys(m.habitLogs).sort()).toEqual(['d1', 'p1'])
    }
  })
  it('a check taken away stays away against the older copy; a later edit wins', () => {
    const gone = base({ _ts: 100 })
    gone.habitLogs = { p1: { _ts: 300 } }
    const stale = base({ _ts: 900, habitLogs: { p1: { h: 'h1', d: T, n: 5, _ts: 40 } } })
    for (const m of [mergeStates(gone, stale), mergeStates(stale, gone)]) expect(m.habitLogs.p1).toEqual({ _ts: 300 })
    const edited = base({ _ts: 50, habitLogs: { p1: { h: 'h1', d: T, n: 7, _ts: 350 } } })
    expect(mergeStates(gone, edited).habitLogs.p1.n).toBe(7)
  })
  it('a state that never used habits merges without inventing the keys', () => {
    const a = { _ts: 1, workouts: [] }, b = { _ts: 2, workouts: [] }
    expect('habitDefs' in mergeStates(a, b)).toBe(false)
    expect('habitLogs' in mergeStates(a, b)).toBe(false)
    const c = { _ts: 3, workouts: [], habitLogs: { x: { h: 'h1', d: T, _ts: 1 } } }
    expect(Object.keys(mergeStates(a, c).habitLogs)).toEqual(['x'])
  })
  it('“Reset everything” wipes the habits and their logs of a stale copy', () => {
    const before = base({ _ts: 1000, habitDefs: { h1: { name: 'Read', type: 'timed', target: 20, _ts: 900 } }, habitLogs: { l1: { h: 'h1', d: T, sec: 600, _ts: 900 } } })
    const reset = base({ _ts: 2000, resetAt: 2000, resetIds: resetIdsOf(before) })
    expect(reset.resetIds.habitDefs).toEqual(['h1'])
    expect(reset.resetIds.habitLogs).toEqual(['l1'])
    const stale = clone(before); stale._ts = 2100
    for (const m of [mergeStates(reset, stale), mergeStates(stale, reset)]) {
      expect(habitsOf(m).length + Object.values(m.habitLogs || {}).filter(e => e && e.d).length).toBe(0)
    }
  })
})
