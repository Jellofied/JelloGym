// @vitest-environment happy-dom
// The Water Home card (WaterCard.jsx): the ring shows the goal, a chip tap logs a drink, the
// Undo toast removes it again, and the release of a long press opens the custom sheet WITHOUT also
// logging (the click after a fired long press is swallowed).
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { WATER_LONG_PRESS_MS } from './WaterQuickAdds.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
const { default: WaterCard } = await import('./WaterCard.jsx')

const clone = o => JSON.parse(JSON.stringify(o))
let host, root

const seed = S => useStore.setState({ S: { ...clone(DEF), ...S }, user: null })
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }))
const chips = () => [...host.querySelectorAll('.chip')]
const water = () => useStore.getState().S.water || {}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

describe('the Water card', () => {
  it("rings today's drinks against the goal", () => {
    seed({ water: { a1: { d: todayISO(), ml: 1000, _ts: 5 } }, waterGoal: 2000 })
    act(() => root.render(<WaterCard />))
    const ring = host.querySelector('[role="progressbar"]')
    expect(ring.getAttribute('aria-valuenow')).toBe('50')
    expect(host.textContent).toContain('1000')
    expect(host.textContent).toContain('2000 ml today')
  })

  it('a chip tap logs that amount and the Undo removes it', () => {
    seed({})
    act(() => root.render(<WaterCard />))
    expect(chips().map(c => c.textContent)).toEqual(['+250', '+500', '+750'])
    const before = Object.keys(water()).length
    act(() => fire(chips()[1], 'pointerdown'))
    act(() => { fire(chips()[1], 'pointerup'); fire(chips()[1], 'click') })
    const ids = Object.keys(water()).filter(id => water()[id].ml)
    expect(ids.length).toBe(before + 1)
    expect(water()[ids[0]]).toMatchObject({ d: todayISO(), ml: 500 })
    expect(useUI.getState().toastAction?.label).toBe('Undo')
    act(() => useUI.getState().runToastAction())
    expect(water()[ids[0]].ml).toBeUndefined()
    expect(water()[ids[0]]._ts).toBeTruthy()
  })

  it('the last-used amount leads the chips', () => {
    seed({ water: { a1: { d: '2026-01-01', ml: 330, _ts: 9 } } })
    act(() => root.render(<WaterCard />))
    expect(chips().map(c => c.textContent)).toEqual(['+330', '+250', '+500', '+750'])
  })

  it('a long press opens the custom sheet and its release does not log', () => {
    vi.useFakeTimers()
    seed({})
    act(() => root.render(<WaterCard />))
    const before = Object.keys(water()).length
    const chip = chips()[0]
    act(() => fire(chip, 'pointerdown'))
    act(() => vi.advanceTimersByTime(WATER_LONG_PRESS_MS + 10))
    expect(useUI.getState().sheets.length).toBe(1)   // the sheet opened
    act(() => fire(chip, 'pointerup'))
    act(() => fire(chip, 'click'))                    // the trailing click must be swallowed
    expect(Object.keys(water()).length).toBe(before)
    expect(useUI.getState().sheets.length).toBe(1)
  })
})
