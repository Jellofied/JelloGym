// The order of Home's cards below the hero (Settings → Modules → Card order).
//
// Every card has a fixed id; the default order is the one Home shipped with before the
// reorder feature (docs/LIFE_MODULES.md). `S.homeOrder` is the ids in the order the user set,
// written whole when a move happens; a plain settings field, so the sync merge takes it from
// the copy that changed it last (like scheduleMode) and no sync-stamps registration is needed.
//
// The hero (today's session) and the Welcome card are not cards you can order: the hero is
// what to do now, and Welcome is an empty state, not a module's surface.
// Pure: only modules.js, no imports of its own beyond it.
import { isOn } from './modules.js'

/* Default order, top of Home first. */
export const HOME_CARD_IDS = ['level', 'recap', 'seasonal', 'wrapped', 'recovery', 'challenges', 'checkin',
  'water', 'habits', 'steps', 'sleep', 'food', 'body', 'streak']

/**
 * Whether this profile has the card on at the Home level: the same gate Home's JSX applied
 * before ordering existed. The date-gated ones (recap banners, the advent card, the year card,
 * the monthly challenges) answer on their module alone — whether they draw anything today is
 * their own, unchanged, and the order still says where they sit when they do.
 */
export function homeCardVisible(S, id) {
  const on = m => isOn(S, m)
  switch (id) {
    case 'level': return on('levels')
    case 'recap': return true
    case 'seasonal': return on('seasonal')
    case 'wrapped': return on('motivation')
    case 'recovery': return on('health')
    case 'challenges': return true
    case 'checkin': return on('checkin')
    case 'water': return on('water')
    case 'habits': return on('habits')
    case 'steps': return on('steps')
    case 'sleep': return on('sleep')
    case 'food': return on('food')
    case 'body': return on('body') && S?.showWeightCard !== false
    // The streak card's seat is Levels' while both are on; with Motivation off the weekly-sets
    // line it carried keeps a card of its own, so the seat (and its row in the order editor)
    // stays for whoever fills it.
    case 'streak': return (on('motivation') && !on('levels')) || S?.homeMuscleSets === true
    default: return true
  }
}

/** The ids Home shows for this profile, in the default order. */
export const homeCardsVisible = S => HOME_CARD_IDS.filter(id => homeCardVisible(S, id))

/**
 * `visible` (any order, usually the default one) put in the order the user set. No saved order
 * (or a malformed one) leaves it untouched. An id saved does not list sorts after the ones it
 * does, in default order between them — so a module switched back on, or a card from a newer
 * app, arrives at the bottom and the user places it.
 */
export function orderHomeCards(visible, saved) {
  const arr = Array.isArray(visible) ? [...visible] : []
  if (!Array.isArray(saved) || !saved.length) return arr
  const pos = id => {
    const i = saved.indexOf(id)
    if (i >= 0) return i
    const d = HOME_CARD_IDS.indexOf(id)
    return saved.length + (d < 0 ? HOME_CARD_IDS.length : d)
  }
  return arr.sort((a, b) => pos(a) - pos(b))
}
