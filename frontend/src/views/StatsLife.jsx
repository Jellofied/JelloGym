// /stats/life (docs/LIFE_MODULES.md, Navigation/IA and feature 8): the Life half of Stats. Every
// enabled module gets its chart over one stretch, the plain numbers under it, and a quiet way on to
// its own page; the comparisons between them are lib/insights.js' words. Nothing here works a
// number out: the charts, the counts and the insights all come from the same pure helpers the Home
// cards and the recap use (lib/life-stats.js, lib/insights.js), so one page cannot disagree with
// another.
//
// A module that is switched off has no card at all, and the whole page goes with the last one
// (StatsViews and App.jsx both ask lib/modules.js' anyLifeOn).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { isOn } from '../lib/modules.js'
import { LIFE_RANGES, habitRows, lifeSummary, monthsOf, perfectValues, ratioLevel, seriesOf, stretchOf } from '../lib/life-stats.js'
import { insights } from '../lib/insights.js'
import { xpTotals } from '../lib/xp.js'
import { fmtDur, fmtDate, todayISO, MONTHS } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import LineChart from '../components/LineChart.jsx'
import DayHeatmap from '../components/DayHeatmap.jsx'
import MonthSquares from '../components/MonthSquares.jsx'
import { BarRow } from '../components/StatBars.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import StatsViews from '../components/StatsViews.jsx'
import Icon from '../components/Icon.jsx'

const count = n => Number(n || 0).toLocaleString()
// The line under a chart: "29 of 30 days at goal · Average day 2,200 ml".
const statsLine = parts => parts.filter(Boolean).join(' · ')

// One card: a heading, the quiet way on to the module's own page, then whatever the module shows.
// In the Month grid the bottom margin is the grid's gap, not the card's.
function ModuleCard({ title, to, nav, note, children, inGrid = false }) {
  return <div className="card" style={{ marginBottom: inGrid ? 0 : 12 }}>
    <div className="row between lg-head">
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {note && <div className="muted small">{note}</div>}
      </div>
      <button type="button" className="iconbtn" aria-label={'Open ' + title} title={'Open ' + title} onClick={() => nav(to)}>
        <Icon name="chevronRight" />
      </button>
    </div>
    {children}
  </div>
}

function LifeChart({ chart, color, unit }) {
  return <div className="chart" style={{ marginTop: 6 }}>
    <LineChart points={chart.points} h={160} unit={unit} color={color} goal={chart.goal} />
  </div>
}

// Each stretch brings its own shape (LIFE_RANGES): the month a grid of day squares, the quarter
// the weekly line, longer stretches one bar per month. The numbers stay the same whatever shows.
const monthLabel = (key, long) => t(MONTHS[Number(key.slice(5, 7)) - 1]) + (long ? ' ' + key.slice(2, 4) : '')

function StretchBody({ S, period, kind, chart, color, unit, fmt, open }) {
  if (period.bucket === 'day') {
    return <MonthSquares S={S} from={period.from} values={Object.fromEntries(chart.points.map(p => [p.d, p.y]))}
      levelOf={ratioLevel(chart.goal)} titleFor={v => v ? fmt(v) : ''} onDay={open} />
  }
  if (period.bucket === 'week') return <LifeChart chart={chart} color={color} unit={unit} />
  const rows = monthsOf(S, kind, period)
  const long = rows.length > 0 && rows[0].key.slice(0, 4) !== rows[rows.length - 1].key.slice(0, 4)
  const max = Math.max(1, ...rows.map(r => r.avg))
  return <div className="sect-b" style={{ marginTop: 6 }}>
    {rows.map(r => <BarRow key={r.key} label={monthLabel(r.key, long)} value={fmt(r.avg)} fill={r.avg / max}
      tone={r.logged ? 'acc' : 'neutral'} onClick={open} ariaLabel={monthLabel(r.key, long) + ', ' + fmt(r.avg)} />)}
  </div>
}

export default function StatsLife() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState('month')
  // All time starts where the profile's first life entry is, so the stretch depends on S too.
  const period = useMemo(() => stretchOf(range, todayISO(), S), [range, S])
  // One walk of the history for the whole page: the level the stretch starts on and the weekly bars
  // both come out of it (lib/xp.js memoises the walk per state copy, so this is the one call).
  const walk = useMemo(() => xpTotals(S), [S])
  // The numbers judge the days that have passed: today, not the stretch's end (a calendar
  // stretch runs on past the present, and the days ahead of today can never owe a goal).
  const stats = useMemo(() => lifeSummary(S, period, todayISO(), walk), [S, period, walk])
  // The line/square charts need a per-day or per-week walk; month bars come from monthsOf in
  // StretchBody, so a month-bucketed seriesOf walk is not built at all for those stretches.
  const liney = period.bucket !== 'month'
  const charts = useMemo(() => ({
    water: liney && isOn(S, 'water') ? seriesOf(S, 'water', period) : null,
    steps: liney && isOn(S, 'steps') ? seriesOf(S, 'steps', period) : null,
    sleep: liney && isOn(S, 'sleep') ? seriesOf(S, 'sleep', period) : null,
    kcal: liney && isOn(S, 'food') ? seriesOf(S, 'kcal', period) : null,
  }), [S, period, liney])
  const habitLines = useMemo(() => (isOn(S, 'habits') ? habitRows(S, period) : []), [S, period])
  const perfectGrid = useMemo(() => (stats.perfect ? perfectValues(S, period) : {}), [S, period, stats.perfect])
  const xpWeeks = useMemo(() => walk.weeks.slice(-8).reverse(), [walk])
  const compares = useMemo(() => insights(S), [S])

  if (!stats.hasAny) return <div className="narrow">
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">Life</div></div></div>
    <div className="card">
      <div className="muted small">Nothing life-shaped is switched on yet. Pick the modules you want and their charts appear here.</div>
      <div style={{ marginTop: 10 }}><Button variant="tinted" onClick={() => nav('/settings/modules')}>Choose modules</Button></div>
    </div>
  </div>

  // The Month view puts the perfect-day grid across the top, then pairs the four square modules
  // two to a row. Levels and habits are lists, so they stay full width below the grid.
  const show = {
    perfect: !!(stats.perfect && stats.perfect.owed > 0),
    water: isOn(S, 'water'),
    steps: isOn(S, 'steps'),
    sleep: isOn(S, 'sleep'),
    food: isOn(S, 'food'),
    levels: isOn(S, 'levels') && xpWeeks.length > 0,
  }
  const squares = [show.water, show.steps, show.sleep, show.food]
  const grid = period.bucket === 'day' && squares.filter(Boolean).length > 1

  const perfectCard = show.perfect && <div className={'card' + (grid ? ' lg-span' : '')} style={{ marginBottom: grid ? 0 : 12 }}>
      <div className="row between lg-head">
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>Perfect days</h2>
        <div className="muted small">{stats.perfect.done} of {stats.perfect.owed} days kept every goal they owed</div>
      </div>
      {/* The whole story (badges, freezes, the week's XP) is /level's when Levels is on; without
          it this grid is still worth a look, and /life is where the day's goals live. */}
      <button type="button" className="iconbtn" aria-label={isOn(S, 'levels') ? 'Open Levels' : 'Open Life'}
        title={isOn(S, 'levels') ? 'Open Levels' : 'Open Life'} onClick={() => nav(isOn(S, 'levels') ? '/level' : '/life')}>
        <Icon name="chevronRight" />
      </button>
    </div>
    {/* The month view keeps the square shape here too: the same red ramp, the levels reading
        as goals kept. Longer stretches use the rolling weekly grid as before. */}
    {period.bucket === 'day'
      ? <MonthSquares S={S} from={period.from} values={perfectGrid} showDates
          levelOf={v => v === 2 ? 4 : v === 1 ? 2 : 0}
          titleFor={v => v === 2 ? 'Perfect' : v === 1 ? 'Half kept' : ''}
          onDay={() => nav(isOn(S, 'levels') ? '/level' : '/life')} />
      : <DayHeatmap S={S} weeks={Math.min(53, Math.ceil(period.days / 7) + 1)} values={perfectGrid}
          titleFor={v => v === 2 ? 'Perfect' : v === 1 ? 'Half kept' : ''} onDay={() => nav(isOn(S, 'levels') ? '/level' : '/life')} />}
  </div>

  const waterCard = show.water && <ModuleCard inGrid={grid} title="Water" to="/water" nav={nav} note={`${count(stats.water.goal)} ml a day`}>
    <StretchBody S={S} period={period} kind="water" chart={charts.water} color="var(--blue)" unit="ml"
      fmt={v => `${count(v)} ml`} open={() => nav('/water')} />
    <div className="muted small" style={{ marginTop: 6 }}>
      {`${stats.water.met}/${stats.days}, ${count(stats.water.avg)} ml avg`}
    </div>
  </ModuleCard>

  const habitsCard = isOn(S, 'habits') && <ModuleCard title="Habits" to="/habits" nav={nav}
    note={statsLine([`${count(stats.habits.checks)} checks`, stats.habits.skips ? `${count(stats.habits.skips)} frozen` : null,
      `${stats.habits.allMetDays} of ${stats.habits.dueDays} days all kept`])}>
    {habitLines.length ? <div className="sect-b">
      {habitLines.map(r => <BarRow key={r.id} label={r.name} value={`${r.done}/${r.due}`} fill={r.pct}
        tone={r.due && r.done === r.due ? 'in' : 'acc'} onClick={() => nav('/habits/' + r.id)} />)}
    </div> : <div className="muted small">No habits yet. Add one and it starts counting here.</div>}
  </ModuleCard>

  const stepsCard = show.steps && <ModuleCard inGrid={grid} title="Steps" to="/steps" nav={nav} note={`${count(stats.steps.goal)} a day, read from Health Connect`}>
    <StretchBody S={S} period={period} kind="steps" chart={charts.steps} color="var(--orange)" unit=""
      fmt={v => count(v)} open={() => nav('/steps')} />
    <div className="muted small" style={{ marginTop: 6 }}>
      {`${stats.steps.met}/${stats.days}, ${count(stats.steps.avg)} avg`}
    </div>
  </ModuleCard>

  const sleepCard = show.sleep && <ModuleCard inGrid={grid} title="Sleep" to="/sleep" nav={nav} note={`${fmtDur(stats.sleep.goal * 60000)} a night`}>
    <StretchBody S={S} period={period} kind="sleep" chart={charts.sleep} color="var(--indigo)" unit=""
      fmt={v => fmtDur(v * 60000)} open={() => nav('/sleep')} />
    <div className="muted small" style={{ marginTop: 6 }}>
      {`${stats.sleep.met}/${stats.sleep.nights}, ${fmtDur(stats.sleep.avg * 60000)} avg`}
    </div>
  </ModuleCard>

  const foodCard = show.food && <ModuleCard inGrid={grid} title="Food" to="/food" nav={nav}
    note={`${count(stats.food.kcalGoal)} kcal and ${stats.food.proteinGoal} g a day`}>
    <StretchBody S={S} period={period} kind="kcal" chart={charts.kcal} color="var(--green)" unit="kcal"
      fmt={v => `${count(v)} kcal`} open={() => nav('/food')} />
    <div className="muted small" style={{ marginTop: 6 }}>
      {`${stats.food.met}/${stats.food.days}, ${count(stats.food.kcal)} kcal, ${stats.food.protein} g protein`}
    </div>
  </ModuleCard>

  const levelsCard = show.levels && <ModuleCard title="Levels" to="/level" nav={nav}
    note={stats.levels ? `Level ${stats.levels.from} to ${stats.levels.to} over these ${stats.days} days` : 'One bar per week, bonus included'}>
    <div className="sect-b">
      {xpWeeks.map(w => <BarRow key={w.key} label={fmtDate(w.key, false)} value={w.total + ' xp' + (w.bonus ? ' · bonus ' + w.bonus : '')}
        fill={w.total / Math.max(1, ...xpWeeks.map(x => x.total))} tone="acc" />)}
    </div>
    <div className="muted small" style={{ marginTop: 6 }}>A kept week pays more than one big day.</div>
  </ModuleCard>

  return <div className="narrow stats-life">
    <div className="hdr">
      <div><h1>{t('Stats')}</h1><div className="sub">Everything outside the sessions</div></div>
      <button type="button" className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button>
    </div>
    <StatsViews view="life" />

    <Segmented className="seg-range" value={range} onChange={setRange} options={LIFE_RANGES} />
      <div className="muted small" style={{ marginBottom: 10 }}>
        {stats.days} days so far in this stretch. A month is day squares, 3 Months a weekly line, longer stretches one bar per month - the goal line always means per day.
      </div>

    {grid
      ? <><div className="life-grid">{perfectCard}{waterCard}{stepsCard}{sleepCard}{foodCard}</div>{levelsCard}{habitsCard}</>
      : <>{perfectCard}{waterCard}{stepsCard}{sleepCard}{foodCard}{levelsCard}{habitsCard}</>}

    <div className="card" style={{ marginBottom: 12 }}>
      <h2 style={{ margin: '0 0 4px' }}>What goes together</h2>
      <div className="muted small">Plain counts from your own log, over the last 180 days whatever stretch is picked above, and only when both sides hold fourteen days or more. A rest day is any day without a session, including the ones before a module was switched on. A pattern in one person is not a reason.</div>
      {compares.length ? <div className="sect-b" style={{ marginTop: 8 }}>
        {compares.map(i => <div key={i.id} className="insight">
          <div style={{ fontWeight: 500 }}>{i.title}</div>
          <div className="muted small" style={{ marginTop: 2 }}>{i.detail}</div>
        </div>)}
      </div> : <div className="muted small" style={{ marginTop: 8 }}>
        Nothing has two sides yet. Keep logging, and the comparisons appear on their own.
      </div>}
    </div>
    <div style={{ height: 16 }} />
  </div>
}
