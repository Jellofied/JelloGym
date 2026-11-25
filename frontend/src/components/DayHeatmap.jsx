// The calendar heatmap of the History view, lifted out of the workout charts (Heatmap.jsx) so the
// life modules can reuse it: pass a per-day value map and it shades 52 weeks with the same l0..l4
// ramp, today ring and tap-through. Used by the workout chart, the habit detail, the perfect-day
// grid and /stats/life. Heatmap.jsx passes levelOf/titleFor/classFor/legend for its per-metric
// counts and notes; the rest keep the plain ramp and legend.
import { isoOf, todayISO, MONTHS, weekStartOf, weekDayOffset } from '../lib/format.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { t } from '../lib/i18n.js'

export default function DayHeatmap({ S, values, weeks = 52, levelOf, titleFor, classFor, onDay, wrapRef, legend }) {
  // Quartiles of the days that hold something, so the ramp adapts to each module's scale.
  const present = Object.values(values).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (present.length ? present[Math.min(present.length - 1, Math.floor(p * present.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const level = v => !v ? 0 : defaultLevel(v)
  function defaultLevel(v) { return v >= t3 ? 4 : v >= t2 ? 3 : v >= t1 ? 2 : 1 }
  const lvl = levelOf || level

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const ws = weekStartOf(S)
  const end = new Date(today); end.setDate(today.getDate() - weekDayOffset(today.getDay(), ws))
  const start = new Date(end); start.setDate(end.getDate() - weeks * 7)
  const dayLabels = Array(7).fill(null)
  dayLabels[weekDayOffset(1, ws)] = 'Mon'
  dayLabels[weekDayOffset(3, ws)] = 'Wed'
  dayLabels[weekDayOffset(5, ws)] = 'Fri'

  const months = [], cols = []
  let lastMonth = -1
  for (let wk = 0; wk <= weeks; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    const showM = mo !== lastMonth && colStart.getDate() <= 7 && wk < weeks - 1
    months.push(<span key={wk}>{showM ? t(MONTHS[mo]) : ''}</span>)
    if (colStart.getDate() <= 7) lastMonth = mo
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const v = values[key] || 0
      const extra = titleFor ? titleFor(v, key) : ''
      const cls = 'hm-c l' + lvl(v, key) + (classFor ? classFor(key, v) : '') + (key === todayISO() ? ' today' : '') + (day > today ? ' future' : '')
      cells.push(<div key={d} className={cls} title={key + (extra ? ' · ' + extra : '')}
        {...tappable(onDay ? () => onDay(key) : undefined)} />)
    }
    cols.push(<div key={wk} className="hm-col">{cells}</div>)
  }

  return <>
    <div className="hm-wrap" ref={wrapRef}>
      <div className="hm-months" style={{ marginInlineStart: 30 }}>{months}</div>
      <div className="hm-body">
        <div className="hm-days">{dayLabels.map((lbl, i) => <span key={i}>{lbl ? t(lbl) : ''}</span>)}</div>
        <div className="hm-grid">{cols}</div>
      </div>
    </div>
    {legend !== undefined ? legend : <div className="hm-legend">Less <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" /><div className="hm-c l3" /><div className="hm-c l4" /> More</div>}
  </>
}
