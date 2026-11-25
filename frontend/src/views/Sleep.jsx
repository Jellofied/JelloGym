// /sleep (docs/LIFE_MODULES.md): last night, the chart of main sessions against the goal line,
// and the nights themselves — hub rows and typed ones side by side, each removable.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtDate } from '../lib/format.js'
import { lastNight, nightTotal, sleepGoalOf, sleepPoints, sleepSessions } from '../lib/sleep.js'
import { onHealthChange, loadHealth } from '../lib/health-sync.js'
import { fmtAgo } from '../lib/format.js'
import { sleepManualSheet } from '../components/SleepSheets.jsx'
import { fmtNight } from '../components/SleepCard.jsx'
import LineChart from '../components/LineChart.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

export default function Sleep() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [days, setDays] = useState(14)
  const [h, setH] = useState(null)
  useEffect(() => {
    let gone = false
    loadHealth().then(f => { if (!gone) setH(f) }).catch(() => {})
    const off = onHealthChange(f => { if (!gone) setH(f) })
    return () => { gone = true; off() }
  }, [])
  const night = lastNight(S)
  const goal = sleepGoalOf(S)
  const sessions = sleepSessions(S).filter(x => x.d <= new Date().toISOString().slice(0, 10))
  const byNight = []
  for (const x of sessions) {
    const top = byNight[byNight.length - 1]
    if (top && top.d === x.d) top.all.push(x); else byNight.push({ d: x.d, main: x, all: [x] })
  }
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Sleep</h1><div className="sub">Nights from your watch, or typed in</div></div>
      <button className="iconbtn" onClick={() => sleepManualSheet()} aria-label="Log a night"><Icon name="plus" /></button>
    </div>

    {night && <div className="card">
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <ProgressRing pct={Math.min(1, night.total / goal)} size={64} tint="var(--indigo)"
          caption={`${Math.round(Math.min(1, night.total / goal) * 100)}%`} />
        <div>
          <div className="big">{fmtNight(night.total)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>last night</span></div>
          <div className="muted small">{fmtDate(night.d, true)} · goal {fmtNight(goal)} · {h?.at ? 'synced ' + fmtAgo(h.at) : 'not read yet'}</div>
        </div>
      </div>
    </div>}

    <div className="card" style={{ marginTop: 12 }}>
      <Segmented className="seg-range" value={days} onChange={setDays}
        options={[{ value: 7, label: 'Week' }, { value: 14, label: '2 Weeks' }, { value: 30, label: 'Month' }]} />
      <div className="chart"><LineChart points={sleepPoints(S, days)} h={170} unit="" color="var(--indigo)" goal={goal} /></div>
      {!byNight.length && <div className="muted small" style={{ marginTop: 8 }}>
        No nights yet. They arrive from Health Connect; until then, type the last one in.
      </div>}
    </div>

    {byNight.length > 0 && <div className="list" style={{ marginTop: 4 }}>
      {byNight.slice(0, 30).map(n => <div className="card" key={n.d} style={{ marginBottom: 8 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div><b>{fmtDate(n.d, true)}</b>
            <div className="muted small" style={{ marginTop: 2 }}>
              {fmtNight(n.main.min)}{n.all.length > 1 ? ` · +${nightTotal(S, n.d) - n.main.min} asleep later` : ''}{n.main.m ? ' · typed' : ''}
            </div>
          </div>
          <button className="iconbtn" onClick={() => sleepManualSheet(n.main)} aria-label="Edit night"><Icon name="pencil" /></button>
        </div>
      </div>)}
    </div>}
    <div style={{ height: 16 }} />
    {byNight.length > 0 && <Button variant="ghost" icon="plus" onClick={() => sleepManualSheet()}>Type another night</Button>}
  </div>
}
