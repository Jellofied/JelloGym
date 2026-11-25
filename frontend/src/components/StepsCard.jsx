// The Steps card on Home (docs/LIFE_MODULES.md): today against the goal, read-only. The number is
// derived from the hub's records with the double-count rule (lib/steps.js), so a watch mirroring
// the phone never shows 18 000 steps for 9 000 walked. Tapping opens /steps.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { stepsProgress } from '../lib/steps.js'
import { onHealthChange, loadHealth } from '../lib/health-sync.js'
import { fmtAgo } from '../lib/format.js'
import ProgressRing from './ProgressRing.jsx'
import CardHead from './CardHead.jsx'

export default function StepsCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [h, setH] = useState(null)
  useEffect(() => {
    let gone = false
    loadHealth().then(f => { if (!gone) setH(f) }).catch(() => {})
    const off = onHealthChange(f => { if (!gone) setH(f) })
    return () => { gone = true; off() }
  }, [])
  const p = stepsProgress(S)
  return <div className="card tap-host" onClick={() => nav('/steps')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') nav('/steps') }}>
    <CardHead icon="steps" tint="var(--orange)" title="Steps"
      sub={h?.at ? (p.n ? `${p.n.toLocaleString()} steps today` : 'Nothing today yet') : 'Read from Health Connect'} />
    <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
      <ProgressRing pct={p.pct} size={56} tint="var(--orange)" caption={`${Math.round(p.pct * 100)}%`} />
      <div className="big">{p.n.toLocaleString()} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>steps</span></div>
      <div className="muted small" style={{ marginInlineStart: 'auto' }}>of {p.goal.toLocaleString()} · {h?.at ? 'synced ' + fmtAgo(h.at) : 'not synced yet'}</div>
    </div>
  </div>
}
