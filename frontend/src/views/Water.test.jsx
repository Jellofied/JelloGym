// @vitest-environment happy-dom
// The /water page (slice 1b): today's card, the goal-line chart with its buckets, and the
// history — edit opens the drink sheet, the trash writes a tombstone and its Undo brings it back.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const navs = []
vi.mock('react-router-dom', () => ({ useNavigate: () => (to, ...rest) => { navs.push([to, ...rest]) } }))
const { default: Water } = await import('./Water.jsx')

const clone = o => JSON.parse(JSON.stringify(o))
let host, root
const D = '2026-11-14'
const seed = S => useStore.setState({ S: { ...clone(DEF), ...S }, user: null })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  navs.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = () => act(() => root.render(<Water />))
const trash = () => [...host.querySelectorAll('[aria-label="Delete"]')]
const pencil = () => [...host.querySelectorAll('[aria-label="Edit"]')]
const topDrinkIds = () => Object.keys(useStore.getState().S.water || {})

describe('the /water page', () => {
  it('shows the ring card, the chart and the days it has', () => {
    seed({ modules: { water: true }, water: { a1: { d: D, ml: 250, _ts: 1 }, a2: { d: D, ml: 500, _ts: 2 }, a3: { d: '2026-11-12', ml: 750, _ts: 3 } }, waterGoal: 2000 })
    mount()
    expect(host.textContent).toContain('Water')
    expect(host.querySelector('svg')).toBeTruthy()          // the goal-line chart
    expect(host.querySelector('[role="progressbar"]')).toBeTruthy()
    expect(host.textContent).toContain('750 ml')            // the older day in the history
    expect(host.querySelector('.chip')).toBeTruthy()        // the embedded card still quick-adds
    expect(host.textContent).not.toContain('All drinks')    // no self-link on the page
  })

  it('the buckets toggle redraws the chart without touching the data', () => {
    seed({ modules: { water: true }, water: { a1: { d: D, ml: 250, _ts: 1 } } })
    mount()
    const before = clone(topDrinkIds())
    const week = [...host.querySelectorAll('.seg button')].find(b => b.textContent.trim() === 'Week')
    act(() => week.click())
    expect(week.getAttribute('aria-pressed')).toBe('true')
    expect(clone(topDrinkIds())).toEqual(before)
  })

  it('a trash tap tombstones the drink and the Undo stamp brings it back', () => {
    seed({ modules: { water: true }, water: { a1: { d: D, ml: 250, _ts: 1 } } })
    mount()
    act(() => trash()[0].click())
    expect(useStore.getState().S.water.a1).toEqual({ _ts: expect.any(Number) })
    expect(useUI.getState().toastAction?.label).toBe('Undo')
    act(() => useUI.getState().runToastAction())
    expect(useStore.getState().S.water.a1.ml).toBe(250)
  })

  it('the pencil opens the drink sheet, and saving retypes it on its day', () => {
    seed({ modules: { water: true }, water: { a1: { d: D, ml: 250, _ts: 1 } } })
    mount()
    act(() => pencil()[0].click())
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    const box = document.createElement('div')
    document.body.appendChild(box)
    const r2 = createRoot(box)
    act(() => r2.render(sheet.render(() => {})))
    const input = box.querySelector('input')
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, '900')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => [...box.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click())
    expect(useStore.getState().S.water.a1.ml).toBe(900)
    expect(useStore.getState().S.water.a1.d).toBe(D)
    act(() => r2.unmount()); box.remove()
  })
})
