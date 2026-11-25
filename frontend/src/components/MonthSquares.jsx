// One calendar month as squares (the Month view of /stats/life and its perfect-day grid):
// the same l0..l4 brand-red ramp every other calendar square uses, at finger size. The month
// grid starts on the profile's week start, blanks in front of day 1, and the days ahead of
// today draw dimmed - the month seen running out.
import { isoOf, todayISO, weekStartOf, weekDayOffset } from '../lib/format.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

export default function MonthSquares({ S, from, values, levelOf, titleFor, onDay, showDates = false }) {
  const first = new Date(from + 'T12:00:00')
  const year = first.getFullYear(), month = first.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  // Same week-start arithmetic as DayHeatmap: the grid's first column is the profile's first weekday.
  const lead = weekDayOffset(first.getDay(), weekStartOf(S))
  const today = todayISO()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<span key={'e' + i} />)
  for (let d = 1; d <= days; d++) {
    const iso = isoOf(new Date(year, month, d))
    const v = values[iso] || 0
    const extra = titleFor ? titleFor(v, iso) : ''
    cells.push(<div key={iso} className={'hm-c l' + levelOf(v, iso) + (iso === today ? ' today' : '') + (iso > today ? ' future' : '')}
      title={iso + (extra ? ' · ' + extra : '')} {...tappable(onDay ? () => onDay(iso) : undefined)}>
      {showDates && <span className="msq-date">{d}</span>}
    </div>)
  }
  return <div className={'msq' + (showDates ? ' msq-dates' : '')}>{cells}</div>
}
