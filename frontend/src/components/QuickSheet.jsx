// The Actions hub (docs/LIFE_MODULES.md, nav rework): the disc, tapped while idle, opens this
// instead of going straight into a session. The layout is the Nothing grid: square cards, the
// icon top-left, the name and today's number at the bottom. Start workout leads and starts
// directly; Habits, Water and Food open a small sheet with their one-tap controls; a weigh-in
// opens its sheet; a note sits in the wide row under its own label, like the mock's
// Support block. Sections follow the module switches.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { effectiveRoutines, lastBW } from '../lib/history.js'
import { dayNoteLine, dayNoteOf } from '../lib/day-notes.js'
import { isOn } from '../lib/modules.js'
import { todayList } from '../lib/habits.js'
import { goalProgress } from '../lib/water.js'
import { addFood, dayFood, foodGoals, recentFoods } from '../lib/food.js'
import { bwSheet, dayNoteSheet } from '../sheets.jsx'
import { t } from '../lib/i18n.js'
import { foodAddSheet, savedPickerSheet } from './FoodSheets.jsx'
import HabitsToday from './HabitsToday.jsx'
import WaterQuickAdds from './WaterQuickAdds.jsx'
import Icon from './Icon.jsx'

function Card({ icon, title, sub, onClick, tour }) {
  return <button className="quick-card" onClick={onClick} {...(tour ? { 'data-tour': tour } : {})}>
    <Icon name={icon} />
    <span className="qc-txt"><span className="qc-title">{title}</span>{sub && <span className="qc-sub">{sub}</span>}</span>
  </button>
}

// The sub-sheets are their own components so they re-render with the store: a water logged from
// the chips updates the chips, a habit ticked stays ticked.
function HabitsQuick() {
  const S = useStore(s => s.S)
  return <><h3>{t('Habits')}</h3><HabitsToday S={S} /></>
}

function FoodQuick({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const recent = recentFoods(S)
  const then = fn => () => { close(); fn() }
  return <>
    <h3>{t('Food')}</h3>
    <div className="chips" style={{ marginTop: 6 }}>
      {recent.slice(0, 4).map(f => <button key={f.id} className="chip"
        aria-label={`Repeat ${f.label || `${f.kcal} kcal`}`}
        onClick={() => update(s => { addFood(s, { kcal: f.kcal, protein: f.protein, label: f.label }) })}>
        {f.label || `${f.kcal} kcal`}
      </button>)}
      <button className="chip" onClick={then(foodAddSheet)}>{t('Log food…')}</button>
      <button className="chip" onClick={then(savedPickerSheet)}>{t('From saved…')}</button>
    </div>
  </>
}

function QuickSheet({ onStart, close }) {
  const S = useStore(s => s.S)
  const routines = effectiveRoutines(S, todayISO())
  const name = routines.map(r => r.name).join(' + ')
  const note = dayNoteOf(S, todayISO())
  const bw = lastBW(S)
  const deep = fn => () => { close(); fn() }
  const openSub = render => useUI.getState().openSheet(render)

  const cards = [
    <Card key="start" tour="quick-start" icon="play" title={t('Start workout')} sub={name || 'Freestyle'}
      onClick={() => { close(); onStart() }} />,
  ]
  if (isOn(S, 'habits')) {
    const list = todayList(S)
    const due = list.filter(r => r.due)
    const met = due.filter(r => r.done || r.skipped).length
    cards.push(<Card key="habits" icon="checkCircle" title={t('Habits')}
      sub={list.length ? `${met} of ${due.length} done today` : 'No habits yet'}
      onClick={() => openSub(() => <HabitsQuick />)} />)
  }
  if (isOn(S, 'water')) {
    const p = goalProgress(S)
    cards.push(<Card key="water" icon="drop" title={t('Water')} sub={`${p.ml} of ${p.goal} ml today`}
      onClick={() => openSub(() => <>
        <h3>{t('Water')}</h3>
        <WaterQuickAdds mode="sheet" style={{ marginTop: 6 }} />
      </>)} />)
  }
  if (isOn(S, 'food')) {
    const d = dayFood(S), g = foodGoals(S)
    cards.push(<Card key="food" icon="target" title={t('Food')}
      sub={`${d.kcal.toLocaleString()} of ${g.kcal.toLocaleString()} kcal`}
      onClick={() => openSub(close2 => <FoodQuick close={close2} />)} />)
  }
  if (isOn(S, 'body')) {
    cards.push(<Card key="body" icon="scale" title={t('Weigh in')}
      sub={bw ? `${t('last')} ${fmtNum(bw.w)} ${S.unit}` : ''} onClick={deep(bwSheet)} />)
  }

  return <>
    <h3>{t('Actions')}</h3>
    <div className="quick-grid">{cards}</div>
    <div className="lbl2 quick-note-lbl">{t('Note')}</div>
    <button className="quick-pill" onClick={deep(() => dayNoteSheet(todayISO()))}>
      <Icon name="note" />
      <span className="qp-txt">{note ? `${t('Today')}: ${dayNoteLine(note, t)}` : t('Add a note')}</span>
      <span className="qp-chev"><Icon name="chevronRight" /></span>
    </button>
    <div style={{ height: 10 }} />
  </>
}

export const openQuickSheet = onStart => useUI.getState().openSheet(close => <QuickSheet onStart={onStart} close={close} />)
