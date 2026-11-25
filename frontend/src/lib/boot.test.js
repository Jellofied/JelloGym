// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { bootWait, handOverFromLaunchScreen } from './boot.js'

const core = vi.hoisted(() => ({ hide: vi.fn(() => Promise.resolve()), registerPlugin: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin: core.registerPlugin }))

afterEach(() => {
  delete window.Capacitor
  core.registerPlugin.mockReset()
  core.hide.mockReset()
})

it('lets the logo finish building before it goes', () => {
  expect(bootWait(100, false)).toBe(600)
  expect(bootWait(720, false)).toBe(0)
})

it('waits for the bar to be back on the floor once it is moving', () => {
  expect(bootWait(750, false)).toBe(0)
  expect(bootWait(750 + 300, false)).toBe(950)
  expect(bootWait(750 + 1250 * 3 + 1200, false)).toBe(50)
})

it('goes at once with reduced motion or no timing to read', () => {
  expect(bootWait(300, true)).toBe(0)
  expect(bootWait(NaN, false)).toBe(0)
})

it('hands over from the launch screen only in the app', async () => {
  core.registerPlugin.mockReturnValue({ hide: core.hide })
  window.Capacitor = { isNativePlatform: () => true }
  await handOverFromLaunchScreen()
  expect(core.registerPlugin).toHaveBeenCalledWith('SplashScreen')
  expect(core.hide).toHaveBeenCalledWith({ fadeOutDuration: 180 })

  core.registerPlugin.mockClear()
  window.Capacitor = { isNativePlatform: () => false }
  await handOverFromLaunchScreen()
  expect(core.registerPlugin).not.toHaveBeenCalled()
})
