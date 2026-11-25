import { NUDGE_COPY, WATER_COPY, HABIT_COPY } from './nudge-copy.js';
import { lineIndex } from './nudge.js';

const COPY = {
  en: {
    restTitle: 'Rest over 💪',
    restBody: 'Time for your next set.',
    testBody: 'Test notification ✅ This is what alerts look like.',
    dayFallbackTitle: 'Workout planned today',
    dayRoutineSuffix: 'today',
    dayBody: "It's on your plan. Let's go 💪",
  },
  'pt-BR': {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora da próxima série.',
    testBody: 'Notificação de teste ✅ É assim que os alertas aparecem.',
    dayFallbackTitle: 'Treino planejado para hoje',
    dayRoutineSuffix: 'hoje',
    dayBody: 'Está no seu plano. Bora treinar 💪',
  },
};

const copyFor = lang => COPY[lang] || COPY.en;

// A routine's `emoji` field held a literal emoji until the glyph redesign; since then it holds
// an icon key ('dumbbell', 'figureRun') that the app renders as an SVG. A push notification has
// no SVG to render, so an unmapped key reaches the phone as its own name — "dumbbell Push
// today". Keys are ASCII and emoji are not, so anything ASCII is looked up here (falling back
// rather than printing a word), and anything else is already an emoji and passes through.
// Mirrors frontend/src/lib/glyphs.js: GLYPHS is the full set the picker offers.
const DEFAULT_EMOJI = '🏋️';
const GLYPH_EMOJI = {
  figureStrength: '🏋️', arm: '💪', abs: '💥', legs: '🦵', pullup: '🧗',
  dumbbell: '🏋️', barbell: '🏋️', kettlebell: '🏋️', plate: '🏋️', machine: '🏋️',
  figureRun: '🏃', bike: '🚴', swim: '🏊', boxing: '🥊', timer: '⏱️',
  stretch: '🤸', moon: '🌙', heart: '❤️', flame: '🔥', bolt: '⚡',
};

export function routineEmoji(value) {
  if (!value) return DEFAULT_EMOJI;
  if (!/^[A-Za-z]+$/.test(value)) return value;
  return GLYPH_EMOJI[value] || DEFAULT_EMOJI;
}

export function restTimerPush(lang) {
  const copy = copyFor(lang);
  return { title: copy.restTitle, body: copy.restBody, tag: 'rest-timer' };
}

export function testPush(lang) {
  return { title: 'JelloGym', body: copyFor(lang).testBody, tag: 'test' };
}

export function dayReminderPush(lang, routine) {
  const copy = copyFor(lang);
  return {
    title: routine
      ? `${routineEmoji(routine.emoji)} ${routine.name} ${copy.dayRoutineSuffix}`
      : copy.dayFallbackTitle,
    body: copy.dayBody,
    tag: 'day-reminder',
  };
}

// The missed-workout nudge (nudge.js). Its copy is translated in the frontend packs and generated
// into nudge-copy.js, so every language the app speaks has it — unlike the strings above, which
// predate that and fall back to English. de-CH is de with ß written ss, as in the frontend
// (lib/i18n-core.js DERIVED_LOCALES).
const nudgeCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return Object.fromEntries(Object.entries(NUDGE_COPY.de).map(([k, c]) => [k, { title: ch(c.title), lines: c.lines.map(ch) }]));
  }
  return NUDGE_COPY[lang] || NUDGE_COPY.en;
};
export function nudgePush(lang, tone, routine, iso) {
  const copy = nudgeCopyFor(lang)[NUDGE_COPY.en[tone] ? tone : 'friendly'];
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  const name = routine?.name || 'JelloGym';
  return { title: copy.title, body: line.replace('{0}', () => name), tag: 'nudge' };
}

// The behind-on-water nudge (nudge.js waterNudgeFor, docs/LIFE_MODULES.md 1d): same generated
// copy mechanism, its own tag so a fresh one replaces the last.
const waterCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return { title: ch(WATER_COPY.de.title), lines: WATER_COPY.de.lines.map(ch) };
  }
  return WATER_COPY[lang] || WATER_COPY.en;
};
export function waterPush(lang, p, iso) {
  const copy = waterCopyFor(lang);
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  return { title: copy.title, body: line.replace('{0}', () => String(p.left)), tag: 'water-nudge' };
}

// The habit reminder digest (lib/nudge.js habitNudgeFor): the open habits' names in one line.
const habitCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return { title: ch(HABIT_COPY.de.title), lines: HABIT_COPY.de.lines.map(ch) };
  }
  return HABIT_COPY[lang] || HABIT_COPY.en;
};
export function habitPush(lang, open, iso) {
  const copy = habitCopyFor(lang);
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  return { title: copy.title, body: line.replace('{0}', () => open.names), tag: 'habit-nudge' };
}
