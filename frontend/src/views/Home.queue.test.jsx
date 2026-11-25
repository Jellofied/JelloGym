// @vitest-environment happy-dom
// A coach week (S.queue) runs by order, not by weekday, so Home swaps the seven dots for a
// progress row. Covered here: the row's name and progress count, the today row answering through
// the same helper (which session is next and starting one are the today row's and Plan's, not the
// progress row's), a session in progress winning over Start, and the today row reading pins
// (S.dayPlan[iso] = queue routine id) like any override.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { startFlow } from '../sheets.jsx'
import { todayISO, isoOf } from '../lib/format.js'
import Home from './Home.jsx'
import { setLang } from '../lib/i18n.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '',
}))

const routines = [
  { id: 'd1', name: 'US W1 D1', emoji: null, ex: [{ id: '0025' }] },
  { id: 'd2', name: 'US W1 D2', emoji: null, ex: [{ id: '0025' }] },
  { id: 'd3', name: 'US W1 D3', emoji: null, ex: [{ id: '0025' }] },
  { id: 'own', name: 'Core', emoji: null, ex: [{ id: '0025' }] },
]
// Home reads the clock, so the queue is pinned relative to the real today: applied three days
// ago, active since the day before yesterday, its logged session on a day that is not today.
const SINCE = Date.now() - 3 * 86400000
const daysFromToday = n => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const queue = (over = {}) => ({ ids: ['d1', 'd2', 'd3'], since: SINCE, startsOn: daysFromToday(-2), label: 'US W1', ...over })
const logged = id => {
  const start = SINCE + 3600000
  return { id: 'w-' + id, d: isoOf(new Date(start)), start, end: start + 3600000, routineIds: [id], routineId: id, name: routines.find(r => r.id === id).name, entries: [] }
}

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  startFlow.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const setS = (over = {}) => useStore.setState(s => ({
  S: { ...s.S, routines, week: {}, dayPlan: {}, workouts: [], active: null, queue: queue(), rotation: null, scheduleMode: null, ...over }, user: null,
}))
const mount = () => act(() => root.render(<Home />))
const header = () => host.querySelector('.queue .row')?.textContent
const todayTitle = () => host.querySelector('.today-row .ttl')?.textContent
const card = () => [...host.querySelectorAll('.card .card-head-sub')].map(e => e.textContent).find(x => x.includes('this week'))

describe('Home — coach week progress row', () => {
  it('replaces the weekday dots with a one-line progress row, named and counted', () => {
    setS()
    mount()
    expect(host.querySelector('.week')).toBeNull()
    expect(host.querySelectorAll('.wday').length).toBe(0)
    expect(host.querySelector('.queue .row .small').textContent).toBe('US W1')
    expect(header()).toBe('US W10 / 3')
    expect(todayTitle()).toBe('US W1 D1')
    // The row itself no longer lists the sessions or names the next one: the today row does.
    expect(host.querySelectorAll('.queue .chip').length).toBe(0)
    expect(host.querySelector('.queue-status')).toBeNull()
  })

  it('a logged session moves the count and the today row on together', () => {
    setS({ workouts: [logged('d1')] })
    mount()
    expect(header()).toBe('US W11 / 3')
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('a session in progress keeps the today row on it: Start becomes Resume', () => {
    setS({ active: { id: 'a', name: 'US W1 D1', start: Date.now(), cur: 0, entries: [], routineIds: ['d1'] } })
    mount()
    expect(host.querySelector('.today-row .tag')?.textContent).toBe('Resume')
  })

  it('before startsOn the today row points at the week starting, with no chip row to say it twice', () => {
    const startsOn = daysFromToday(2)
    setS({ queue: queue({ startsOn }) })
    mount()
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss').textContent).toMatch(/^Next session: \w+, US W1 D1$/)
    expect(host.querySelectorAll('.queue .chip').length).toBe(0)
  })

  it('a rotation-managed queue never names a weekday on its empty gap — the row above already says what is next', () => {
    const startsOn = daysFromToday(2)
    setS({ queue: queue({ startsOn, rotationId: 'r1' }) })
    mount()
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss')).toBeNull()
  })

  it('Rotation chosen with nothing built yet hides the weekday strip and offers an empty state instead', () => {
    setS({ queue: null, rotation: null, scheduleMode: 'rotation', week: {} })
    mount()
    expect(host.querySelector('.week')).toBeNull()
    expect(host.querySelectorAll('.wday').length).toBe(0)
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.textContent).toContain('No rotation yet')
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss')).toBeNull()
  })

  it('a complete week tallies full, and the day goes back to the weekday plan', () => {
    setS({ workouts: [logged('d1'), logged('d2'), logged('d3')], week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(header()).toBe('US W13 / 3')
    expect(todayTitle()).toBe('Core')
  })

  it('a pass this app manages gets its own wording in the header, not the coach-week count', () => {
    setS({
      queue: queue({ rotationId: 'r1' }),
      rotation: { id: 'r1', sequence: ['d1', 'd2', 'd3'], label: 'US W1' },
      workouts: [logged('d1'), logged('d2'), logged('d3')],
    })
    mount()
    expect(header()).toBe('Rotation3 of 3 done this round.')
  })

  it('own routines on the weekday ride along beside the queue session', () => {
    setS({ week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(todayTitle()).toBe('US W1 D1 + Core')
  })

  it('a rest override for today wins on the today row', () => {
    setS({ dayPlan: { [todayISO()]: 'rest' } })
    mount()
    expect(todayTitle()).toBe('Rest day')
  })

  it('a malformed queue from another client shows the weekday dots, never an empty card', () => {
    setS({ queue: { ids: 'd1' }, week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.querySelectorAll('.week .wday').length).toBe(7)
    expect(todayTitle()).toBe('Core')
  })

  it('the streak card counts the coach sessions done, wherever in the calendar they fell', () => {
    // Ran long: the queue applied ten days ago and D1 logged the day after — never in this
    // calendar week, whichever weekday today is, so a calendar-week count would show 0 / 3.
    const since = Date.now() - 10 * 86400000, start = since + 3600000
    setS({ queue: queue({ since, startsOn: daysFromToday(-9) }), workouts: [{ ...logged('d1'), d: isoOf(new Date(start)), start, end: start + 3600000 }] })
    mount()
    expect(card()).toMatch(/^1 \/ 3 this week · 1 workout total$/)
  })

  it('the streak card counts your own day beside the coach week, planned and done', () => {
    const now = Date.now()
    const core = { id: 'w-own', d: todayISO(), start: now - 3600000, end: now, routineIds: ['own'], routineId: 'own', name: 'Core', entries: [] }
    setS({ week: { [new Date().getDay()]: ['own'] }, workouts: [logged('d1'), core] })
    mount()
    expect(card()).toMatch(/^2 \/ 4 this week · 2 workouts total$/)
    expect(header()).toBe('US W11 / 3')
  })

  it('a managed pass counts your own day beside it exactly as an external one does — ownership plays no part in the tally', () => {
    const now = Date.now()
    const core = { id: 'w-own', d: todayISO(), start: now - 3600000, end: now, routineIds: ['own'], routineId: 'own', name: 'Core', entries: [] }
    setS({
      queue: queue({ rotationId: 'r1' }),
      rotation: { id: 'r1', sequence: ['d1', 'd2', 'd3'], label: 'US W1' },
      week: { [new Date().getDay()]: ['own'] }, workouts: [logged('d1'), core],
    })
    mount()
    expect(card()).toMatch(/^2 \/ 4 this week · 2 workouts total$/)
    expect(header()).toBe('Rotation1 of 3 done this round.')
  })

  it('without a queue the weekday dots are back', () => {
    setS({ queue: null })
    mount()
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.querySelectorAll('.wday').length).toBe(7)
  })
})

describe('Home — a session pinned to a day', () => {
  it('a fulfilled pin — pinned to today, done on an earlier day — reads as no override on the today row', () => {
    setS({ dayPlan: { [todayISO()]: 'd1' }, workouts: [logged('d1')] })
    mount()
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('a session pinned ahead leaves the floating next one offered on the today row', () => {
    setS({ dayPlan: { [daysFromToday(2)]: 'd1' } })
    mount()
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('a session pinned to today is the day\'s session, ahead of the floating order', () => {
    setS({ dayPlan: { [todayISO()]: 'd3' } })
    mount()
    // Home reads any per-date override on today as a reschedule — a pin is one.
    expect(todayTitle()).toBe('US W1 D3 · rescheduled')
  })

  it('every session pinned ahead: nothing floats, so today rests', () => {
    const d1 = daysFromToday(1), d2 = daysFromToday(3), d3 = daysFromToday(2)
    setS({ dayPlan: { [d1]: 'd1', [d2]: 'd2', [d3]: 'd3' } })
    mount()
    expect(todayTitle()).toBe('Rest day')
  })
})

// Android QA (1.3.10 rc): the today row reported the last finished session ("Full Body A, Done")
// while the progress row and Start already named the next one for today.
describe('Home — the today row follows today\'s plan, not just the last session', () => {
  const today = todayISO()
  const at = (id, start, name) => ({ id: 'w-' + id + start, d: today, start, end: start + 1000, routineIds: id ? [id] : [], routineId: id, name: name || routines.find(r => r.id === id).name, entries: [] })
  // The row's trailing control: the Start pill since the Nothing layout, and the quiet chip
  // (Resume, Edit, Done) for the days that have already settled.
  const tag = () => (host.querySelector('.today-row .tag') || host.querySelector('.today-row .btn'))?.textContent

  it('a queue session done today: the row offers the next one, like the progress row counts it', () => {
    setS({ workouts: [at('d1', Date.now() - 3600000)] })
    mount()
    expect(todayTitle()).toBe('US W1 D2')
    expect(tag()).toBe('Start')
  })

  it('a freestyle session on a planned day leaves the plan offered', () => {
    const wd = new Date(today + 'T12:00:00').getDay()
    setS({ queue: null, week: { [wd]: ['own'] }, workouts: [at(null, Date.now() - 3600000, 'Freestyle')] })
    mount()
    expect(todayTitle()).toBe('Core')
    expect(tag()).toBe('Start')
  })

  it('the planned routine done today still reads as done', () => {
    const wd = new Date(today + 'T12:00:00').getDay()
    setS({ queue: null, week: { [wd]: ['own'] }, workouts: [at('own', Date.now() - 3600000)] })
    mount()
    expect(todayTitle()).toBe('Core (done)')
    expect(tag()).toBe('Done')
  })

  it('Start new pass after a session today: the pass runs today, from its first session', () => {
    const now = Date.now()
    setS({
      rotation: { id: 'rot', sequence: ['d1', 'd2', 'd3'], label: 'Rotation' },
      queue: { ids: ['d1', 'd2', 'd3'], since: now - 1000, startsOn: today, label: 'Rotation', rotationId: 'rot', strict: true },
      workouts: [at('d1', now - 3600000)],
    })
    mount()
    expect(todayTitle()).toBe('US W1 D1')
    expect(tag()).toBe('Start')
  })
})

describe('Home: your own loop', () => {
  // QA round 2 (2026-10-06): the loop's name was saved as text in the language it was made in, so
  // a loop made in English still read "Rotation" after switching to Arabic.
  it('is called Rotation in the language on screen, whatever an older save kept as its name', async () => {
    const rot = { id: 'rot', sequence: ['d1', 'd2'], label: 'Rotation' }
    try {
      await setLang('ar')
      setS({ rotation: rot, scheduleMode: 'rotation', queue: queue({ ids: ['d1', 'd2'], label: 'Rotation', rotationId: 'rot' }) })
      mount()
      expect(host.querySelector('.queue .row .small').textContent).toBe('التناوب')
      setS({ rotation: { ...rot, label: '' }, scheduleMode: 'rotation', queue: queue({ ids: ['d1', 'd2'], label: '', rotationId: 'rot' }) })
      mount()
      expect(host.querySelector('.queue .row .small').textContent).toBe('التناوب')
    } finally { await act(() => setLang('en')) }
    // A coach's week keeps the name its planner gave it.
    setS()
    mount()
    expect(host.querySelector('.queue .row .small').textContent).toBe('US W1')
  })
})
