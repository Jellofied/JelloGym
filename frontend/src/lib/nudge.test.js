import { describe, expect, it } from 'vitest'
import { HABIT_COPY, NUDGE_COPY, NUDGE_TONES, WATER_COPY, habitNudgeFor, lineIndex, nudgeFor, nudgeMinute, toneOf, waterNudgeFor } from './nudge.js'
import { buildHabitNotifications, buildNudgeNotifications, buildWaterNotifications } from './mobile.js'
import { addHabit } from './habits.js'

// The same rules as api/nudge.js (api/test/nudge.test.js holds the mirror of these cases):
// a planned day with nothing logged is a miss; 3 misses in a row since the last workout and it
// goes quiet. 2026-09-07 is a Monday; Push on Mon/Wed/Fri.
const routines = [{ id: 'push', name: 'Push' }, { id: 'pull', name: 'Pull' }]
const S = (over = {}) => ({
  routines, week: { 1: 'push', 3: 'push', 5: 'push' }, dayPlan: {}, workouts: [],
  reminder: { on: true, time: '08:00', nudge: true, tone: 'friendly' }, ...over,
})
const w = d => ({ id: 'w' + d, d, routineId: 'push' })

describe('nudgeFor', () => {
  it('nudges a missed planned day, not a rest day or a trained one', () => {
    expect(nudgeFor(S({ workouts: [w('2026-09-04')] }), '2026-09-07')).toEqual(['push'])
    expect(nudgeFor(S({ workouts: [w('2026-09-04')] }), '2026-09-08')).toBeNull()
    expect(nudgeFor(S({ workouts: [w('2026-09-07')] }), '2026-09-07')).toBeNull()
    expect(nudgeFor(S({ workouts: [w('2026-09-04')], dayPlan: { '2026-09-07': 'rest' } }), '2026-09-07')).toBeNull()
  })

  it('backs off after 3 missed days in a row until the next workout', () => {
    const s = S({ workouts: [w('2026-09-04')] })
    expect(['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14'].map(d => !!nudgeFor(s, d))).toEqual([true, true, true, false])
    expect(nudgeFor(S({ workouts: [w('2026-09-04'), w('2026-09-15')] }), '2026-09-16')).toEqual(['push'])
  })

  it('in a coach week the day after a session is rest; the second day off is a miss', () => {
    const queue = { ids: ['push', 'pull'], since: 0, startsOn: '2026-09-07' }
    const s = S({ week: {}, queue, workouts: [{ id: 'a', d: '2026-09-07', routineId: 'push', start: 1 }] })
    expect(nudgeFor(s, '2026-09-08')).toBeNull()
    expect(nudgeFor(s, '2026-09-09')).toEqual(['pull'])
  })

  // A note is just a note: it does not excuse a missed day or change the back-off.
  it('still nudges a noted day', () => {
    const notes = { '2026-09-07': { tag: 'note', _ts: 1 } }
    expect(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: notes }), '2026-09-07')).toEqual(['push'])
    expect(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: { '2026-09-07': { text: 'Flight to Lisbon', _ts: 1 } } }), '2026-09-07')).toEqual(['push'])
    expect(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: { '2026-09-07': { _ts: 2 } } }), '2026-09-07')).toEqual(['push'])
    const s = S({ workouts: [w('2026-09-04')], dayNotes: notes })
    expect(['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14'].map(d => !!nudgeFor(s, d))).toEqual([true, true, true, false])
  })

  it('times the evening and reads the tone tolerantly', () => {
    expect(nudgeMinute('08:00')).toBe(1200)
    expect(nudgeMinute('19:15')).toBe(1275)
    expect(nudgeMinute('20:00')).toBeNull()
    expect(toneOf({ tone: 'guilt' })).toBe('guilt')
    expect(toneOf({ tone: 'nope' })).toBe('friendly')
    for (const k of NUDGE_TONES) expect(NUDGE_COPY[k].lines.length).toBeGreaterThanOrEqual(3)
  })
})

describe('buildNudgeNotifications (mobile)', () => {
  const now = new Date(2026, 8, 7, 12, 0) // Monday noon
  it('schedules the evening of each upcoming missed day, at most 3 past the last workout', () => {
    const n = buildNudgeNotifications(S({ workouts: [w('2026-09-04')] }), now)
    expect(n.map(x => [x.schedule.at.getDate(), x.schedule.at.getHours(), x.schedule.at.getMinutes()]))
      .toEqual([[7, 20, 0], [9, 20, 0], [11, 20, 0]])
    expect(n[0].title).toBe(NUDGE_COPY.friendly.title)
    expect(n[0].body).toBe(NUDGE_COPY.friendly.lines[lineIndex('2026-09-07', 4)].replace('{0}', 'Push'))
    expect(new Set(n.map(x => x.id)).size).toBe(3)
  })
  it('is off unless both the reminder and the nudge are on', () => {
    expect(buildNudgeNotifications(S({ reminder: { on: true, time: '08:00' } }), now)).toEqual([])
    expect(buildNudgeNotifications(S({ reminder: { on: false, nudge: true } }), now)).toEqual([])
    expect(buildNudgeNotifications(S({ workouts: [w('2026-09-04')], reminder: { on: true, nudge: true, time: '20:30' } }), now)).toEqual([])
  })
  it('skips today when it is trained, past its evening, or a session is on screen', () => {
    const trained = buildNudgeNotifications(S({ workouts: [w('2026-09-07')] }), now)
    expect(trained[0].schedule.at.getDate()).toBe(9)
    const late = buildNudgeNotifications(S({ workouts: [w('2026-09-04')] }), new Date(2026, 8, 7, 21, 0))
    expect(late[0].schedule.at.getDate()).toBe(9)
    const live = buildNudgeNotifications(S({ workouts: [w('2026-09-04')], active: { rid: 'push' } }), now)
    expect(live[0].schedule.at.getDate()).toBe(9)
  })
  it('does not skip today for a note', () => {
    const n = buildNudgeNotifications(S({ workouts: [w('2026-09-04')], dayNotes: { '2026-09-07': { tag: 'idea', _ts: 1 } } }), now)
    expect(n[0].schedule.at.getDate()).toBe(7)
  })
  it('takes the tone, and runs 2 hours after a late reminder', () => {
    const n = buildNudgeNotifications(S({ workouts: [w('2026-09-04')], reminder: { on: true, time: '19:00', nudge: true, tone: 'drill' } }), now)
    expect(n[0].title).toBe(NUDGE_COPY.drill.title)
    expect([n[0].schedule.at.getHours(), n[0].schedule.at.getMinutes()]).toEqual([21, 0])
  })
})

// The behind-on-water nudge (docs/LIFE_MODULES.md 1d). api/nudge.js holds the mirrored rule and
// api/test/nudge.test.js the mirrored cases; the phone schedules it at S.waterReminder.time.
const WD = '2026-09-07'
const WS = (over = {}) => S({ modules: { water: true }, waterReminder: { on: true, time: '18:00' }, ...over })
describe('waterNudgeFor', () => {
  it('is owed while the day is under half the chosen goal', () => {
    expect(waterNudgeFor(WS({ water: { a1: { d: WD, ml: 250, _ts: 1 } }, waterGoal: 2000 }), WD)).toEqual({ ml: 250, goal: 2000, left: 750 })
    expect(waterNudgeFor(WS({ water: {}, waterGoal: 2000 }), WD)).toEqual({ ml: 0, goal: 2000, left: 1000 })
  })
  it('falls back to ~33 ml/kg, else 2000 ml, when no goal is set', () => {
    expect(waterNudgeFor(WS({ bodyweight: [{ d: WD, w: 80 }] }), WD).goal).toBe(2650)
    expect(waterNudgeFor(WS({ unit: 'lb', bodyweight: [{ d: WD, w: 176 }] }), WD).goal).toBe(2650)
    expect(waterNudgeFor(WS({}), WD).goal).toBe(2000)
  })
  it('goes quiet once half is drunk, or the day is noted off', () => {
    expect(waterNudgeFor(WS({ water: { a1: { d: WD, ml: 1000, _ts: 1 } }, waterGoal: 2000 }), WD)).toBeNull()
    expect(waterNudgeFor(WS({ water: { a1: { d: WD, ml: 900, _ts: 1 } }, waterGoal: 2000 }), WD)).not.toBeNull()
  })
  it('says nothing when the Water module or the reminder is off', () => {
    expect(waterNudgeFor({ ...WS(), modules: { water: false } }, WD)).toBeNull()
    expect(waterNudgeFor({ ...WS(), waterReminder: { on: false } }, WD)).toBeNull()
    expect(waterNudgeFor(S({ water: {}, waterGoal: 2000 }), WD)).toBeNull()   // module absent = default off
  })
  it('counts only the day asked, ignoring tombstones and junk', () => {
    const st = WS({ waterGoal: 2000, water: { a1: { d: '2026-09-06', ml: 1000, _ts: 1 }, b: { _ts: 9 }, c: { d: WD, ml: 0, _ts: 3 } } })
    expect(waterNudgeFor(st, WD).left).toBe(1000)
  })
})

describe('buildWaterNotifications (mobile)', () => {  const now = new Date(2026, 8, 7, 12, 0) // Monday noon
  const day = n => n.map(x => x.schedule.at.getDate())
  it('schedules the check time of the week ahead while the day is behind', () => {
    const n = buildWaterNotifications(WS({ water: { a1: { d: WD, ml: 250, _ts: 1 } }, waterGoal: 2000 }), now)
    expect(day(n)).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(n[0].id).toBe(4000)
    expect([n[0].schedule.at.getHours(), n[0].schedule.at.getMinutes()]).toEqual([18, 0])
    expect(n[0].title).toBe(WATER_COPY.title)
    expect(n[0].body).toBe(WATER_COPY.lines[lineIndex(WD, WATER_COPY.lines.length)].replace('{0}', '750'))
    expect(new Set(n.map(x => x.id)).size).toBe(7)
  })
  it('logging the half day drops that day, as the rebuild after every save does', () => {
    const n = buildWaterNotifications(WS({ water: { a1: { d: WD, ml: 1000, _ts: 1 } }, waterGoal: 2000 }), now)
    expect(day(n)).toEqual([8, 9, 10, 11, 12, 13])
  })
  it('is quiet when the module or the reminder is off', () => {
    expect(buildWaterNotifications(WS({ modules: { water: false } }), now)).toEqual([])
    expect(buildWaterNotifications(S({ waterReminder: { on: true } }), now)).toEqual([])   // module absent = default off
  })
  it('today past its check time is not re-scheduled; the week ahead still is', () => {
    const n = buildWaterNotifications(WS({ waterGoal: 2000 }), new Date(2026, 8, 7, 19, 0))
    expect(day(n)).toEqual([8, 9, 10, 11, 12, 13])
  })
})

// The habit reminder digest (docs/LIFE_MODULES.md 2b). api/nudge.js holds the hand copy and
// api/test/nudge.test.js the mirrored cases.
const HS = (over = {}) => ({
  unit: 'kg', routines: [], week: {}, dayPlan: {}, workouts: [], habitDefs: {}, habitLogs: {},
  modules: { habits: true }, habitReminder: { on: true, time: '20:00' }, ...over,
})
const withHabit = (raw, ...over) => { const s = HS(...over); addHabit(s, raw, { id: 'h1', now: Date.parse('2026-09-01T12:00:00Z') }); return s }
describe('habitNudgeFor', () => {
  it('names the open habits that opted in', () => {
    const s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    expect(habitNudgeFor(s, '2026-09-07')).toEqual({ ids: ['h1'], names: 'Read' })
  })
  it('is quiet when checked, skipped, not opted in, module off or digest off', () => {
    let s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    s.habitLogs = { x: { h: 'h1', d: '2026-09-07', sec: 1200, _ts: 1 } }
    expect(habitNudgeFor(s, '2026-09-07')).toBe(null)
    s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    s.habitLogs = { x: { h: 'h1', d: '2026-09-07', skip: 1, _ts: 1 } }
    expect(habitNudgeFor(s, '2026-09-07')).toBe(null)
    expect(habitNudgeFor(withHabit({ name: 'Read', type: 'timed', target: 20 }), '2026-09-07')).toBe(null)
    expect(habitNudgeFor({ ...withHabit({ name: 'Read', type: 'timed', target: 20, remind: true }), modules: { habits: false } }, '2026-09-07')).toBe(null)
    expect(habitNudgeFor({ ...withHabit({ name: 'Read', type: 'timed', target: 20, remind: true }), habitReminder: { on: false } }, '2026-09-07')).toBe(null)
    expect(habitNudgeFor(HS(), '2026-09-07')).toBe(null)
  })
  it('two names join with plus, a third folds into +1', () => {
    const s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    addHabit(s, { name: 'Meditate', type: 'timed', target: 10, remind: true }, { id: 'h2', now: Date.parse('2026-09-01T12:00:00Z') })
    addHabit(s, { name: 'Stretch', type: 'timed', target: 5, remind: true }, { id: 'h3', now: Date.parse('2026-09-01T12:00:00Z') })
    expect(habitNudgeFor(s, '2026-09-07').names).toBe('Read + Meditate +1')
  })
  it('a weekdays habit only nags on its days', () => {
    const s = withHabit({ name: 'Stretch', type: 'timed', target: 5, remind: true, schedule: { kind: 'weekdays', days: [1, 3, 5] } })
    expect(habitNudgeFor(s, '2026-09-07')).not.toBeNull()   // Monday
    expect(habitNudgeFor(s, '2026-09-08')).toBeNull()       // Tuesday
  })
})

describe('buildHabitNotifications (mobile)', () => {
  const now = new Date(2026, 8, 7, 12, 0) // Monday noon
  it('schedules the digest for the days ahead that would come up open', () => {
    const s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    const n = buildHabitNotifications(s, now)
    expect(n.map(x => x.schedule.at.getDate())).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(n[0].id).toBe(5000)
    expect(n[0].title).toBe(HABIT_COPY.title)
    expect(n[0].body).toBe(HABIT_COPY.lines[lineIndex('2026-09-07', 4)].replace('{0}', 'Read'))
  })
  it('checked-in days drop out of the schedule', () => {
    const s = withHabit({ name: 'Read', type: 'timed', target: 20, remind: true })
    s.habitLogs = { x: { h: 'h1', d: '2026-09-07', sec: 1200, _ts: 1 } }
    expect(buildHabitNotifications(s, now).map(x => x.schedule.at.getDate())).toEqual([8, 9, 10, 11, 12, 13])
  })
})
