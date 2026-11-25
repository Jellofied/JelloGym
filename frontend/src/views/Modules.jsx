// Settings → Modules (v1.4.4): whole feature areas on and off (lib/modules.js has the rules).
//
// A preset row on top (Just training, Training and body, Everything, or Custom once the switches
// below make a mix of their own), then one row per module in three groups, each with its switch.
// Off hides; it never deletes. A module that is connected to something (the phone's health app,
// a watch, webhooks, scheduled Coach reviews) says what pauses and asks once before it goes off.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { DEMO } from '../lib/demo.js'
import { platformNow } from '../lib/platform-now.js'
import { api } from '../lib/api.js'
import { MODULES, GROUPS, PRESETS, isOn, presetOf, presetModules, applyPreset, setModule, turnedOff, onCount } from '../lib/modules.js'
import { homeCardsVisible, orderHomeCards } from '../lib/home-order.js'
import { readWatchStatus, readGarminLink } from '../lib/watch-settings.js'
import { moduleCopy, groupCopy, presetCopy } from '../lib/modules-copy.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, SelectRow, Switch } from '../components/ui.jsx'

/* What is connected right now, read once when the page opens. Each answer is a promise that never
   rejects: a check that fails counts as nothing connected, and the switch simply goes off. */
function useConnections() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const coachMode = useStore(s => s.coachLocal?.mode)
  const [found, setFound] = useState({})
  useEffect(() => {
    let gone = false
    const put = patch => { if (!gone) setFound(f => ({ ...f, ...patch })) }
    if (MOBILE) {
      import('../lib/health-sync.js').then(m => m.loadHealth()).then(h => {
        if (h && (h.on || h.readHr || h.readWeight)) put({ health: platformNow() === 'android' ? 'Health Connect' : 'Apple Health' })
      }).catch(() => {})
      // An Apple Watch that has reported in, or a Garmin the watch link found (docs/GARMIN.md).
      if (readWatchStatus() || readGarminLink()) put({ watch: true })
    }
    if (user && !DEMO) {
      import('../lib/watch-relay.js').then(m => m.relayLinks()).then(links => { if (links.length) put({ watch: true }) }).catch(() => {})
      if ((config?.integrations?.providers || []).includes('webhook')) {
        api('/api/integrations').then(d => {
          const n = (d?.connections || []).filter(c => c.provider === 'webhook' && !c.paused).length
          if (n) put({ webhooks: n })
        }).catch(() => {})
      }
    }
    return () => { gone = true }
  }, [user, config]) // eslint-disable-line react-hooks/exhaustive-deps
  const cadence = S.coach?.cadence
  return { ...found, coach: !!coachMode || (!!S.coach?.consent?.agreedAt && !!cadence && cadence !== 'off') }
}

/** The sentence per module that is connected, for the modules about to go off. */
export function connectionNotes(ids, conn) {
  const out = []
  for (const id of ids) {
    if (id === 'health' && conn.health) out.push(t('{0} stops syncing while Health is off. Nothing is disconnected, and it catches up once Health is back.', conn.health))
    if (id === 'watch' && conn.watch) out.push(t('Your watch stops getting workouts while Watch is off. It stays paired.'))
    if (id === 'integrations' && conn.webhooks) out.push(t('Your webhooks stop sending while Integrations is off. They stay set up.'))
    if (id === 'coach' && conn.coach) out.push(t('Scheduled Coach reviews take a break while the AI Coach is off. Your setup and chats stay.'))
  }
  return out
}

export default function ModulesPage() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const conn = useConnections()
  const preset = presetOf(S)

  // Applies a change, after one question when it pauses something that is connected.
  const change = (next, title, apply) => {
    const notes = connectionNotes(turnedOff(S, next), conn)
    if (!notes.length) { update(apply); return }
    confirmSheet({
      title,
      message: notes.map((n, i) => <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}>{n}</p>),
      confirmText: t('Switch off'),
      onConfirm: () => update(apply),
    })
  }

  // A life module that lives in the phone's health store asks for its permission the moment the
  // switch goes on (docs/LIFE_MODULES.md): water asks WRITE_HYDRATION, steps and sleep their
  // reads — each on its own, never batched with the old exercise/weight pair.
  const lifeOn = ['water', 'steps', 'sleep'].filter(id => isOn(S, id)).join(',')
  const lifeAsked = useRef({})
  useEffect(() => {
    if (!MOBILE || platformNow() !== 'android') return
    const st = () => useStore.getState().S
    if (isOn(st(), 'water') && !lifeAsked.current.water) {
      lifeAsked.current.water = true
      import('../lib/health-sync.js').then(m => m.enableWaterWrite()).catch(() => {})
    }
    for (const kind of ['steps', 'sleep']) {
      if (isOn(st(), kind) && !lifeAsked.current[kind]) {
        lifeAsked.current[kind] = true
        import('../lib/health-sync.js').then(m => m.enableRead(kind, st)).catch(() => {})
      }
    }
  }, [lifeOn])
  const mc = moduleCopy(), gc = groupCopy(), pc = presetCopy()
  const pickPreset = id => {
    if (id === 'custom' || id === preset) return
    const next = presetModules(id)
    const off = turnedOff(S, next)
    change(next, off.length === 1 ? t('Switch off {0}?', mc[off[0]][0]) : t('Switch these off?'), s => applyPreset(s, id))
  }
  const flip = (id, on) => {
    if (on) { update(s => setModule(s, id, true)); return }
    change({ [id]: false }, t('Switch off {0}?', mc[id][0]), s => setModule(s, id, false))
  }

  const options = [
    ...PRESETS.map(p => ({ value: p.id, label: pc[p.id][0], subtitle: pc[p.id][1] })),
    { value: 'custom', label: t('Custom'), subtitle: t('Your own mix. Flip the switches below.') },
  ]

  // Card order (lib/home-order.js): the stack under Home's hero, top card first. Only the cards
  // this profile has on are listed; a module switched back on lands at the bottom until placed.
  // The move writes the whole visible order, which is also what the sort rule expects.
  const order = orderHomeCards(homeCardsVisible(S), S.homeOrder)
  const labels = {
    level: [t('Levels'), 'trophy'],
    recap: [t('Recap'), 'chart'],
    seasonal: [t('Seasonal themes'), 'pumpkin'],
    wrapped: [t('Your year in JelloGym'), 'sparkles'],
    recovery: [t('Recovery'), 'heart'],
    challenges: [t('Challenges'), 'medal'],
    checkin: [t('Gym check-in'), 'qr'],
    water: [t('Water'), 'drop'],
    habits: [t('Habits'), 'checkCircle'],
    steps: [t('Steps'), 'steps'],
    sleep: [t('Sleep'), 'moon'],
    food: [t('Food'), 'target'],
    body: [t('Body weight'), 'scale'],
    streak: [t('Week streak'), 'flame'],
  }
  const move = (id, dir) => {
    const i = order.indexOf(id), j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    next[i] = next[j]; next[j] = id
    update(s => { s.homeOrder = next })
  }

  return <div className="modules">
    <p className="sect-f modules-intro">{t('Switch off what you don’t use. Nothing gets deleted: switch it back on and it’s all still there.')}</p>
    <Section footer={preset === 'custom' ? t('{0} of {1} modules on.', onCount(S), MODULES.length) : null}>
      <SelectRow icon="slider" iconTint="var(--blue)" title={t('Start from')} sheetTitle={t('Modules')}
        value={preset} onChange={pickPreset} options={options} />
    </Section>
    {GROUPS.map((g, gi) => <Section key={g.id} title={gc[g.id]}
      footer={gi === GROUPS.length - 1 ? t('Logging, plans, history, the exercise library and the basic stats are always on.') : null}>
      {MODULES.filter(m => m.group === g.id).map(m => (
        <Row key={m.id} icon={m.icon} iconTint={m.tint} title={mc[m.id][0]} subtitle={mc[m.id][1]} className="module-row" tour={'module-' + m.id}>
          <Switch aria-label={mc[m.id][0]} checked={isOn(S, m.id)} onChange={v => flip(m.id, v)} />
        </Row>
      ))}
    </Section>)}
    {order.length > 1 && <Section title={t('Card order')}>
      {order.map((id, i) => <Row key={id} icon={labels[id][1]} title={labels[id][0]} className="module-row">
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="iconbtn" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(id, -1)}><Icon name="chevronUp" /></button>
          <button type="button" className="iconbtn" aria-label={t('Move down')} disabled={i === order.length - 1} onClick={() => move(id, 1)}><Icon name="chevronDown" /></button>
        </div>
      </Row>)}
    </Section>}
  </div>
}
