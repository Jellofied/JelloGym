import { describe, expect, test } from 'vitest'
import { recapPeriod, shownRecapPeriod, recapOf, recapDue, lifeRecapOf, lifeRecapDue, lifeOfYear } from './recap.js'
import { fmtDateRange } from './format.js'

const BENCH = '0025'
const wk = (d, n = 3, prs = []) => ({ id: 'w' + d, d, start: new Date(d + 'T10:00:00').getTime(), end: new Date(d + 'T11:00:00').getTime(), prs, entries: [{ id: BENCH, target: { mode: 'reps' }, sets: Array.from({ length: n }, () => ({ w: 100, r: 5, done: true })) }] })
const S = extra => ({ unit: 'kg', weekStart: 1, bodyweight: [], workouts: [wk('2026-10-20'), wk('2026-10-22', 3, [BENCH]), wk('2026-09-15')], ...extra })

describe('week and month recap', () => {
  test('a Monday looks back on last week, the 1st on last month, other days on nothing', () => {
    expect(recapPeriod(S(), '2026-10-26')).toEqual({ kind: 'week', from: '2026-10-19', to: '2026-10-25', key: 'w:2026-10-19' })
    expect(recapPeriod(S(), '2026-10-01')).toEqual({ kind: 'month', from: '2026-09-01', to: '2026-09-30', key: 'm:2026-09' })
    expect(recapPeriod(S(), '2026-10-28')).toBe(null)
    // a Sunday week start
    expect(recapPeriod(S({ weekStart: 0 }), '2026-10-25').kind).toBe('week')
  })
  test('the shown stretch is a real local week when no recap is due, never Invalid Date', () => {
    const p = shownRecapPeriod(S(), '2026-11-25')
    expect(p).toEqual({ kind: 'week', from: '2026-11-16', to: '2026-11-22', key: 'w:2026-11-16' })
    // This is the label /recap builds. With no `today` the old fallback made both ends NaN.
    const label = fmtDateRange(p.from, p.to, true, new Date('2026-11-25T12:00:00'))
    expect(label).toBe('Mon 16 Nov – Sun 22 Nov')
    expect(label).not.toContain('Invalid Date')
    expect(shownRecapPeriod(S(), '2026-10-26')).toEqual(recapPeriod(S(), '2026-10-26'))
  })
  test('the numbers are the report’s: workouts, volume, sets, PRs and the top muscle', () => {
    const r = recapOf(S(), recapPeriod(S(), '2026-10-26'), '2026-10-26')
    expect(r).toMatchObject({ kind: 'week', workouts: 2, volume: 3000, sets: 6, prs: 1, days: 2 })
    expect(r.top.slug).toBe('chest')
  })
  test('off, put away or a week without a workout: no card', () => {
    expect(recapDue(S(), '2026-10-26')).toBeTruthy()
    expect(recapDue(S({ recap: false }), '2026-10-26')).toBe(null)
    expect(recapDue(S({ recapSeen: 'w:2026-10-19' }), '2026-10-26')).toBe(null)
    expect(recapDue(S({ workouts: [] }), '2026-10-26')).toBe(null)
  })
})

const LIFES = extra => ({
  unit: 'kg', weekStart: 1, workouts: [wk('2026-10-20'), wk('2026-10-22')],
  dayPlan: {}, routines: [], week: [],
  modules: { water: true, habits: true },
  waterGoal: 1000,
  water: { a: { d: '2026-10-20', ml: 1200, _ts: 1 }, b: { d: '2026-10-21', ml: 800, _ts: 1 } },
  habitDefs: { h1: { name: 'Stretch', type: 'yesno', schedule: { kind: 'daily' }, _ts: 1 } },
  habitLogs: { l1: { h: 'h1', d: '2026-10-20', _ts: 1 }, l2: { h: 'h1', d: '2026-10-21', skip: 1, _ts: 1 } },
  ...extra,
})
const PERIOD = { kind: 'week', from: '2026-10-19', to: '2026-10-25', key: 'w:2026-10-19' }

describe('life recap', () => {
  test('enabled modules get a section, disabled ones are absent', () => {
    const r = lifeRecapOf(LIFES(), PERIOD, '2026-10-26')
    expect(r.modules.water).toEqual({ daysWithLogs: 2, met: 1, avg: 1000 })
    expect(r.modules.habits.checks).toBe(1)
    expect(r.modules.habits.skips).toBe(1)
    expect(r.modules.habits.dueDays).toBe(7)
    expect(r.modules.habits.allMetDays).toBe(2)
    expect(r.modules.steps).toBeUndefined()
    expect(r.hasAny).toBe(true)
    expect(r.hasData).toBe(true)
  })
  test('a dead week: nothing to show', () => {
    expect(lifeRecapOf(LIFES({ water: {} }), PERIOD, '2026-10-26').hasData).toBe(true) // habits still logged
    const r = lifeRecapOf(LIFES({ water: {}, habitLogs: {}, habitDefs: {} }), PERIOD, '2026-10-26')
    expect(r.hasData).toBe(false)
  })
  test('the due card: needs a life module on, something logged, and its own put-away', () => {
    expect(lifeRecapDue(LIFES(), '2026-10-26')).toBeTruthy()
    expect(lifeRecapDue(S(), '2026-10-26')).toBe(null)
    expect(lifeRecapDue(LIFES({ lifeRecapSeen: 'w:2026-10-19' }), '2026-10-26')).toBe(null)
    expect(lifeRecapDue(LIFES({ lifeRecap: false }), '2026-10-26')).toBe(null)
    expect(lifeRecapDue(LIFES({ water: {}, habitLogs: {}, habitDefs: {} }), '2026-10-26')).toBe(null)
    expect(lifeRecapDue(LIFES(), '2026-10-28')).toBe(null) // not a due day
  })
  test('the year pass: buckets by day, off modules stay at zero', () => {
    const y = lifeOfYear({
      unit: 'kg', weekStart: 1, workouts: [], dayPlan: {}, routines: [], week: [], modules: { water: true }, waterGoal: 1000,
      water: { a: { d: '2025-03-01', ml: 1200, _ts: 1 }, b: { d: '2026-01-05', ml: 2000, _ts: 1 } },
    }, 2025, '2026-11-14')
    expect(y.waterDays).toBe(1)
    expect(y.waterMet).toBe(1)
    expect(y.any).toBe(true)
    expect(y.checks).toBe(0)
    expect(lifeOfYear(LIFES(), 2027, '2026-11-14').any).toBe(false)
  })
})
