// The quick-add chips, shared by the Home water card and the Start sheet (nav rework): the same
// cup sizes, the same last-used leader, the same tap-to-log-and-Undo. In 'card' mode a long press
// opens the custom amount instead of logging (the release never logs); in 'sheet' mode there is a
// Custom chip instead, because a long press inside a scrollable sheet fights the scroll.
import { useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { cupsOf, lastUsed } from '../lib/water.js'
import { logWater, waterCustomSheet } from './WaterSheets.jsx'

export const WATER_LONG_PRESS_MS = 380

export default function WaterQuickAdds({ mode = 'card', style }) {
  const S = useStore(s => s.S)
  const cups = cupsOf(S)
  const last = lastUsed(S)
  const chips = last && !cups.includes(last) ? [last, ...cups] : cups

  const timer = useRef(null)
  const fired = useRef(false)
  const startPress = () => {
    if (mode !== 'card') return
    fired.current = false
    timer.current = window.setTimeout(() => { fired.current = true; waterCustomSheet() }, WATER_LONG_PRESS_MS)
  }
  const endPress = () => { clearTimeout(timer.current); timer.current = null }
  const tapChip = ml => {
    if (fired.current) { fired.current = false; return }
    logWater(ml)
  }

  return <div className="chips" style={style}>
    {chips.map(ml => <button key={ml} className="chip" aria-label={`Log ${ml} ml`}
      onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
      onClick={() => tapChip(ml)}>+{ml}</button>)}
    {mode === 'sheet' && <button className="chip" onClick={() => waterCustomSheet()}>Custom…</button>}
  </div>
}
