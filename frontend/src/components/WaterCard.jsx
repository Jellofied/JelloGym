// The Water card on Home (docs/LIFE_MODULES.md, slice 1a): today's ring, the quick-add chips and
// the last amount. The chips themselves are shared with the Start sheet (components/WaterQuickAdds).
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { goalProgress } from '../lib/water.js'
import { waterCustomSheet } from './WaterSheets.jsx'
import ProgressRing from './ProgressRing.jsx'
import CardHead from './CardHead.jsx'
import WaterQuickAdds from './WaterQuickAdds.jsx'
import { Button } from './ui.jsx'

export default function WaterCard({ showAllLink = true }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const p = goalProgress(S)

  return <div className="card">
    <CardHead icon="drop" tint="var(--blue)" title="Water"
      action={<Button size="sm" icon="plus" onClick={() => waterCustomSheet()}>Log</Button>} />
    <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
      <ProgressRing pct={p.pct} size={64} tint="var(--blue)" caption={`${Math.round(p.pct * 100)}%`} />
      <div className="big">{p.ml} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>ml</span></div>
      <div className="muted small" style={{ marginInlineStart: 'auto' }}>of {p.goal} ml today</div>
    </div>
    <WaterQuickAdds style={{ marginTop: 8 }} />
    {showAllLink && <div className="row between" style={{ marginTop: 6 }}>
      <span />
      <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/water')}>All drinks</Button>
    </div>}
  </div>
}
