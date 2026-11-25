// The Nothing Glyph strips (Android sideload/play builds): the native side shows set progress from
// the widget snapshot in a foreground service. This file only asks for the two permissions the
// service needs, once, when the first workout starts. F-Droid and every other platform are no-ops.
import { MOBILE, nativePlatform } from './mobile.js'

const ASKED_KEY = 'jellogym_glyph_background_asked'

let pluginP = null
const glyphPlugin = () => pluginP || (pluginP = (async () => {
  if (!MOBILE || (await nativePlatform()) !== 'android') return null
  const { registerPlugin } = await import('@capacitor/core')
  return { WidgetBridge: registerPlugin('WidgetBridge') }
})().catch(() => null))

/** Started once by the app; asks for background access the first time a workout runs. */
export async function startGlyph ({ useStore }) {
  const p = await glyphPlugin()
  if (!p) return () => {}
  let wasOn = !!useStore.getState().S?.active
  const off = useStore.subscribe(s => {
    const on = !!s.S?.active
    if (on && !wasOn && !localStorage.getItem(ASKED_KEY)) {
      localStorage.setItem(ASKED_KEY, '1')
      p.WidgetBridge.requestBackground?.().catch?.(() => {})
    }
    wasOn = on
  })
  return off
}

// Test seam.
export function _setGlyphPluginForTest (plugin) { pluginP = Promise.resolve(plugin ? { WidgetBridge: plugin } : null) }
