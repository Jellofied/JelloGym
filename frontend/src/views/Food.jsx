// /food (Food 6a): today against both goals, the one-tap repeats, a kcal chart with the goal
// line, and the history — each day removable with the Undo, the entries inside it listed.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtDate } from '../lib/format.js'
import { addFood, dayFood, foodGoals, foodPoints, recentFoods } from '../lib/food.js'
import { foodAddSheet, savedPickerSheet, savedFoodSheet } from '../components/FoodSheets.jsx'
import LineChart from '../components/LineChart.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

export default function Food() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [days, setDays] = useState(14)
  const t = dayFood(S)
  const g = foodGoals(S)
  const recent = recentFoods(S)
  const map = (S.food && typeof S.food === 'object') ? S.food : {}
  const byDay = new Map()
  for (const [id, e] of Object.entries(map)) {
    if (!e || typeof e !== 'object' || !(Number(e._ts) > 0)) continue
    const kcal = Math.round(Number(e.kcal) || 0), protein = Math.round(Number(e.protein) || 0)
    if (!kcal && !protein) continue
    const d = String(e.d || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d).push({ id, kcal, protein, label: e.label || '' })
  }
  const daysSorted = [...byDay.keys()].sort().reverse().slice(0, 21)
  const clearDay = d => {
    const undone = []
    update(s => {
      for (const e of byDay.get(d) || []) {
        const cur = s.food?.[e.id]
        if (cur && typeof cur === 'object' && Number(cur._ts) > 0) undone.push({ id: e.id, ...cur })
      }
      const next = { ...(s.food || {}) }
      for (const x of undone) next[x.id] = { _ts: Date.now() }
      s.food = next
    })
    if (!undone.length) return
    useUI.getState().toast('Day cleared', { action: 'Undo', onAction: () => update(s => {
      const n = { ...(s.food || {}) }
      for (const x of undone) if (!n[x.id] || !(Number(n[x.id].kcal) || Number(n[x.id].protein))) n[x.id] = { d: x.d, kcal: x.kcal, protein: x.protein, ...(x.label ? { label: x.label } : {}), _ts: Date.now() }
      s.food = n
    }) })
  }
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Food</h1><div className="sub">Calories and protein, nothing more</div></div>
      <button className="iconbtn" onClick={() => nav('/settings/food')} aria-label="Food settings"><Icon name="gear" /></button>
    </div>

    <div className="card">
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <ProgressRing pct={Math.min(1, t.kcal / g.kcal)} size={64} tint="var(--green)" caption={`${Math.min(100, Math.round((t.kcal / g.kcal) * 100))}%`} />
        <div>
          <div className="big">{t.kcal.toLocaleString()} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>of {g.kcal.toLocaleString()} kcal</span></div>
          <div className="muted small">{t.protein} of {g.protein} g protein{suggestedNote(g)}</div>
        </div>
        <Button size="sm" icon="plus" onClick={foodAddSheet}>Log</Button>
      </div>
      {recent.length > 0 && <div className="chips" style={{ marginTop: 10 }}>
        {recent.slice(0, 6).map(f => <button key={f.id} className="chip" onClick={() => update(s => { addFood(s, { kcal: f.kcal, protein: f.protein, label: f.label }) })}
          aria-label={`Repeat ${f.label || f.kcal + ' kcal'}`}>+{f.label || `${f.kcal}`}</button>)}
      </div>}
      {Object.keys(g).length > 0 && <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="ghost" icon="list" onClick={savedPickerSheet}>From saved</Button>
      </div>}
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <Segmented className="seg-range" value={days} onChange={setDays}
        options={[{ value: 7, label: 'Week' }, { value: 14, label: '2 Weeks' }, { value: 30, label: 'Month' }]} />
      <div className="chart"><LineChart points={foodPoints(S, days)} h={170} unit="kcal" color="var(--green)" goal={g.kcal} /></div>
    </div>

    <div className="row between" style={{ margin: '18px 2px 10px' }}>
      <h4 className="sec" style={{ margin: 0 }}>History</h4>
      <Button size="sm" variant="ghost" onClick={() => nav('/food/saved')}>Saved foods</Button>
    </div>
    {daysSorted.length ? <div className="list">{daysSorted.map(d => <div className="card" key={d} style={{ marginBottom: 8 }}>
      <div className="row between">
        <div><b>{fmtDate(d, true)}</b>
          <div className="muted small" style={{ marginTop: 2 }}>
            {(byDay.get(d) || []).reduce((s, x) => s + x.kcal, 0).toLocaleString()} kcal · {(byDay.get(d) || []).reduce((s, x) => s + x.protein, 0)} g
          </div>
        </div>
        <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => clearDay(d)} aria-label="Clear day"><Icon name="trash" /></button>
      </div>
      {(byDay.get(d) || []).map(e => <div className="row between" key={e.id} style={{ marginTop: 4 }}>
        <span className="muted small">{e.label || `${e.kcal} kcal`}</span>
        <span className="small">{e.kcal} · {e.protein} g</span>
      </div>)}
    </div>)}</div> : <div className="empty small">Nothing logged yet.</div>}
    <div style={{ height: 16 }} />
    <Button variant="ghost" icon="plus" onClick={() => savedFoodSheet(null)}>New saved item</Button>
  </div>
}

const suggestedNote = g => g.suggested ? ' · goal suggested from your weigh-in' : ''
