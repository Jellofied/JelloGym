# JelloGym design audit

Branch: `chore/rename-to-jellogym`, commit `5d7e08111`
Date: Wed Nov 25 2026
Scope: frontend dev server (`http://localhost:5173`) with the API on `:3000`, inspected as a guest with every life module switched on through Settings > Modules. No source, branch, remote, or git history was modified. The only files written are this report and the screenshots under `docs/audits/screenshots/design/`.

## Verdict

Needs work

Score: 3 / 5: the app has a clean, consistent design system with working module gating and helpful empty states, but a visible "Invalid Date" defect on /recap and several responsive / accessibility areas could not be verified.

## What is already good

- One cohesive dark theme across every screen, with consistent type (Geist) and spacing.
- Navigation is predictable: a bottom tab bar (Home, Workout, Actions, Life, Stats) plus the idle Start disc that opens the Actions hub. The Life tab appears only once a life module is on.
- Module toggles actually work: switching Water off in Settings > Modules removes the Water card from Home, hides /water, and redirects a direct /water visit back to Home. Nothing is deleted.
- Empty states are present and worded helpfully ("No habits yet", "No data yet", "Nothing saved yet", "No rotation yet").
- Progress rings appear on Water, Level, and Home cards, using the same shared ring pattern.
- Each screen has a clear title and a short plain-English subtitle.
- The settings information architecture is sensible: Modules first, then grouped rows (workout, alerts, reminders, plan, units, water, habits, food, health-goals, equipment, look, coach, watch, zepp, integrations, data, about).

## Top issues ranked by severity

### Blocking

**1. /recap shows "Invalid Date" for the week range**
- Screen: /recap
- Screenshot: docs/audits/screenshots/design/recap-desktop-1.jpg
- What proves it: the page header reads "Your week Invalid Date" and the body says "Nothing was logged in this stretch." A real date range should be shown instead.
- Suggested fix direction: fix the date formatting in views/Recap.jsx so the week label renders a valid local date range instead of "Invalid Date".

**2. Lazy-loaded screens can flash blank on first chunk load**
- Screen: any lazy view (Water, Habits, Sleep, Food, Level, StatsLife, Plan, Library, ...)
- Screenshot: not directly capturable; timing-dependent
- What proves it: App.jsx wraps every lazy view in `<Suspense fallback={null}>` (lines 70-78), so while a chunk loads the screen renders nothing. On a cold start or slow network the user sees a blank frame before the page appears.
- Suggested fix direction: replace `fallback={null}` with a subtle skeleton or spinner so a load never looks like a broken empty screen.

### Polish

**3. Mobile viewport, touch targets, safe areas, focus visibility, contrast, and reduced motion could not be verified**
- Screen: all
- Screenshot: none
- What proves it: the OpenChamber browser panel did not honor the requested viewport size (captures came back at a fixed ~611-939 px wide body regardless of the requested desktop or mobile size), so a true mobile portrait (about 375-390 px) was never inspected. Touch-target sizes, safe-area insets, focus-visible rings, contrast ratios, and prefers-reduced-motion behavior were therefore not observed.
- Suggested fix direction: re-run this audit in a browser that can set an explicit viewport and check touch targets (at least 44x44 px), safe areas, focus rings, WCAG contrast, and reduced-motion handling.

**4. The onboarding tour can block the Settings gear until dismissed**
- Screen: Home (sign-in / first boot)
- Screenshot: docs/audits/screenshots/design/login-desktop-1.jpg
- What proves it: the first click on the Settings gear was rejected because a `div.tour-block` backdrop was drawn over it ("drawn over button[aria-label=Settings]"). The tour had to be dismissed before Settings could be reached.
- Suggested fix direction: ensure the tour backdrop never covers the Settings gear, or make the backdrop dismissible with one tap so new users are not locked out of Settings.

**5. Habit detail could not be reached**
- Screen: /habits/:id
- Screenshot: none
- What proves it: /habits is an empty state ("No habits yet") with no habit created, so there is no habit row to tap into /habits/:id. Creating a habit requires opening the create/edit sheet, which was not reached during this session.
- Suggested fix direction: verify /habits/:id manually after creating at least one habit, checking the detail sheet, schedule picker, and check-in flow.

## Coverage table

| Screen / flow | Visited | Screenshot | Notes |
|---|---|---|---|
| Home | yes | home-desktop-2-moduleson.jpg | card stack visible when all modules on |
| Actions hub (idle Start disc) | yes | actionshub-desktop-1.jpg | disc reads "Actions" when idle |
| Plan | yes | plan-desktop-1.jpg | Fixed Week / Rotation toggles |
| Exercise library | yes | library-desktop-1.jpg | 5,632 exercises, filters |
| Workout | yes | workout-desktop-1.jpg | "Start workout" on a rest day |
| Water | yes | water-desktop-1.jpg | quick-add cups +250 +50, 0% ring |
| Habits | yes | habits-desktop-1.jpg | empty state "No habits yet" |
| Habit detail | no | none | no habit exists to open |
| Steps | yes | steps-desktop-1.jpg | "0 STEPS TODAY of 8,000" |
| Sleep | yes | sleep-desktop-1.jpg | "No data yet", week/2 weeks/month |
| Food | yes | food-desktop-1.jpg | kcal and protein goals |
| Food saved | yes | foodsaved-desktop-1.jpg | "Nothing saved yet" |
| Level | yes | level-desktop-1.jpg | "0 xp so far 0 / 100" |
| Recap | yes | recap-desktop-1.jpg | "Invalid Date" defect |
| Stats / Life | yes | statslife-desktop-1.jpg | Training / Life segmented control |
| Settings (root) | yes | settings-desktop-1.jpg | grouped rows, Modules first |
| Settings > Modules | yes | settings-modules-desktop-2-allon.jpg | all switches on |
| Module off hides traces | yes | water-blocked-desktop-1.jpg | /water redirected to /home |
| Sheet dismissal / undo | partial | none | sheets are modal overlays not inspectable; undo toast not triggered |
| Back behaviour | partial | none | hash router; not exercised click-by-click |

## Method notes

- The app was run as a guest so no passkey ceremony was needed. Every life module (water, habits, steps, sleep, food, levels) was switched on through the app's own Settings > Modules UI before visiting the life screens.
- The tour overlay ("How much app do you want?") appeared on first boot and was dismissed with Skip.
- Screenshots were taken at whatever viewport the browser panel rendered (a fixed narrow width); a deliberate desktop versus mobile comparison was not possible.
