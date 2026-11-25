// @vitest-environment happy-dom
// Home's today row (Nothing layout): the day block opens that day's plan, the pill starts it, and
// a running session takes you back into the workout instead. There is no "different workout"
// control on the card: a second session in a day is started from the tab bar's Actions hub, the
// Start screen or Plan, so nothing here has to stay reachable for it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'
import { startFlow, dayOverrideSheet } from '../sheets.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

const routines = [{ id: 'r1', name: 'Push', emoji: null, ex: [{ id: '0025' }] }]

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear(); startFlow.mockClear(); dayOverrideSheet.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

// Every weekday points at a routine, so today is always planned unless the week is emptied.
const setS = (over = {}) => useStore.setState(s => ({
  S: {
    ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over,
  },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const row = () => host.querySelector('.today-row')
const main = () => row().querySelector('.today-main')
const tap = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const startBtn = () => [...row().querySelectorAll('.btn')].find(b => b.textContent === 'Start')
const chip = () => row().querySelector('.tag')?.textContent
const anyDoor = () => [...host.querySelectorAll('button')].some(b => b.textContent.includes('Choose a different workout'))

describe('Home — the today row: the block opens the day, the pill starts it', () => {
  it('a planned day carries a real Start button, not a tag', () => {
    setS(); mount()
    expect(startBtn()).toBeTruthy()
    expect(chip()).toBeUndefined()
  })

  it('Start starts today\u2019s plan and goes nowhere else', () => {
    setS(); mount()
    tap(startBtn())
    expect(startFlow).toHaveBeenCalledWith(['r1'])
    expect(nav).not.toHaveBeenCalled()
    expect(dayOverrideSheet).not.toHaveBeenCalled()
  })

  it('the day block changes that day\u2019s plan instead of starting it', () => {
    setS(); mount()
    tap(main())
    expect(dayOverrideSheet).toHaveBeenCalledWith(todayISO())
    expect(startFlow).not.toHaveBeenCalled()
  })

  it('has no different-workout control at all', () => {
    setS(); mount()
    expect(anyDoor()).toBe(false)
    setS({ week: {} }); mount()
    expect(anyDoor()).toBe(false)
  })

  it('a rest day offers no Start: the block is the way to put something on the day', () => {
    setS({ week: {} }); mount()
    expect(startBtn()).toBeFalsy()
    tap(main())
    expect(dayOverrideSheet).toHaveBeenCalledWith(todayISO())
  })
})

describe('Home — the today row once something is happening or logged', () => {
  it('a running session: Resume chip, no Start, and the block goes back into it', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    mount()
    expect(row().querySelector('.ttl').textContent).toBe('Push (in progress)')
    expect(chip()).toBe('Resume')
    expect(startBtn()).toBeFalsy()
    tap(main())
    expect(nav).toHaveBeenCalledWith('/workout')
    expect(dayOverrideSheet).not.toHaveBeenCalled()
  })

  it('reads an open editor on a saved workout as an edit, not as a session in progress', () => {
    setS({ active: { id: 'w', name: 'Push', start: 1000, cur: 0, entries: [], editingWorkoutId: 'w' } })
    mount()
    expect(row().querySelector('.ttl').textContent).toBe('Push')
    expect(chip()).toBe('Edit')
    tap(main())
    expect(nav).toHaveBeenCalledWith('/workout')
  })

  it('a logged day stops asking for it: the Done chip stays, the block still opens the day', () => {
    setS({ workouts: [{ id: 'w1', d: todayISO(), name: 'Push', routineIds: ['r1'], entries: [] }] })
    mount()
    expect(row().querySelector('.ttl').textContent).toBe('Push (done)')
    expect(chip()).toBe('Done')
    expect(startBtn()).toBeFalsy()
    tap(main())
    expect(dayOverrideSheet).toHaveBeenCalledWith(todayISO())
  })
})
