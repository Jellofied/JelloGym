// The water sheets (docs/LIFE_MODULES.md, Water slice 1a): the long-press custom amount, the
// daily goal and the cup sizes. Opened through useUI (never persisted); every save goes through
// useStore's update, so it stamps and syncs like any other change.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { CUPS_DEFAULT, ML_MAX, addWater, cupsOf, editWater, goalOf, readWaterEntry, removeWater, restoreWater } from '../lib/water.js'
import { Button, NumberField } from './ui.jsx'
import Icon from './Icon.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

/** Logs one drink and offers the Undo toast. Returns the entry id, or null when refused. */
export function logWater(ml, opts = {}) {
  let id = null
  update(s => { const r = addWater(s, ml, opts); if (r !== 'invalid') id = r })
  if (!id) return null
  ui().toast(`${Math.round(Number(ml))} ml logged`, {
    action: 'Undo',
    onAction: () => update(s => { removeWater(s, id) }),
  })
  return id
}

function CustomAmount({ close }) {
  const [v, setV] = useState(500)
  const n = Math.round(Number(v) || 0)
  return <>
    <h3>Log water</h3>
    <div className="muted small">How much did you drink?</div>
    <div style={{ height: 10 }} />
    <StepperRow value={v} onChange={setV} />
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!(n > 0 && n <= ML_MAX)} onClick={() => {
      const id = logWater(n)
      close()
      if (!id) ui().toast('Enter an amount between 1 and 2000 ml')
    }}>Log it</Button>
  </>
}

function GoalEdit({ close }) {
  const st = S()
  const [v, setV] = useState(st.waterGoal ?? goalOf(st))
  const n = Math.round(Number(v) || 0)
  return <>
    <h3>Daily goal</h3>
    <div className="muted small">About 33 ml per kg of body weight is a good starting point.
      Leave it on auto and the goal follows your latest weigh-in.</div>
    <div style={{ height: 10 }} />
    <StepperRow value={v} onChange={setV} />
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!(n > 0 && n <= 20000)} onClick={() => {
      update(s => { s.waterGoal = n })
      close()
      ui().toast(`Goal set: ${n} ml`)
    }}>Save goal</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" onClick={() => {
      update(s => { s.waterGoal = null })
      close()
      ui().toast('Goal back to auto')
    }}>Auto (by body weight)</Button>
  </>
}

function CupsEdit({ close }) {
  const [cups, setCups] = useState(cupsOf(S()))
  const set = (i, v) => setCups(c => c.map((x, j) => (j === i ? Math.round(Number(v) || 0) : x)))
  return <>
    <h3>Cup sizes</h3>
    <div className="muted small">The buttons on the Water card. Up to six.</div>
    <div style={{ height: 6 }} />
    {cups.map((c, i) => <StepperRow key={i} value={c} onChange={v => set(i, v)}
      trailing={<button type="button" className="iconbtn" aria-label="Remove cup" disabled={cups.length <= 1}
        onClick={() => setCups(x => x.filter((_, j) => j !== i))}><Icon name="trash" /></button>} />)}
    <div style={{ height: 8 }} />
    <Button size="sm" variant="ghost" icon="plus" disabled={cups.length >= 6}
      onClick={() => setCups(c => [...c, 1000])}>Add cup</Button>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      const clean = [...new Set(cups.filter(c => c > 0 && c <= ML_MAX))].sort((a, b) => a - b)
      if (!clean.length) { ui().toast('Keep at least one cup'); return }
      update(s => { s.waterCups = clean })
      close()
      ui().toast('Cup sizes saved')
    }}>Save cups</Button>
  </>
}

// One amount row: the number field with ml beside it, ±50 steps within reach of thumbs.
function StepperRow({ value, onChange, trailing = null }) {
  return <div className="row" style={{ gap: 8, alignItems: 'center' }}>
    <Button size="sm" variant="ghost" onClick={() => onChange(Math.max(0, (Number(value) || 0) - 50))}>−50</Button>
    <NumberField value={value} onChange={onChange} decimal={false} style={{ width: 90, textAlign: 'center' }} />
    <Button size="sm" variant="ghost" onClick={() => onChange((Number(value) || 0) + 50)}>+50</Button>
    <span className="muted">ml</span>
    {trailing}
  </div>
}

/** Deletes one drink as a tombstone and offers the Undo stamp-back (the weigh-in rows' pattern). */
export function deleteWater(id) {
  const read = readWaterEntry((S().water || {})[id])
  if (!read) return
  update(s => { removeWater(s, id) })
  ui().toast('Drink deleted', { action: 'Undo', onAction: () => update(s => { restoreWater(s, id, read) }) })
}

export const waterCustomSheet = () => ui().openSheet(close => <CustomAmount close={close} />)
export const waterGoalSheet = () => ui().openSheet(close => <GoalEdit close={close} />)
export const waterCupsSheet = () => ui().openSheet(close => <CupsEdit close={close} />)

// One logged drink retyped or deleted, from the /water history (slice 1b). The delete is a
// tombstone (lib/water.js) and its Undo stamps the entry back, like a weigh-in's.
function DrinkEdit({ id, close }) {
  const entry = (S().water || {})[id]
  const read = readWaterEntry(entry)
  const [v, setV] = useState(read ? read.ml : 250)
  if (!read) return null   // gone from another device mid-open: nothing to edit
  const n = Math.round(Number(v) || 0)
  return <>
    <h3>Edit drink</h3>
    <div className="muted small">Logged on {read.d}.</div>
    <div style={{ height: 10 }} />
    <StepperRow value={v} onChange={setV} />
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!(n > 0 && n <= ML_MAX)} onClick={() => {
      update(s => { editWater(s, id, n) })
      close()
      ui().toast(`${n} ml`)
    }}>Save</Button>
    <div style={{ height: 8 }} />
    <Button variant="danger" onClick={() => { deleteWater(id); close() }}>Delete</Button>
  </>
}
export const waterEditSheet = id => ui().openSheet(close => <DrinkEdit id={id} close={close} />)
