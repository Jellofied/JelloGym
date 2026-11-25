// Typing a night by hand (docs/LIFE_MODULES.md): the fallback for a watch that did not write one.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { isoOf, todayISO } from '../lib/format.js'
import { addSleep, readSleepEntry, removeSleep, restoreSleep } from '../lib/sleep.js'
import { Button } from './ui.jsx'
import DateField from './DateField.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()

const hhmm = ms => new Date(ms).toTimeString().slice(0, 5)
const at = (iso, t) => { const [h, m] = String(t || '00:00').split(':').map(Number); return new Date(iso + 'T12:00:00').setHours(h, m, 0, 0) }

function SleepForm({ existing, close }) {
  const e = existing ? readSleepEntry((S().sleep || {})[existing.id]) : null
  const [date, setDate] = useState(e ? isoOf(new Date(e.e)) : todayISO())
  const [bed, setBed] = useState(e ? hhmm(e.s) : '23:00')
  const [wake, setWake] = useState(e ? hhmm(e.e) : '07:00')
  const s = bed >= wake ? at(date, bed) - 86400000 : at(date, bed)
  const en = bed >= wake ? at(date, wake) : at(date, wake) + 86400000
  const min = Math.round((en - s) / 60000)
  const ok = min >= 5 && min <= 900
  return <>
    <h3>{existing ? 'Edit night' : 'Log a night'}</h3>
    <div className="muted small">Filed under the day you woke up, so a night past midnight lands where the morning counts it.</div>
    <div style={{ height: 12 }} />
    <DateField value={date} onChange={setDate} max={todayISO()} label="Wake-up day" />
    <div style={{ height: 8 }} />
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <span className="muted small">Bed</span>
      <input type="time" className="timef" value={bed} onChange={ev => setBed(ev.target.value)} aria-label="Bed time" />
      <span className="muted small">Wake</span>
      <input type="time" className="timef" value={wake} onChange={ev => setWake(ev.target.value)} aria-label="Wake time" />
    </div>
    {date && !/^\d{4}-\d{2}-\d{2}$/.test(date) && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Use the day's date, like 2026-11-14.</div>}
    {/^\d{4}-\d{2}-\d{2}$/.test(date) && !ok && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Between 5 minutes and 15 hours, please.</div>}
    <div className="muted small" style={{ marginTop: 6 }}>{ok ? `${Math.floor(min / 60)}h ${min % 60}m` : ''}</div>
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!ok || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => {
      let res = null
      update(st => { res = addSleep(st, { s, e: en, id: existing ? existing.id : undefined, now: Date.now() }) })
      close()
      ui().toast(existing ? 'Night saved' : res === 'dup' ? 'That night was newer here, so it stayed' : 'Night logged')
    }}>Save</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => {
      const undo = { ...S().sleep[existing.id] }
      update(st => { removeSleep(st, existing.id) })
      close()
      ui().toast('Night removed', { action: 'Undo', onAction: () => update(st => { restoreSleep(st, existing.id, undo) }) })
    }}>Remove</Button></>}
  </>
}

export const sleepManualSheet = (existing = null) => ui().openSheet(close => <SleepForm existing={existing} close={close} />)
