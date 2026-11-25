// Missed-workout nudge — the pure half (nudge.js) and its push text (push-messages.js). The tick
// in server.js is covered end to end in server-nudge.test.js; the rules themselves are here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nudgeFor, nudgeMinute, nudgeWindowOpen, toneOf, lineIndex, waterNudgeFor, waterNudgeWindowOpen, habitNudgeFor, habitNudgeWindowOpen } from '../nudge.js';
import { nudgePush, waterPush, habitPush } from '../push-messages.js';
import { NUDGE_COPY, WATER_COPY, HABIT_COPY } from '../nudge-copy.js';

const routines = [{ id: 'push', name: 'Push Day' }, { id: 'pull', name: 'Pull Day' }];
// 2026-09-07 is a Monday. Push on Mon/Wed/Fri, nothing else.
const S = (over = {}) => ({ routines, week: { 1: 'push', 3: 'push', 5: 'push' }, dayPlan: {}, workouts: [], reminder: { on: true, nudge: true, time: '08:00' }, ...over });
const w = d => ({ id: 'w' + d, d, routineId: 'push' });

test('when: 20:00, or 2 hours after a late reminder, and never after 21:30', () => {
  assert.equal(nudgeMinute('08:00'), 20 * 60);
  assert.equal(nudgeMinute('19:00'), 21 * 60);
  assert.equal(nudgeMinute('19:30'), 21 * 60 + 30);
  assert.equal(nudgeMinute('19:31'), null, 'a reminder this late leaves no evening for a nudge');
  assert.equal(nudgeMinute(undefined), 20 * 60);
  assert.equal(nudgeWindowOpen('08:00', '19:59'), false);
  assert.equal(nudgeWindowOpen('08:00', '20:00'), true);
  assert.equal(nudgeWindowOpen('08:00', '21:30'), true);
  assert.equal(nudgeWindowOpen('08:00', '21:31'), false);
  assert.equal(nudgeWindowOpen('19:00', '20:30'), false);
  assert.equal(nudgeWindowOpen('21:00', '21:15'), false);
});

test('which: a planned day with nothing logged; not a rest day, not a trained day', () => {
  assert.equal(nudgeFor(S({ workouts: [w('2026-09-04')] }), '2026-09-07'), 'push');   // Monday, missed
  assert.equal(nudgeFor(S(), '2026-09-08'), null);                                    // Tuesday, rest
  assert.equal(nudgeFor(S({ workouts: [w('2026-09-07')] }), '2026-09-07'), null);     // trained
  assert.equal(nudgeFor(S({ dayPlan: { '2026-09-07': 'rest' }, workouts: [w('2026-09-04')] }), '2026-09-07'), null); // moved to rest
  assert.equal(nudgeFor(S({ dayPlan: { '2026-09-08': 'pull' }, workouts: [w('2026-09-07')] }), '2026-09-08'), 'pull'); // moved onto Tuesday
});

test('back-off: quiet after 3 missed days in a row, back after the next workout', () => {
  // last workout Fri 09-04; missed Mon 07, Wed 09, Fri 11 -> nudged on each of those three
  const s = S({ workouts: [w('2026-09-04')] });
  assert.equal(nudgeFor(s, '2026-09-07'), 'push');
  assert.equal(nudgeFor(s, '2026-09-09'), 'push');
  assert.equal(nudgeFor(s, '2026-09-11'), 'push');
  // the fourth missed day in a row: silent, and so is every one after it
  assert.equal(nudgeFor(s, '2026-09-14'), null);
  assert.equal(nudgeFor(s, '2026-09-16'), null);
  // a workout resets the count
  const back = S({ workouts: [w('2026-09-04'), w('2026-09-15')] });
  assert.equal(nudgeFor(back, '2026-09-16'), 'push');
  // rest days in between are not misses
  assert.equal(nudgeFor(S({ week: { 1: 'push' }, workouts: [w('2026-08-31')] }), '2026-09-14'), 'push');
});

test('back-off: a profile with no workouts at all is not nagged for ever', () => {
  const every = S({ week: { 0: 'push', 1: 'push', 2: 'push', 3: 'push', 4: 'push', 5: 'push', 6: 'push' } });
  assert.equal(nudgeFor(every, '2026-09-07'), null, 'the 14 days looked back on are all misses');
});

test('coach week / rotation: the day right after a workout is rest, the second day off is a miss', () => {
  const queue = { ids: ['push', 'pull'], since: 0, startsOn: '2026-09-07' };
  const s = S({ week: {}, queue, workouts: [{ id: 'a', d: '2026-09-07', routineId: 'push', start: 1 }] });
  assert.equal(nudgeFor(s, '2026-09-08'), null, 'the day after a session');
  assert.equal(nudgeFor(s, '2026-09-09'), 'pull', 'two days off in a row');
});

// The mirror of frontend/src/lib/nudge.test.js: a note is just a note.
test('a noted day is still nudged', () => {
  const notes = { '2026-09-07': { tag: 'note', _ts: 1 } };
  assert.equal(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: notes }), '2026-09-07'), 'push');
  assert.equal(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: { '2026-09-07': { text: 'Flight to Lisbon', _ts: 1 } } }), '2026-09-07'), 'push');
  assert.equal(nudgeFor(S({ workouts: [w('2026-09-04')], dayNotes: { '2026-09-07': { _ts: 2 } } }), '2026-09-07'), 'push');
  const s = S({ workouts: [w('2026-09-04')], dayNotes: notes });
  assert.deepEqual(['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14'].map(d => !!nudgeFor(s, d)), [true, true, true, false]);
});

test('a malformed state reads as nothing to nudge about', () => {
  assert.equal(nudgeFor({}, '2026-09-07'), null);
  assert.equal(nudgeFor({ workouts: 'x', routines: null, week: { 1: 'push' } }, '2026-09-07'), null);
  assert.equal(nudgeFor(S({ workouts: [null, w('2026-09-04')] }), '2026-09-07'), 'push');
  assert.equal(toneOf({ tone: 'mean' }), 'friendly');
  assert.equal(toneOf(undefined), 'friendly');
  assert.equal(toneOf({ tone: 'drill' }), 'drill');
});

test('push text: by tone, one line per date, routine name filled in, localized', () => {
  const iso = '2026-09-07';
  const i = lineIndex(iso, 4);
  const en = nudgePush('en', 'guilt', { name: 'Push Day' }, iso);
  assert.equal(en.title, 'I miss you');
  assert.equal(en.body, NUDGE_COPY.en.guilt.lines[i].replace('{0}', 'Push Day'));
  assert.equal(en.tag, 'nudge');
  // the next day takes the next line
  assert.notEqual(nudgePush('en', 'guilt', { name: 'Push Day' }, '2026-09-08').body, en.body);
  // every tone, every language: a title and the routine's name where the line has a slot
  for (const lang of Object.keys(NUDGE_COPY)) {
    for (const tone of ['friendly', 'guilt', 'drill']) {
      for (let d = 0; d < 4; d++) {
        const p = nudgePush(lang, tone, { name: 'Ω' }, `2026-09-0${d + 1}`);
        assert.ok(p.title && p.body && !p.body.includes('{0}'), `${lang}/${tone}`);
      }
    }
  }
  assert.equal(nudgePush('de', 'drill', null, iso).title, 'Achtung, Rekrut!');
  assert.equal(nudgePush('pt-BR', 'friendly', null, iso).title, 'Está tudo bem?');
  // unknown language and tone fall back to English and friendly; de-CH writes ss
  assert.deepEqual(nudgePush('xx', 'mean', { name: 'A' }, iso), nudgePush('en', 'friendly', { name: 'A' }, iso));
  for (const tone of ['friendly', 'guilt', 'drill']) {
    for (let d = 0; d < 4; d++) assert.doesNotMatch(nudgePush('de-CH', tone, { name: 'A' }, `2026-09-0${d + 1}`).body, /ß/);
  }
  // a name with $-patterns is inserted literally
  assert.match(nudgePush('en', 'friendly', { name: '$& $1' }, '2026-09-04').body + nudgePush('en', 'friendly', { name: '$& $1' }, '2026-09-05').body, /\$& \$1/);
});

// The nudge looks back over up to fifteen days, and every day asks the queue rules again. They
// used to work the whole queue out on each question (a dedupe over every id, a Set of every
// routine), so a crafted state the size a PUT allows held the server's one thread for seconds per
// nudge, in the tick and on every GET /api/nudge-check. Now it is worked out once per state.
// These are under the 5 MB limit; each took several seconds before.
test('nudge: a crafted state costs one pass, not one per day looked back on', () => {
  const today = '2026-10-23';
  const within = state => {
    const t = Date.now();
    nudgeFor(state, today);
    return Date.now() - t;
  };
  const long = [...Array.from({ length: 400000 }, (_, i) => 'x' + i), 'push'];
  // a long queue of ids that name no routine, its one real session due from today and never done,
  // so every earlier day is looked back on and asks the queue again
  assert.ok(within(S({ week: {}, queue: { ids: long, since: 1, startsOn: today } })) < 1000);
  // the same, with that session pinned to a later day, so every day falls to the weekday list
  assert.ok(within(S({ queue: { ids: long, since: 1, startsOn: '2026-10-01' }, dayPlan: { '2026-11-01': 'push' }, week: { 0: 'pull', 1: 'pull', 2: 'pull', 3: 'pull', 4: 'pull', 5: 'pull', 6: 'pull' } })) < 1000);
});

// The behind-on-water nudge (docs/LIFE_MODULES.md 1d), the mirror of the water cases in
// frontend/src/lib/nudge.test.js: the rule here, the window the server's tick opens on.
const WD = '2026-09-07';
const W = (over = {}) => ({ unit: 'kg', bodyweight: [], routines: [], week: {}, dayPlan: {}, workouts: [],
  modules: { water: true }, waterReminder: { on: true, time: '18:00' }, ...over });
test('water: which — half the goal short; own goal, weigh-in estimate, or 2000', () => {
  assert.deepEqual(waterNudgeFor(W({ water: { a1: { d: WD, ml: 250, _ts: 1 } }, waterGoal: 2000 }), WD), { ml: 250, goal: 2000, left: 750 });
  assert.equal(waterNudgeFor(W({ water: {}, waterGoal: 2000 }), WD).left, 1000);
  assert.equal(waterNudgeFor(W({ bodyweight: [{ d: WD, w: 80 }] }), WD).goal, 2650);
  assert.equal(waterNudgeFor(W({ unit: 'lb', bodyweight: [{ d: WD, w: 176 }] }), WD).goal, 2650);
  assert.equal(waterNudgeFor(W({}), WD).goal, 2000);
  assert.equal(waterNudgeFor(W({ water: { a1: { d: WD, ml: 1000, _ts: 1 } }, waterGoal: 2000 }), WD), null, 'half drunk is not behind');
});
test('water: silent when the module or the reminder is off (default-off module)', () => {
  assert.equal(waterNudgeFor({ ...W(), modules: { water: false } }, WD), null);
  assert.equal(waterNudgeFor({ ...W(), waterReminder: { on: false } }, WD), null);
  assert.equal(waterNudgeFor({ water: {}, waterGoal: 2000, waterReminder: { on: true } }, WD), null, 'absent water module reads default off');
  assert.equal(waterNudgeFor({ ...W(), modules: { water: true }, week: { 1: 'push' } }, WD).left, 1000, 'other modules never switch water on');
});
test('water: counts only the day asked, ignoring tombstones and junk', () => {
  const st = W({ waterGoal: 2000, water: { a1: { d: '2026-09-06', ml: 1000, _ts: 1 }, b: { _ts: 9 }, c: { d: WD, ml: 0, _ts: 3 } } });
  assert.equal(waterNudgeFor(st, WD).left, 1000);
});
test('water: when — from the check time until 21:30', () => {
  assert.equal(waterNudgeWindowOpen('18:00', '17:59'), false);
  assert.equal(waterNudgeWindowOpen('18:00', '18:00'), true);
  assert.equal(waterNudgeWindowOpen('18:00', '21:30'), true);
  assert.equal(waterNudgeWindowOpen('18:00', '21:31'), false);
  assert.equal(waterNudgeWindowOpen(undefined, '18:30'), true, 'no time chosen: 18:00 is the default');
});
test('water: push text — one line per date, the shortfall filled in, every language', () => {
  const i = lineIndex(WD, 4);
  const p = waterPush('en', { ml: 250, goal: 2000, left: 750 }, WD);
  assert.equal(p.title, WATER_COPY.en.title);
  assert.equal(p.body, WATER_COPY.en.lines[i].replace('{0}', '750'));
  assert.equal(p.tag, 'water-nudge');
  for (const lang of Object.keys(WATER_COPY)) {
    for (let d = 0; d < 4; d++) {
      const x = waterPush(lang, { ml: 0, goal: 2000, left: 1000 }, '2026-09-0' + (d + 1));
      assert.ok(x.title && x.body && !x.body.includes('{0}'), lang);
    }
  }
  assert.equal(waterPush('xx', { left: 5 }, WD).title, WATER_COPY.en.title, 'unknown language falls back to English');
});

// The habit reminder digest, the mirror of the habit cases in frontend/src/lib/nudge.test.js.
const HW = (over = {}) => ({ unit: 'kg', routines: [], week: {}, dayPlan: {}, workouts: [], habitDefs: {}, habitLogs: {},
  modules: { habits: true }, habitReminder: { on: true, time: '20:00' }, ...over });
const hdef = (d = {}) => ({ name: 'Read', type: 'timed', target: 20, remind: true, ...d });
test('habit: names the open habits that opted in', () => {
  assert.deepEqual(habitNudgeFor(HW({ habitDefs: { h1: hdef() } }), WD), { ids: ['h1'], names: 'Read' });
  assert.equal(habitNudgeFor(HW(), WD), null);
  assert.equal(habitNudgeFor(HW({ habitDefs: { h1: { ...hdef(), remind: false } } }), WD), null);
  assert.equal(habitNudgeFor(HW({ habitDefs: { h1: hdef() }, modules: { habits: false } }), WD), null);
  assert.equal(habitNudgeFor({ ...HW({ habitDefs: { h1: hdef() } }), habitReminder: { on: false } }, WD), null);
});
test('habit: checked, skipped and opted-out days are quiet; two names join, a third folds', () => {
  const s = HW({ habitDefs: { h1: hdef() }, habitLogs: { x: { h: 'h1', d: WD, sec: 1200, _ts: 1 } } });
  assert.equal(habitNudgeFor(s, WD), null);
  const sk = HW({ habitDefs: { h1: hdef() }, habitLogs: { x: { h: 'h1', d: WD, skip: 1, _ts: 1 } } });
  assert.equal(habitNudgeFor(sk, WD), null);
  const three = HW({ habitDefs: { h1: hdef(), h2: hdef({ name: 'Meditate' }), h3: hdef({ name: 'Stretch' }) } });
  assert.equal(habitNudgeFor(three, WD).names, 'Read + Meditate +1');
});
test('habit: weekdays schedules nag only their days, skipRest exempts plan rest days', () => {
  const wd = HW({ routines: [{ id: 'r' }], week: { 1: 'r' }, habitDefs: { h1: hdef({ schedule: { kind: 'weekdays', days: [1] } }) } });
  assert.ok(habitNudgeFor(wd, '2026-09-07'));
  assert.equal(habitNudgeFor(wd, '2026-09-08'), null);
  const rest = HW({ routines: [{ id: 'r' }], week: { 1: 'r' }, habitDefs: { h1: hdef({ skipRest: true }) } });
  assert.ok(habitNudgeFor(rest, '2026-09-07'));   // Monday trains: due
  assert.equal(habitNudgeFor(rest, '2026-09-08'), null);   // Tuesday rest: exempt
});
test('habit: window and push text', () => {
  assert.equal(habitNudgeWindowOpen('20:00', '19:59'), false);
  assert.equal(habitNudgeWindowOpen('20:00', '20:30'), true);
  assert.equal(habitNudgeWindowOpen('20:00', '21:31'), false);
  const iso = WD, i = lineIndex(iso, 4);
  const p = habitPush('en', { names: 'Read' }, iso);
  assert.equal(p.title, HABIT_COPY.en.title);
  assert.equal(p.body, HABIT_COPY.en.lines[i].replace('{0}', 'Read'));
  assert.equal(p.tag, 'habit-nudge');
  for (const lang of Object.keys(HABIT_COPY)) {
    const x = habitPush(lang, { names: 'A' }, iso);
    assert.ok(x.title && x.body && !x.body.includes('{0}'), lang);
  }
});
