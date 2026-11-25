// @vitest-environment happy-dom
// A cold chunk must show the shared loading state, not an empty page (design audit issue 2).
import React, { act, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import RouteLoading from './RouteLoading.jsx'

let host, root
let settleView, pendingView
const PendingView = lazy(() => {
  pendingView = new Promise(resolve => { settleView = resolve })
  return pendingView
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it('shows the shared fallback while a lazy view is pending, then the view', async () => {
  await act(async () => root.render(<Suspense fallback={<RouteLoading />}><PendingView /></Suspense>))
  const loading = host.querySelector('[role="status"]')
  expect(loading).not.toBeNull()
  expect(loading.className).toContain('route-loading')
  expect(loading.textContent).toContain('Loading…')
  expect(host.querySelector('.route-loading-mark')).not.toBeNull()

  await act(async () => {
    settleView({ default: () => <div className="loaded-view">Water</div> })
    await pendingView
  })
  await act(async () => {})
  expect(host.textContent).toContain('Water')
  expect(host.querySelector('.route-loading')).toBeNull()
})

it('App uses the shared fallback at every lazy boundary', () => {
  const app = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8')
  expect(app).not.toMatch(/fallback=\{null\}/)
  expect(app).toContain('fallback={<RouteLoading />}')
  expect(app).toContain('fallback={<RouteLoading compact />}')
})
