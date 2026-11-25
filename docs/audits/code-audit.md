# JelloGym code audit

Date: 2026-11-25
Branch: `chore/rename-to-jellogym`
Commit: `5d7e08111d694ce98ab7f63978aebfcddb3aeb93`
Scope: independent audit of that commit, including a review of `docs/audits/rename-report.md`.

## Verdict

**Needs work**

**Score: 4/5.** The rename is clean and the app's core logic and security design are strong, but API and MCP test gates are red in this environment and one API test is line-ending fragile, so this checkout is not ready to call fully green.

## What is already good

- The rename changed no runtime source or dependency files. `git diff HEAD^ HEAD -- frontend/src api/src api/server.js api/sync-stamps.js mcp/src` and the package and lockfile equivalent return no output. The failing frontend, API and MCP tests also have no content diff in the commit.
- Generated outputs are current. Catalogue, coach assets and API docs checks pass. Locales and source strings are in sync at 19 locales, 3702 keys each and 3023 translated strings.
- Sync membership is mirrored correctly. `STAMPED_MAPS` and `OWN_MERGE` match between `frontend/src/lib/sync-merge.js:95,720` and `api/sync-stamps.js:70,79`, with a parity test in `frontend/src/lib/sync-stamps-parity.test.js`. No merge logic was changed.
- Day-index reads stay linear. The `day-cache.test.js` proxy contract showed one pass per map at both 365 and 1095 days, not one pass per day.
- The auth and session code has strong defenses. Signed session payloads, version revocation, duplicate cookie refusal, paired bearer rules and the CSRF origin guard are visible at `api/server.js:575-774`, and their focused tests pass.
- The frontend suite is green here. `cd frontend && npm test` passed 670 files and 8095 tests. The two failures reported in the rename report did not reproduce, and a targeted rerun passed 40/40.
- The web and mobile bundles build. The web build passed in 4.13s. A mobile flavour build plus staged media passed `scripts/check-mobile-bundle.mjs`, including the Android and iOS public asset paths as checked by the script.
- No shipped dependency advisories were found. Only a dev-only high advisory on `happy-dom` was reported.

## Findings on the rename report

| Rename report claim | Audit result |
|---|---|
| Frontend `8093/8095 passed`, with two failures | Not reproduced. This audit got `8095/8095 passed`. The two named files passed `40/40` on a targeted rerun. Happy-dom iframe errors are noisy console output, not test failures here. |
| API failures are Windows permission and socket cases plus one existing OpenAPI error-code mismatch | Nine of ten failures are Windows permission or socket cases. The OpenAPI conclusion is wrong. The route exists at `api/openapi.yaml:1028`, the returned codes are documented, and the test fails because it searches for LF delimiters in a CRLF checkout. |
| MCP `137/138 passed`, one Windows chmod case | Confirmed, with an extra detail. Four unhandled `EPERM: operation not permitted, watch` errors also occurred. The rename report did not mention them. |
| No runtime source or dependency changes | Confirmed. |
| Generated files were regenerated | Confirmed by all three `--check` scripts passing at this commit. |

## Correctness and security issues, ranked

### C1. OpenAPI test fails on a CRLF checkout, and the report misstates the cause

**Files:** `api/test/openapi-routes.test.js:81-84`, `api/test/openapi-routes.test.js:106-107`, `api/openapi.yaml:1028`

The test searches for `\n  /api/register/password:\n`. This checkout has `core.autocrlf=true`, so the working tree file has CRLF line endings and the search returns -1. The parent blob has LF endings and `git diff --numstat HEAD^ HEAD -- api/openapi.yaml` is empty, so the content is unchanged. After normalising CRLF to LF in memory, the route is found and the operation contains 400, 409, 429 and `email-invalid`. The error codes are therefore documented.

**Proof or measurement:** a Node check reported `current: crlf 4887, lf 4887`, `parent: crlf 0, lf 4887`, `diffStat: ""`, `autocrlf: "true"`, `asCheckedOut from -1`, `normalized from 46720` with 400, 409, 429 and `email-invalid` present. The API run itself reports `openapi-routes.test.js:71` failing at line 82 with assertion text `/api/register/password`.

**Impact:** the API suite gives a false red on Windows, and the false message invites someone to "fix" a spec that is correct. A real docs drift could be missed because the test stops before checking any code.

**Fix direction:** make the parser line-ending agnostic with `\r?\n`, or read through a normaliser before searching. If the team wants one canonical line ending for YAML, add a `.gitattributes` rule and re-checkout, but the test should still tolerate both. Update the rename report conclusion to say the test is platform fragile, not that the route is missing from the spec.

### C2. API suite has nine Windows permission and socket failures

**Files:** `api/test/credential.test.js:102`, `api/test/durable.test.js:25`, `api/test/integrations.test.js:70`, `api/test/server-db-unreadable.test.js:76`, `api/test/server-media.test.js:402`, `api/test/server-health-writable.test.js:66`, `api/test/server-push-prune-save.test.js:82`, `api/test/server-recovery.test.js:146,170`

`cd api && npm test` finished with 799 passed and 10 failed. Five mode assertions saw decimal 438 where 384 or 448 was expected. The unwritable data directory health check saw 200 instead of 503. The push-prune test missed its expected save error log. The two recovery tests could not find a Unix admin socket under a Windows temp path. These are environment assumptions, not rename regressions, but they leave security relevant paths unverified on this host.

**Proof or measurement:** the API log lists the exact failures above, including `438 !== 384`, `438 !== 448`, `200 !== 503`, and `ENOENT ... jellogym-admin-u-10016968c9`.

**Impact:** the API gate is red on Windows, and checks for unwritable data, file modes, admin socket privacy and failed background saves are not actually proving their intended behavior there.

**Fix direction:** gate these cases on POSIX, or inject filesystem errors and a fake socket transport so the behavior is tested without relying on Windows `chmod` and Unix sockets. Keep a separate POSIX CI lane for the real filesystem assertions.

### C3. MCP suite has one chmod failure and four unhandled watch errors

**Files:** `mcp/test/state.test.js:92`, `mcp/test/log-workout.e2e.test.js` watcher setup

`cd mcp && npm test` finished with 137 passed, 1 failed and 4 unhandled errors. The failure expects `EACCES` after `fs.chmodSync(..., 0o600)`, but the file still reads as `null` error on Windows. Four `EPERM: operation not permitted, watch` exceptions came from `state.test.js` and `log-workout.e2e.test.js`.

**Proof or measurement:** the MCP log shows `AssertionError: expected null to be truthy` at `state.test.js:92` and four uncaught exceptions with `code: 'EPERM', syscall: 'watch'`.

**Impact:** the MCP gate is red, and Vitest warns that unhandled errors can cause false positives. A real read failure or watcher regression could be hidden by the noise.

**Fix direction:** make the permission case POSIX-only or inject a read error. Ensure test watchers are closed, and attach an `error` handler or skip watch based cases where the platform refuses `fs.watch`.

### C4. Dev-only high advisory on happy-dom

**Files:** `frontend/package.json:41`, `frontend/package-lock.json:1704`

The dependency audit reports zero shipped advisories for frontend, api and mcp. It reports one high dev-only advisory for `happy-dom` 20.14.6: incomplete fix for CVE-2026-33943 through an unsanitized import alias leading to host code execution, plus SSRF through iframe and stylesheet parsing of untrusted HTML.

**Proof or measurement:** `node scripts/ci/deps-audit.mjs frontend api mcp` printed `frontend | 0 / 0 / 0 / 0 | 0 / 1 / 0 / 0` and named both happy-dom advisories with fixes available.

**Impact:** this is not in the shipped app, but it affects the test host that parses HTML in CI and on developer machines.

**Fix direction:** upgrade to the fixed happy-dom release, then rerun the dependency audit and the frontend suite.

## Performance and maintainability issues, ranked

### P1. XP history walk is costly on a cold three-year history

**Files:** `frontend/src/lib/xp.js:24-27`, `frontend/src/lib/xp.js:168-181`, `frontend/src/components/LevelCard.jsx:18`, `frontend/src/views/StatsLife.jsx:78-97`

The walk is memoised against the state object, so repeat renders in one committed state are effectively free. The first render after an edit still walks the whole history. A synthetic dense three-year history in this audit, 548 sessions, 3285 drinks and 6570 habit checks, cost 816ms cold and 0ms warm. The source comment estimates about 400ms cold at three years, so the measured Node 24 result is about twice that.

**Proof or measurement:** a Node measurement against `xpTotals` printed `years:1, coldMs:130, warmMs:0` and `years:3, coldMs:816, warmMs:0`, with identical XP on the cached read.

**Impact:** the Level card on Home and `/stats/life` can stall first paint on a long, dense history, especially on a phone WebView slower than this host.

**Fix direction:** aggregate by week during the walk, as the source comment already suggests, or share one incremental index with the life stats helpers. Keep the pure helper and its tests as the contract.

### P2. Large JS bundles and ineffective dynamic imports

**Files:** `frontend/vite.config.js:126`, `frontend/package.json:41`

Both web and mobile builds warn about chunks over 1500 kB and ineffective dynamic imports. The mobile flavour build in ignored `dist/` has 172 JS files totalling 29336433 bytes, about 27.98 MiB. Largest chunks are `en-BJ9FHc_q.js` at 1752.8 KiB, `hi-CrhvEsuL.js` at 1547.9 KiB, `exercises-lo-P5Fv7.js` at 1196.6 KiB and `ru-CJ33ZKaN.js` at 1032.2 KiB. Vite reports that `@capacitor/core` and `src/lib/scan-web.js` are dynamically imported but also pulled in statically, so the split does not happen.

**Proof or measurement:** `cd frontend && npm run build` and `node scripts/build-mobile.mjs` both printed the warnings. A Node measurement of `frontend/dist/assets/*.js` printed the file count and totals above.

**Impact:** slow cold loads and higher WebView memory use, with locale chunks dominating. The static imports make some code-splitting work wasted effort.

**Fix direction:** remove the static imports that defeat the dynamic boundaries, review why large locale chunks are emitted twice per language, and consider splitting the exercise catalogue further. Raise the warning threshold only after the measured chunks are acceptable, not before.

### P3. Same-name test convention is uneven in `frontend/src/lib`

**Files:** examples at `frontend/src/lib/coach-schedule.js:1`, `frontend/src/lib/media-owed.js:1`, `frontend/src/lib/workout-controls.js:1`

A directory scan found 235 non-test JS files and 328 test files, with 35 source files lacking a same-name `*.test.js`. Many are covered indirectly by neighbouring tests, for example `coach-schedule.js` is exercised by `coach-api.schedule.test.js`, so this is a maintainability signal rather than a proven coverage hole.

**Proof or measurement:** a Node scan of `frontend/src/lib` excluding `.test.js` and test utility files printed `without same-name test: 35` and listed the files.

**Impact:** ownership of those helpers is less obvious, and a future change can miss the indirect test that covers them.

**Fix direction:** either add focused tests for the helpers that decide user-visible values, or document an explicit alias mapping for files intentionally tested under another name.

## Coverage by test area

The table uses `areaOf` from `scripts/ci/test-areas.mjs` on tracked files under `frontend/src`, `api`, `mcp/src` and `mcp/test`. Cases are static `it(` and `test(` declarations. Dynamic or generated cases can be undercounted, so use the runtime totals in the verification table for exact pass counts. First match wins, as defined by the script.

| Area | Test files | Test cases | Source files | Cases per source file |
|---|---:|---:|---:|---:|
| Workout logging | 158 | 1862 | 65 | 28.6 |
| Other | 109 | 1189 | 89 | 13.4 |
| Progression, 1RM & stats | 57 | 941 | 30 | 31.4 |
| Coach (AI) | 49 | 664 | 50 | 13.3 |
| Sync & no data loss | 58 | 589 | 13 | 45.3 |
| Exercise catalogue & media | 62 | 506 | 78 | 6.5 |
| Accounts, auth & security | 48 | 465 | 21 | 22.1 |
| Other UI | 72 | 431 | 64 | 6.7 |
| Rest timer & alerts | 40 | 417 | 16 | 26.1 |
| Import, export & backup | 36 | 390 | 18 | 21.7 |
| Phone, watch & health apps | 31 | 259 | 18 | 14.4 |
| Plates & equipment | 24 | 231 | 7 | 33.0 |
| App state & API server | 25 | 187 | 6 | 31.2 |
| Languages | 11 | 56 | 24 | 2.3 |

Totals from the static classification: 780 test files, 8187 declared cases, 499 source files. The areas with the strongest declared coverage relative to source size are sync, progression and stats, and plates. The thinnest relative areas are languages and exercise media, though generated files and exact equality checks explain some of that.

## Verification table

| Command or measurement | Result |
|---|---|
| `git status --short --branch` | `## chore/rename-to-jellogym`, clean working tree |
| `git rev-parse HEAD` | `5d7e08111d694ce98ab7f63978aebfcddb3aeb93` |
| `git diff --check` | Pass, no output |
| `git diff --name-only HEAD^ HEAD -- frontend/src api/src api/server.js api/sync-stamps.js mcp/src` | No output |
| `git diff --name-only HEAD^ HEAD -- */package.json */package-lock.json` | No output |
| `cd frontend && npm test` | 670 files, 8095 tests passed, 356.26s |
| `cd frontend && npx vitest run src/lib/backup-media.test.js src/views/GymReminder.test.jsx` | 2 files, 40 tests passed, 13.98s |
| `cd api && npm test` | 809 tests, 799 passed, 10 failed, 194.24s. Failures listed in C1 and C2. |
| `cd mcp && npm test` | 138 tests, 137 passed, 1 failed, 4 unhandled errors, 5.35s |
| `cd frontend && node scripts/check-locales.mjs` | Pass, 19 locales, 3702 keys each |
| `cd frontend && node scripts/check-source-strings.mjs --strict` | Pass, 3023 strings, all present |
| `node scripts/catalogue/build.mjs --check` | Pass, 5632 exercises and generated files current |
| `node scripts/build-coach-assets.mjs --check` | Pass |
| `node scripts/build-api-docs.mjs --check` | Pass, 92 endpoints, 32 schemas, 356.9 KB |
| `cd frontend && npm run build` | Pass, 4.13s, chunk and dynamic import warnings |
| `cd frontend && node scripts/build-mobile.mjs`, then stage media and `node scripts/check-mobile-bundle.mjs` | Pass. `Mobile bundle OK in dist, android/app/src/main/assets/public, ios/App/App/public.` `cap sync` was not run. |
| `node scripts/ci/deps-audit.mjs frontend api mcp` | Zero shipped advisories in all three packages, one high dev-only happy-dom advisory in frontend |
| `STAMPED_MAPS` and `OWN_MERGE` comparison across frontend and api | Exact match in both mirrored files |
| `day-cache.test.js` proxy measurement at 365 and 1095 days | 731 and 2191 walks for five maps on both reads, confirming one pass per map |
| `xpTotals` measurement at 1 and 3 years | 130ms and 816ms cold, 0ms warm, stable results |
| JS size measurement of mobile `frontend/dist/assets` | 172 files, 29336433 bytes, 27.98 MiB |
| `git status --short --untracked-files=all` after all checks | No output |

## Limits and unresolved blockers

- Environment Node is `v24.16.0`, while the repository documents Node 22 for CI and Docker. Some timings and happy-dom behavior may differ from CI.
- The requested `understand-anything` and `archify` skills were permission denied, so codebase mapping and architecture review were done manually.
- Android and iOS native builds, Docker image builds and Nix evaluation were not run. The mobile web bundle was built and checked in ignored `dist/`, but `cap sync` was not run.
- No application source, branch, remote or git history was modified. The only file written by this audit is this report.
