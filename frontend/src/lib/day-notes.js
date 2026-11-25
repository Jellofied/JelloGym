// A note on a day (the old "why I missed today" feature, now a plain note): "Note", "Idea", a
// line of your own. It is kept in the calendar, the heatmap and the week strip as a mark on the
// day; it no longer changes the missed-day nudge or the workout-day reminder.
//
// Stored per day, the way a plate-loading choice is (lib/plates.js):
//
//   S.dayNotes = { '2026-10-08': { tag: 'note', text: 'Pick up milk', _ts }, … }
//
// Each day is one entry with the time it was last written, so two devices that each noted a
// different day keep both, and the same day keeps the later note (lib/sync-merge.js
// mergeStampedMap). Taking a note away is a stamped empty entry (`{ _ts }`), not a deleted key:
// a delete would come straight back from the other device's copy on the next sync.
//
// Only today and the days before can take a note in the day sheet.
import { NOTE_MAX } from './history.js'
import { todayISO } from './format.js'

/** The quick picks, in the order the sheet shows them. Labels are English source strings. */
export const DAY_NOTE_TAGS = ['note', 'idea', 'todo', 'reminder']
export const DAY_NOTE_LABEL = { note: 'Note', idea: 'Idea', todo: 'To do', reminder: 'Reminder' }
// Icons the set already has (components/Icon.jsx): a page, a bulb, a list, a bell.
export const DAY_NOTE_ICON = { note: 'note', idea: 'lightbulb', todo: 'list', reminder: 'bell' }
// Notes written before the rename still read as a plain note instead of losing their quick pick.
const LEGACY_TAG = { sick: 'note', travel: 'note', rest: 'note', injured: 'note' }

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const tagOf = tag => DAY_NOTE_TAGS.includes(tag) ? tag : LEGACY_TAG[tag] || null

/** A stored entry read back: { tag, text } with the junk left out, or null for none or a cleared one. */
export function readDayNote(entry) {
  if (!isMap(entry)) return null
  const tag = tagOf(entry.tag)
  const text = typeof entry.text === 'string' ? entry.text.trim().slice(0, NOTE_MAX) : ''
  return tag || text ? { tag, text } : null
}

/** The note on `iso`, or null. */
export const dayNoteOf = (S, iso) => readDayNote(isMap(S?.dayNotes) ? S.dayNotes[iso] : null)

/** Whether `iso` can take a note at all: a real date, today or earlier. */
export const canNoteDay = (iso, today = todayISO()) => ISO.test(String(iso || '')) && iso <= today

/**
 * S.dayNotes with `iso` set to `note` ({ tag, text }), stamped `now`. An empty note (no tag, no
 * text) is written as a cleared entry, so the removal syncs (see the top of this file).
 */
export function withDayNote(map, iso, note, now = Date.now()) {
  const clean = readDayNote(note)
  const entry = clean ? { ...(clean.tag ? { tag: clean.tag } : {}), ...(clean.text ? { text: clean.text } : {}), _ts: now } : { _ts: now }
  return { ...(isMap(map) ? map : {}), [iso]: entry }
}

/** The label a note reads as in a list or a tooltip: its quick pick, its text, or both. */
export function dayNoteLine(note, tr = s => s) {
  if (!note) return ''
  const label = note.tag ? tr(DAY_NOTE_LABEL[note.tag]) : ''
  return label && note.text ? `${label} · ${note.text}` : label || note.text
}
