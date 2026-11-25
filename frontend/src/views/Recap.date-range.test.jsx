// @vitest-environment happy-dom
//
// The screenshot in docs/audits/design-audit.md showed /recap reading "Your week Invalid Date" on
// an ordinary day. The pure period helper is covered in lib/recap.test.js; this pins the rendered
// header, so a call site that leaves `today` out cannot bring the defect back.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ S: null, nav: vi.fn() }))
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector({ S: mocks.S }) : { S: mocks.S }
  return { useStore }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../components/Recap.jsx', () => ({ recapSheet: () => {} }))

import LifeRecap from './Recap.jsx'

let host, root
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T12:00:00'))
  mocks.S = { unit: 'kg', weekStart: 1, modules: {} }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  mocks.nav.mockClear()
})

describe('/recap header', () => {
  it('shows the last closed week as a valid local date range on a day with no recap due', () => {
    act(() => root.render(<LifeRecap />))
    expect(host.querySelector('h1').textContent).toBe('Your week')
    expect(host.querySelector('.sub').textContent).toBe('Mon 16 Nov – Sun 22 Nov')
    expect(host.textContent).not.toContain('Invalid Date')
  })
})
