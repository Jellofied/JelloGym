// Missed-workout nudge — one playful notification on the evening of a planned day that went by
// without a workout. Opt-in, under the workout-day reminder (S.reminder.nudge, S.reminder.tone).
//
// The self-hosted app sends it as a web push from the server (api/nudge.js, a hand copy of the
// rules below, as api/queue.js is of lib/queue.js); the mobile build schedules it as a native
// local notification (lib/mobile.js). Both answer the same three questions the same way:
//
//   WHEN  — at 20:00 on the user's clock, or 2 hours after the reminder when that is later, and
//           never after 21:30: a nudge is owed from that time until 21:30, once per day.
//   WHICH — a day is a MISSED day when it has a routine planned (the same plan the reminder
//           reads, coach week/rotation included) and no workout dated on it. A floating coach
//           week or rotation names a session every day until it is done, so on such a day the
//           day right after a workout is a rest day, not a miss — only the second day off in a
//           row counts. A note is just a note (lib/day-notes.js): it does not excuse a miss.
//   HOW OFTEN — back-off: the missed days since the last workout are counted (14 days back at
//           most). After 3 of them the nudge goes quiet until the next workout is logged, so a
//           break never turns into a daily nag. No counter is stored anywhere: it is read off
//           the plan and the log, so the server and the phone agree without syncing anything.
//
// Copy: three tones, one title and four lines each. The line is chosen by the date, so a day
// always gets the same one and consecutive days rotate. Keys are the English source strings;
// api/nudge-copy.js carries the server's copy of their translations (a test keeps the two equal).
import { isoOf } from './format.js'
import { effectiveRoutineIds } from './history.js'
import { queueLiveOn } from './queue.js'
import { isOn } from './modules.js'
import { reminderOpenOn } from './habits.js'
import { dayTotal, goalOf } from './water.js'

export const NUDGE_TONES = ['friendly', 'guilt', 'drill']
export const NUDGE_MAX_MISSES = 3
export const NUDGE_LOOKBACK_DAYS = 14
const EVENING = 20 * 60, LATEST = 21 * 60 + 30, AFTER_REMINDER = 120

export const NUDGE_COPY = {
  friendly: {
    title: 'Everything okay?',
    lines: [
      '{0} is still waiting. What’s up?',
      'No {0} today? Even a short session tomorrow counts.',
      'Rough day? {0} will keep. Tomorrow is a fresh start.',
      'Hey, {0} didn’t happen today. All good?',
    ],
  },
  guilt: {
    title: 'I miss you',
    lines: [
      '{0} waited by the door all evening. For you.',
      'The barbell asked about you today. I didn’t know what to say.',
      'Was it something I said? {0} misses you.',
      'I saved you a spot on the bench. It’s still empty.',
    ],
  },
  drill: {
    title: 'Attention, recruit!',
    lines: [
      'Your gains are packing their bags. {0} tomorrow, no excuses!',
      '{0} doesn’t do itself, recruit. Move it!',
      'Excuses don’t lift weights. Report for {0} tomorrow!',
      'Your muscles filed a missing-person report. Show up for {0}!',
    ],
  },
}

export const toneOf = r => (NUDGE_TONES.includes(r?.tone) ? r.tone : 'friendly')

const hhmmToMin = v => {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Minutes after midnight the nudge is owed from, or null when that would be after 21:30. */
export function nudgeMinute(reminderTime) {
  const r = hhmmToMin(reminderTime)
  const at = Math.max(EVENING, Number.isNaN(r) ? 0 : r + AFTER_REMINDER)
  return at > LATEST ? null : at
}

const dayBefore = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - 1); return isoOf(d) }
const logged = (S, iso) => (S.workouts || []).some(w => w?.d === iso)
const norm = S => ({
  ...S,
  routines: Array.isArray(S?.routines) ? S.routines.filter(Boolean) : [],
  workouts: Array.isArray(S?.workouts) ? S.workouts.filter(Boolean) : [],
  week: S?.week || {}, dayPlan: S?.dayPlan || {},
})

// The routine ids `iso` missed, or [] when it is not a missed day. Each date is asked as if it
// were today, as the reminder does: a coach week's session is due every day until it is done.
function missed(S, iso) {
  if (logged(S, iso)) return []
  const ids = effectiveRoutineIds(S, iso, iso)
  if (!ids.length) return []
  if (queueLiveOn(S, iso, iso) && logged(S, dayBefore(iso))) return []
  return ids
}

/**
 * The routine ids to nudge about on `iso`, or null: not a missed day, or already 3 missed days in
 * a row since the last workout (back-off). Workouts dated after `iso` are not looked at, so the
 * phone can ask about future dates and get the back-off of a break that simply goes on.
 */
export function nudgeFor(state, iso) {
  const S = norm(state)
  const ids = missed(S, iso)
  if (!ids.length) return null
  const last = S.workouts.reduce((m, w) => (typeof w.d === 'string' && w.d < iso && w.d > m ? w.d : m), '')
  let misses = 0
  let d = dayBefore(iso)
  for (let i = 0; i < NUDGE_LOOKBACK_DAYS && d > last; i++, d = dayBefore(d)) {
    if (missed(S, d).length && ++misses >= NUDGE_MAX_MISSES) return null
  }
  return ids
}

/** The day's line index: by date, so a day keeps its line and consecutive days rotate. */
export const lineIndex = (iso, n) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000) % n

/* ------------------------------------------------------------------ habits (docs/LIFE_MODULES.md 2b) -- */
// One digest a day for the habits that opted into a reminder: at the check time (S.habitReminder,
// Settings → Reminders → Habit reminders), while the Habits module is on, the open ones are named.
// api/nudge.js keeps the hand copy; the phone schedules it through lib/mobile.js.
export const HABIT_COPY = {
  title: 'Habit check-in',
  lines: [
    'Still open today: {0}. A minute now keeps the run alive.',
    '{0} has not been checked. The streak is waiting.',
    'A short go on {0} closes today out.',
    'Last call for {0} today.',
  ],
}

/** The habits still open on `iso` for the reminder digest: { ids, names } or null. */
export function habitNudgeFor(state, iso) {
  if (!isOn(state, 'habits')) return null
  if (!state?.habitReminder?.on) return null
  const open = reminderOpenOn(state, iso)
  if (!open.length) return null
  const names = open.slice(0, 2).map(o => o.name).join(' + ') + (open.length > 2 ? ` +${open.length - 2}` : '')
  return { ids: open.map(o => o.id), names }
}

/* ------------------------------------------------------------------ water (docs/LIFE_MODULES.md 1d) -- */
// The second nudge rule, a twin of the first in every way that matters: opt-in on its own
// (S.waterReminder, Settings → Reminders → Water reminder), a window on the user's clock from the
// chosen check time until 21:30 (the caller's job), and a plain predicate here. api/nudge.js keeps
// the hand copy; the phone schedules it through lib/mobile.js (which is what knows the clock).
export const WATER_COPY = {
  title: 'Thirsty?',
  lines: [
    '{0} ml still to drink today. A glass now?',
    'Water is behind: {0} ml left before the day’s goal.',
    'The last {0} ml of today’s water is the easiest to forget. Finish the day?',
    'Rough day — but {0} ml of water before bed still counts. Go on.',
  ],
}
export const WATER_FRAC = 0.5
export const WATER_DEFAULT_TIME = '18:00'

/**
 * The water owed on `iso` when its drinks fall short of half the goal, or null: the Water module
 * off, the reminder off, nothing set as a goal worth chasing, or the day already half drunk.
 * The caller owns the clock window (the phone schedules at the time; the server asks in its tick).
 */
export function waterNudgeFor(state, iso) {
  if (!isOn(state, 'water')) return null
  const r = state?.waterReminder
  if (!r?.on) return null
  const goal = goalOf(state)
  const ml = dayTotal(state, iso)
  const left = Math.round(goal * WATER_FRAC) - ml
  if (left <= 0) return null
  return { ml, goal, left }
}
