// The Sleep card on Home (docs/LIFE_MODULES.md): last night against the goal. Sourced from
// Health Connect by the read (lib/sleep.js), or typed in — the ring does not care which.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { sleepProgress } from '../lib/sleep.js'
import ProgressRing from './ProgressRing.jsx'
import CardHead from './CardHead.jsx'

export function fmtNight(min) {
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

export default function SleepCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const p = sleepProgress(S)
  return <div className="card tap-host" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') nav('/sleep') }} onClick={() => nav('/sleep')}>
    <CardHead icon="moon" tint="var(--indigo)" title="Sleep" sub={p ? `Last night ${fmtNight(p.min)}` : 'No nights yet'} />
    {p ? <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
      <ProgressRing pct={p.pct} size={56} tint="var(--indigo)" caption={`${Math.round(p.pct * 100)}%`} />
      <div className="big">{fmtNight(p.min)}</div>
      <div className="muted small" style={{ marginInlineStart: 'auto' }}>of {fmtNight(p.goal)}</div>
    </div> : <div className="muted small" style={{ marginTop: 6 }}>
      Your watch writes nights to Health Connect, or type one in.
    </div>}
  </div>
}
