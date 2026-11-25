// The habit create/edit sheet (slice 2a). New habits start from a template — meditate, read,
// stretch, no sugar, vitamins, and a supplement/medication with its dose and time — or from
// scratch; the form then holds the name, the type, the daily target, the schedule, the rest-day
// choice and the "after finishing a workout" flag (the stack itself lands in 2b). Saving writes
// through useStore, so it stamps and syncs like everything else.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { DAYS } from '../lib/format.js'
import { HABIT_TEMPLATES, addHabit, editHabit, removeHabit, restoreHabit } from '../lib/habits.js'
import { Button, NumberField, Row, Section, Segmented, Switch, TextField } from './ui.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

function HabitForm({ existing, template, close }) {
  const d = existing || template || { name: '', type: 'yesno', target: 0, schedule: { kind: 'daily' }, skipRest: false, stack: false, dose: '', at: '' }
  const [name, setName] = useState(d.name || '')
  const [type, setType] = useState(d.type || 'yesno')
  const [target, setTarget] = useState(d.target || (d.type === 'count' ? 8 : 10))
  const [kind, setKind] = useState((d.schedule || {}).kind || 'daily')
  const [days, setDays] = useState([...((d.schedule || {}).days || [1, 2, 3, 4, 5])])
  const [n, setN] = useState((d.schedule || {}).n || (kind === 'perWeek' ? 3 : 3))
  const [skipRest, setSkipRest] = useState(d.skipRest === true)
  const [stack, setStack] = useState(d.stack === true)
  const [remind, setRemind] = useState(d.remind === true)
  const [dose, setDose] = useState(d.dose || '')
  const [at, setAt] = useState(d.at || '')
  const pickType = v => { setType(v); if (v === 'count') setTarget(x => x || 8); if (v === 'timed') setTarget(x => x || 10) }
  const save = () => {
    const sched = kind === 'weekdays' ? { kind, days } : kind === 'daily' ? { kind } : { kind, n: Math.round(Number(n) || 0) }
    const raw = { name, type, target: type === 'yesno' ? 0 : target, schedule: sched, skipRest, stack, remind, dose, at }
    if (existing) {
      let ok = false
      update(s => { ok = editHabit(s, existing.id, raw) })
      close()
      ui().toast(ok ? 'Saved' : 'Give it a name and a target that fits')
      return
    }
    let id = null
    update(s => { const r = addHabit(s, raw); if (r !== 'invalid') id = r })
    close()
    if (id) ui().toast('Habit made')
    else ui().toast('Give it a name and a target that fits')
  }
  const del = () => {
    const undo = { ...S().habitDefs[existing.id] }
    update(s => { removeHabit(s, existing.id) })
    close()
    ui().toast('Habit deleted', { action: 'Undo', onAction: () => update(s => { restoreHabit(s, existing.id, undo) }) })
  }
  return <>
    <h3>{existing ? 'Edit habit' : 'New habit'}</h3>
    {!existing && <div className="chips" style={{ marginBottom: 12 }}>
      {HABIT_TEMPLATES.map(tpl => <button key={tpl.key} className={'chip' + (template?.key === tpl.key ? ' on' : '')}
        onClick={() => { setName(tpl.name); setType(tpl.type); setTarget(tpl.target || (tpl.type === 'count' ? 8 : 10)); setKind(tpl.schedule.kind); setDays([...(tpl.schedule.days || [1, 2, 3, 4, 5])]); setN(tpl.schedule.n || 3); setDose(tpl.dose || ''); setAt(tpl.at || '') }}>{tpl.name}</button>)}
      <button className="chip" onClick={() => { setName(''); setType('yesno'); setKind('daily'); setDose(''); setAt('') }}>Custom</button>
    </div>}
    <Section>
      <TextField value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Name" aria-label="Habit name" />
    </Section>
    <Section>
      <Row title="Kind">
        <Segmented value={type} onChange={pickType}
          options={[{ value: 'yesno', label: 'Yes / no' }, { value: 'count', label: 'Count' }, { value: 'timed', label: 'Timed' }]} />
      </Row>
      {type !== 'yesno' && <Row title={type === 'count' ? 'Units a day' : 'Minutes a day'}>
        <NumberField value={target} onChange={setTarget} decimal={false} style={{ width: 90 }} aria-label={type === 'count' ? 'Units a day' : 'Minutes a day'} />
      </Row>}
    </Section>
    <Section>
      <Row title="Schedule" subtitle={kind === 'weekdays' && !days.length ? 'Pick at least one day' : undefined}>
        <Segmented value={kind} onChange={setKind} options={[
          { value: 'daily', label: 'Daily' }, { value: 'weekdays', label: 'Days' },
          { value: 'perWeek', label: 'Per week' }, { value: 'everyNDays', label: 'Every N days' }]} />
      </Row>
      {kind === 'weekdays' && <div className="chips" style={{ marginTop: 6 }}>
        {[1, 2, 3, 4, 5, 6, 0].map(wd => <button key={wd} className={'chip' + (days.includes(wd) ? ' on' : '')}
          onClick={() => setDays(x => (x.includes(wd) ? x.filter(v => v !== wd) : [...x, wd].sort((a, b) => (a + 6) % 7 - (b + 6) % 7)))}>{DAYS[wd]}</button>)}
      </div>}
      {(kind === 'perWeek' || kind === 'everyNDays') && <Row title={kind === 'perWeek' ? 'Days a week' : 'Every N days'}>
        <NumberField value={n} onChange={setN} decimal={false} style={{ width: 90 }} aria-label={kind === 'perWeek' ? 'Days a week' : 'Every N days'} />
      </Row>}
    </Section>
    <Section>
      <Row title="Skip on rest days" subtitle={existing || template ? 'Days the plan gives you off do not count against this habit.' : undefined}>
        <Switch checked={skipRest} onChange={setSkipRest} aria-label="Skip on rest days" />
      </Row>
      <Row title="After finishing a workout" subtitle="Checked in the moment you end a session.">
        <Switch checked={stack} onChange={setStack} aria-label="After finishing a workout" />
      </Row>
      <Row title="Remind me" subtitle="Named in the daily digest while it stays open.">
        <Switch checked={remind} onChange={setRemind} aria-label="Remind me" />
      </Row>
    </Section>
    {(template?.key === 'supplement' || template?.key === 'vitamins' || existing && (existing.dose || existing.at)) && <Section>
      <TextField value={dose} onChange={e => setDose(e.target.value)} maxLength={40} placeholder="Dose, e.g. 1 capsule" aria-label="Dose" />
      <div style={{ height: 8 }} />
      <Row title="Time">
        <input type="time" className="timef" value={at} onChange={e => setAt(e.target.value)} aria-label="Habit time" />
      </Row>
    </Section>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>Save</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" onClick={del}>Delete</Button></>}
  </>
}

export function habitSheet(existing, template = null) {
  return ui().openSheet(close => <HabitForm existing={existing} template={template} close={close} />, existing ? {} : { wide: true })
}
