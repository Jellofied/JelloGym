// The words of Settings → Modules (lib/modules.js), each written inside t() so that
// scripts/check-source-strings.mjs finds them: a key handed over in a variable is invisible to it
// and would quietly stay English. modules.js keeps the same English, which the settings search
// matches on; modules-copy.test.js holds the two together.
import { t } from './i18n.js'

export const moduleCopy = () => ({
  effort: [t('Effort'), t('Rate each set in RIR or RPE, and see in Stats how hard you really push.')],
  plates: [t('Plates and warm-ups'), t('The plates to load under every set, and warm-ups that build themselves.')],
  strength: [t('Strength levels'), t('Beginner to Elite for your main lifts, measured against your body weight.')],
  videos: [t('Form videos'), t('Film a set and watch it back right under the row.')],
  watch: [t('Watch'), t('Log sets from your wrist on an Apple Watch, Wear OS or Zepp watch.')],
  checkin: [t('Gym check-in'), t('Your membership codes on Home, and NFC stickers that start a workout.')],
  body: [t('Body'), t('Weigh-ins, measurements, progress photos and your weight goal.')],
  health: [t('Health'), t('Apple Health or Health Connect, heart rate and recovery tips.')],
  water: [t('Water'), t('A daily goal, quick-add cups and a ring on Home.')],
  habits: [t('Habits'), t('Routines you check in place, with streaks and rest-day-aware skipping.')],
  steps: [t('Steps'), t('Your daily steps, read from Health Connect. Nothing to log.')],
  sleep: [t('Sleep'), t('Nights from Health Connect, with a goal and a ring.')],
  food: [t('Food'), t('Calories and protein, a tap to repeat yesterday, saved foods and meals.')],
  motivation: [t('Motivation'), t('Streaks, challenges, badges, recaps and your year in JelloGym.')],
  levels: [t('Levels'), t('Consistency-weighted XP from every module, milestones and streak freezes.')],
  coach: [t('AI Coach'), t('Reviews your training and suggests changes. You still say yes or no.')],
  integrations: [t('Integrations'), t('Webhooks for Home Assistant and friends, and the MCP server.')],
  seasonal: [t('Seasonal themes'), t('Halloween, Christmas and the advent calendar. Spooky, festive, optional.')],
})

export const groupCopy = () => ({
  training: t('Training'),
  body: t('Body and health'),
  life: t('Life'),
  extras: t('Extras'),
})

export const presetCopy = () => ({
  training: [t('Just training'), t('Log, plan, progress. Nothing else on the screen.')],
  body: [t('Training and body'), t('Plus weigh-ins, measurements, photos and your health apps.')],
  all: [t('Everything'), t('Streaks, the Coach, themes, the lot.')],
})
