// "Your week" / "Your month" (lib/recap.js): the Home card, and the sheet behind it with the
// numbers, Share as image (components/ShareCard.jsx) and Save as PDF (the performance report for
// that stretch, lib/report-print.js). LifeRecapHomeCard is the same beat for the life modules:
// one line, tap through to the /recap page (views/Recap.jsx).
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtNum, fmtVol, fmtDateRange } from '../lib/format.js'
import { recapDue, recapOf, lifeRecapDue } from '../lib/recap.js'
import { recapCardImage } from '../lib/recap-card.js'
import { printReport } from '../lib/report-print.js'
import ShareCardSheet from './ShareCard.jsx'
import Icon from './Icon.jsx'
import CardHead from './CardHead.jsx'
import { Button } from './ui.jsx'

const titleOf = r => (r.kind === 'month' ? t('Your month') : t('Your week'))
const datesOf = r => fmtDateRange(r.from, r.to, true)

/** The four headline tiles, translated, for the sheet and the picture. */
function tilesOf(r, unit) {
  return [
    { label: tn('workout', 'workouts', r.workouts), value: fmtNum(r.workouts) },
    { label: t('Volume'), value: fmtVol(r.volume, unit) },
    { label: tn('new best', 'new bests', r.prs), value: fmtNum(r.prs) },
    { label: tn('week in a row', 'weeks in a row', r.streak), value: fmtNum(r.streak) },
  ]
}
const topOf = r => (r.top ? t('Most work: {0}, {1} sets', t(r.top.name), fmtNum(r.top.sets)) : null)

/** One line for the Home card: "4 workouts · 12,300 kg · 2 new bests". */
function lineOf(r, unit) {
  return [tn('{0} workout', '{0} workouts', r.workouts), fmtVol(r.volume, unit), r.prs ? tn('{0} new best', '{0} new bests', r.prs) : null].filter(Boolean).join(' · ')
}

/** Home: the recap due today, or nothing. */
export function RecapHomeCard({ S }) {
  const update = useStore(s => s.update)
  const r = recapDue(S)
  if (!r) return null
  const dismiss = () => update(s => { s.recapSeen = r.key })
  // The card is not a button: its text is (CardHead open), and the × sits beside it (card dismiss pass).
  return <div className="card tap-host recap-card" data-recap={r.kind}>
    <CardHead icon="chart" tint="var(--purple)" eyebrow={datesOf(r)} title={titleOf(r)} sub={lineOf(r, S.unit)}
      open={{ onClick: () => recapSheet(r), haspopup: 'dialog' }}
      action={<button type="button" className="iconbtn" aria-label={t('Put it away')} onClick={dismiss}><Icon name="xmark" /></button>} />
  </div>
}

function RecapSheet({ period, close }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const r = recapOf(S, period)
  const tiles = tilesOf(r, S.unit)
  const words = { title: titleOf(r), dates: datesOf(r), tiles, top: topOf(r) }
  const shareImage = () => useUI.getState().openSheet(c => <ShareCardSheet title={titleOf(r)} close={c} toast={m => useUI.getState().toast(m)}
    name={`jellogym-${r.kind}-${r.from}.png`} shareTitle={titleOf(r)} render={pref => recapCardImage(words, pref)} />)
  const pdf = () => printReport(S, { range: 'custom', from: r.from, to: r.to, owner: user?.name || '' })
  return <>
    <div className="lbl2">{datesOf(r)}</div>
    <h3 style={{ marginTop: 2 }}>{titleOf(r)}</h3>
    <div className="recap-tiles">
      {tiles.map(tile => <div key={tile.label} className="recap-tile"><div className="recap-v">{tile.value}</div><div className="small muted">{tile.label}</div></div>)}
    </div>
    {r.top && <div className="small muted recap-most"><Icon name="figureStrength" /><span>{topOf(r)}</span></div>}
    <Button variant="primary" icon="share" onClick={shareImage}>{t('Share as image')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="note" onClick={pdf}>{t('Save as PDF')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Done')}</Button>
  </>
}
export const recapSheet = period => useUI.getState().openSheet(close => <RecapSheet period={period} close={close} />)

function lifeLineOf(r, days) {
  const m = r.modules
  const bits = []
  if (m.water) bits.push(`${t('Water')} ${m.water.met}/${days}`)
  if (m.habits) bits.push(`${t('Habits')} ${m.habits.checks}`)
  if (m.steps) bits.push(`${t('Steps')} ${m.steps.met}/${days}`)
  if (m.sleep) bits.push(`${t('Sleep')} ${m.sleep.met}/${m.sleep.nights}`)
  if (m.food) bits.push(`${t('Food')} ${m.food.met}/${days}`)
  if (r.perfect) bits.push(`${t('Perfect days')} ${r.perfect.perfect}`)
  return bits.join(' · ')
}

/** Home: the life half of the recap due today, or nothing (lib/recap.js, lifeRecapDue). */
export function LifeRecapHomeCard({ S }) {
  const nav = useNavigate()
  const update = useStore(s2 => s2.update)
  const r = lifeRecapDue(S)
  if (!r) return null
  const days = Math.round((new Date(r.to + 'T12:00:00') - new Date(r.from + 'T12:00:00')) / 86400000) + 1
  const dismiss = () => update(s2 => { s2.lifeRecapSeen = r.key })
  return <div className="card tap-host recap-card" data-recap={'life:' + r.kind}>
    <CardHead icon="calendar" tint="var(--blue)" eyebrow={datesOf(r)} title={titleOf(r)} sub={lifeLineOf(r, days)}
      open={{ onClick: () => nav('/recap'), haspopup: 'dialog' }}
      action={<button type="button" className="iconbtn" aria-label={t('Put it away')} onClick={dismiss}><Icon name="xmark" /></button>} />
  </div>
}
