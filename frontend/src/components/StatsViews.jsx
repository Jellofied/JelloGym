// The top tabs of Stats (docs/LIFE_MODULES.md, Navigation/IA): Training is the page that was
// already there, Life is /stats/life. Two routes rather than one page with the halves hidden, so
// a Life figure can be linked, shared and come back on reload the way every other Stats part can.
// The control only exists while a life module is on: switching the last one off takes the whole
// half away, tab, control and route with it (App.jsx gates the route the same way).
//
// Not to be confused with StatsIndex (views/Stats.jsx), which is the sticky list of the parts
// *inside* one half. This one picks the half; that one jumps around inside it.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { anyLifeOn } from '../lib/modules.js'
import { t } from '../lib/i18n.js'
import { Segmented } from './ui.jsx'

/** `view`: 'train' on /stats, 'life' on /stats/life. */
export default function StatsViews({ view }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  if (!anyLifeOn(S)) return null
  // `peer` says what the paths cannot: /stats/life is not a level inside /stats, it is the other
  // half of the same screen. Without it the depth rule in lib/page-motion.js slid Life in from the
  // right and faded Training back in, so the two halves arrived differently (their comment).
  return <nav className="stats-views" aria-label={t('Stats')}>
    <Segmented value={view}
      onChange={v => { if (v !== view) nav(v === 'life' ? '/stats/life' : '/stats', { replace: true, state: { peer: true } }) }}
      options={[{ value: 'train', label: t('Training') }, { value: 'life', label: t('Life') }]} />
  </nav>
}
