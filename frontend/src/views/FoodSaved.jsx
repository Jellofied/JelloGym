// /food/saved (Food 6b): your own foods and meals, modelled on the user-defined exercises —
// the same fields, the same picker idea — one tap away from the Food page.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { savedFoodsOf } from '../lib/food.js'
import { savedFoodSheet } from '../components/FoodSheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function FoodSaved() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const items = savedFoodsOf(S)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/food" onClick={() => nav('/food')} aria-label="Food"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Saved foods</h1><div className="sub">The things you eat again and again</div></div>
      <button className="iconbtn" onClick={() => savedFoodSheet(null)} aria-label="New saved item"><Icon name="plus" /></button>
    </div>
    {!items.length && <div className="card"><div className="muted small">
      Nothing saved yet. Add the oats you always have, or a whole meal — they become one-tap entries.
    </div><div style={{ height: 10 }} /><Button variant="primary" onClick={() => savedFoodSheet(null)}>Make the first one</Button></div>}
    {items.length > 0 && <div className="list">
      {items.map(f => <div className="card" key={f.id} style={{ marginBottom: 8 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <button className="habits-name" style={{ textAlign: 'start' }} onClick={() => savedFoodSheet(f)}>
            <b>{f.n}</b>
            <div className="muted small" style={{ marginTop: 2 }}>
              {f.kcal} kcal · {f.protein} g{f.serving ? ` · ${f.serving}` : ''}{f.meal ? ' · meal' : ''}
            </div>
          </button>
          <Button size="sm" variant="ghost" onClick={() => savedFoodSheet(f)}>{f.meal ? 'Edit meal' : 'Edit'}</Button>
        </div>
      </div>)}
    </div>}
    <div style={{ height: 16 }} />
  </div>
}
