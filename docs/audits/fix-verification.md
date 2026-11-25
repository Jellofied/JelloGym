# Audit fix verification

Host: Windows, Node `v24.16.0`. Date: 25 November 2026. All nine fixes were
cherry-picked onto `integration/audit-fixes` from `4af364ccd` with no conflicts.

## Verdict after the fixes

- **Code: good, with stated limits.** All six ranked findings in the code audit
  are closed and the full local gates are green. POSIX-only assertions, Android
  and iOS native builds, Docker images and Nix evaluation were not run here, so
  they are not claimed as verified.
- **Design: good on the flows that were observed.** The three observed defects
  are fixed and the first load no longer shows a blank frame. True mobile
  portrait, touch targets, safe areas, focus rings, contrast and reduced motion
  still lack screenshot evidence because the browser panel did not honour the
  requested viewport during the audit.
- **Efficiency: improved and measured.** The cold three-year XP walk went from
  448.82 ms to 32.11 ms with identical XP and level. Web JS shrank by 19,484
  bytes and mobile JS by 30,705 bytes, and both ineffective dynamic-import
  warnings are gone.

## Fixes integrated

| Finding | Original branch | Integrated commit | Evidence |
|---|---|---|---|
| `/recap` showed `Invalid Date` | `fix/recap-invalid-date` at `20ce2cca4` | `abc016d1f` | Pure `shownRecapPeriod` helper and regression test |
| Null Suspense fallback on lazy routes | `fix/lazy-route-loading` at `ed9bba78a` | `20d44b1d2` | Shared `RouteLoading`, reserved space, reduced-motion support, source-pinning test |
| Tour backdrop blocked Settings | `fix/tour-settings-access` at `99f4def89` | `bf35cfbff` | Any backdrop tap now dismisses the tour like Skip |
| OpenAPI false red on CRLF | `fix/openapi-crlf-test` at `d42b62b63` | `4673b7e91` | Reader normalises line endings, fixture pins LF and CRLF, spec untouched |
| Nine API platform failures | `fix/api-platform-tests` at `421cd6d42` | `81f20f0f5` | POSIX cases gated with reasons, injected write faults keep two security paths active |
| MCP chmod failure and watch errors | `fix/mcp-platform-tests` at `3481092ce` | `538566957` | Injected read error, watchers closed, platform test pins cleanup |
| Dev-only `happy-dom` advisory | `fix/happy-dom-advisory` at `9f44a7119` | `7a9e38911` | `20.14.6` to `21.0.4`, dependency audit clean |
| Cold XP walk | `fix/xp-cold-walk` at `0d9a02e6c` | `05e62f7c0` | Week-keyed counts, output-equality tests, benchmark before and after |
| Ineffective dynamic imports | `fix/bundle-splitting` at `099642f7a` | `4e70442f7` | Static imports removed from `boot.js` and `CameraScan.jsx`, builds measured |

## Gate rerun on the integrated branch

| Command | Result |
|---|---|
| `cd frontend && npm test` | 673 files, 8,105 tests passed, 0 failed |
| `cd frontend && npm run build` | Passed, web build 11.93 s |
| `cd frontend && npm run build:mobile` | Passed, `cap sync` completed |
| `cd frontend && node scripts/check-mobile-bundle.mjs` | `Mobile bundle OK in dist, android/app/src/main/assets/public, ios/App/App/public.` |
| `cd frontend && node scripts/check-locales.mjs` | 19 locales, 3,702 keys each, in sync |
| `cd frontend && node scripts/check-source-strings.mjs --strict` | 3,023 translated strings present in locale packs |
| `node scripts/catalogue/build.mjs --check` | 5,632 exercises, generated files up to date |
| `node scripts/build-coach-assets.mjs --check` | Coach library and prompts in sync |
| `node scripts/build-api-docs.mjs --check` | `website/api.html` in sync, 92 endpoints, 32 schemas |
| `cd api && npm test` | 812 tests, 810 passed, 0 failed, 2 explicit POSIX skips |
| `cd mcp && npm test` | 142 tests, 141 passed, 1 explicit Windows watch skip, no unhandled errors |
| `node scripts/ci/deps-audit.mjs frontend api mcp` | Zero shipped and zero dev advisories in all three packages |
| `git diff --check 4af364ccd..HEAD` | Clean |

The combined run hit the host's 10 minute shell limit while MCP started. The
remaining gates were rerun separately and all passed. The first standalone
bundle check used the wrong directory and was rerun from `frontend/`.

## Decisions and limits

- The large generated exercise packs were left alone. The chunks named after
  languages are four generated pack families with the same base name, and the
  biggest are exercise instructions, not UI locale files. Merging them would
  change generated file names and the detail-loader contract. That is too risky
  for a behaviour-preserving bundle fix. The remaining build warning is chunk
  size only, and the threshold was not raised.
- POSIX mode and Unix socket assertions still run on POSIX. They were skipped
  here with printed reasons. No POSIX CI lane was added in this pass.
- `cap sync` reported that CocoaPods and `xcodebuild` are absent, so pod install
  and the Xcode clean step were skipped. Native compilation was not attempted.
- Host Node is `v24.16.0`; CI and the images pin Node 22. Timings may differ in
  CI, but the result equality tests do not depend on the host version.
