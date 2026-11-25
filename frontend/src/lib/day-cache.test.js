// The per-day caches in lib/water.js, lib/steps.js, lib/sleep.js, lib/food.js and lib/habits.js
// are keyed on the entries map object rather than on the clock, which is what makes a year of
// daily reads cost one pass instead of one pass per day. They are only correct while the rule
// every module here follows holds: a writer hands out a NEW map object instead of writing into the
// one a read has already indexed. These tests hold that line, because a future writer that
// mutated in place would show up as a lost drink or a stale habit check on a phone, not here.
//
// Each case reads first (that builds the index), then writes through the module's own writer, then
// reads again - and says what a copy that was never read at all would say.
import { describe, expect, it } from 'vitest'
import { addWater, dayTotal, drinksOn, editWater, removeWater } from './water.js'
import { daySteps, stepsProgress } from './steps.js'
import { addSleep, mainSession, nightTotal, removeSleep } from './sleep.js'
import { addFood, dayFood, foodGoalsMet } from './food.js'
import { dayState, habitLogsOf, habitsAllMet, logHabit, todayList } from './habits.js'
import { mergeSteps } from './health-read.js'

const D = '2026-11-14'
const D2 = '2026-11-13'
const NOON = Date.parse(D + 'T12:00:00Z')
const base = (over = {}) => ({
  unit: 'kg', weekStart: 1, week: {}, dayPlan: {}, routines: [], workouts: [],
  water: {}, steps: {}, sleep: {}, food: {}, habitDefs: {}, habitLogs: {}, modules: {}, _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))
const def = S => ({ ...S.habitDefs.h1, id: 'h1' })

describe('water', () => {
  it('a drink logged after a read is in the next total', () => {
    const S = base({ water: { a: { d: D, ml: 500, _ts: 1 } } })
    expect(dayTotal(S, D)).toBe(500)                    // index the day
    addWater(S, 750, { d: D, id: 'b', now: 2 })
    expect(dayTotal(S, D)).toBe(1250)
    expect(drinksOn(S, D).map(e => e.ml).sort((x, y) => x - y)).toEqual([500, 750])
  })

  it('a retyped amount and a removal both land', () => {
    const S = base({ water: { a: { d: D, ml: 500, _ts: 1 }, b: { d: D2, ml: 300, _ts: 1 } } })
    dayTotal(S, D); dayTotal(S, D2)                     // index both days
    editWater(S, 'a', 900, { now: 3 })
    removeWater(S, 'b', 4)
    expect(dayTotal(S, D)).toBe(900)
    expect(dayTotal(S, D2)).toBe(0)
  })

  it('a drink on a day nobody had read yet arrives too', () => {
    const S = base({})
    addWater(S, 250, { d: D2, id: 'x', now: 1 })
    expect(dayTotal(S, D2)).toBe(250)
  })
})

describe('steps', () => {
  it('a record merged in after a read counts, and the origin rule still decides', () => {
    const S = base({ steps: { a: { d: D, n: 4000, o: 'com.x', _ts: 1 } } })
    expect(daySteps(S, D)).toBe(4000)                   // index
    mergeSteps(S, [{ t: NOON, n: 9000, origin: 'com.y' }], { src: 'hc', now: NOON })
    expect(daySteps(S, D)).toBe(9000)                   // the bigger single origin wins
    expect(stepsProgress(S, D).n).toBe(9000)
    // the same merge into a copy that was never read gives the same number
    const cold = base({ steps: { a: { d: D, n: 4000, o: 'com.x', _ts: 1 } } })
    mergeSteps(cold, [{ t: NOON, n: 9000, origin: 'com.y' }], { src: 'hc', now: NOON })
    expect(daySteps(cold, D)).toBe(daySteps(S, D))
  })

  it('a preferred source set after a read is honoured at once', () => {
    const S = base({ steps: { a: { d: D, n: 9000, o: 'com.y', _ts: 1 }, b: { d: D, n: 4000, o: 'com.x', _ts: 1 } } })
    daySteps(S, D)
    S.stepsSource = 'com.x'                             // a setting, not the log: same map object
    expect(daySteps(S, D)).toBe(4000)
  })
})

describe('sleep', () => {
  it('a night typed after a read is the main session of its day', () => {
    const S = base({})
    expect(mainSession(S, D)).toBeNull()                // index an empty log
    const start = NOON - 8 * 3600000
    addSleep(S, { s: start, e: NOON, manual: true, id: 'n1', now: 1 })
    expect(mainSession(S, D).min).toBe(480)
    expect(nightTotal(S, D)).toBe(480)
    removeSleep(S, 'n1', 2)
    expect(mainSession(S, D)).toBeNull()
  })

  it('two overlapping nights resolve the same as on a cold copy', () => {
    const build = () => base({ sleep: { n1: { d: D, s: NOON - 8 * 3600000, e: NOON, m: 1, _ts: 1 } } })
    const S = build()
    mainSession(S, D)                                   // index first
    addSleep(S, { s: NOON - 7 * 3600000, e: NOON, manual: true, id: 'n2', now: 2 })
    const cold = build()
    addSleep(cold, { s: NOON - 7 * 3600000, e: NOON, manual: true, id: 'n2', now: 2 })
    expect(clone(S.sleep)).toEqual(clone(cold.sleep))    // the newest copy owns the night, the other is a tombstone
    expect(mainSession(S, D).min).toBe(mainSession(cold, D).min)
  })
})

describe('food', () => {
  it('a meal logged after an empty read is in the day', () => {
    const S = base({})
    expect(foodGoalsMet(S, D)).toBeNull()               // index: the day owes nothing
    addFood(S, { d: D, kcal: 800, protein: 40 }, { id: 'f1', now: 1 })
    expect(dayFood(S, D)).toEqual({ kcal: 800, protein: 40 })
    expect(foodGoalsMet(S, D)).toBe(false)
    addFood(S, { d: D, kcal: 2400, protein: 180 }, { id: 'f2', now: 2 })
    expect(dayFood(S, D)).toEqual({ kcal: 3200, protein: 220 })
    expect(foodGoalsMet(S, D)).toBe(true)
  })
})

describe('habits', () => {
  const withHabit = () => base({
    habitDefs: { h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 } },
  })

  it('a check-in after a read counts for the day, the list and the all-met rule', () => {
    const S = withHabit()
    expect(dayState(S, def(S), D).done).toBe(false)     // index
    logHabit(S, 'h1', { d: D, now: 2 })
    expect(dayState(S, def(S), D).done).toBe(true)
    expect(habitsAllMet(S, D)).toBe(true)
    expect(todayList(S, D)[0].done).toBe(true)
    expect(habitLogsOf(S, 'h1', D)).toHaveLength(1)
  })

  it('a second yesno the same day is still refused, cached or not', () => {
    const S = withHabit()
    logHabit(S, 'h1', { d: D, now: 1 })
    dayState(S, def(S), D)                              // index after the first check
    expect(logHabit(S, 'h1', { d: D, now: 2 })).toBe('dup')
    expect(habitLogsOf(S, 'h1', D)).toHaveLength(1)
  })

  it('a skip on another day lands where the check did not', () => {
    const S = withHabit()
    dayState(S, def(S), D2)                             // index the empty day
    logHabit(S, 'h1', { d: D2, kind: 'skip', now: 3 })
    const st = dayState(S, def(S), D2)
    expect(st.done).toBe(false)
    expect(st.skipped).toBe(true)
  })
})

// The reason the caches exist: a per-day reader that walked the whole log made a long history cost
// its length SQUARED, and /stats/life plus the Home level card were the paying customers
// (measured before the caches: 4.7 s to build a month's summary at one year of daily entries,
// 44 s at three). This pins the fix by counting the walks themselves rather than by the clock -
// a timing test would be flaky on a loaded runner, and a slow runner would still pass a quadratic.
describe('the day index is walked once per map, never once per day', () => {
  // A proxy whose ownKeys trap counts the passes: Object.entries(map) is how every module walks
  // its log, so the count is the walks, whatever the machine is doing.
  const counting = obj => {
    let walks = 0
    const proxy = new Proxy(obj, {
      ownKeys(t) { walks++; return Reflect.ownKeys(t) },
      getOwnPropertyDescriptor(t, k) { walks++; return Reflect.getOwnPropertyDescriptor(t, k) },
    })
    return [proxy, () => walks]
  }

  const days = 40
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

  it('water: 40 daily totals, one pass over the drink log', () => {
    const [water, walks] = counting({})
    for (let i = 0; i < days; i++) water[`w${i}`] = { d: addDays(D, -i), ml: 300, _ts: i + 1 }
    const S = base({ water })
    for (let i = 0; i < days; i++) dayTotal(S, addDays(D, -i))
    expect(walks()).toBeGreaterThan(0)                  // the index was built
    const after = walks()
    for (let i = 0; i < days; i++) dayTotal(S, addDays(D, -i))
    expect(walks(), 'a second stretch walked the log again').toBe(after)
  })

  it('steps, sleep and food: the same one pass each', () => {
    const [steps, sWalks] = counting({})
    const [sleep, nWalks] = counting({})
    const [food, fWalks] = counting({})
    for (let i = 0; i < days; i++) {
      const d = addDays(D, -i)
      steps[`s${i}`] = { d, n: 9000, o: 'com.x', _ts: i + 1 }
      sleep[`n${i}`] = { d, s: Date.parse(d + 'T23:00:00Z') - 8 * 3600000, e: Date.parse(d + 'T23:00:00Z'), _ts: i + 1 }
      food[`f${i}`] = { d, kcal: 400, protein: 30, _ts: i + 1 }
    }
    const S = base({ steps, sleep, food })
    const marks = []
    for (let i = 0; i < days; i++) { daySteps(S, addDays(D, -i)); mainSession(S, addDays(D, -i)); dayFood(S, addDays(D, -i)); marks.push([sWalks(), nWalks(), fWalks()]) }
    const [s1, n1, f1] = marks[marks.length - 1]
    for (let i = 0; i < days; i++) { daySteps(S, addDays(D, -i)); mainSession(S, addDays(D, -i)); dayFood(S, addDays(D, -i)) }
    expect([sWalks(), nWalks(), fWalks()], 'second stretch re-walked a log').toEqual([s1, n1, f1])
  })

  it('habits: dayState over 40 days walks the check log once, not 40 times', () => {
    const [logs, walks] = counting({})
    const S = base({
      habitDefs: { h1: { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 } },
      habitLogs: logs,
    })
    for (let i = 0; i < days; i++) logs[`l${i}`] = { h: 'h1', d: addDays(D, -i), _ts: i + 1 }
    const def = { ...S.habitDefs.h1, id: 'h1' }
    for (let i = 0; i < days; i++) dayState(S, def, addDays(D, -i))
    const after = walks()
    for (let i = 0; i < days; i++) dayState(S, def, addDays(D, -i))
    expect(walks(), 'a second stretch walked the check log again').toBe(after)
  })

  it('and the numbers are still right next to the proxy', () => {
    const [water, walks] = counting({})
    for (let i = 0; i < 5; i++) water[`w${i}`] = { d: i < 2 ? D : D2, ml: 500, _ts: i + 1 }
    const S = base({ water })
    expect(dayTotal(S, D)).toBe(1000)
    expect(dayTotal(S, D2)).toBe(1500)
    expect(walks()).toBeGreaterThan(0)
  })
})
