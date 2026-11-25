# Life modules: master brief

## Context
Personal, single-user app. Android only. English only. Never published. No
i18n, accessibility, multi-user or iOS/Apple Health work for new features.
Existing architecture: one synced user document S (useStore, localStorage,
revisioned PUT to server, 409 -> stamp-based field merge). Sheets live in
useUI and are never persisted. Derived values are pure, tested lib/ helpers
(the MIRROR rule). Server db.json holds identity only, never training/life
data. Features are gated by module toggles in Settings > Modules.

## Rules for all work
- Log entries, not totals: flat maps keyed by entryId, e.g.
  S.water[entryId] = {d, ml, _ts}, where d is the local-date string
  (dayPhotos-style). Totals are always derived.
- Derived values (totals, goal progress, streaks, XP, levels, badge
  eligibility, recap, insights) are pure lib/ functions with tests. Never
  stored.
- Sync: list-membership edits only are allowed (registering new maps in
  lib/sync-merge.js and the api/sync-stamps.js mirror, with parity tests
  passing, including tombstone deletes and reset names). Never change merge
  logic. Flag anything beyond membership edits.
- Every new module is gated by a toggle in Settings > Modules, off by
  default, and turning it off hides every trace of it.
- New fields are optional with defaults so existing data loads unchanged.
- Reuse existing components and patterns (weight tracker, charts, history
  calendar, sheets, Home cards, reminders/push, Health Connect integration).
  Follow the existing design system.
- Small diffs, tests first for lib logic, list files before editing.
- Strings are plain English, hardcoded.

## Features (built one at a time, in this order)
1. WATER (modelled on the weight tracker; reuse its storage shape, units,
   chart, history, CSV export/import)
   - Entries with ids; one-tap quick-add buttons with editable cup sizes
     (default 250/500/750 ml), last-used amount, long-press custom amount,
     undo toast
   - Daily goal, suggested default from tracked bodyweight (~30-35 ml/kg),
     optional training-day bump
   - Home card with progress ring; /water page with goal-line chart
     (day/week/month) and history with edit/delete
   - Behind-schedule nudges via existing push/reminders
   - Health Connect hydration read/write (tag our own writes with an origin
     id so they aren't re-imported)
   - Later extras: NFC tag, voice shortcut logging
2. HABITS (includes meds and supplements)
   - Types: yes/no, count, timed. Schedules: daily, specific weekdays, N per
     week, every N days
   - Rest-day-aware: a habit can be set to skip on rest days so it doesn't
     break consistency. Skip days and streak freezes
   - Weekly-consistency view plus streaks; calendar heatmap reusing the
     History calendar; optional per-habit reminders
   - Templates: meditate, read, stretch, no sugar, vitamins, and a
     supplement/med variant with dose and time; habit stacking ("after
     finishing a workout")
3. STEPS: read-only from Health Connect (CMF Watch -> Nothing X -> Health
   Connect). Goal, Home ring, /steps chart, last-synced indicator, no
   logging UI
4. SLEEP: sessions from Health Connect (same CMF path) keyed by wake date,
   manual entry as fallback, sleep goal, Home card, /sleep chart and
   history. Handle late-arriving sync and import/manual duplicates
5. GAMIFICATION (toggle: Levels)
   - Levels from consistency-weighted XP, derived from history so existing
     gym history gives a starting level. Weekly consistency rewarded over
     daily grinding. No daily XP cap. Deliberately slow, steady level curve.
   - XP sources are a registry: workouts, water, habits, steps, sleep, food
     each plug in with their own rule
   - Perfect day: all enabled modules' daily targets met, shown as a
     count on /level and /stats/life rather than a ring
   - Milestone badges (eligibility derived, only unlock dates stored)
   - Streak freezes earned by levelling up (store only freezes used)
   - Level card on Home (absorbs the existing streak), /level page,
     level-up/badge popup sheet
   - No cosmetic unlocks, no leaderboards
6. FOOD (minimal): tier 1 = calories + protein entries, goals (calorie
   target suggested from bodyweight), one-tap repeats of recent entries;
   tier 2 = saved foods and meals, modelled on user-defined exercises.
   Barcode lookup is optional and later. Food is an XP source
7. WEEKLY RECAP: /recap summarising all enabled modules for the week
   (workouts, water, habits, sleep, steps, food, perfect days, level
   progress), Home banner on recap day, also extend the "Wrapped" year recap
8. INSIGHTS (no AI): Stats > Life segment with plain-statistics insights
   (e.g. lifting performance after 7h+ sleep vs under), minimum 14 days per
   side, phrased as patterns not causes. Pure lib functions with tests

## Navigation / IA changes
- Tabs: Home, Workout (the plan page, dumbbell glyph), Start disc, Life (present only while a life module is on), Stats. The
  exercise library opens from an Exercises icon button in the Plan header; /library is its own page
  with a back chevron.
  The Life tab opens /life: the Level card on top, then one row per enabled
  module (Water, Habits, Steps, Sleep, Food, Body) with today's number.
- The Start disc is the Actions hub whenever it is idle (plus glyph, tab named Actions): a grid
  of square quick-add cards — Start workout, today's habits, water, food, weigh-in — with the
  day note in a wide row below; each multi-action card opens a small sheet with its one-tap
  controls. While a session runs the disc keeps the play glyph and resumes it directly.
- Home becomes a card dashboard in fixed order: today's session, the Level card,
  Water, Habits, Weight, Sleep/Steps, Food, Streak (folded
  into Level when Levels is on). Each card gated by its module toggle.
- Stats gets a Training | Life segmented control (Training unchanged;
  /stats/life is new). Built: components/StatsViews.jsx above both halves - StatsIndex
  inside the Training half picks a part of it, this picks the half - and the
  control only exists while a life module is on (lib/modules.js anyLifeOn).
  /stats/life (views/StatsLife.jsx) is one stretch (Month / 3 Months / Year)
  with a chart and its numbers per enabled module, a perfect-day grid, the
  weekly XP, and lib/insights.js' comparisons under "What goes together".
  All of it derives: lib/life-stats.js and lib/insights.js, both tested, and
  the same helpers the Home cards and the recap use. The day-by-day reads are
  memoised against the entry maps (lib/water.js, steps.js, sleep.js, food.js,
  habits.js) and the XP walk against the state copy (lib/xp.js), which is what
  keeps a long history affordable; lib/day-cache.test.js holds that contract.
- New routes: /water, /habits, /habits/:id, /sleep, /steps, /food,
  /food/saved, /level, /recap, /stats/life
- New settings pages (under existing groups): modules toggles, water,
  habits, food, health-goals (sleep/step goals), reminders/water,
  reminders/habits; Health Connect page gains per-type permissions
  (hydration, sleep, steps), preferred source, last-synced display;
  Data export/import covers the new modules
- New bottom sheets (in useUI, never persisted): water quick-add/custom
  amount, habit quick-check, habit create/edit, schedule picker, sleep
  manual entry, food quick-log, saved-food picker, goal editor, level-up/
  badge popup, streak-freeze confirm
- Health Connect permissions are requested per module when its toggle is
  switched on, not at onboarding
- Optional later: Android home-screen widgets (water quick-add, perfect-day
  ring), MCP tools (log_water, check_habit, log_food)

## Out of scope
Mood check-in, fasting timer, journal, leaderboards, cosmetic unlocks, AI
insights, i18n, accessibility, Apple Health/Watch, Wear OS/Garmin/Zepp UI for
new modules, multi-user considerations.

## How we work
One feature at a time, in the order above, each through the Plan agent. For
each: plan first, wait for approval, then build as a vertical slice. Create
shared code (toggle, entry storage) inside the first feature that needs it,
and only extract shared helpers once a second feature shows what's actually
common.

## Decisions
- New modules are off by default via a per-module default:false in
  isOn (lib/modules.js only, no migration). Presets: Just training
  excludes life modules, Everything includes them. Health-backed modules
  stay sub-gated under the existing health master toggle.
- Home order: hero, existing cards unchanged, then Water, Habits,
  Weight, Sleep/Steps, Food, Streak. When Levels is on, the Level card
  goes right after the hero and replaces the Streak card.
- Progress ring: build one shared ring component in the Water feature
  and reuse it for later modules.
- The Home level card is one ring beside the card head, nothing else: the
  way to the next level. No perfect-day readout on it, neither a second
  ring nor a row of pips, which only repeated counts the /level page
  already gives with its 4-week perfect-day grid.
- Insights (feature 8) are five plain comparisons over the last 180 days -
  session volume after 7h+ nights against shorter ones, and the night's
  length, the water goal, steps and habit checks on training days against
  days off. Each needs 14 days (or sessions) on both sides before it speaks,
  says how many it counted, and is worded as a pattern, never as a cause.
  lib/insights.js, pure and tested.
- The two sides of an insight are the days in the 180-day window, not the
  days a module has existed, so a young profile's "days off" include days it
  never had anything to log. That is said in the sentence (and in the card's
  note) rather than trimmed out of the maths: a window the reader can see is
  worth more than a denominator quietly narrowed.
- The weigh-in step before a session is decided by its own switch alone
  (Settings > Workout > Weigh in before workouts): it is no longer gated on
  the Body module, and it starts on for a new profile. Both were silent
  reasons the step never appeared. Sheet: "Save & start workout" or "Start
  without weighing in".
- Health Connect after the rename to JelloGym: both `opengym-` and
  `jellogym-` client ids, and both package origins, count as our own records
  (reading an old one back as another app's data would double its day). The
  phone's own bookkeeping file was adopted from `opengym-health.json`, and a
  record already in the hub under the old id is not written a second time -
  it is only taken out once its content moves to the new id, or the log
  entry is deleted.
- A permission kind the native side does not know is an error, not a quiet
  skip (HealthConnectPlugin.asked()): dropping it means the permission is
  never asked for, Health Connect keeps answering "not granted" for that
  kind, and the switch in Settings looks broken with nothing in the log to
  say why. lib/health-connect.test.js pins the three-way contract (the kinds
  JS sends, the names HealthRead.java maps, the permissions the manifest
  declares); HealthReadTest pins the mapping on the Android side.
- The watch's own JVM tests (:wear:testDebugUnitTest, codec and SessionCore
  against the JSON the phone suite writes) run in the CI android job. Before
  that they were documented in docs/WEAR_OS.md and run by nobody, so no pull
  request ever touched the watch app's logic.
- Module titles/descriptions follow the lib/modules-copy.js convention,
  English only, no locale additions. Keep CI checks green.
- Water v1 writes to Health Connect only (no read-back). Steps and sleep
  later derive entry ids from the Health Connect record id so multi-device
  imports dedupe on merge.
- Levels, badges and recap must extend the existing motivation module's
  badges, recap and Wrapped, not duplicate them. Decide precedence when
  we reach Levels.
- Water is built in slices: 1a toggle, storage + sync registration, Home
  card with ring, quick-add and undo; 1b /water page, chart, history,
  settings, CSV export; 1c Health Connect hydration write; 1d nudges
  (optional).
- Work on a local branch; don't push unless I say so.
