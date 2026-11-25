// /habits (slice 2b): today, tappable exactly like the Home card, and This week, one heatmap per
// habit (checked days warm, skips cooler). The name opens the habit's own page.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { habitStreak, logHabit, restoreHabitLogs, todayList, uncheckHabit } from '../lib/habits.js'
import { habitSheet } from '../components/HabitSheet.jsx'
import DayHeatmap from '../components/DayHeatmap.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

export function habitHeatValues(S, id) {
  const out = {}
  for (const l of Object.values(S.habitLogs || {})) {
    if (!l || l.h !== id || typeof l.d !== 'string' || !(l._ts > 0)) continue
    out[l.d] = Math.max(out[l.d] || 0, l.skip === 1 ? 1 : 2)
  }
  return out
}

export default function Habits() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [view, setView] = useState('today')
  const rows = todayList(S)

  const toggle = r => {
    const id = r.def.id
    if (r.done || r.skipped) {
      let undone = null
      update(s => { undone = uncheckHabit(s, id) })
      if (!undone) return
      useUI.getState().toast('Cleared', { action: 'Undo', onAction: () => update(s => { restoreHabitLogs(s, undone) }) })
      return
    }
    update(s => { logHabit(s, id, r.def.type === 'count' ? { n: 1 } : {}) })
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Habits</h1><div className="sub">Checked in place</div></div>
      <button className="iconbtn" onClick={() => habitSheet(null)} aria-label="New habit"><Icon name="plus" /></button>
    </div>

    <Segmented className="seg-range" value={view} onChange={setView}
      options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]} />

    {!rows.length && <div className="card"><div className="muted small">
      No habits yet. Meditate, read, stretch, vitamins or a supplement: make the first one.
    </div></div>}

    {view === 'today' && rows.length ? <div className="card">
      {rows.map(r => <div className="row habits-row" key={r.def.id} style={{ gap: 10, alignItems: 'center', marginTop: r === rows[0] ? 2 : 12 }}>
        <button className={'habit-check' + (r.done ? ' on' : '')} aria-pressed={r.done}
          aria-label={`${r.def.name}: ${r.done ? 'checked' : 'check'}`} onClick={() => toggle(r)}>
          <Icon name={r.done ? 'checkCircle' : 'ring'} style={{ fontSize: 22 }} />
        </button>
        <button className="habits-name" style={{ textAlign: 'start', flex: 1, minWidth: 0 }} onClick={() => nav('/habits/' + r.def.id)}>
          <div style={{ fontWeight: 500 }}>{r.def.name}</div>
          <div className="muted" style={{ fontSize: 'var(--fs-footnote)' }}>
            {r.def.schedule.kind === 'perWeek' ? `${r.week.done} of ${r.week.n} this week`
              : r.def.type !== 'yesno' && !r.done ? `${r.cur}/${r.target}${r.def.type === 'timed' ? ' min' : ''}`
              : r.done ? 'Done today' : r.rest ? 'Rest day' : r.due ? 'Due today' : 'Not today'}
          </div>
        </button>
        {r.due && !r.done && !r.skipped && <Button size="sm" variant="ghost" onClick={() => { update(s => { logHabit(s, r.def.id, { kind: 'skip' }) }); useUI.getState().toast('Skipped today') }}>Skip</Button>}
      </div>)}
    </div> : null}

    {view === 'week' && rows.length ? rows.map(r => <div className="card" key={r.def.id} style={{ marginBottom: 10 }}>
      <button className="habits-name" style={{ textAlign: 'start', marginBottom: 6 }} onClick={() => nav('/habits/' + r.def.id)}>
        <b>{r.def.name}</b> <span className="muted small">{habitStreak(S, r.def.id).current} in a row</span>
      </button>
      <DayHeatmap S={S} weeks={8} values={habitHeatValues(S, r.def.id)}
        titleFor={v => v >= 2 ? 'Checked' : v >= 1 ? 'Skipped' : 'Missed'} />
    </div>) : null}
    <div style={{ height: 16 }} />
  </div>
}
