// @vitest-environment happy-dom
// The Actions hub (nav rework): a grid of square cards. Start workout closes the hub and starts,
// the Habits / Water / Food cards open a small sheet with their one-tap controls, weigh-in and
// the day-note pill open theirs. Sections follow the module switches.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { addFood } from '../lib/food.js'
import { addHabit } from '../lib/habits.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
const { openQuickSheet } = await import('../components/QuickSheet.jsx')

const clone = o => JSON.parse(JSON.stringify(o))
const T = () => { const d = new Date(); d.setHours(12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
let host, root
const seed = S => useStore.setState({ S: { ...clone(DEF), ...S }, user: null })
const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
const open = (onStart = vi.fn()) => {
  act(() => { openQuickSheet(onStart) })
  renderTop()
  return onStart
}
const card = title => [...host.querySelectorAll('.quick-card')].find(b => b.textContent.trim().startsWith(title))
const chip = text => [...host.querySelectorAll('.chip')].find(b => b.textContent.trim() === text)
const into = title => { act(() => card(title).click()); renderTop() }
const pop = () => { act(() => useUI.getState().closeSheet(useUI.getState().sheets.at(-1).id)); renderTop() }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('the Actions hub', () => {
  it('is a grid of square cards titled Actions, starting with the workout', () => {
    seed({ modules: { water: true } })
    open()
    expect(host.querySelector('h3').textContent).toBe('Actions')
    expect(host.querySelector('.quick-grid')).toBeTruthy()
    expect(card('Start workout').textContent).toContain('Start workout')
    expect(card('Water')).toBeTruthy()
  })

  it('the Start card closes into the start flow', () => {
    seed({ modules: { water: true } })
    const onStart = open()
    act(() => card('Start workout').click())
    expect(onStart).toHaveBeenCalled()
    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('sections follow the module switches; Start and the note stay', () => {
    seed({})
    open()
    expect(host.querySelector('.quick-grid').children).toHaveLength(2)   // Start + Weigh in
    expect(card('Water')).toBeFalsy()
    expect(card('Habits')).toBeFalsy()
    expect(host.querySelector('.quick-pill').textContent).toContain('Add a note')
  })

  it('the water card opens the cups; they log with the Undo', () => {
    seed({ modules: { water: true } })
    open()
    into('Water')
    expect(useUI.getState().sheets).toHaveLength(2)
    act(() => chip('+250').click())
    const entries = Object.values(useStore.getState().S.water || {})
    expect(entries.filter(e => e.ml > 0).map(e => e.ml)).toEqual([250])
    expect(entries.every(e => e.d === T())).toBe(true)
    act(() => useUI.getState().runToastAction())
    expect(Object.values(useStore.getState().S.water).every(e => e.ml === undefined)).toBe(true)
  })

  it('a Custom chip in the water sheet opens the amount sheet', () => {
    seed({ modules: { water: true } })
    open()
    into('Water')
    act(() => chip('Custom…').click())
    expect(useUI.getState().sheets).toHaveLength(3)
  })

  it('the habits card opens the check list; ticking counts back on the card', () => {
    const S = { modules: { habits: true } }
    addHabit(S, { name: 'Read', type: 'timed', target: 20 }, { id: 'h1', now: Date.now() - 86400000 })
    seed(S)
    open()
    expect(card('Habits').textContent).toContain('0 of 1 done today')
    into('Habits')
    const check = host.querySelector('.habit-check')
    expect(check.getAttribute('aria-pressed')).toBe('false')
    act(() => check.click())
    expect(useStore.getState().S.habitLogs).toBeTruthy()
    expect(Object.values(useStore.getState().S.habitLogs).some(l => l.d === T() && l.sec === 1200)).toBe(true)
    pop()
    expect(host.querySelector('h3').textContent).toBe('Actions')     // back on the grid
    expect(card('Habits').textContent).toContain('1 of 1 done today')
  })

  it('the food card repeats the recent meal with one tap; the deep chips replace its sheet', () => {
    const S = { modules: { food: true }, food: {} }
    addFood(S, { d: T(), kcal: 300, protein: 12, label: 'Yogurt' }, { id: 'f1', now: 1 })
    seed(S)
    open()
    into('Food')
    act(() => chip('Yogurt').click())
    expect(Object.values(useStore.getState().S.food).filter(f => f.kcal > 0).length).toBe(2)
    act(() => chip('From saved…').click())
    expect(useUI.getState().sheets).toHaveLength(2)   // the hub, then the picker in the food sheet's place
  })

  it('weigh-in and a note open straight from the grid', () => {
    seed({})
    open()
    act(() => card('Weigh in').click())
    expect(useUI.getState().sheets).toHaveLength(1)
    useUI.setState({ sheets: [] })
    open()
    act(() => host.querySelector('.quick-pill').click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })
})
