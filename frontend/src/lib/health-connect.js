// What the Android app writes to Health Connect (#200), worked out from the state alone. Health
// Connect is the phone's own store for health data: other apps read the workouts and weigh-ins from
// there. Nothing here talks to it — lib/health-sync.js hands these records to the native plugin.
//
// Write-only, and only on request: the user turns it on in Settings, on each phone. Every record
// carries a client id of its own (a workout's id, a weigh-in's day), so writing it again replaces
// it instead of adding a second one, and anything JelloGym wrote can be found and removed again.
import { workoutText } from './workout-text.js'
import { modeForEntry, hasCompletedWork } from './workout-model.js'
import { isoOf } from './format.js'
import { readingsOf, readingAt, cleanTime } from './weigh-ins.js'
import { EXIDX } from './exercises.js'
import { isOn } from './modules.js'
import { LB_PER_KG } from './units.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/* The client ids this app gives its records, and the one the build before the rename to JelloGym
   gave them. Both spellings are ours: a record already in the hub under the old name is not
   written twice, and a removal names both so whichever one went in comes out (health-read.js
   recognises both too, so the old writes are never read back as another app's data). */
export const ID_PREFIXES = ['jellogym-', 'opengym-']

/** One record's id under every prefix this app has written with: ['jellogym-w-1', 'opengym-w-1']. */
export function ownIds(id) {
  const s = String(id)
  const hit = ID_PREFIXES.find(p => s.startsWith(p))
  if (!hit) return [s]
  const rest = s.slice(hit.length)
  return ID_PREFIXES.map(p => p + rest)
}

// Health Connect refuses a title or notes over 1000 characters (ExerciseSessionRecord).
export const TEXT_MAX = 1000

// The session type Health Connect (and Apple Health) files a workout under. A workout with any
// strength work in it is strength training: ten minutes on the treadmill before the squats do not
// make it a walk. One that is all cardio takes the type of what was done when the catalogue says
// (the machine, else the move's name: a run, a row, burpees and jacks as HIIT), stretching at the
// end of a run leaves it a run, and cardio of two kinds is mixed cardio (#799).
// The native side maps each name to its ExerciseSessionRecord.EXERCISE_TYPE_* constant, and to an
// HKWorkoutActivityType on the iPhone and the watch (AppleHealthPlugin, WorkoutManager).
const CARDIO_TYPES = {
  '3666': 'walking',                // walking on incline treadmill
  '0685': 'running', '0684': 'running', '3656': 'running',
  '2138': 'biking_stationary', '0798': 'biking_stationary',
  '2141': 'elliptical', '2331': 'elliptical',
  '2311': 'stair_climbing_machine',
}
export const SESSION_TYPES = ['strength_training', 'walking', 'running', 'biking_stationary', 'biking', 'elliptical', 'stair_climbing_machine',
  'rowing', 'jump_rope', 'hiit', 'mixed_cardio', 'yoga', 'flexibility', 'other_workout']

// Catalogue cardio by its name, first match wins: the treadmill before the bike ("run on treadmill"
// is filed with the stationary bike), the bike before the run ("assault bike run").
const BY_NAME = [
  [/treadmill/, n => (/walk/.test(n) ? 'walking' : 'running')],
  [/\b(bike|bicycle|cycl\w*|aquabike)\b/, (n, ex) => (ex.eq === 'stationary bike' ? 'biking_stationary' : 'biking')],
  [/jump rope|skip rope|\bskipping\b/, () => 'jump_rope'],
  [/\brow(ing)?\b/, () => 'rowing'],
  [/\b(walk\w*|marching)\b/, () => 'walking'],
  [/\b(run|running|jog|sprints?|trot)\b/, () => 'running'],
  [/burpee|jacks?\b|mountain climber|squat thrust|battling rope|tuck jump|star jump|hiit|circuit|tabata/, () => 'hiit'],
]
const CARDIO_EQ = { 'elliptical machine': 'elliptical', 'stepmill machine': 'stair_climbing_machine' }

/** What one exercise counts as for the session type: one of SESSION_TYPES. */
export function exerciseType(entry) {
  const id = String(entry?.id ?? '')
  if (CARDIO_TYPES[id]) return CARDIO_TYPES[id]
  const ex = EXIDX[id]
  if (ex?.cat === 'yoga') return 'yoga'
  if (ex?.cat === 'stretching' || ex?.cat === 'mobility') return 'flexibility'
  // Cardio by the catalogue, whether it is logged as minutes or as reps (burpees count reps, #717).
  if (ex && (ex.cat === 'cardio' || ex.cat === 'plyometrics' || ex.bp === 'cardio')) {
    if (CARDIO_EQ[ex.eq]) return CARDIO_EQ[ex.eq]
    const n = String(ex.n || '').toLowerCase()
    const hit = BY_NAME.find(([re]) => re.test(n))
    return hit ? hit[1](n, ex) : 'mixed_cardio'
  }
  // A custom exercise logged as cardio: nothing says which.
  return modeForEntry(entry) === 'cardio' ? 'other_workout' : 'strength_training'
}

const CALM = new Set(['yoga', 'flexibility'])

function typeOf(entries) {
  if (!entries.length) return 'other_workout'
  const types = new Set(entries.map(exerciseType))
  if (types.has('strength_training')) return 'strength_training'
  // The stretches after a run or a row: still that run. Only stretching: yoga if any yoga.
  const moving = [...types].filter(x => !CALM.has(x))
  if (!moving.length) return types.has('yoga') ? 'yoga' : 'flexibility'
  if (moving.length === 1) return moving[0]
  // Two kinds of cardio, or cardio the catalogue does not place next to one it does.
  return moving.includes('other_workout') ? 'other_workout' : 'mixed_cardio'
}

/** The type of a finished workout, from the exercises with something done in them. */
export function sessionType(w) {
  return typeOf((w?.entries || []).filter(e => (e.sets || []).some(hasCompletedWork)))
}

/**
 * The type a workout is set to be, before anything is done (the watch's workout session, #799).
 * Null for one with nothing in it yet: the watch keeps its strength training then.
 */
export function plannedType(entries) {
  const planned = (entries || []).filter(e => e && e.id != null)
  return planned.length ? typeOf(planned) : null
}

const clip = s => (s.length > TEXT_MAX ? s.slice(0, TEXT_MAX - 1) + '…' : s)

// The exercises and sets as "Copy as text" writes them, without its heading: the title already
// carries the name, and Health Connect shows the date and the duration itself.
function sessionNotes(w, opts) {
  const blocks = workoutText(w, opts).split('\n\n').slice(1)
  return clip(blocks.join('\n\n'))
}

/**
 * One exercise session per finished workout. A workout with no start or end (or an end not after
 * its start) is left out rather than given made-up times: Health Connect needs both.
 */
export function sessionRecord(w, { unit, nameOf, speedUnit }) {
  const start = Number(w?.start), end = Number(w?.end)
  if (!w?.id || !(start > 0) || !(end > start)) return null
  return {
    id: 'jellogym-w-' + w.id,
    start, end,
    type: sessionType(w),
    title: clip(String(w.name || '').trim()),
    notes: sessionNotes(w, { unit, nameOf, speedUnit }),
  }
}

/**
 * One weight record per weigh-in. A day from before has one, without a time: `t` is when it was
 * typed, which for a weigh-in added to an earlier day is not on that day; then it is put at 08:00
 * local time on the day it belongs to. A weigh-in with a time (#859, lib/weigh-ins.js) goes in at
 * that time. The record of a day's reading '0' (every day from before) keeps the day's old id, so
 * nothing written earlier is written twice; the others are named by day and reading.
 */
export function weightRecord(b, unit, r = null) {
  const w = Number(r ? r.w : b?.w)
  if (!b?.d || !(w > 0)) return null
  const typed = Number(r ? r.t : b.t)
  const at = r && cleanTime(r.at)
  const time = at ? readingAt(b.d, at) : typed > 0 && isoOf(new Date(typed)) === b.d ? typed : localMorning(b.d)
  if (!(time > 0)) return null
  const kg = unit === 'lb' ? w / LB_PER_KG : w
  return { id: weightRecordId(b.d, r?.id), time, kg: Math.round(kg * 1000) / 1000 }
}

/**
 * The hub's id of one weigh-in JelloGym wrote: its day, and its reading unless that is '0'.
 */
export const weightRecordId = (d, rid) => 'jellogym-bw-' + d + (rid != null && String(rid) !== '0' ? '-' + rid : '')

/**
 * One hydration record per logged drink (Water, docs/LIFE_MODULES.md): write-only, never read
 * back. The client id is the entry's own, so an edit rewrites it in place and a removal finds it
 * again; the time is the entry's stamp, the only time a drink carries. `S` without a live entry —
 * removed or junk — gives nothing, and goneIds takes the written record out with it.
 */
export const hydrationRecordId = id => 'jellogym-hy-' + id

export function hydrationRecord(id, e) {
  const ml = Math.round(Number(e?.ml))
  const time = Number(e?._ts)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(String(e?.d || '')) || !(ml > 0) || !(time > 0)) return null
  return { id: hydrationRecordId(String(id)), time, ml }
}

function localMorning(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d, 8, 0, 0, 0).getTime()
}

/** Everything the state has to give Health Connect: { sessions, weights, hydration }. */
export function healthRecords(S, { nameOf, speedUnit }) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  return {
    sessions: (S?.workouts || []).map(w => sessionRecord(w, { unit, nameOf, speedUnit })).filter(Boolean),
    // A weigh-in read from the hub (`src`, lib/health-read.js) is already there: never written back.
    // Every weigh-in of a day with several (lib/weigh-ins.js), each at its own time.
    weights: (S?.bodyweight || []).flatMap(b => (Array.isArray(b?.ins)
      ? readingsOf(b).filter(r => !r.src).map(r => weightRecord(b, unit, r))
      : b?.src ? [] : [weightRecord(b, unit)])).filter(Boolean),
    // Water off on this profile (Settings → Modules) pauses its writes: nothing is removed, the
    // records already written stay the user's, and switching back on catches up (same rule as Health off).
    hydration: isOn(S, 'water')
      ? Object.entries(isMap(S?.water) ? S.water : {}).map(([id, e]) => hydrationRecord(id, e)).filter(Boolean)
      : [],
  }
}

// A record's content as a short fingerprint, to tell a changed record from one already written as
// it is. Key order is fixed by the builders above, so the same record always gives the same one.
// cyrb53: 53 bits are plenty to tell two versions of one record apart, and the file that keeps a
// fingerprint per record stays small next to a history of hundreds of workouts with their notes.
export function recordKey(rec) {
  const str = JSON.stringify(rec)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * The record ids JelloGym has on record as deleted: a workout or a weigh-in day removed on this
 * device or on another one whose removal synced in (S.deleted, lib/sync-merge.js stampDeletions;
 * a negative stamp is an add-back), and everything a "Reset everything" wiped (S.resetIds).
 * Only these are taken out of Health: a copy that merely lacks a workout (signed out, a guest
 * copy, a state not loaded yet) never empties Apple Health or Health Connect.
 *
 * Every id goes in under both of its spellings (ownIds): the record in the hub carries whichever
 * prefix the build that wrote it used, and a removal that only named the new one would leave the
 * old copy sitting there with no way back.
 */
export function goneIds(S) {
  const out = new Set()
  const add = id => { for (const t of ownIds(id)) out.add(t) }
  const del = S?.deleted && typeof S.deleted === 'object' ? S.deleted : {}
  for (const [k, at] of Object.entries(del.workouts || {})) if (Number(at) > 0) add('jellogym-w-' + k)
  // A removed day takes all its weigh-ins with it (planSync matches the `*`); one weigh-in
  // removed from a day that keeps others is on record in that day's `gone`.
  for (const [k, at] of Object.entries(del.bodyweight || {})) if (Number(at) > 0) { add('jellogym-bw-' + k); add('jellogym-bw-' + k + '-*') }
  for (const b of S?.bodyweight || []) {
    if (!b?.d || !b.gone || typeof b.gone !== 'object') continue
    for (const [rid, at] of Object.entries(b.gone)) if (Number(at) > 0) add(weightRecordId(b.d, rid))
  }
  // A removed drink is the tombstone it left in the water map: an entry with no amount.
  const waters = isMap(S?.water) ? S.water : {}
  for (const [id, e] of Object.entries(waters)) if (isMap(e) && !(Number(e?.ml) > 0) && Number(e?._ts) > 0) add(hydrationRecordId(id))
  const reset = S?.resetIds && typeof S.resetIds === 'object' ? S.resetIds : {}
  for (const k of Array.isArray(reset.workouts) ? reset.workouts : []) add('jellogym-w-' + k)
  // A weigh-in is named by its day and time there ("2026-09-17|1758…"); Health knows it by day.
  for (const k of Array.isArray(reset.bodyweight) ? reset.bodyweight : []) { const d = String(k).split('|')[0]; add('jellogym-bw-' + d); add('jellogym-bw-' + d + '-*') }
  for (const k of Array.isArray(reset.water) ? reset.water : []) add(hydrationRecordId(String(k)))
  return out
}

/**
 * What a sync has to do, given the records now and `written`, what this phone wrote before
 * ({ [id]: { k: 'session' | 'weight', h: recordKey } }). New and changed records are written,
 * records that are gone from JelloGym (a deleted workout, a removed weigh-in) are removed.
 * With `gone` (goneIds), only a record on record as deleted is removed; one that is merely
 * missing stays written, and goes once its deletion arrives. Returns { sessions, weights,
 * remove: { sessions: [id], weights: [id] }, written } — `written` being what the phone has
 * written once the sync went through.
 */
export function planSync({ sessions, weights, hydration = [] }, written = {}, gone = null) {
  const next = {}
  const out = { sessions: [], weights: [], hydration: [], remove: { sessions: [], weights: [], hydration: [] } }
  const moved = new Set()      // old-prefix ids this pass takes out, because their new twin goes in
  const into = (k, rec) => k === 'session' ? out.sessions : k === 'weight' ? out.weights : out.hydration
  const remove = (k, id) => {
    if (k === 'session') out.remove.sessions.push(id)
    else if (k === 'weight') out.remove.weights.push(id)
    else if (k === 'hydration') out.remove.hydration.push(id)
    moved.add(id)
  }
  const take = (list, k) => {
    for (const rec of list) {
      if (next[rec.id]) continue   // two workouts with one id: the first is the one written
      const h = recordKey(rec)
      if (written[rec.id]?.h === h) { next[rec.id] = { k, h }; continue }
      // The same content may already be in the hub under the prefix the previous build wrote
      // with. Then it is not written twice: the phone keeps that id as the one it wrote, and a
      // later removal names both spellings so the record is found wherever it went in.
      const twin = ownIds(rec.id).find(id => id !== rec.id && written[id])
      if (twin) {
        if (written[twin].h === recordKey({ ...rec, id: twin })) { next[twin] = written[twin]; continue }
        remove(written[twin].k || k, twin)   // its content is on its way under the new id: take the old one out
      }
      next[rec.id] = { k, h }
      into(k).push(rec)
    }
  }
  take(sessions, 'session')
  take(weights, 'weight')
  take(hydration, 'hydration')
  for (const [id, was] of Object.entries(written || {})) {
    if (next[id] || moved.has(id)) continue
    if (gone && !isGone(gone, id)) { next[id] = was; continue }
    remove(was?.k, id)
  }
  out.written = next
  return out
}

// Whether a written record is on record as deleted: by its own id (goneIds names both prefixes),
// or as a weigh-in of a removed day ('<prefix>-bw-<day>-<reading>' under that day's
// '<prefix>-bw-<day>-*'). The day is taken from the match, not a fixed slice: renaming the id
// prefix must never shift it.
const isGone = (gone, id) => {
  if (gone.has(id)) return true
  const m = /^(?:jellogym|opengym)-bw-(\d{4}-\d{2}-\d{2})-/.exec(id)
  return !!m && ownIds('jellogym-bw-' + m[1] + '-*').some(t => gone.has(t))
}

/** Every record this phone wrote, by type — what "remove what JelloGym wrote" takes away. */
export function writtenIds(written = {}) {
  const out = { sessions: [], weights: [], hydration: [] }
  for (const [id, was] of Object.entries(written || {})) {
    if (was?.k === 'session') out.sessions.push(id)
    else if (was?.k === 'weight') out.weights.push(id)
    else if (was?.k === 'hydration') out.hydration.push(id)
  }
  return out
}
