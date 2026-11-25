// @vitest-environment happy-dom
// Settings → Modules → Card order: the rows Home actually shows, and Move down writing the
// visible order into S.homeOrder. (The sort rule itself is lib/home-order.test.js.)
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import ModulesPage from './Modules.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({ api: () => Promise.resolve({}) }))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const setS = (over = {}) => useStore.setState(s => ({ ...s, S: { ...s.S, modules: { water: true, habits: true }, homeOrder: null, ...over } }))
const section = () => [...host.querySelectorAll('.sect')].find(s => s.querySelector('.sect-t')?.textContent === 'Card order')
const titles = () => [...section().querySelectorAll('.lrow-t')].map(e => e.textContent)
const downs = () => [...section().querySelectorAll('button[aria-label="Move down"]')]

describe('Modules — card order editor', () => {
  it('lists the cards Home shows, in the default order, ends disabled', () => {
    setS()
    act(() => root.render(<ModulesPage />))
    const ids = titles()
    expect(ids[0]).toBe('Recap')
    expect(ids).toContain('Water')
    expect(ids).toContain('Habits')
    expect(ids.indexOf('Water')).toBeLessThan(ids.indexOf('Habits'))
    expect(section().querySelectorAll('button[aria-label="Move up"]')[0].disabled).toBe(true)
    expect(downs()[ids.length - 1].disabled).toBe(true)
  })

  it('Move down swaps the two cards and writes the visible order to the store', () => {
    setS()
    act(() => root.render(<ModulesPage />))
    const ids = titles()
    const i = ids.indexOf('Water')
    act(() => { downs()[i].click() })
    expect(titles()).toEqual([...ids.slice(0, i), ids[i + 1], ids[i], ...ids.slice(i + 2)])
    const saved = useStore.getState().S.homeOrder
    expect(saved).toHaveLength(ids.length)
    expect(saved.indexOf('habits')).toBeLessThan(saved.indexOf('water'))
  })

  it('a moved order reads back; a card the move predates lands after the moved ones', () => {
    // the user moved food before water; habits was off at the time and comes back at the bottom
    setS({ modules: { water: true, habits: true, food: true }, homeOrder: ['food', 'water'] })
    act(() => root.render(<ModulesPage />))
    const ids = titles()
    expect(ids[0]).toBe('Food')
    expect(ids.indexOf('Water')).toBe(1)
    expect(ids.indexOf('Habits')).toBeGreaterThan(ids.indexOf('Water'))
  })
})
