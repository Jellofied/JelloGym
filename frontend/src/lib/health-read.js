// What JelloGym takes back from the phone's health hub (#544, #127): Health Connect on Android,
// Apple Health on the iPhone. Two things, each behind its own switch in Settings:
//
//   - the heart rate during a finished workout, per set and for the session (lib/heart-rate.js
//     works out which samples belong to which set), for every watch that saves to the hub;
//   - weigh-ins other apps saved there (a smart scale's, Garmin's, Withings', Samsung's...).
//
// Pure: lib/health-sync.js reads the hub and hands the records over; this decides what goes into
// the log. The rules:
//   - a set that already has a heart rate keeps it (the Apple Watch measured it live);
//   - a weigh-in read in joins the day's others with its own time (lib/weigh-ins.js), never
//     replacing one typed into JelloGym; the daily-value setting picks the day's number;
//   - JelloGym's own records in the hub (what it wrote there itself) are never read back as new;
//   - an imported weigh-in carries `src` and is never written back to the hub (no ping-pong:
//     lib/health-connect.js healthRecords leaves it out).
import { hrFromSamples, sanitizeHr } from './heart-rate.js'
import { stampWorkout } from './sync-merge.js'
import { isoOf } from './format.js'
import { addWeighIn, readingsOf, timeOf, hashId } from './weigh-ins.js'
import { addSleep } from './sleep.js'
import { LB_PER_KG } from './units.js'

// Weigh-ins outside this are a typo or another person's profile in the hub, not a body weight.
const KG_MIN = 20
const KG_MAX = 400
// Packages and bundle ids that are JelloGym: the app, its test build, the Apple Watch app — and
// the `opengym` ones the same app wrote under before the rename. A record from the old build in
// the hub is still ours: taken back as new data it would double the weigh-ins on its days.
const OWN = /^ch\.duartesantos\.(jellogym|opengym)(\.|$)/

/** Whether a record in the hub is one JelloGym wrote itself (by its client id or by its origin). */
export function isOwnRecord(rec) {
  if (!rec || typeof rec !== 'object') return false
  if (/^(jellogym|opengym)-/.test(String(rec.clientId || ''))) return true
  return OWN.test(String(rec.origin || ''))
}

/**
 * The heart rate read for workout `wid` (`samples`: [ms, bpm] from the hub) put into the log `S`
 * (mutated). Only sets without a reading get one; the session's reading is set when the workout
 * has none, or replaced by a fuller one from the same hub (Garmin and Fitbit sync late, so a
 * read right after the workout can hold only part of it). One the watch took is never replaced.
 * The workout is stamped as edited, so a sync keeps the change. Returns whether anything changed.
 */
export function mergeHeartRate(S, wid, samples, src, now = Date.now()) {
  const w = (S?.workouts || []).find(x => x && x.id === wid)
  if (!w) return false
  const res = hrFromSamples(w, samples)
  let changed = false
  for (const [key, got] of res.sets) {
    const [ei, si] = key.split(':').map(Number)
    const set = w.entries?.[ei]?.sets?.[si]
    if (!set) continue
    if (got.hr && !sanitizeHr(set.hr)) { set.hr = got.hr; changed = true }
    if (got.restHr && !sanitizeHr(set.restHr)) { set.restHr = got.restHr; changed = true }
  }
  if (res.session) {
    const cur = w.hr && typeof w.hr === 'object' ? w.hr : null
    const fuller = !cur || (cur.src === src && res.n > (Number(cur.n) || 0))
    if (fuller && cur?.src !== 'watch') {
      w.hr = { ...res.session, src, n: res.n }
      changed = true
    }
  }
  if (changed) stampWorkout(w, now)
  return changed
}

/** Whether a workout still has sets the hub could fill: one done and without a heart rate. */
export function lacksHeartRate(w) {
  if (!w || typeof w !== 'object') return false
  if (!w.hr) return true
  return (w.entries || []).some(e => (e?.sets || []).some(s => s && (s.done === true || s.sides) && !sanitizeHr(s.hr)))
}

/** The id a hub sample gets among a day's weigh-ins: the same on every phone that reads it. */
export function hubReadingId(r) {
  return 'h' + hashId(String(r?.id || r?.t || ''))
}

/**
 * Weigh-ins from the hub (`records`: [{ t, kg, id, origin, clientId }]) put into the log `S`
 * (mutated), each with its time (#859): a scale that weighs you morning and evening gives the day
 * two readings, and the profile's daily value (lib/weigh-ins.js) picks the one the charts use.
 * `seen` is this phone's memo of what it imported ({ [reading id]: { id, t } }), updated in place,
 * which makes a second read of the same records a no-op. A sample is left out when the day already
 * has it (by the hub's id) or another weigh-in at the same minute (typed in, or read by another
 * phone), when it was removed in JelloGym, or when its whole day was deleted in JelloGym after it
 * was taken. Weights go in in the profile's unit. Returns the days changed.
 */
export function mergeWeighIns(S, records, { src, seen = {} } = {}) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const fresh = []
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || isOwnRecord(r)) continue
    const t = Number(r.t), kg = Number(r.kg)
    if (!(t > 0) || !(kg >= KG_MIN && kg <= KG_MAX)) continue
    fresh.push({ t, kg, id: r.id || null })
  }
  if (!fresh.length) return []
  fresh.sort((a, b) => a.t - b.t)
  if (!Array.isArray(S.bodyweight)) S.bodyweight = []
  const deleted = S.deleted?.bodyweight && typeof S.deleted.bodyweight === 'object' ? S.deleted.bodyweight : {}
  const days = new Set()
  for (const r of fresh) {
    const rid = hubReadingId(r)
    if (seen[rid]) continue
    const d = isoOf(new Date(r.t)), at = timeOf(r.t)
    const day = S.bodyweight.find(b => b && b.d === d)
    if (!day && Number(deleted[d]) > r.t) continue        // the day was removed in JelloGym after it was taken
    if (day) {
      const rs = readingsOf(day)
      const removed = Number(day.gone?.[rid]) > 0
      if (removed || rs.some(x => x.id === rid || (x.at && x.at === at))) { seen[rid] = { id: r.id, t: r.t }; continue }
    }
    const w = Math.round((unit === 'lb' ? r.kg * LB_PER_KG : r.kg) * 10) / 10
    addWeighIn(S, { d, at, w, t: r.t, id: rid, src, sid: r.id })
    seen[rid] = { id: r.id, t: r.t }
    days.add(d)
  }
  return [...days].sort()
}

/**
 * Steps (docs/LIFE_MODULES.md): one stamped entry per local day, its id derived from the day so
 * two devices importing the same day land on one entry and a watch catching up rewrites it in
 * place. `d` marks an aggregate day: Health Connect's aggregate call dedupes the phone's and the
 * watch's overlapping records, which summing the raw ones could not. Old raw entries on the same
 * days are tombstoned, so the total cannot count them twice on any device.
 */
export function mergeSteps(S, records, { src = 'hc', seen = null, now = Date.now() } = {}) {
  if (!Array.isArray(records)) return []
  const map = (S.steps && typeof S.steps === 'object' && !Array.isArray(S.steps)) ? { ...S.steps } : {}
  const changed = []
  const days = new Set(), dayIds = new Set()
  for (const r of records) {
    if (!r || isOwnRecord(r)) continue
    const t = Number(r.t), n = Math.round(Number(r.n))
    if (!(t > 0) || !Number.isFinite(n) || n < 0 || n > 100000) continue
    const id = hubReadingId(r)
    const d = typeof r.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.d) ? r.d : isoOf(new Date(t))
    if (r.d) { days.add(d); dayIds.add(id) }
    const o = typeof r.origin === 'string' && r.origin ? r.origin : src
    const cur = map[id]
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      const live = Number(cur.n) >= 0 && cur.d === d
      if (live && cur.n === n && cur.o === o) continue
      if (!live && !(Number(cur._ts) > 0)) continue   // no stamp to judge by: leave it
      if (!live) continue                              // a removal: the hub's copy lost the round
      if (Number(cur._ts) > now) continue              // ours is newer than this read
    }
    map[id] = { d, n, o, _ts: now }
    changed.push(id)
    if (seen) seen[id] = { d, n, t: now }
  }
  for (const [id, e] of Object.entries(map)) {
    if (dayIds.has(id) || !days.has(e?.d) || !(Number(e?._ts) > 0)) continue
    map[id] = { _ts: now }
    changed.push(id)
  }
  if (changed.length) S.steps = map
  return changed
}

/**
 * Sleep (docs/LIFE_MODULES.md): sessions read from Health Connect, keyed by the wake day, the id
 * derived from the hub's record so two devices import one night once. Records that only nudge
 * the same night (a nap, a watch that restarted a session) join as their own entries; the
 * manual-versus-imported call is made by sleep.js addSleep, which this routes through so the
 * same rule decides however the night arrived. A removed night stays removed: a tombstoned id
 * is never written back.
 */
export function mergeSleep(S, records, { src = 'hc', seen = null, now = Date.now() } = {}) {
  if (!Array.isArray(records)) return []
  const changed = []
  for (const r of records) {
    if (!r || isOwnRecord(r)) continue
    const s = Number(r.s), e = Number(r.e)
    if (!(s > 0) || !(e > s)) continue
    const id = hubReadingId(r)
    const cur = (S.sleep && typeof S.sleep === 'object') ? S.sleep[id] : null
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      if (!(Number(cur._ts) > 0)) continue                                   // junk: leave it be
      if (!(cur.s > 0)) continue                                             // a removal: stays a removal
      if (Number(cur.s) === s && Number(cur.e) === e) continue               // the same night as read
    }
    const before = (S.sleep && typeof S.sleep === 'object') ? S.sleep[id] : null
    addSleep(S, { s, e, manual: false, id, now })
    if (!before && !S.sleep[id]) continue                                     // the dup rule said no
    if (before && S.sleep[id] && before.s === S.sleep[id].s && before.e === S.sleep[id].e) continue
    changed.push(id)
    if (seen) seen[id] = { d: isoOf(new Date(e)), t: now }
  }
  return changed
}
