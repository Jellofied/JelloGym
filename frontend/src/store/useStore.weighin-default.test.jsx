// @vitest-environment happy-dom
// "Weigh in before workouts" starts on, for a profile created from nothing as for one that
// already exists: the step is one tap to skip and it is the curve's first honest point. It used to
// be forced off for new profiles, which read as a step that had gone missing. A profile that
// turned it off keeps it off (`weighIn === false` all the way through), and one saved before the
// setting existed (no key) still reads as on through DEF and `!== false`.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

import { freshState, DEF, restoredStateFor, restartedState, useStore } from './useStore.js'

describe('weigh-in default', () => {
  it('a fresh profile starts with the weigh-in on', () => {
    expect(freshState().weighIn).toBe(true)
  })

  it('DEF keeps it on, so an existing profile without the key is not changed under it', () => {
    expect(DEF.weighIn).toBe(true)
    const old = { workouts: [{ id: 'w1' }], routines: [] }         // written before the setting existed
    const S = restoredStateFor({ workouts: [], routines: [], bodyweight: [], customEx: [] }, old)
    expect(S.weighIn).toBe(true)
    const off = restoredStateFor({ workouts: [], routines: [], bodyweight: [], customEx: [] }, { ...old, weighIn: false })
    expect(off.weighIn).toBe(false)                                // an explicit off is still an off
  })
})

describe('exercise animations default', () => {
  it('a fresh profile starts with Small animations, the thumbnail on the workout screen', () => {
    expect(freshState().gifSize).toBe('mini')
  })

  it('DEF keeps Full, so an existing profile without the key is not changed under it', () => {
    expect(DEF.gifSize).toBe('full')
    const S = restoredStateFor({ workouts: [], routines: [], bodyweight: [], customEx: [] }, { workouts: [{ id: 'w1' }], routines: [] })
    expect(S.gifSize).toBe('full')
  })
})

// A reset, or another account signing in on this device, starts a new profile: the same new
// defaults as a first run, in the language already on screen, and the reset keeps its stamps.
describe('starting over', () => {
  const old = () => ({ ...JSON.parse(JSON.stringify(DEF)), lang: 'de', weighIn: true, gifSize: 'full', resetAt: 5, resetIds: { workouts: ['w-old'] }, workouts: [{ id: 'w1', d: '2026-09-01', entries: [] }] })
  afterEach(() => { localStorage.clear(); useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user: null, ready: false }) })

  it('Reset everything gives the weigh-in step on and small animations, in the same language', async () => {
    useStore.setState({ S: old(), user: null })
    await useStore.getState().resetEverything()
    const S = useStore.getState().S
    expect(S.weighIn).toBe(true)
    expect(S.gifSize).toBe('mini')
    expect(S.lang).toBe('de')
    expect(S.langAuto).toBe(false)
    expect(S.workouts).toEqual([])
    expect(S.resetAt).toBeGreaterThan(5)
    expect(S.resetIds.workouts).toEqual(expect.arrayContaining(['w-old', 'w1']))
  })

  it('restartedState keeps a language nobody picked yet marked as such', () => {
    expect(restartedState({ lang: 'ar', langAuto: true })).toMatchObject({ lang: 'ar', langAuto: true, weighIn: true, gifSize: 'mini' })
  })

  it('another account signing in on this device starts from the same new profile', () => {
    localStorage.setItem('gym_owner', 'user-1')
    useStore.setState({ S: old(), user: { id: 'user-1' } })
    useStore.getState().setUser({ id: 'user-2', name: 'Two' })
    const S = useStore.getState().S
    expect(S.workouts).toEqual([])
    expect(S.weighIn).toBe(true)
    expect(S.gifSize).toBe('mini')
    expect(S.lang).toBe('de')
  })
})
