// The Food card on Home (Food 6a): today's calories against the goal, protein under it, the last
// few meals one tap away, and a plus for a new entry.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { addFood, dayFood, foodGoals, recentFoods } from '../lib/food.js'
import { foodAddSheet, savedPickerSheet } from './FoodSheets.jsx'
import ProgressRing from './ProgressRing.jsx'
import CardHead from './CardHead.jsx'
import { Button } from './ui.jsx'

export default function FoodCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const t = dayFood(S)
  const g = foodGoals(S)
  const recent = recentFoods(S)
  const pct = g.kcal ? Math.min(1, t.kcal / g.kcal) : 0
  const repeat = f => { update(s => { addFood(s, { kcal: f.kcal, protein: f.protein, label: f.label }) }) }
  return <div className="card">
    <CardHead icon="target" tint="var(--green)" title="Food" sub={`${t.kcal.toLocaleString()} of ${g.kcal.toLocaleString()} kcal · ${t.protein} of ${g.protein} g protein`}
      action={<Button size="sm" icon="plus" onClick={foodAddSheet}>Log</Button>} />
    <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
      <ProgressRing pct={pct} size={56} tint="var(--green)" caption={`${Math.round(pct * 100)}%`} />
      {recent.length > 0 && <div className="chips" style={{ flex: 1, minWidth: 0 }}>
        {recent.slice(0, 4).map(f => <button key={f.id} className="chip" onClick={() => repeat(f)}
          aria-label={`Repeat ${f.label || `${f.kcal} kcal`}`}>{f.label || `${f.kcal} kcal`}</button>)}
      </div>}
      {!recent.length && <div className="muted small">Log your first meal and the repeats land here.</div>}
    </div>
    <div className="row between" style={{ marginTop: 8 }}>
      <Button size="sm" variant="ghost" icon="list" onClick={savedPickerSheet}>Saved</Button>
      <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/food')}>All food</Button>
    </div>
  </div>
}
