import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { isOn } from '../lib/modules.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import { useConnectionTrouble } from './SyncBanner.jsx'
import { retapTab } from '../lib/scroll-top.js'
import { openQuickSheet } from './QuickSheet.jsx'

// Module scope, not TabBar's render body. Declared inside it, `Tab` was a new function on every
// render, so React saw a different component type each time and threw the button away and built a
// fresh one — on a bar that is fixed on screen, and once a second for the whole of a rest. The
// state it took with it is the DOM node itself: focus, the :active tint, any in-flight transition.
function Tab({ active, icon, label, onClick, dot, tour }) {
  return (
    <button className={active ? 'on' : ''} onClick={onClick} data-tour={tour} aria-label={dot ? label + ', ' + t('Connection problem') : undefined}>
      <span className="tab-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}</span><span>{label}</span>
    </button>
  )
}

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  // With the connection banner switched off, a sync problem shows as a dot on Home, the tab
  // Settings lives under (#369, #330).
  const trouble = useConnectionTrouble()
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  // The Life tab exists while any life module is on; with none, the bar is four peers + the disc.
  const lifeOn = ['water', 'habits', 'steps', 'sleep', 'food', 'levels'].some(id => isOn(S, id))
  // A screen without a tab of its own lights the tab it is opened from (Muscles from both).
  // The Exercises library is a Plan segment now; the life pages all live under Life.
  const PARENT = { history: 'stats', 'structural-balance': 'stats', 'progress-photos': 'stats', measurements: 'stats', settings: 'home', checkin: 'home', muscles: 'plan', library: 'plan', water: 'life', habits: 'life', steps: 'life', sleep: 'life', food: 'life', level: 'life', recap: 'life' }
  const parent = cur === 'muscles' && loc.state?.from === '/stats' ? 'stats' : PARENT[cur]
  const on = k => cur === k || parent === k

  // Root tabs are peers, not another level to unwind with Android Back. The tab you are already
  // on takes you to the top of its page instead (lib/scroll-top.js).
  const switchTab = path => {
    if (loc.pathname !== path || loc.search) nav(path, { replace: true })
    else retapTab(path)
  }

  const running = !!S.active && cur !== 'workout' && !S.active.editingWorkoutId && !S.active.backfill && S.active.start > 0
  const startWorkout = () => {
    if (!S.active) {
      // A weekday can hold several routines; start the combined session if any of them has
      // exercises, otherwise fall through to the picker.
      if (effectiveRoutines(S, todayISO()).some(r => r.ex.length)) { onStart(effectiveRoutineIds(S, todayISO())); return }
    }
    nav('/workout')
  }
  // The disc, tapped while idle, opens the day's quick-add hub for every profile: Start leads
  // it, then the sections each profile has (habits, water, food, weigh-in, a note).
  // Resuming a live session stays the one tap it always was. (docs/LIFE_MODULES.md, nav rework;
  // lean profiles got the hub too since it became the one entry point.)
  const quickable = !S.active
  const tapDisc = () => {
    if (!quickable) { startWorkout(); return }
    openQuickSheet(startWorkout)
  }

  return (
    <nav id="tabbar">
      <Tab active={on('home')} icon="house" label={t('Home')} dot={trouble} onClick={() => switchTab('/home')} tour="tab-home" />
      <Tab active={on('plan')} icon="dumbbell" label={t('Workout')} onClick={() => switchTab('/plan')} tour="tab-plan" />
      {/* On the workout screen itself there is nothing to resume, so the button reads as the
          tab it is and stays lit (#29); anywhere else it brings you back to the exercise you
          were on — the marker is kept in S.active.cur and never moves on its own (#21). The
          glyph says what the tap does: plus while idle, where the disc opens the Actions hub,
          and play once a session runs, where it resumes it. A live session you stepped away
          from shows its running time instead of a word, the button still named Resume; a past
          workout being edited or logged after the fact has no clock to run. */}
      <button data-tour="start" className={'start' + (S.active ? ' rec' : '') + (S.active && cur === 'workout' ? ' on' : '')} onClick={tapDisc}
        aria-label={running ? t('Resume') : undefined} aria-haspopup={quickable ? 'dialog' : undefined}>
        <span className="cir"><Icon name={S.active ? 'play' : 'plus'} /></span>
        {running ? <span className="tab-time"><Elapsed start={S.active.start} /></span>
          : <span>{S.active ? (cur === 'workout' ? t('Workout') : S.active.editingWorkoutId ? t('Edit workout') : t('Resume')) : t('Actions')}</span>}
      </button>
      {lifeOn && <Tab active={on('life')} icon="life" label={t('Life')} onClick={() => switchTab('/life')} tour="tab-life" />}
      <Tab active={on('stats')} icon="chart" label={t('Stats')} onClick={() => switchTab('/stats')} tour="tab-stats" />
    </nav>
  )
}
