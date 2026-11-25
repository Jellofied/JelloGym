// @vitest-environment happy-dom
// The browser camera sheet also shares its decoder with lib/scan.js. Keep that import lazy: the
// decoder is a large chunk, and a static import here would pull it into the sheet's own chunk.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const m = vi.hoisted(() => ({ decode: vi.fn(), tracks: [] }))
vi.mock('../lib/scan-web.js', () => ({ decodeSource: m.decode }))
const { default: CameraScan } = await import('./CameraScan.jsx')

let host, root
beforeEach(() => {
  m.decode.mockReset()
  m.decode.mockResolvedValue({ value: 'gym://checkin/abc', fmt: 'qr' })
  m.tracks = [{ stop: vi.fn() }]
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => m.tracks })) },
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: async () => {} })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', { configurable: true, set() {}, get: () => null })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 2 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete navigator.mediaDevices
})

it('decodes a camera frame through the lazy scan-web import', async () => {
  const onFound = vi.fn()
  await act(async () => { root.render(<CameraScan onFound={onFound} onCancel={() => {}} />) })
  await vi.waitFor(() => expect(onFound).toHaveBeenCalledWith({ value: 'gym://checkin/abc', fmt: 'qr' }))
  expect(m.decode).toHaveBeenCalled()
  expect(m.tracks[0].stop).toHaveBeenCalled()
})
