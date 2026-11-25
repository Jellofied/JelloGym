// @vitest-environment happy-dom
// The Life hub: one row per enabled module with today's number; off modules leave no row;
// Levels puts its card on top. (The tab's own existence is TabBar's job, tested there.)
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from '../store/useStore.js'

const navs = []
vi.mock('react-router-dom', () => ({ useNavigate: () => (to, ...r) => { navs.push([to, ...r]) } }))
const { default: Life } = await import('./Life.jsx')

const clone = o => JSON.parse(JSON.stringify(o))
let host, root
const seed = (mods, over = {}) => useStore.setState({ S: { ...clone(DEF), modules: mods, ...over }, user: null })
const rows = () => [...host.querySelectorAll('.lrow-t')].map(e => e.textContent)
const subs = () => [...host.querySelectorAll('.lrow-s')].map(e => e.textContent)
const rowFor = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  navs.length = 0
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = () => act(() => root.render(<Life />))

describe('the Life hub', () => {
  it('shows the water and body rows with today’s numbers', () => {
    seed({ water: true })
    mount()
    expect(rows()).toEqual(['Water', 'Body'])
    expect(subs()[0]).toContain('of 2000 ml today')
    act(() => rowFor('Water').click())
    expect(navs[0][0]).toBe('/water')
    act(() => rowFor('Body').click())
    expect(navs[1][0]).toBe('/stats?section=body')
  })

  it('habits counts what is due and done; steps and food read their helpers', () => {
    const today = new Date(); today.setHours(12)
    const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
    seed({ water: true, habits: true, steps: true, food: true }, {
      habitDefs: { h1: { name: 'Read', type: 'timed', target: 20, schedule: { kind: 'daily' }, createdAt: today.getTime(), _ts: 1 } },
      habitLogs: { a: { h: 'h1', d: iso, sec: 1200, _ts: 1 } },
      steps: { s1: { d: iso, n: 9000, o: 'x', _ts: 1 } },
      food: { f1: { d: iso, kcal: 1200, protein: 60, _ts: 1 } },
    })
    mount()
    expect(rows()).toEqual(['Water', 'Habits', 'Steps', 'Food', 'Body'])
    expect(subs()[1]).toBe('1 of 1 done today')
    expect(subs()[2]).toContain('of 8,000 steps today')
    expect(subs()[3]).toContain('1,200 of 2,200 kcal')
  })

  it('puts the level card on top when Levels is on', () => {
    seed({ levels: true })
    mount()
    expect(host.querySelector('.card-head-title')?.textContent).toMatch(/^Level \d+$/)
    expect(rows()).toEqual(['Body'])
  })

  it('says so when nothing life-ish is switched on', () => {
    seed({})
    mount()
    expect(host.textContent).toContain('Body')
    expect(rows()).toEqual(['Body'])   // body is legacy-on, never a "life" module
  })
})
