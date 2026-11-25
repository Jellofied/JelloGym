// /life — the Life tab's hub (docs/LIFE_MODULES.md, nav rework): one row per enabled life module
// with today's number, computed on the spot from the same pure helpers the cards and charts use.
// A module switched off takes its row with it; the tab itself only exists while one of them is on
// (App.jsx and TabBar.jsx gate it the same way). Body — the weigh-ins that predate all this —
// rides along when its module is on, pointing at Stats' body section.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { isOn } from '../lib/modules.js'
import { fmtNum } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import { goalProgress } from '../lib/water.js'
import { todayList } from '../lib/habits.js'
import { stepsProgress } from '../lib/steps.js'
import { sleepProgress } from '../lib/sleep.js'
import { fmtNight } from '../components/SleepCard.jsx'
import { dayFood, foodGoals } from '../lib/food.js'
import LevelCard from '../components/LevelCard.jsx'
import Icon from '../components/Icon.jsx'

export default function Life() {
  const nav = useNavigate()
  const S = useStore(s => s.S)

  const rows = []
  if (isOn(S, 'water')) {
    const p = goalProgress(S)
    rows.push({ id: 'water', icon: 'drop', tint: 'var(--blue)', title: 'Water', path: '/water',
      sub: `${p.ml} of ${p.goal} ml today`, pct: p.pct })
  }
  if (isOn(S, 'habits')) {
    const list = todayList(S)
    const due = list.filter(r => r.due)
    const met = due.filter(r => r.done || r.skipped).length
    rows.push({ id: 'habits', icon: 'checkCircle', tint: 'var(--teal)', title: 'Habits', path: '/habits',
      sub: list.length ? `${met} of ${due.length} done today` : 'No habits yet' })
  }
  if (isOn(S, 'steps')) {
    const p = stepsProgress(S)
    rows.push({ id: 'steps', icon: 'steps', tint: 'var(--orange)', title: 'Steps', path: '/steps',
      sub: `${p.n.toLocaleString()} of ${p.goal.toLocaleString()} steps today` })
  }
  if (isOn(S, 'sleep')) {
    const p = sleepProgress(S)
    rows.push({ id: 'sleep', icon: 'moon', tint: 'var(--indigo)', title: 'Sleep', path: '/sleep',
      sub: p ? `Last night ${fmtNight(p.min)}` : 'No nights yet' })
  }
  if (isOn(S, 'food')) {
    const t = dayFood(S), g = foodGoals(S)
    rows.push({ id: 'food', icon: 'target', tint: 'var(--green)', title: 'Food', path: '/food',
      sub: `${t.kcal.toLocaleString()} of ${g.kcal.toLocaleString()} kcal · ${t.protein} of ${g.protein} g` })
  }
  if (isOn(S, 'body')) {
    const bw = lastBW(S)
    rows.push({ id: 'body', icon: 'scale', tint: 'var(--teal)', title: 'Body', path: '/stats?section=body',
      sub: bw ? `${fmtNum(bw.w)} ${S.unit} · weigh-ins, measurements, photos` : 'Weigh-ins, measurements, photos' })
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Life</h1><div className="sub">Everything outside the gym</div></div>
      <button className="iconbtn" onClick={() => nav('/settings/modules')} aria-label="Modules"><Icon name="gear" /></button>
    </div>

    {isOn(S, 'levels') && <LevelCard />}
    <div className="card" style={{ marginTop: isOn(S, 'levels') ? 12 : 0 }}>
      <div className="sect-b">
        {rows.map(r => <button type="button" className="lrow tap" key={r.id} onClick={() => nav(r.path)}>
          <span className="lrow-i" style={{ background: r.tint }} aria-hidden="true"><Icon name={r.icon} /></span>
          <span className="lrow-m"><span className="lrow-t">{r.title}</span><span className="lrow-s">{r.sub}</span></span>
          <Icon name="chevronRight" className="chev" />
        </button>)}
        {!rows.length && <div className="muted small" style={{ padding: '10px 2px' }}>
          Nothing switched on yet — pick the modules you want in Settings.
        </div>}
      </div>
    </div>
    <div style={{ height: 16 }} />
  </div>
}
