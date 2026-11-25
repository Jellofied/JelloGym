// /habits/:id (slice 2b): one habit's page. The streak (current and best), the year heatmap, and
// the history: the last 21 days with something on them, unchecked from here (undo restores).
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtDate } from '../lib/format.js'
import { dayState, habitLogsOf, habitStreak, habitsOf, restoreHabitLogs, uncheckHabit } from '../lib/habits.js'
import { habitSheet } from '../components/HabitSheet.jsx'
import DayHeatmap from '../components/DayHeatmap.jsx'
import { habitHeatValues } from './Habits.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function HabitDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const def = habitsOf(S).find(h => h.id === id)
  if (!def) return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/habits" onClick={() => nav('/habits')} aria-label="Habits"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Habit</h1></div>
    </div>
    <div className="card"><div className="muted small">This habit is gone.</div></div>
  </div>

  const st = habitStreak(S, id)
  const days = [...new Set(habitLogsOf(S, id).map(l => l.d))].sort().reverse().slice(0, 21)

  const clear = d => {
    let undone = null
    update(s => { undone = uncheckHabit(s, id, d) })
    if (!undone) return
    useUI.getState().toast('Day cleared', { action: 'Undo', onAction: () => update(s => { restoreHabitLogs(s, undone) }) })
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/habits" onClick={() => nav('/habits')} aria-label="Habits"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{def.name}</h1>
        <div className="sub">{[def.type === 'count' && `${def.target} a day`, def.type === 'timed' && `${def.target} min a day`,
          def.skipRest && 'skips rest days', def.stack && 'after workouts'].filter(Boolean).join(' · ') || 'Every day'}</div></div>
      <button className="iconbtn" onClick={() => habitSheet(def)} aria-label="Edit habit"><Icon name="gear" /></button>
    </div>

    <div className="card">
      <div className="row" style={{ gap: 20, alignItems: 'center' }}>
        <div><div className="big">{st.current}</div><div className="muted small">in a row</div></div>
        <div><div className="big">{st.best}</div><div className="muted small">best</div></div>
      </div>
      <div style={{ marginTop: 10 }}><DayHeatmap S={S} values={habitHeatValues(S, id)}
        titleFor={v => v >= 2 ? 'Checked' : v >= 1 ? 'Skipped' : 'Missed'} /></div>
    </div>

    <div className="row between" style={{ margin: '18px 2px 10px' }}>
      <h4 className="sec" style={{ margin: 0 }}>History</h4>
    </div>
    {days.length ? <div className="list">{days.map(d => {
      const day = dayState(S, { ...def, id }, d)
      return <div className="card" key={d} style={{ marginBottom: 8 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div><b>{fmtDate(d, true)}</b>
            <div className="muted small" style={{ marginTop: 2 }}>
              {day.skipped ? 'Skipped' : def.type === 'count' ? `${day.cur}/${day.target}`
                : def.type === 'timed' ? `${day.cur}/${day.target} min` : 'Checked'}
            </div>
          </div>
          <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => clear(d)} aria-label="Clear day"><Icon name="trash" /></button>
        </div>
      </div>
    })}</div> : <div className="empty small">Nothing checked yet.</div>}
    <div style={{ height: 16 }} />
    <Button variant="ghost" onClick={() => nav('/habits')}>Back to habits</Button>
  </div>
}
