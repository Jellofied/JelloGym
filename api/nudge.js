// Missed-workout nudge — the server half. Hand-copied (not imported) from
// frontend/src/lib/nudge.js, as queue.js is from lib/queue.js: see there for the three rules
// (WHEN 20:00, or 2 h after the reminder, until 21:30; WHICH day counts as missed; the back-off
// after 3 missed days in a row). Kept out of server.js so it can be unit-tested without booting
// the server; the tick in server.js adds what only it knows (the push subscription, a session
// on screen right now, the once-a-day mark in db.json).
import { effectiveRoutineId, queueLiveOn } from './queue.js';

export const NUDGE_TONES = ['friendly', 'guilt', 'drill'];
export const NUDGE_MAX_MISSES = 3;
export const NUDGE_LOOKBACK_DAYS = 14;
const EVENING = 20 * 60, LATEST = 21 * 60 + 30, AFTER_REMINDER = 120;

export const toneOf = r => (NUDGE_TONES.includes(r?.tone) ? r.tone : 'friendly');

const hhmmToMin = v => {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Minutes after midnight the nudge is owed from, or null when that would be after 21:30. */
export function nudgeMinute(reminderTime) {
  const r = hhmmToMin(reminderTime);
  const at = Math.max(EVENING, Number.isNaN(r) ? 0 : r + AFTER_REMINDER);
  return at > LATEST ? null : at;
}

/** Is `hhmm` inside today's nudge window for a reminder set at `reminderTime`? */
export function nudgeWindowOpen(reminderTime, hhmm) {
  const at = nudgeMinute(reminderTime);
  const now = hhmmToMin(hhmm);
  return at != null && now >= at && now <= LATEST;
}

// Calendar arithmetic on ISO dates at UTC noon: no zone or DST edge can move the day.
const dayBefore = iso => new Date(Date.parse(iso + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
const records = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const logged = (S, iso) => S.workouts.some(w => w.d === iso);
// A note is just a note (frontend lib/day-notes.js): it does not excuse a missed day.
function missed(S, iso) {
  if (logged(S, iso)) return null;
  const rid = effectiveRoutineId(S, iso);
  if (!rid) return null;
  if (queueLiveOn(S, iso) && logged(S, dayBefore(iso))) return null;
  return rid;
}

/**
 * The routine id to nudge about on `iso`, or null: not a missed day, or 3 missed days in a row
 * already since the last workout (back-off). Workouts dated after `iso` are not looked at.
 */
export function nudgeFor(state, iso) {
  const S = { ...state, workouts: records(state?.workouts), routines: records(state?.routines) };
  const rid = missed(S, iso);
  if (!rid) return null;
  const last = S.workouts.reduce((m, w) => (typeof w.d === 'string' && w.d < iso && w.d > m ? w.d : m), '');
  let misses = 0;
  let d = dayBefore(iso);
  for (let i = 0; i < NUDGE_LOOKBACK_DAYS && d > last; i++, d = dayBefore(d)) {
    if (missed(S, d) && ++misses >= NUDGE_MAX_MISSES) return null;
  }
  return rid;
}

/** The day's line index: by date, so a day keeps its line and consecutive days rotate. */
export const lineIndex = (iso, n) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000) % n;

/* ------------------------------------------------------------------ water (docs/LIFE_MODULES.md 1d) -- */
// The behind-on-water nudge, the same three-part rule as frontend/src/lib/nudge.js (a hand copy,
// as the rest of this file). WHEN the caller owns the clock window (the tick in server.js checks
// nudgeWindowOpen with the chosen time); WHICH a day is short on water once its drinks fall under
// half the goal; HOW OFTEN once per day, marked in db.json. The goal is the chosen one, else
// ~33 ml/kg from the last weigh-in, else 2000 — lib/water.js goalOf(), hand-copied with the same
// LB factor so a phone and the server never disagree on what a day owed.
export const WATER_FRAC = 0.5;
export const WATER_DEFAULT_TIME = '18:00';
const WATER_ML_MAX = 2000, WATER_GOAL_MAX = 20000, WATER_LB = 0.45359237;

function waterDayTotal(S, iso) {
  const map = S?.water && typeof S.water === 'object' && !Array.isArray(S.water) ? S.water : {};
  let ml = 0;
  for (const e of Object.values(map)) {
    if (e && typeof e === 'object' && e.d === iso) { const n = Number(e.ml); if (Number.isFinite(n) && n > 0 && n <= WATER_ML_MAX) ml += n; }
  }
  return ml;
}

function waterGoalOf(S) {
  const g = Math.round(Number(S?.waterGoal));
  if (Number.isFinite(g) && g > 0 && g <= WATER_GOAL_MAX) return g;
  const days = Array.isArray(S?.bodyweight) ? S.bodyweight : [];
  const last = days.length ? days[days.length - 1] : null;
  const w = Number(last && last.w);
  if (Number.isFinite(w) && w > 0) {
    const kg = S?.unit === 'lb' ? w * WATER_LB : w;
    return Math.round(kg * 33 / 50) * 50;
  }
  return 2000;
}

/** Whether module `id` is on: an explicit choice wins, the check-in keeps its old switch, and the
 * life modules (lib/modules.js default:false) are off until asked. The nudges must go quiet when
 * their module is off, so this mirrors isOn for exactly the ids the reminder engine reads. */
function moduleOn(S, id) {
  const v = S?.modules && typeof S.modules === 'object' ? S.modules[id] : undefined;
  if (typeof v === 'boolean') return v;
  if (id === 'water' || id === 'habits') return false;
  return true;
}

/** The water owed on `iso` when its drinks fall short of half the goal, or null (module/switch off). */
export function waterNudgeFor(state, iso) {
  if (!moduleOn(state, 'water')) return null;
  const r = state?.waterReminder;
  if (!r || r.on !== true) return null;
  const goal = waterGoalOf(state);
  const ml = waterDayTotal(state, iso);
  const left = Math.round(goal * WATER_FRAC) - ml;
  if (left <= 0) return null;
  return { ml, goal, left };
}

/** Is `hhmm` inside the water nudge's window, from the chosen check time until 21:30? */
export function waterNudgeWindowOpen(checkTime, hhmm) {
  const at = hhmmToMin(checkTime || WATER_DEFAULT_TIME);
  const now = hhmmToMin(hhmm);
  return !Number.isNaN(at) && !Number.isNaN(now) && now >= at && now <= LATEST;
}

/* ------------------------------------------------------------------ habits (docs/LIFE_MODULES.md 2b) -- */
// The habit reminder digest, the same rule as frontend/src/lib/nudge.js (a hand copy): one line
// a day at the check time naming up to two habits that opted into reminders and are still open.
// Week math is Monday-first here, the frontend follows the profile's week start: the only
// divergence, like this file's UTC calendar arithmetic.
export const HABIT_DEFAULT_TIME = '20:00';
const isMapObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

function habitOpenOn(S, iso) {
  const defs = isMapObj(S.habitDefs) ? S.habitDefs : {};
  const logs = isMapObj(S.habitLogs) ? S.habitLogs : {};
  const out = [];
  for (const [id, def] of Object.entries(defs)) {
    if (!def || typeof def !== 'object' || def.remind !== true || typeof def.name !== 'string' || !def.name.trim()) continue;
    let checked = false, skipped = false, weekCount = 0;
    const t = Math.floor(Date.parse(iso + 'T12:00:00Z') / 86400000);
    const monday = t - (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
    for (const e of Object.values(logs)) {
      if (!e || typeof e !== 'object' || e.h !== id) continue;
      if (e.d === iso) { if (e.skip === 1) skipped = true; else if (Number(e._ts) > 0) checked = true; }
      if (!e.skip && typeof e.d === 'string' && e.d <= iso) {
        const g = Math.floor(Date.parse(e.d + 'T12:00:00Z') / 86400000);
        if (g >= monday && g <= t) weekCount++;
      }
    }
    const kind = (def.schedule && def.schedule.kind) || 'daily';
    let due;
    if (kind === 'perWeek') due = weekCount < Math.round(Number(def.schedule.n) || 0);
    else {
      const rest = !effectiveRoutineId(S, iso);
      if (def.skipRest && rest) due = false;
      else if (kind === 'weekdays') due = (Array.isArray(def.schedule.days) ? def.schedule.days : []).includes(new Date(Date.parse(iso + 'T12:00:00Z')).getUTCDay());
      else if (kind === 'everyNDays') {
        const n = Math.round(Number(def.schedule.n) || 0);
        const a = def.createdAt ? new Date(def.createdAt).toISOString().slice(0, 10) : iso;
        const gap = Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
        due = n >= 1 && gap >= 0 && gap % n === 0;
      } else due = true;
    }
    if (due && !checked && !skipped) out.push({ id, name: def.name.trim().slice(0, 60) });
  }
  return out;
}

export function habitNudgeFor(state, iso) {
  const S = { ...state, workouts: records(state?.workouts), routines: records(state?.routines), week: state?.week || {}, dayPlan: state?.dayPlan || {} };
  if (!moduleOn(S, 'habits')) return null;
  if (!S.habitReminder || S.habitReminder.on !== true) return null;
  const open = habitOpenOn(S, iso);
  if (!open.length) return null;
  const names = open.slice(0, 2).map(o => o.name).join(' + ') + (open.length > 2 ? ` +${open.length - 2}` : '');
  return { ids: open.map(o => o.id), names };
}

/** Is `hhmm` inside the habit digest's window, from the chosen check time until 21:30? */
export function habitNudgeWindowOpen(checkTime, hhmm) {
  const at = hhmmToMin(checkTime || HABIT_DEFAULT_TIME);
  const now = hhmmToMin(hhmm);
  return !Number.isNaN(at) && !Number.isNaN(now) && now >= at && now <= LATEST;
}
