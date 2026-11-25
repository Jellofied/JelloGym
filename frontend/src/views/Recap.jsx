// The /recap page (docs/LIFE_MODULES.md, Recap): the stretch lib/recap.js says is due, in one
// place — the week on the gym (when motivation is on) and every enabled life module. Off modules
// are absent; nothing logged anywhere says so plainly. Wrapped keeps its own year story.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtVol, fmtDur, fmtDateRange } from '../lib/format.js'
import { isOn } from '../lib/modules.js'
import { shownRecapPeriod, recapOf, lifeRecapOf } from '../lib/recap.js'
import { recapSheet } from '../components/Recap.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

function Section({ icon, tint, title, sub, lines, to, nav }) {
  return <div className="card" style={{ marginBottom: 8 }}>
    <div className="row between tap-host" onClick={() => nav(to)}>
      <div className="row" style={{ gap: 10 }}>
        <span className="tint-ic" style={{ color: tint }}><Icon name={icon} /></span>
        <div><b>{title}</b>{sub && <div className="muted small">{sub}</div>}</div>
      </div>
      <Icon name="chevronRight" />
    </div>
    {lines.map(l => <div className="row between" key={l.k} style={{ marginTop: 6 }}>
      <span className="small muted">{l.k}</span><span className="small">{l.v}</span>
    </div>)}
  </div>
}

export default function LifeRecap() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const p = shownRecapPeriod(S)
  const r = lifeRecapOf(S, p)
  const days = Math.round((new Date(p.to + 'T12:00:00') - new Date(p.from + 'T12:00:00')) / 86400000) + 1
  const w = isOn(S, 'motivation') ? recapOf(S, p) : null
  const m = r.modules
  const sections = []
  if (m.water) sections.push({ icon: 'drop', tint: 'var(--blue)', title: 'Water', to: '/water', lines: [
    { k: 'Days at goal', v: `${m.water.met}/${days}` },
    ...(m.water.avg ? [{ k: 'Average day', v: m.water.avg + ' ml' }] : []),
  ] })
  if (m.habits) sections.push({ icon: 'checkCircle', tint: 'var(--teal)', title: 'Habits', to: '/habits', lines: [
    { k: 'Checks', v: String(m.habits.checks) },
    ...(m.habits.skips ? [{ k: 'Frozen days', v: String(m.habits.skips) }] : []),
    ...(m.habits.dueDays ? [{ k: 'Days all done', v: `${m.habits.allMetDays}/${m.habits.dueDays}` }] : []),
  ] })
  if (m.steps) sections.push({ icon: 'steps', tint: 'var(--orange)', title: 'Steps', to: '/steps', lines: [
    { k: 'Days at goal', v: `${m.steps.met}/${days}` },
    ...(m.steps.avg ? [{ k: 'Average day', v: m.steps.avg.toLocaleString() + ' steps' }] : []),
  ] })
  if (m.sleep) sections.push({ icon: 'moon', tint: 'var(--indigo)', title: 'Sleep', to: '/sleep', lines: [
    { k: 'Good nights', v: `${m.sleep.met}/${m.sleep.nights}` },
    ...(m.sleep.avg ? [{ k: 'Average night', v: fmtDur(m.sleep.avg * 60000) }] : []),
  ] })
  if (m.food) sections.push({ icon: 'target', tint: 'var(--green)', title: 'Food', to: '/food', lines: [
    { k: 'Days at goal', v: `${m.food.met}/${days}` },
    { k: 'Days logged', v: String(m.food.days) },
  ] })
  const empty = !r.hasData && !(w && w.workouts > 0)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/life" onClick={() => nav('/life')} aria-label="Life"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{p.kind === 'month' ? 'Your month' : 'Your week'}</h1><div className="sub">{fmtDateRange(p.from, p.to, true)}</div></div>
    </div>
    {empty && <div className="empty small">Nothing was logged in this stretch. It still counted.</div>}
    {w && w.workouts > 0 && <div className="card tap-host" style={{ marginBottom: 12 }} onClick={() => recapSheet(p)}>
      <div className="row between">
        <div><b>Training</b><div className="muted small">{w.workouts} workouts · {fmtVol(w.volume, S.unit)} · {w.prs} new bests</div></div>
        <Icon name="chevronRight" />
      </div>
    </div>}
    {sections.map(s => <Section key={s.title} {...s} nav={nav} />)}
    {r.perfect && <div className="card" style={{ marginBottom: 8 }}>
      <div className="row between">
        <span className="tint-ic" style={{ color: 'var(--yellow)' }}><Icon name="star" /></span>
        <div style={{ flex: 1 }}><b>Perfect days</b><div className="muted small">{r.perfect.perfect} of {r.perfect.owedDays} days had every open goal met</div></div>
      </div>
    </div>}
    {r.level && (r.level.to > 1 || r.level.gained > 0) && <div className="card tap-host" style={{ marginBottom: 8 }} onClick={() => nav('/level')}>
      <div className="row between">
        <div><b>Level</b><div className="muted small">Level {r.level.from} → {r.level.to}</div></div>
        <Icon name="chevronRight" />
      </div>
    </div>}
    <div style={{ height: 16 }} />
    <Button variant="ghost" onClick={() => nav('/life')}>Back to Life</Button>
  </div>
}
