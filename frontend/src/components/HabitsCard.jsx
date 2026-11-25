// The Habits card on Home (slice 2a): today's rows, checked in place. The rows themselves are
// shared with the Start sheet (components/HabitsToday); the card adds the header, the empty
// state and the way into /habits.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { todayList } from '../lib/habits.js'
import { habitSheet } from './HabitSheet.jsx'
import HabitsToday from './HabitsToday.jsx'
import CardHead from './CardHead.jsx'
import { Button } from './ui.jsx'

export default function HabitsCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = todayList(S)
  const met = rows.filter(r => r.done || r.skipped || !r.due).length
  return <div className="card">
    <CardHead icon="checkCircle" tint="var(--teal)" title="Habits" sub={`${met} of ${rows.length} today`}
      action={<Button size="sm" icon="plus" onClick={() => habitSheet(null)}>New</Button>} />
    {!rows.length && <div className="muted small" style={{ marginTop: 6 }}>
      No habits yet. Meditate, read, stretch, vitamins or a supplement: make the first one.
    </div>}
    <HabitsToday S={S} />
    {rows.length > 0 && <div className="row between" style={{ marginTop: 10 }}>
      <span />
      <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/habits')}>All habits</Button>
    </div>}
  </div>
}
