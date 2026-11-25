// The Life half of Stats (lib/life-stats.js): the range maths, the chart buckets and every enabled
// module's numbers. The rule under test throughout: an off module is absent (null), never zero, and
// the goal line keeps meaning "per day" whatever the bucket.
import { describe, expect, it } from 'vitest'
import { LIFE_RANGES, addDays, eachDay, habitRows, lifeSummary, monthsOf, perfectValues, ratioLevel, rangeOf, seriesOf, stretchOf } from './life-stats.js'
import { goalOf } from './water.js'

const T = '2026-11-14'                                  // a Saturday
const D = n => addDays(T, -n)
const base = (over = {}) => ({
  unit: 'kg', weekStart: 1, week: {}, dayPlan: {}, routines: [], workouts: [], bodyweight: [],
  water: {}, habitDefs: {}, habitLogs: {}, steps: {}, sleep: {}, food: {}, modules: {}, _ts: 0, ...over,
})

describe('the range', () => {
  it('counts back from today and takes the page choices in order', () => {
    expect(rangeOf(30, T)).toEqual({ from: D(29), to: T, days: 30 })
    expect(LIFE_RANGES.map(r => r.value)).toEqual(['month', 'quarter', 'year', 'all'])
    expect(rangeOf(0, T).days).toBe(30)                  // junk falls back to the shortest one
    expect(rangeOf(5000, T).days).toBe(400)              // and a silly long walk is capped
  })

  it('the calendar stretches run from the first day of the period to its last, each with its grain', () => {
    expect(stretchOf('month', T)).toEqual({ from: '2026-11-01', to: '2026-11-30', days: 30, bucket: 'day' })
    expect(stretchOf('quarter', T)).toEqual({ from: '2026-09-01', to: '2026-11-30', days: 91, bucket: 'week' })
    expect(stretchOf('year', T)).toEqual({ from: '2026-01-01', to: '2026-12-31', days: 365, bucket: 'month' })
    // February, in a leap year: the month is 29 days, not a rolling 30.
    expect(stretchOf('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29', days: 29, bucket: 'day' })
    // A quarter's first month crossing a year still lands on January.
    expect(stretchOf('quarter', '2026-02-05')).toEqual({ from: '2025-12-01', to: '2026-02-28', days: 90, bucket: 'week' })
  })

  it('all time starts at the earliest life entry and runs to the end of this month', () => {
    const S = { water: { a: { d: '2026-05-03', ml: 500, _ts: 1 } }, steps: { s: { d: '2025-02-01', n: 1, o: 'com.x', _ts: 1 } } }
    expect(stretchOf('all', T, S)).toEqual({ from: '2025-02-01', to: '2026-11-30', days: eachDay('2025-02-01', '2026-11-30').length, bucket: 'month' })
    // Nothing logged yet: today alone, out to the month's end.
    expect(stretchOf('all', T, {})).toEqual({ from: T, to: '2026-11-30', days: 17, bucket: 'month' })
    expect(stretchOf('all', T, null).from).toBe(T)
  })

  it('walks a stretch inclusive at both ends, well past 400 days', () => {
    expect(eachDay('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(eachDay('2020-01-01', '2023-01-01').length).toBe(1097)   // All time is not capped at a leap-year-plus walk
  })
})

describe('the series', () => {
  const water = days => {
    const S = base({ water: {} })
    for (const [d, ml] of days) S.water[d] = { d, ml, _ts: 1 }
    return S
  }

  it('a stretch of two months or less is a point per day, empty days at zero', () => {
    const S = water([[T, 1000], [D(2), 500]])
    const s = seriesOf(S, 'water', rangeOf(7, T), T)
    expect(s.bucket).toBe('day')
    expect(s.points.length).toBe(7)
    expect(s.points.at(-1)).toMatchObject({ y: 1000, d: T })
    expect(s.points.map(p => p.y)).toEqual([0, 0, 0, 0, 500, 0, 1000])
    expect(s.goal).toBe(goalOf(S))
  })

  it('never plots a day that has not happened yet in a rolling stretch, and draws it empty in a calendar one', () => {
    // A rolling window ends today: nothing future, ever.
    const s = seriesOf(base({ water: { a: { d: '2026-12-25', ml: 500, _ts: 1 } } }), 'water', rangeOf(30, T))
    expect(s.points.some(p => p.d > T)).toBe(false)
    // A calendar month runs to the 30th: the days ahead of today are on the chart, at zero.
    const m = seriesOf(base({ water: { a: { d: '2026-11-25', ml: 500, _ts: 1 } } }), 'water', stretchOf('month', T))
    expect(m.points.length).toBe(30)
    expect(m.points.at(-1).d).toBe('2026-11-30')
    expect(m.points.find(p => p.d === '2026-11-25').y).toBe(500)
    expect(m.points.filter(p => p.d > T && p.d !== '2026-11-25').every(p => p.y === 0)).toBe(true)
  })

  it('a longer stretch averages inside weeks, then months, and the goal line stays the daily one', () => {
    // The same amount every day, so a bucket can only read as that amount whatever the alignment:
    // the point of the test is the daily average, not where this profile's weeks happen to break.
    const S = base({ water: {} })
    for (let i = 0; i < 365; i++) { const d = D(i); S.water['w' + i] = { d, ml: 1000, _ts: 1 } }
    const goal = goalOf(S)
    const wk = seriesOf(S, 'water', rangeOf(90, T), T)
    expect(wk.bucket).toBe('week')
    expect(wk.goal).toBe(goal)                           // per day, not per week
    expect(wk.points.length).toBeLessThan(90)
    expect(wk.points.every(p => p.y === 1000)).toBe(true)
    const mo = seriesOf(S, 'water', rangeOf(365, T), T)
    expect(mo.bucket).toBe('month')
    expect(mo.points.length).toBeLessThanOrEqual(13)     // a year spans 12 months, plus a part one
    expect(mo.points.every(p => p.y === 1000)).toBe(true)
  })

  it('the bucket that straddles today averages the upcoming days into itself', () => {
    // Every passed day of the quarter holds 1 400 ml. T is a Saturday and the profile's week
    // starts on Monday, so the week's bucket also holds Sunday, an empty day ahead of today.
    const S = base({ water: {} })
    for (const d of eachDay('2026-09-01', T)) S.water['x' + d] = { d, ml: 1400, _ts: 1 }
    const wk = seriesOf(S, 'water', stretchOf('quarter', T))
    expect(wk.bucket).toBe('week')
    // T is the Saturday of the week that starts Monday the 9th: six filled days and Sunday,
    // a day that has not come yet, average down inside that week's bucket.
    expect(wk.points.find(p => p.d === '2026-11-09').y).toBe(1200)
    // The weeks wholly ahead of today sit on the line at zero - the quarter drawn running out.
    expect(wk.points.at(-1).y).toBe(0)
  })

  it('the Year stretch is a month grain - its rows come from monthsOf, not a line series', () => {
    expect(stretchOf('year', T).bucket).toBe('month')
    expect(stretchOf('all', T, {}).bucket).toBe('month')
  })

  it('reads each module through its own helper', () => {    const S = base({
      steps: { a: { d: T, n: 9000, o: 'com.x', _ts: 1 } },
      sleep: { n1: { d: T, s: Date.parse(T + 'T23:00:00Z'), e: Date.parse(T + 'T06:30:00Z') + 86400000, _ts: 1 } },
      food: { f1: { d: T, kcal: 2400, protein: 150, _ts: 1 } },
    })
    const p = rangeOf(3, T)
    expect(seriesOf(S, 'steps', p, T).points.map(x => x.y)).toEqual([0, 0, 9000])
    expect(seriesOf(S, 'sleep', p, T).points.at(-1).y).toBe(450)
    expect(seriesOf(S, 'kcal', p, T).points.at(-1).y).toBe(2400)
    expect(seriesOf(S, 'protein', p, T).points.at(-1).y).toBe(150)
  })
})

describe('monthsOf', () => {
  const filled = () => {
    const S = base({ water: {} })
    for (let i = 0; i < 80; i++) { const d = D(i); S.water['x' + i] = { d, ml: 1400, _ts: 1 } }
    S.water['future'] = { d: '2026-11-25', ml: 500, _ts: 1 }     // a drink that has not happened yet
    return S
  }

  it('one row per month, this month averaged over its passed days only', () => {
    const rows = monthsOf(filled(), 'water', stretchOf('quarter', T), T)
    expect(rows.map(r => r.key)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(rows[0].avg).toBe(1400)
    expect(rows[1].avg).toBe(1400)
    expect(rows[2].avg).toBe(1400)                               // the November 25 ghost and the days
    expect(rows[2].logged).toBe(14)                              // ahead of today never count in a bar
  })

  it('the year gives a row for every month up to this one - no empty future bars', () => {
    const rows = monthsOf(filled(), 'water', stretchOf('year', T), T)
    expect(rows.map(r => r.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(rows[0]).toMatchObject({ avg: 0, logged: 0 })
  })
})

describe('ratioLevel', () => {
  const lv = ratioLevel(2000)
  it('l4 is at goal, the steps below are fractions of it, none is l0', () => {
    expect(lv(0)).toBe(0)
    expect(lv(500)).toBe(1)
    expect(lv(800)).toBe(2)                                      // 40% of the goal
    expect(lv(1400)).toBe(3)                                     // 70% of it
    expect(lv(2000)).toBe(4)
    expect(lv(3000)).toBe(4)
    expect(ratioLevel(0)(500)).toBe(1)                           // no goal: some, or none
    expect(ratioLevel(0)(0)).toBe(0)
  })
})

describe('the perfect-day grid', () => {
  const planned = (over = {}) => base({
    routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }],
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] },
    ...over,
  })

  it('2 for every goal kept, 1 for some, 0 for none owed', () => {
    const S = planned({ workouts: [{ id: 'w1', d: T, entries: [] }, { id: 'w2', d: D(1), entries: [] }] })
    const v = perfectValues(S, rangeOf(3, T), T)
    expect(v[T]).toBe(2)                                 // today: the session it owed is logged
    expect(v[D(1)]).toBe(2)
    expect(v[D(2)]).toBe(0)                              // owed training, nothing logged
  })

  it('is empty without a plan to read', () => {
    expect(perfectValues({ workouts: [] }, rangeOf(3, T), T)).toEqual({})
  })
})

describe('the habit rows', () => {
  const twoHabits = () => base({
    habitDefs: {
      h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 },
      h2: { name: 'Stretch', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 },
    },
  })

  it('counts the days each habit was due and kept inside the stretch', () => {
    const S = twoHabits()
    S.habitLogs = { a: { h: 'h1', d: T, _ts: 1 }, b: { h: 'h1', d: D(1), _ts: 1 }, c: { h: 'h2', d: D(5), _ts: 1 } }
    const rows = habitRows(S, rangeOf(7, T), T)
    expect(rows.map(r => r.name)).toEqual(['Read', 'Stretch'])
    expect(rows[0]).toMatchObject({ due: 7, done: 2 })
    expect(rows[1]).toMatchObject({ due: 7, done: 1 })
    expect(rows[0].pct).toBeCloseTo(2 / 7)
  })

  it('a perWeek habit has no due days, so it never reads as missed', () => {
    const S = twoHabits()
    S.habitDefs.h1.schedule = { kind: 'perWeek', n: 3 }
    expect(habitRows(S, rangeOf(7, T), T)[0]).toMatchObject({ due: 0, done: 0, pct: 0 })
  })
})

describe('the summary', () => {
  const rich = (modules = {}) => base({
    modules,
    water: { w1: { d: T, ml: 1500, _ts: 1 }, w1b: { d: T, ml: 500, _ts: 1 }, w2: { d: D(1), ml: 1000, _ts: 1 } },
    steps: { s1: { d: T, n: 12000, o: 'com.x', _ts: 1 }, s2: { d: D(1), n: 3000, o: 'com.x', _ts: 1 } },
    sleep: { n1: { d: T, s: Date.parse(T + 'T23:00:00Z'), e: Date.parse(T + 'T06:00:00Z') + 86400000, _ts: 1 } },
    food: { f1: { d: T, kcal: 2400, protein: 160, _ts: 1 } },
    habitDefs: { h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 } },
    habitLogs: { a: { h: 'h1', d: T, _ts: 1 }, b: { h: 'h1', d: D(1), skip: 1, _ts: 2 } },
    routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }],
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] },
    workouts: [{ id: 'w1', d: T, entries: [] }],
  })

  it('names the modules that are on and leaves the rest absent', () => {
    const s = lifeSummary(rich({ water: true, steps: false }), rangeOf(7, T), T)
    expect(s.water).toBeTruthy()
    expect(s.steps).toBeNull()
    expect(s.habits).toBeNull()
    expect(s.hasAny).toBe(true)
  })

  it('says so plainly when nothing life-shaped is switched on', () => {
    expect(lifeSummary(rich({}), rangeOf(7, T), T).hasAny).toBe(false)
  })

  it('the water numbers: goal days and the average of the days that were drunk on', () => {
    const s = lifeSummary(rich({ water: true }), rangeOf(7, T), T)
    expect(s.water.goal).toBe(goalOf(rich({ water: true })))
    expect(s.water.logged).toBe(2)
    expect(s.water.met).toBe(1)                          // 2 000 on the 2 000 default, 1 000 under
    expect(s.water.avg).toBe(1500)
  })

  it('steps, sleep and food each give their goal kept and their average', () => {
    const s = lifeSummary(rich({ steps: true, sleep: true, food: true }), rangeOf(7, T), T)
    expect(s.steps).toMatchObject({ goal: 8000, met: 1, avg: 7500 })
    expect(s.sleep).toMatchObject({ goal: 480, nights: 1, met: 0, avg: 420 })
    expect(s.food).toMatchObject({ days: 1, met: 1, kcal: 2400, protein: 160 })
  })

  it('habits count checks, freezes and the days everything due was kept', () => {
    const s = lifeSummary(rich({ habits: true }), rangeOf(7, T), T)
    expect(s.habits.checks).toBe(1)
    expect(s.habits.skips).toBe(1)
    expect(s.habits.dueDays).toBe(7)
    expect(s.habits.allMetDays).toBe(2)                  // today checked, yesterday frozen: both kept
  })

  it('the perfect-day count spans every module plus the plan', () => {
    const s = lifeSummary(rich({ water: true }), rangeOf(3, T), T)
    expect(s.perfect.owed).toBe(3)
    expect(s.perfect.done).toBe(1)                       // only today: water 2 500 and the session
  })

  it('the level change over the stretch, read at both boundaries', () => {
    const s = lifeSummary(rich({ levels: true }), rangeOf(7, T), T)
    expect(s.levels.from).toBeLessThanOrEqual(s.levels.to)
    expect(s.levels.gained).toBe(Math.max(0, s.levels.to - s.levels.from))
  })
})
