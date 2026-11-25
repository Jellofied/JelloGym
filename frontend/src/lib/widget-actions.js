// The Android Home Screen widgets log into their own queue (WidgetActionReceiver.java), because a
// widget is not the app: it has no copy of S and cannot write the mirror file. The page drains the
// queue once the store has its copy back, applies each tap with the same pure mutator the screens
// use (addWater), saves the mirror at once, and only then acknowledges the tap. The same shape as
// lib/live-activity.js: a tap is never dropped against an empty, not yet restored state, and a tap
// whose app died between save and ack writes the same entry id again, never a second drink.
//
// Android only, and English only like the other life modules.
import { MOBILE, nativePlatform } from './mobile.js'
import { isOn } from './modules.js'
import { addWater, ML_MAX } from './water.js'
import { addFood } from './food.js'
import { logHabit } from './habits.js'
import { DAY_NOTE_TAGS, withDayNote } from './day-notes.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const tapId = a => (typeof a?.id === 'string' && a.id ? a.id : undefined)

/** Is this queued tap still one we should apply? A stale or malformed one is acknowledged away. */
export function canApplyWidgetAction (S, action) {
  if (!action || !ISO.test(String(action.d || ''))) return false
  const id = tapId(action)
  if (action.action === 'water') {
    if (!isOn(S, 'water') || !id) return false
    const ml = Math.round(Number(action.ml))
    return Number.isFinite(ml) && ml > 0 && ml <= ML_MAX
  }
  if (action.action === 'food') {
    if (!isOn(S, 'food') || !id) return false
    const kcal = Math.round(Number(action.kcal))
    const protein = Math.round(Number(action.protein || 0))
    return Number.isFinite(kcal) && kcal > 0 && kcal <= 5000 && Number.isFinite(protein) && protein >= 0 && protein <= 1000
  }
  if (action.action === 'habit') {
    return !!(isOn(S, 'habits') && id && S?.habitDefs && Object.prototype.hasOwnProperty.call(S.habitDefs, action.h))
  }
  if (action.action === 'day-note') {
    return !!id && DAY_NOTE_TAGS.includes(action.tag)
  }
  return false
}

/** Applies a queued tap to a draft of S. Returns the new entry id, or null when it was not valid. */
export function applyWidgetAction (state, action, { now = Date.now() } = {}) {
  if (!canApplyWidgetAction(state, action)) return null
  // The entry takes its id from the queued tap, so a replay after a crash overwrites that one
  // entry instead of logging the drink twice.
  const id = tapId(action)
  if (action.action === 'water') return addWater(state, action.ml, { d: action.d, now, id })
  if (action.action === 'food') return addFood(state, {
    d: action.d,
    kcal: Math.round(Number(action.kcal)),
    protein: Math.round(Number(action.protein || 0)),
    label: String(action.label || ''),
  }, { id, now })
  if (action.action === 'habit') {
    logHabit(state, action.h, { d: action.d, kind: 'check', n: 1, id, now })
    return id
  }
  state.dayNotes = withDayNote(state.dayNotes, action.d, { tag: action.tag, text: String(action.text || '').slice(0, 120) }, now)
  return id
}

let pluginP = null
// Inside an object: a Capacitor plugin proxy answers `then` (lib/rest-alert.js, the Coach hang #42).
const actionPlugin = () => pluginP || (pluginP = (async () => {
  if (!MOBILE || (await nativePlatform()) !== 'android') return null
  const { registerPlugin } = await import('@capacitor/core')
  return { WidgetBridge: registerPlugin('WidgetBridge') }
})().catch(() => null))

let draining = null
/** Drains the widget's queued taps, saves each applied change and acknowledges what is done. */
export function drainWidgetActions ({ useStore, now = Date.now() } = {}) {
  if (draining) return draining
  draining = (async () => {
    try {
      const p = await actionPlugin()
      if (!p || !useStore || useStore.getState().ready === false) return []
      const { events = [] } = (await p.WidgetBridge.drain()) || {}
      const done = [], applied = []
      for (const ev of events) {
        if (!ev || typeof ev.id !== 'string' || !ev.id) continue
        if (canApplyWidgetAction(useStore.getState().S, ev)) {
          useStore.getState().update(s => { applyWidgetAction(s, ev, { now }) })
          applied.push(ev.id)
        }
        // Junk and taps for a module since turned off still leave the queue: they are not owed.
        done.push(ev.id)
      }
      if (applied.length) await useStore.getState().saveNow?.()
      if (done.length) await p.WidgetBridge.ack({ ids: done })
      return done
    } catch { return [] } finally { draining = null }
  })()
  return draining
}

/** Started once by the app: drains what a widget logged while the page was asleep. */
export async function startWidgetActions ({ useStore }) {
  const p = await actionPlugin()
  if (!p) return () => {}
  drainWidgetActions({ useStore })
  const off = useStore.subscribe((s, prev) => { if (s.ready && !prev.ready) drainWidgetActions({ useStore }) })
  const onVisible = () => { if (document.visibilityState === 'visible') drainWidgetActions({ useStore }) }
  document.addEventListener('visibilitychange', onVisible)
  return () => { off(); document.removeEventListener('visibilitychange', onVisible) }
}

// Test seams.
export function _setWidgetActionPluginForTest (plugin) { pluginP = Promise.resolve(plugin ? { WidgetBridge: plugin } : null) }
export function _resetWidgetActions () { pluginP = null; draining = null }
