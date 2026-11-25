// The food sheets (Food 6a/6b): logging a meal, and the saved item behind the one-taps. A saved
// food logs a snapshot — the entry keeps the values it had at the tap, and only the `fid` says
// where it came from, so editing a saved item never rewrites the history (the way logged sets
// keep their weights when an exercise is renamed).
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { addFood, addSavedFood, editSavedFood, logSavedFood, readSavedFood, removeSavedFood, savedFoodsOf } from '../lib/food.js'
import { Button, NumberField, Row, Switch, TextField } from './ui.jsx'
import Icon from './Icon.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

function MealForm({ close }) {
  const [kcal, setKcal] = useState(0)
  const [protein, setProtein] = useState(0)
  const [label, setLabel] = useState('')
  const k = Math.round(Number(kcal) || 0), p = Math.round(Number(protein) || 0)
  const ok = (k > 0 || p > 0) && k <= 20000 && p <= 1000
  return <>
    <h3>Log food</h3>
    <div className="muted small">Calories and protein for today. The label is optional: {todayISO()}.</div>
    <div style={{ height: 10 }} />
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <NumberField value={kcal} onChange={setKcal} decimal={false} style={{ width: 90 }} aria-label="Calories" />
      <span className="muted">kcal</span>
      <NumberField value={protein} onChange={setProtein} decimal={false} style={{ width: 80 }} aria-label="Protein grams" />
      <span className="muted">g protein</span>
    </div>
    <div style={{ height: 8 }} />
    <TextField value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder="Oats and whey (optional)" aria-label="Meal label" />
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!ok} onClick={() => {
      let id = null
      update(s => { const r = addFood(s, { kcal: k, protein: p, label }); if (r !== 'invalid') id = r })
      close()
      if (id) ui().toast('Logged')
    }}>Log it</Button>
  </>
}

function SavedPicker({ close }) {
  const S0 = S()
  const foods = savedFoodsOf(S0)
  const pick = f => {
    let id = null
    update(s => { const r = logSavedFood(s, f.id); if (r !== 'invalid') id = r })
    close()
    if (id) ui().toast(`${f.n} logged`)
  }
  return <>
    <h3>Saved foods</h3>
    {!foods.length && <div className="muted small">Nothing saved yet. Add one from the Food page.</div>}
    <div className="sect-b">
      {foods.map(f => <button className="lrow tap" key={f.id} onClick={() => pick(f)}>
        <span className="lrow-m"><span className="lrow-t">{f.n}</span>
          <span className="lrow-s">{f.kcal} kcal · {f.protein} g{f.serving ? ` · ${f.serving}` : ''}</span></span>
        {f.meal && <Icon name="check" className="lrow-k" />}
      </button>)}
    </div>
    <div style={{ height: 8 }} />
  </>
}

function SavedForm({ existing, close }) {
  const [n, setN] = useState(existing?.n || '')
  const [kcal, setKcal] = useState(existing?.kcal ?? 0)
  const [protein, setProtein] = useState(existing?.protein ?? 0)
  const [serving, setServing] = useState(existing?.serving || '')
  const [meal, setMeal] = useState(existing?.meal === true)
  const save = () => {
    const raw = { n, kcal: Math.round(Number(kcal) || 0), protein: Math.round(Number(protein) || 0), serving, meal }
    let ok = false
    update(s => { ok = existing ? editSavedFood(s, existing.id, raw) : addSavedFood(s, raw) !== 'invalid' })
    close()
    if (!ok) { ui().toast('Give it a name and a number'); return }
    ui().toast(existing ? 'Saved item updated' : 'Saved for one-taps')
  }
  return <>
    <h3>{existing ? 'Edit saved item' : 'New saved food or meal'}</h3>
    <div className="muted small">Modelled on your own exercises: a name, what is in it, and it shows up in the picker.</div>
    <div style={{ height: 10 }} />
    <TextField value={n} onChange={e => setN(e.target.value)} maxLength={60} placeholder="Name" aria-label="Saved item name" />
    <div style={{ height: 8 }} />
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <NumberField value={kcal} onChange={setKcal} decimal={false} style={{ width: 90 }} aria-label="Calories" />
      <span className="muted">kcal</span>
      <NumberField value={protein} onChange={setProtein} decimal={false} style={{ width: 80 }} aria-label="Protein grams" />
      <span className="muted">g</span>
    </div>
    <div style={{ height: 8 }} />
    <TextField value={serving} onChange={e => setServing(e.target.value)} maxLength={40} placeholder="Serving, e.g. 1 bowl (optional)" aria-label="Serving" />
    <div style={{ height: 8 }} />
    <Row title="It is a whole meal">
      <Switch checked={meal} onChange={setMeal} aria-label="It is a whole meal" />
    </Row>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>Save</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => {
      const undo = readSavedFood(S().savedFoods[existing.id])
      if (!undo) return
      update(s => { removeSavedFood(s, existing.id) })
      close()
      ui().toast('Saved item removed', { action: 'Undo', onAction: () => update(s => { addSavedFood(s, undo, { id: existing.id }) }) })
    }}>Delete</Button></>}
  </>
}

export const foodAddSheet = () => ui().openSheet(close => <MealForm close={close} />)
export const savedPickerSheet = () => ui().openSheet(close => <SavedPicker close={close} />)
export const savedFoodSheet = (existing = null) => ui().openSheet(close => <SavedForm existing={existing} close={close} />)
