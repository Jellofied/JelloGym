// The one-time celebration sheet (Levels 5c): a new level, a first badge, or both together.
// Red is reserved for this moment — the level's colour everywhere it actually happens.
import { useUI } from '../store/useUI.js'
import ProgressRing from './ProgressRing.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

function LevelPopup({ items, close }) {
  const level = items.find(i => i.kind === 'level')
  const badges = items.filter(i => i.kind === 'badge')
  return <>
    <h3 style={{ color: 'var(--red)' }}>{level ? `Level ${level.level}!` : 'Milestone!'}</h3>
    <div className="row" style={{ gap: 12, alignItems: 'center', margin: '10px 0' }}>
      <ProgressRing pct={1} size={64} tint="var(--red)" caption={level ? `${level.level}` : '★'} />
      <div className="muted small">
        {level ? 'Earned by consistency: the weeks kept, not one big day.' : 'A badge unlocked from your history.'}
      </div>
    </div>
    {badges.length > 0 && <div className="sect-b">
      {badges.map(b => <div className="row" key={b.key} style={{ gap: 8, padding: '8px 2px' }}>
        <Icon name="trophy" style={{ color: 'var(--red)' }} />
        <span style={{ fontWeight: 500 }}>{b.title}</span>
      </div>)}
    </div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={close}>Nice</Button>
  </>
}

export function openLevelPopup(items) {
  if (!items.length) return
  useUI.getState().openSheet(close => <LevelPopup items={items} close={close} />, { kind: 'center', locked: true })
}
