// The Level card on Home (Levels 5b): it takes the streak card's seat right after the hero when
// the module is on — consistency, one number: the ring beside the head is the way to the next
// level, and today's goals live on /level, not here. Red is the level-up colour and nothing else
// (decision).
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { xpTotals } from '../lib/xp.js'
import { newUnlocks, markUnlocksSeen } from '../lib/levels.js'
import { openLevelPopup } from './LevelPopup.jsx'
import ProgressRing from './ProgressRing.jsx'
import CardHead from './CardHead.jsx'

export default function LevelCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const x = xpTotals(S)

  // Show a new level or badge once per account: the marker lands before the sheet opens, so a
  // second device never re-shows it and a closed sheet does not nag again (StreakParty's rule).
  const items = newUnlocks(S)
  const seenKey = JSON.stringify(items.map(i => i.kind === 'level' ? `L${i.level}` : i.key))
  const popped = useRef('')
  useEffect(() => {
    if (!items.length || popped.current === seenKey) return
    popped.current = seenKey
    update(st => { markUnlocksSeen(st, items) })
    openLevelPopup(items)
  }, [seenKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Level 0 has no level beneath it yet, so its first hundred points are the whole step; every
  // level after that reads from the same pair the /level page shows, so the ring's number and its
  // sweep always mean the same thing.
  const into = x.level === 0 ? x.xp : x.into
  const forNext = x.level === 0 ? 100 : x.forNext
  const nextLabel = x.level === 0 ? 'First level at 100 xp' : `${x.forNext - x.into} xp to level ${x.level + 1}`
  return <div className="card tap-host" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') nav('/level') }} onClick={() => nav('/level')}>
    <div className="row" style={{ gap: 14, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CardHead icon="trophy" tint="var(--red)" title={`Level ${x.level}`} sub={nextLabel} />
      </div>
      <ProgressRing pct={into / forNext} size={72} tint="var(--red)" caption={`${into}`} />
    </div>
  </div>
}
