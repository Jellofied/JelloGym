// The /water page (slice 1b): today with the quick-add chips (the Home card itself), a goal-line
// chart day/week/month (LineChart, the weight charts' bones), and the history with edit and
// delete-undo (the weigh-ins sheet's pattern over lib/water.js). Route + Home link appear with
// the Water module; a module off hides every surface of it (lib/modules.js).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtDate } from '../lib/format.js'
import { drinksOn, waterDays, waterSeries } from '../lib/water.js'
import { deleteWater, waterEditSheet } from '../components/WaterSheets.jsx'
import WaterCard from '../components/WaterCard.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

export default function Water() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [mode, setMode] = useState('day')
  const series = waterSeries(S, mode)
  const days = useMemo(() => [...waterDays(S)].reverse().slice(0, 60), [S.water])
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label="Home"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>Water</h1><div className="sub">Every drink, one tap at a time</div></div>
      <button className="iconbtn" onClick={() => nav('/settings/water')} aria-label="Water settings"><Icon name="gear" /></button>
    </div>

    <WaterCard showAllLink={false} />

    <div className="card" style={{ marginTop: 12 }}>
      <Segmented className="seg-range" value={mode} onChange={setMode}
        options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      <div className="muted small" style={{ marginBottom: 4 }}>
        {mode === 'day' ? 'Millilitres each of the last 14 days.' : mode === 'week' ? 'A daily average over each of the last 12 weeks.' : 'A daily average inside each of the last 12 months.'}
      </div>
      <div className="chart"><LineChart points={series.points} h={170} unit="ml" color="var(--blue)" goal={series.goal} /></div>
    </div>

    <div className="row between" style={{ margin: '18px 2px 10px' }}>
      <h4 className="sec" style={{ margin: 0 }}>History</h4>
    </div>
    {days.length ? <div className="list">{days.map(({ d, ml }) => <div className="card" key={d} style={{ marginBottom: 8 }}>
      <div className="row between">
        <b>{fmtDate(d, true)}</b>
        <span className="muted small">{ml} ml</span>
      </div>
      {drinksOn(S, d).map(e => <div className="row between" key={e.id} style={{ marginTop: 4 }}>
        <span>+{e.ml} ml</span>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" onClick={() => waterEditSheet(e.id)} aria-label="Edit"><Icon name="pencil" /></button>
          <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => deleteWater(e.id)} aria-label="Delete"><Icon name="trash" /></button>
        </div>
      </div>)}
    </div>)}</div> : <div className="empty small">No drinks yet.</div>}
    <div style={{ height: 16 }} />
    <Button variant="ghost" onClick={() => nav('/home')}>Back to Home</Button>
  </div>
}
