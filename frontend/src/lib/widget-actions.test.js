// @vitest-environment happy-dom
// A widget's tap is queued natively and applied here (lib/widget-actions.js), with the same pure
// water mutator the screens use and an ack only after the mirror is on disk.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => { vi.stubEnv('VITE_MOBILE', '1'); return { platform: 'android' } })
vi.mock('./mobile.js', () => ({ MOBILE: true, nativePlatform: async () => h.platform }))

const { canApplyWidgetAction, applyWidgetAction, drainWidgetActions, startWidgetActions, _setWidgetActionPluginForTest, _resetWidgetActions } = await import('./widget-actions.js')
const { DAY_NOTE_TAGS } = await import('./day-notes.js')
const { dayTotal } = await import('./water.js')

const D = '2026-11-14'
const S0 = { modules: { water: true }, water: {} }
const ev = (id = 'tap1', over = {}) => ({ id, action: 'water', d: D, ml: 250, ...over })
const store = (S = S0, ready = true) => {
  const st = {
    ready,
    S,
    getState: () => st,
    update (fn) { const draft = JSON.parse(JSON.stringify(st.S)); fn(draft); st.S = draft },
    saveNow: vi.fn(async () => {}),
  }
  return st
}

describe('widget action validation and apply', () => {
  it('accepts a whole ml for a real day while Water is on', () => {
    expect(canApplyWidgetAction(S0, ev())).toBe(true)
    expect(canApplyWidgetAction(S0, ev('x', { ml: 2001 }))).toBe(false)
    expect(canApplyWidgetAction(S0, ev('x', { ml: 0 }))).toBe(false)
    expect(canApplyWidgetAction(S0, ev('x', { d: 'nope' }))).toBe(false)
    expect(canApplyWidgetAction(S0, ev('x', { action: 'food' }))).toBe(false)
    expect(canApplyWidgetAction({ modules: { water: false } }, ev())).toBe(false)
    expect(canApplyWidgetAction(S0, null)).toBe(false)
  })

  it('accepts only the four generic note tags from the widget', () => {
    for (const tag of DAY_NOTE_TAGS) {
      const action = ev('n1', { action: 'day-note', tag, text: 'Pick up milk' })
      expect(canApplyWidgetAction(S0, action)).toBe(true)
      const S = { dayNotes: {} }
      expect(applyWidgetAction(S, action, { now: 10 })).toBe('n1')
      expect(S.dayNotes[D]).toEqual({ tag, text: 'Pick up milk', _ts: 10 })
    }
    expect(canApplyWidgetAction(S0, ev('n1', { action: 'day-note', tag: 'sick' }))).toBe(false)
  })

  it('writes the entry under the tap id, so a replay cannot double the drink', () => {
    const S = JSON.parse(JSON.stringify(S0))
    expect(applyWidgetAction(S, ev(), { now: 10 })).toBe('tap1')
    expect(S.water.tap1).toEqual({ d: D, ml: 250, _ts: 10 })
    expect(dayTotal(S, D)).toBe(250)
    expect(applyWidgetAction(S, ev(), { now: 20 })).toBe('tap1')
    expect(Object.keys(S.water)).toEqual(['tap1'])
    expect(dayTotal(S, D)).toBe(250)
    expect(applyWidgetAction(S, ev('x', { ml: 0 }))).toBeNull()
  })
})

describe('drainWidgetActions', () => {
  let plugin, st
  beforeEach(() => {
    st = store()
    plugin = {
      drain: vi.fn(async () => ({ events: [] })),
      ack: vi.fn(async () => {}),
    }
    _setWidgetActionPluginForTest(plugin)
  })
  afterEach(() => _resetWidgetActions())

  it('takes the queue, applies it, saves the mirror, then acknowledges', async () => {
    plugin.drain.mockResolvedValueOnce({ events: [ev()] })
    expect(await drainWidgetActions({ useStore: st, now: 10 })).toEqual(['tap1'])
    expect(st.S.water.tap1).toEqual({ d: D, ml: 250, _ts: 10 })
    expect(st.saveNow).toHaveBeenCalledTimes(1)
    expect(plugin.ack).toHaveBeenCalledWith({ ids: ['tap1'] })
  })

  it('acknowledges junk and taps for a module since turned off without writing', async () => {
    plugin.drain.mockResolvedValueOnce({ events: [ev('junk', { ml: 0 }), ev('late'), null] })
    st.S = { modules: { water: false }, water: {} }
    expect(await drainWidgetActions({ useStore: st })).toEqual(['junk', 'late'])
    expect(st.S.water).toEqual({})
    expect(st.saveNow).not.toHaveBeenCalled()
    expect(plugin.ack).toHaveBeenCalledWith({ ids: ['junk', 'late'] })
  })

  it('waits for the store to be ready, and never drains twice at once', async () => {
    plugin.drain.mockResolvedValueOnce({ events: [ev()] })
    expect(await drainWidgetActions({ useStore: store(S0, false) })).toEqual([])
    expect(plugin.drain).not.toHaveBeenCalled()
    const first = drainWidgetActions({ useStore: st })
    const second = drainWidgetActions({ useStore: st })
    expect(first).toBe(second)
    expect(await first).toEqual(['tap1'])
    expect(plugin.drain).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all on a platform with no widgets', async () => {
    h.platform = 'web'
    _resetWidgetActions()
    _setWidgetActionPluginForTest(null)
    expect(await drainWidgetActions({ useStore: st })).toEqual([])
    expect(plugin.drain).not.toHaveBeenCalled()
    h.platform = 'android'
  })
})

describe('startWidgetActions', () => {
  it('drains on start and when boot hands the store back, and stops on demand', async () => {
    const p = { drain: vi.fn(async () => ({ events: [] })), ack: vi.fn(async () => {}) }
    _setWidgetActionPluginForTest(p)
    let subs = []
    const st = store()
    st.subscribe = fn => { subs.push(fn); return () => { subs = [] } }
    const stop = await startWidgetActions({ useStore: st })
    await vi.waitFor(() => expect(p.drain).toHaveBeenCalledTimes(1))
    st.ready = false
    subs.forEach(fn => fn(st, { ready: false }))
    st.ready = true
    subs.forEach(fn => fn(st, { ready: false }))
    await vi.waitFor(() => expect(p.drain).toHaveBeenCalledTimes(2))
    stop()
    subs.forEach(fn => fn(st, { ready: true }))
    expect(p.drain).toHaveBeenCalledTimes(2)
    _resetWidgetActions()
  })
})
