// Today's habit rows, shared by the Home card and the Start sheet (nav rework): tap the circle
// to check (a count habit adds one), tap again to clear with the Undo, Skip on a due day that
// suits a pass. The name opens the habit; the streak flame is derived (lib/habits.js).
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { habitStreak, logHabit, todayList, uncheckHabit, restoreHabitLogs } from '../lib/habits.js'
import { habitSheet } from './HabitSheet.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const small = { fontSize: 'var(--fs-footnote)' }

export default function HabitsToday({ S }) {
  const update = useStore(s => s.update)
  const rows = todayList(S)
  const toggle = row => {
    const id = row.def.id
    if (row.done || row.skipped) {
      let undone = null
      update(s => { undone = uncheckHabit(s, id) })
      if (!undone) return
      useUI.getState().toast('Cleared', { action: 'Undo', onAction: () => update(s => { restoreHabitLogs(s, undone) }) })
      return
    }
    update(s => { logHabit(s, id, row.def.type === 'count' ? { n: 1 } : {}) })
  }
  const skip = row => {
    update(s => { logHabit(s, row.def.id, { kind: 'skip' }) })
    useUI.getState().toast('Skipped today')
  }
  return <>{rows.map(r => {
    const st = habitStreak(S, r.def.id)
    const sub = r.def.schedule.kind === 'perWeek'
      ? `${r.week.done} of ${r.week.n} this week${r.def.dose ? ' · ' + r.def.dose : ''}`
      : [r.def.type !== 'yesno' && !r.done ? `${r.cur}/${r.target}${r.def.type === 'timed' ? ' min' : ''}` : '',
        r.def.dose || '', r.def.at || ''].filter(Boolean).join(' · ')
    return <div className="row habits-row" key={r.def.id} style={{ gap: 10, alignItems: 'center', marginTop: 10 }}>
      <button className={'habit-check' + (r.done ? ' on' : '')} aria-pressed={r.done}
        aria-label={`${r.def.name}: ${r.done ? 'checked' : 'check'}`} onClick={() => toggle(r)}>
        <Icon name={r.done ? 'checkCircle' : 'ring'} style={{ fontSize: 22 }} />
      </button>
      <button className="habits-name" style={{ textAlign: 'start', flex: 1, minWidth: 0 }} onClick={() => habitSheet(r.def)}>
        <div style={{ fontWeight: 500 }} className={r.rest && !r.done ? 'dim' : ''}>{r.def.name}</div>
        {sub ? <div className="muted" style={small}>{sub}</div> : null}
        {r.done ? <div style={{ ...small, color: 'var(--green)' }}>Done</div> : null}
      </button>
      {r.due && !r.done && !r.skipped && <Button size="sm" variant="ghost" onClick={() => skip(r)}>Skip</Button>}
      {st.current > 1 && <span className="row habits-streak" style={small} title={`${st.current} in a row`}>
        <Icon name="flame" style={{ fontSize: 14, color: 'var(--orange)' }} />{st.current}
      </span>}
    </div>
  })}</>
}
