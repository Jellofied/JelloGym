// /level (Levels 5b/5c): where the number comes from. The big ring, what each module paid this
// year, the last eight weeks with their consistency bonus, the perfect-day grid, the badge board
// with its unlock dates, and the streak-freeze pool — everything derived, except the dates.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtDate, isoOf, todayISO } from '../lib/format.js'
import { xpTotals } from '../lib/xp.js'
import { dayGoals } from '../lib/perfectday.js'
import { badgesOf, freezePool } from '../lib/levels.js'
import DayHeatmap from '../components/DayHeatmap.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Icon from '../components/Icon.jsx'

const DAY_MS = 86400000

export default function Level() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const x = xpTotals(S)
  const pool = freezePool(S)
  const today = todayISO()
  const values = {}
  for (let i = 27; i >= 0; i--) {
    const d = isoOf(new Date(new Date(today + 'T12:00:00').getTime() - i * DAY_MS))
    const g = dayGoals(S, d, today)
    values[d] = g.total ? Math.round((g.met / g.total) * 2) : 0
  }
  const badges = badgesOf(S, today)
  const recent = x.weeks.slice(-8).reverse()
  const SRC = { workouts: ['Sessions', 'flame'], water: ['Water goal days', 'drop'], habits: ['Check-ins', 'checkCircle'], steps: ['Step goal days', 'steps'], sleep: ['Goal nights', 'moon'], food: ['Goal days', 'target'] }
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Level {x.level}</h1><div className="sub">{x.xp} xp so far</div></div>
    </div>

    <div className="card">
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <ProgressRing pct={x.level === 0 ? x.xp / 100 : x.into / x.forNext} size={72} tint="var(--red)"
          caption={`${x.level === 0 ? x.xp : x.into}`} small={x.level === 0 ? '/100' : `/${x.forNext}`} />
        <div>
          <div style={{ fontWeight: 700 }}>{x.level === 0 ? 'The first level is the hardest' : `${x.forNext - x.into} xp to level ${x.level + 1}`}</div>
          <div className="muted small" style={{ marginTop: 3 }}>Consistency over volume: a kept week pays more than one big day.</div>
        </div>
      </div>
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>Perfect days, last 4 weeks</div>
      <DayHeatmap S={S} weeks={4} values={values} titleFor={v => v === 2 ? 'Perfect' : v === 1 ? 'Half kept' : v === 0 ? '' : ''} />
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>Badges</div>
      {badges.map(b => <div className="row between" key={b.key} style={{ padding: '5px 0' }}>
        <span className={b.earned ? '' : 'dim'}><Icon name="trophy" style={{ color: b.earned ? 'var(--red)' : 'var(--label-3)', fontSize: 15, marginInlineEnd: 7 }} />{b.title}</span>
        <span className="muted small">{b.date ? fmtDate(b.date, true) : b.earned ? 'unlocked' : 'not yet'}</span>
      </div>)}
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 500 }}>Streak freezes</div>
          <div className="muted small" style={{ marginTop: 2 }}>A missed habit day can be frozen instead of breaking the run. One earned every three levels.</div>
        </div>
        <div className="big" style={{ color: pool.left ? 'var(--red)' : undefined }}>{pool.left}<span className="muted" style={{ fontSize: 'var(--fs-caption)', fontWeight: 400 }}> / {pool.earned}</span></div>
      </div>
      {pool.used > 0 && <div className="muted small" style={{ marginTop: 4 }}>{pool.used} used, and the runs they saved show no gaps.</div>}
    </div>

    {Object.keys(x.bySource).length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>Where the xp came from</div>
      {Object.entries(x.bySource).map(([id, r]) => <div className="row between" key={id} style={{ padding: '4px 0' }}>
        <span><Icon name={SRC[id]?.[1] || 'dot'} style={{ fontSize: 14, marginInlineEnd: 7 }} />{SRC[id]?.[0] || id}</span>
        <span className="muted small">{r.n} {r.unit} · {r.xp} xp</span>
      </div>)}
    </div>}

    {recent.length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>Recent weeks</div>
      {recent.map(w => <div className="row between" key={w.key} style={{ padding: '4px 0' }}>
        <span className="muted small">{fmtDate(w.key, false)}</span>
        <span className="small">{w.total} xp{w.bonus ? ` · bonus ${w.bonus}` : ''}</span>
      </div>)}
    </div>}
    <div style={{ height: 16 }} />
  </div>
}
