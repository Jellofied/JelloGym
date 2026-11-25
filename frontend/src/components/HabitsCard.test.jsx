// @vitest-environment happy-dom
// The Habits card (slice 2a): today's rows, check in place, skip on a due day, and the name opens
// the edit sheet. A module that is off is not rendered here (that is Home's gate) — this mounts the
// card directly, so it only checks the card's own behaviour.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { addHabit, logHabit } from '../lib/habits.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
const { default: HabitsCard } = await import('./HabitsCard.jsx')

const clone = o => JSON.parse(JSON.stringify(o))
const T = () => { const d = new Date(); d.setHours(12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
let host, root
const seed = S => useStore.setState({ S: { ...clone(DEF), ...S }, user: null })
const rows = () => [...host.querySelectorAll('.habits-row')]
const checkBtn = i => rows()[i].querySelector('.habit-check')

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = () => act(() => root.render(<HabitsCard />))
const twoHabits = () => {
  const S = clone(DEF)
  addHabit(S, { name: 'Read', type: 'timed', target: 20 }, { id: 'a', now: Date.now() - 86400000 })
  addHabit(S, { name: 'Water pills', type: 'count', target: 3 }, { id: 'b', now: Date.now() - 86400000 })
  return S
}

describe('the Habits card', () => {
  it('lists today with an empty state when there are none', () => {
    seed({})
    mount()
    expect(rows()).toHaveLength(0)
    expect(host.textContent).toContain('No habits yet')
    seed(twoHabits())
    mount()
    expect(rows()).toHaveLength(2)
    expect(host.textContent).toContain('Read')
    expect(host.textContent).toContain('0/20 min')
    expect(host.textContent).toContain('0/3')
  })
  it('checking a timed habit logs the full target; tapping again clears it with an Undo', () => {
    seed(twoHabits())
    mount()
    act(() => checkBtn(0).click())
    expect(logsFor('a').length).toBe(1)
    expect(logsFor('a')[0].sec).toBe(20 * 60)
    mount()
    expect(rows()[0].textContent).toContain('Done')
    act(() => checkBtn(0).click())
    expect(logsFor('a')).toHaveLength(0)
    act(() => useUI.getState().runToastAction())
    expect(logsFor('a').length).toBe(1)
  })
  it('a count tap adds one; a rest day never shows Skip, and skipRest habits are exempt anyway', () => {
    const S = twoHabits()
    S.habitDefs.a.skipRest = true            // Read: exempt on today's rest day (empty plan = rest)
    seed(S)
    mount()
    const plus = [...rows()[1].querySelectorAll('button')].find(b => /Water pills: /.test(b.getAttribute('aria-label') || ''))
    act(() => plus.click())
    expect(logsFor('b')[0].n).toBe(1)
    expect(rows()[0].textContent).toContain('0/20 min')
    // Read is skipRest on a rest day → not due → no Skip; Water pills (no skipRest) is due → Skip
    expect([...rows()[0].querySelectorAll('button')].find(b => b.textContent.trim() === 'Skip')).toBeFalsy()
    const skip = [...rows()[1].querySelectorAll('button')].find(b => b.textContent.trim() === 'Skip')
    expect(skip).toBeTruthy()
    act(() => skip.click())
    expect(logsFor('b').some(l => l.skip)).toBe(true)
    mount()
    expect([...rows()[1].querySelectorAll('button')].find(b => b.textContent.trim() === 'Skip')).toBeFalsy()
  })
  it('the New button and the name both open the habit sheet', () => {
    seed(twoHabits())
    mount()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'New').click())
    expect(useUI.getState().sheets).toHaveLength(1)
    act(() => rows()[0].querySelector('.habits-name').click())
    expect(useUI.getState().sheets).toHaveLength(2)
    const box = document.createElement('div'); document.body.appendChild(box)
    const r2 = createRoot(box)
    act(() => r2.render(useUI.getState().sheets.at(-1).render(vi.fn())))
    expect(box.textContent).toContain('Edit habit')
    act(() => r2.unmount()); box.remove()
  })
})

const logsFor = id => Object.values(useStore.getState().S.habitLogs || {}).filter(e => e && e.h === id && e.d === T())
