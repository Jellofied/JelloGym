// /steps (docs/LIFE_MODULES.md): the daily totals Health Connect holds, the goal line, and when
// the hub was last read. Read-only by design — there is nothing to log here.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { stepsPoints, stepsProgress, stepOrigins, originName } from '../lib/steps.js'
import { onHealthChange, loadHealth } from '../lib/health-sync.js'
import { fmtAgo } from '../lib/format.js'
import LineChart from '../components/LineChart.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Icon from '../components/Icon.jsx'
import { Segmented } from '../components/ui.jsx'

export default function Steps() {
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
  const p = stepsProgress(S)
  const origins = stepOrigins(S)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Steps</h1><div className="sub">From your watch and phone, nothing to log</div></div>
    </div>
    <div className="card">
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <ProgressRing pct={p.pct} size={64} tint="var(--orange)" caption={`${Math.round(p.pct * 100)}%`} />
        <div>
          <div className="big">{p.n.toLocaleString()} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>steps today</span></div>
          <div className="muted small">of {p.goal.toLocaleString()} · {h?.at ? 'synced ' + fmtAgo(h.at) : 'not read yet'}</div>
        </div>
      </div>
    </div>
    <div className="card" style={{ marginTop: 12 }}>
      <Segmented className="seg-range" value={days} onChange={setDays}
        options={[{ value: 7, label: 'Week' }, { value: 14, label: '2 Weeks' }, { value: 30, label: 'Month' }]} />
      <div className="chart"><LineChart points={stepsPoints(S, days)} h={170} unit="" color="var(--orange)" goal={p.goal} /></div>
      {!p.n && days === 7 && origins.length === 0 && <div className="muted small" style={{ marginTop: 8 }}>
        Nothing yet. Steps arrive when the app that writes them syncs to Health Connect.
      </div>}
    </div>
    {origins.length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small">Sources read: {origins.map(x => `${originName(x.o)} (${x.days} days)`).join(' · ')}</div>
      {origins.length > 1 && <div className="muted small" style={{ marginTop: 4 }}>
        The day counts the biggest single source. Pick another in the health settings.
      </div>}
    </div>}
    <div style={{ height: 16 }} />
  </div>
}
