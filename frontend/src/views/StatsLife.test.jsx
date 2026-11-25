// @vitest-environment happy-dom
// /stats/life (views/StatsLife.jsx): the cards follow the module toggles, the range control drives
// them, and the comparisons come from lib/insights.js. The charts are stood in for; what is under
// test is which cards exist, what they say, and that an off module leaves no trace.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { addDays, eachDay, stretchOf } from '../lib/life-stats.js'
import { todayISO } from '../lib/format.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../components/LineChart.jsx', () => ({ default: () => null }))
vi.mock('../components/DayHeatmap.jsx', () => ({ default: () => null }))

import StatsLife from './StatsLife.jsx'
import StatsViews from '../components/StatsViews.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const T = todayISO()                                     // the day the page itself reads as today
let host, root

beforeEach(() => {
  mocks.nav.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = '' })

// Forty trained days and twenty off ones, with a night, a drink, steps and a check each day, so
// every module has something to show and the insights have two sides to compare.
const seed = (modules = {}) => {
  const S = {
    unit: 'kg', weekStart: 1, week: {}, dayPlan: {}, routines: [], workouts: [], bodyweight: [],
    water: {}, habitDefs: {}, habitLogs: {}, steps: {}, sleep: {}, food: {}, modules, _ts: 0,
  }
  S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025' }] }]
  S.week = { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }
  S.habitDefs.h1 = { name: 'Read', type: 'yesno', target: 0, schedule: { kind: 'daily' }, createdAt: 0, _ts: 1 }
  for (let i = 60; i >= 1; i--) {
    const d = addDays(T, -i)
    const trained = i <= 40
    const hours = i <= 20 ? 8 : i <= 40 ? 6 : 7
    S.sleep['n' + d] = { d, s: Date.parse(d + 'T12:00:00Z') - hours * 3600000, e: Date.parse(d + 'T12:00:00Z'), _ts: 1 }
    S.water['w' + d] = { d, ml: 1200, _ts: 1 }
    S.water['v' + d] = { d, ml: 1000, _ts: 1 }
    S.steps['s' + d] = { d, n: trained ? 11000 : 6000, o: 'com.x', _ts: 1 }
    S.habitLogs['c' + d] = { h: 'h1', d, _ts: 1 }
    if (trained) S.workouts.push({ id: 'w' + d, d, start: Date.parse(d + 'T17:00:00Z'), end: Date.parse(d + 'T18:00:00Z'), name: 'Push',
      entries: [{ id: '0025', target: { id: '0025', sets: 1, reps: 5 }, sets: [{ w: hours === 8 ? 100 : 60, r: 5, done: true }] }] })
  }
  useStore.setState({ S, user: null, ready: true })
}

const mount = Comp => act(() => root.render(<Comp />))
const heads = () => [...host.querySelectorAll('.card h2')].map(e => e.textContent)
const text = () => host.textContent

describe('the cards follow the toggles', () => {
  it('only the modules that are on get a card', () => {
    seed({ water: true, sleep: true })
    mount(StatsLife)
    expect(heads()).toEqual(['Perfect days', 'Water', 'Sleep', 'What goes together'])
  })

  it('Everything on gives the whole set: the Month grid pairs, habits sits under it', () => {
    seed({ water: true, habits: true, steps: true, sleep: true, food: true, levels: true })
    mount(StatsLife)
    expect(heads()).toEqual(['Perfect days', 'Water', 'Steps', 'Sleep', 'Food', 'Levels', 'Habits', 'What goes together'])
  })

  it('a module switched off between renders takes its card away with it', () => {
    seed({ water: true, steps: true })
    mount(StatsLife)
    expect(heads()).toContain('Steps')
    seed({ water: true })
    act(() => root.render(<StatsLife />))
    expect(heads()).not.toContain('Steps')
  })

  it('with nothing life-shaped the page says so and offers the Modules settings', () => {
    seed({})
    mount(StatsLife)
    expect(text()).toContain('Nothing life-shaped is switched on yet')
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Choose modules').click() })
    expect(mocks.nav).toHaveBeenCalledWith('/settings/modules')
  })
})

// How many days of a stretch have passed, the way the page counts them (calendar stretches
// carry days ahead of today; the numbers judge only what has happened).
const elapsed = p => eachDay(p.from, p.to).filter(d => d <= T).length

describe('the numbers on the cards', () => {
  it('this month of water: days at goal and the average day', () => {
    seed({ water: true })
    mount(StatsLife)
    const owed = elapsed(stretchOf('month', T))           // every day of the month so far has a drink bar today
    expect(text()).toContain(`${owed - 1}/${owed}, 2,200 ml avg`)
  })

  it('the range control re-derives everything', () => {
    seed({ water: true })
    mount(StatsLife)
    const pick = label => act(() => { [...host.querySelectorAll('.seg-range button')].find(b => b.textContent === label).click() })
    expect(host.querySelector('.seg-range .on').textContent).toBe('Month')
    pick('3 Months')
    expect(host.querySelector('.seg-range .on').textContent).toBe('3 Months')
    expect(text()).toContain(`${elapsed(stretchOf('quarter', T))} days so far in this stretch`)
  })

  it('the habits card lists each habit with its kept days over its due ones', () => {
    seed({ habits: true })
    mount(StatsLife)
    expect(text()).toContain('Read')
    expect(text()).toMatch(`${elapsed(stretchOf('month', T)) - 1}/${elapsed(stretchOf('month', T))}`)  // daily, every day but today checked
  })

  it('sleep reads in hours and minutes, not as a bare number', () => {
    seed({ sleep: true })
    mount(StatsLife)
    expect(text()).toMatch(/\d+\/\d+, \d+h \d+m avg/)
  })
})

describe('the stretch layouts', () => {
  const pick = label => act(() => { [...host.querySelectorAll('.seg-range button')].find(b => b.textContent === label).click() })

  it('Month draws day squares - one per calendar day, in the perfect grid and every module card', () => {
    seed({ water: true })
    mount(StatsLife)
    const grids = [...host.querySelectorAll('.msq')]
    expect(grids.length).toBe(2)                       // the perfect-day card and the water card
    const monthDays = new Date(Number(T.slice(0, 4)), Number(T.slice(5, 7)), 0).getDate()
    expect(grids[1].querySelectorAll('.hm-c').length).toBe(monthDays)
    expect(grids[0].querySelectorAll('.msq-date').length).toBe(monthDays)  // the perfect card is a dated calendar
    expect(grids[1].querySelectorAll('.msq-date').length).toBe(0)          // module cards keep plain squares
  })

  it('Month pairs the small cards two to a row, habits under the grid', () => {
    seed({ water: true, habits: true, steps: true, sleep: true, food: true, levels: true })
    mount(StatsLife)
    const grid = host.querySelector('.life-grid')
    expect(grid).toBeTruthy()
    expect(host.querySelectorAll('.life-grid > .lg-span').length).toBe(1)
    expect(grid.firstElementChild.querySelector('h2').textContent).toBe('Perfect days')
    expect([...grid.children].map(c => c.querySelector('h2').textContent))
      .toEqual(['Perfect days', 'Water', 'Steps', 'Sleep', 'Food'])
    const [levels, habits] = [grid.nextElementSibling, grid.nextElementSibling.nextElementSibling]
    expect(levels.querySelector('h2').textContent).toBe('Levels')
    expect(habits.querySelector('h2').textContent).toBe('Habits')
  })

  it('the grid is the Month view alone - other stretches never pair', () => {
    seed({ water: true, steps: true })
    mount(StatsLife)
    expect(host.querySelector('.life-grid')).toBeTruthy()
    pick('3 Months')
    expect(host.querySelector('.life-grid')).toBeNull()
    pick('Year')
    expect(host.querySelector('.life-grid')).toBeNull()
    pick('All time')
    expect(host.querySelector('.life-grid')).toBeNull()
    pick('Month')
    expect(host.querySelector('.life-grid')).toBeTruthy()
  })

  it('3 Months draws the weekly line and no squares', () => {
    seed({ water: true })
    mount(StatsLife)
    pick('3 Months')
    expect(host.querySelectorAll('.msq').length).toBe(0)
    expect(text()).toMatch(/\d+\/\d+, [\d,]+ ml avg/)
  })

  it('Year and All time draw one bar per month, and stop at the present', () => {
    seed({ water: true })
    mount(StatsLife)
    const bars = () => [...host.querySelectorAll('.card .sbar-row')]
    pick('Year')
    const months = Number(T.slice(5, 7))               // January through this month, no future bars
    const dayN = Number(T.slice(8, 10))
    expect(bars().length).toBe(months)
    const vals = bars().map(b => b.querySelector('.sbar-v').textContent)
    // This month's bar averages every passed day, and today holds no drink (the seed leaves it out).
    expect(vals[months - 1]).toBe(`${Math.round(2200 * (dayN - 1) / dayN).toLocaleString()} ml`)
    pick('All time')
    const all = bars().filter(b => b.querySelector('.sbar-v').textContent !== '0 ml')
    expect(all.length).toBeGreaterThanOrEqual(3)       // the seed's sixty days, month by month
    expect(all.every(b => Number(b.querySelector('.sbar-v').textContent.replace(/[^0-9]/g, '')) > 1500)).toBe(true)
  })
})

describe('the comparisons', () => {
  it('two sides of data give the sleep line and the counts it looked at', () => {
    seed({ sleep: true, water: true, steps: true, habits: true })
    mount(StatsLife)
    expect(text()).toContain('Sleep and volume')
    expect(text()).toContain('sessions')
    expect(text()).toContain('Water on training days')
  })

  it('a thin log says it is waiting rather than showing zeros', () => {
    useStore.setState({ S: { unit: 'kg', week: {}, dayPlan: {}, routines: [], workouts: [], water: {}, habitDefs: {}, habitLogs: {}, steps: {}, sleep: {}, modules: { sleep: true }, _ts: 0 }, user: null, ready: true })
    mount(StatsLife)
    expect(text()).toContain('Nothing has two sides yet')
  })
})

describe('the top tabs', () => {
  it('exist while a life module is on, and name both halves', () => {
    seed({ levels: true })
    mount(() => <StatsViews view="train" />)
    const buttons = [...host.querySelectorAll('.stats-views button')].map(b => b.textContent)
    expect(buttons).toEqual(['Training', 'Life'])
    expect(host.querySelector('.stats-views .on').textContent).toBe('Training')
  })

  it('are gone with nothing on, so the Life half leaves no trace', () => {
    seed({})
    mount(() => <StatsViews view="train" />)
    expect(host.querySelector('.stats-views')).toBeNull()
  })

  it('the other half is a navigation, not a hidden section, and says it is a peer', () => {
    seed({ water: true })
    mount(() => <StatsViews view="train" />)
    act(() => { [...host.querySelectorAll('.stats-views button')].find(b => b.textContent === 'Life').click() })
    // `peer` is what lib/page-motion.js needs to fade it like a tab instead of sliding it in like
    // a level: /stats/life nests under /stats by path only.
    expect(mocks.nav).toHaveBeenCalledWith('/stats/life', { replace: true, state: { peer: true } })
  })
})
