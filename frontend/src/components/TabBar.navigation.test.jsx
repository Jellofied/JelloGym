// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, router, originalS, originalUser, onStart
beforeEach(() => {
  const store = useStore.getState()
  originalS = store.S
  originalUser = store.user
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user: { id: 'test', name: 'test' } })
  useUI.setState({ sheets: [] })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  onStart = vi.fn()
  router = createMemoryRouter([{ path: '*', element: <TabBar onStart={onStart} /> }], { initialEntries: ['/home'] })
  act(() => root.render(<RouterProvider router={router} />))
})
afterEach(() => {
  act(() => root.unmount())
  router.dispose()
  host.remove()
  useStore.setState({ S: originalS, user: originalUser })
  useUI.setState({ sheets: [] })
})
const tap = async label => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label)
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
const go = async to => { await act(async () => router.navigate(to)) }

describe('root tab history', () => {
  it('does not accumulate a back stack when switching tabs repeatedly', async () => {
    for (let i = 0; i < 3; i++) {
      for (const label of ['Workout', 'Stats', 'Home']) await tap(label)
    }
    await tap('Workout')
    expect(router.state.location.pathname).toBe('/plan')
    await go(-1)
    expect(router.state.location.pathname).toBe('/plan')
  })

  it('ignores a tap on the current root, but clears a tab query when returning to its root', async () => {
    const key = router.state.location.key
    await tap('Home')
    expect(router.state.location.key).toBe(key)
    await go('/stats?range=month')
    await tap('Stats')
    expect(router.state.location.pathname).toBe('/stats')
    expect(router.state.location.search).toBe('')
  })

  it('still pushes a detail page and returns to the tab it opened from', async () => {
    await tap('Workout')
    await go('/plan/r/one')
    await go(-1)
    expect(router.state.location.pathname).toBe('/plan')
    await go('/settings/workout')
    await go(-1)
    expect(router.state.location.pathname).toBe('/plan')
  })

  it('opens a different tab root from a nested page of the active tab', async () => {
    await go('/plan/r/one')
    await tap('Workout')
    expect(router.state.location.pathname).toBe('/plan')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('preserves the workout chooser return path, opened from the Start sheet', async () => {
    useStore.setState({ S: { ...useStore.getState().S, routines: [] } })
    await tap('Actions')                                      // idle: the disc opens the hub
    expect(useUI.getState().sheets).toHaveLength(1)
    const sheet = useUI.getState().sheets.at(-1)
    const sheetHost = document.createElement('div')
    document.body.appendChild(sheetHost)
    const sheetRoot = createRoot(sheetHost)
    try {
      act(() => sheetRoot.render(sheet.render(() => useUI.setState({ sheets: [] }))))
      const startBtn = [...sheetHost.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Start workout'))
      expect(startBtn).toBeTruthy()
      await act(async () => startBtn.click())                // the hub's primary action starts
      expect(router.state.location.pathname).toBe('/workout')
      await go(-1)
      expect(router.state.location.pathname).toBe('/home')
      expect(onStart).not.toHaveBeenCalled()
    } finally {
      act(() => sheetRoot.unmount())
      sheetHost.remove()
    }
  })
})
