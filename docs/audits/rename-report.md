# JelloGym rename report

Date: 2026-11-25
Branch: `chore/rename-to-jellogym`
Checkpoint: `wip/pre-rename-checkpoint` at `afba16933000d080d1f7f6358e4e3b3cd9d8af37`
Commit message: `chore: rename openGym to JelloGym`

## Status

The rename is applied and verified. This report is included in the rename commit.
The commit SHA is reported in the completion message, because a commit cannot
contain its own final SHA. Nothing was pushed and no remote, upstream or GitHub
state was changed.

The change has 128 tracked files with content edits, one 100 per cent file rename
(`contrib/nix/opengym.nix` to `contrib/nix/jellogym.nix`), and this report.

## Scan method

`rg` is not installed in this environment. All scans use tracked files only:

```bash
git grep -I -i -n 'opengym' -- . ':(exclude)catalogue/media/**'
```

Before edits: 5,938 matching lines in 4,539 tracked files.
Case variants: `opengym` 5,033, `openGym` 901, `OpenGym` 24, `OPENGYM` 20.
Existing canonical `jellogym` refs before edits: 4,189 lines in 632 files.

After edits: 5,082 matching lines in 4,459 tracked files.
Case variants: `opengym` 4,714, `openGym` 381, `Opengym` 0, `OpenGym` 0, `OPENGYM` 0.

A diff audit compared every URL in removed and added lines. Zero URLs were lost
or gained. Added lines containing the old name are limited to three intentional
cases: two Ko-fi URLs and the legacy `openGym.apk` release filename in a signing
example.

## Applied changes

### Product identity and current prose

Changed current product naming in repository and deployment prose, including
`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`,
`renovate.json`, `package-lock.json`, 18 docs files, 12 website files,
`.github/`, `.gitlab-ci.yml`, GitLab issue templates, Fastlane metadata and
changelogs, Helm, Kubernetes, `web/`, `scripts/README.md` and SVG assets.

Frontend source strings were already canonical where they name the product.
The remaining `openGym` strings in `frontend/src/locales/*.js` are the
`Documents/openGym` backup folder or preserved URLs.

### Build and deployment identity

Changed the Compose project name, GHCR image names, OCI image title, Helm and
Kubernetes release names, cloudflare and Fastlane build names, and stale CI
names. `.github/workflows/ios.yml` now matches the existing current constants
in the native source (`ch.jellogym.app`, `JelloGymWidgetPreview`,
`JelloGymWatchDemo` and the related launch arguments). No native source file
was changed.

### Configuration names already migrated in code

The MCP source already reads `JELLOGYM_DATA`, `JELLOGYM_UID`, `JELLOGYM_URL` and
`JELLOGYM_TOKEN`. `mcp/README.md` and the Nix module now use those names.
`OPENGYM_*` and `OPENGYM` are gone. Internal Nix bindings are
`hostJellogymPkgs` and `defaultJellogymPkgs`. No runtime code changed in this
bucket.

### Generated files

Generated files were regenerated with their scripts, not hand edited:

- `node scripts/catalogue/build.mjs`
- `node scripts/build-coach-assets.mjs`
- `node scripts/build-api-docs.mjs`

The pre-rename `--check` scripts were red because committed generated outputs
lagged their sources. Regeneration is part of this change.

## Preserved occurrences

### Provenance and external links

Upstream repository links and badges stay exact, including
`github.com/DuarteSantos8/openGym`, `gitlab.com/DuarteSantos8/opengym`,
`gitea.com/DuarteSantos/openGym`, `duartesantos8.github.io/openGym` and
`kurktchiev/openGym`. External URLs stay exact, including `https://opengym.ch`,
`ko-fi.com/opengym`, the Google tester group and Play testing link, and
`api/Dockerfile` image source labels. No replacement domain or upstream
repository was supplied.

### Legal and licensing provenance

Old product name stayed in `NOTICE.md`, the Gym visual media notices,
`README.md`, `catalogue/README.md`, `docs/FAQ.md`, `docs/NIX.md`, Fastlane's
store description, and the licence phrases "licensed for openGym",
"licensed to openGym", "for use in openGym only" and "openGym only" where they
describe the media grant. `catalogue/exercises/*.json` keeps
`"textSource": "opengym"` on 4,308 exercises. The AGPL licence itself is
unchanged.

### Historical records

`CHANGELOG.md` keeps the product name used when each release shipped.
Published iOS bundle IDs stay in `docs/APP_STORES.md` and `docs/MOBILE.md`.

### Compatibility IDs and paths

Legacy data names stay readable: `Documents/openGym`, `opengym-state.json`,
`opengym-health.json`, `opengym-stash.json`, `opengym-backup`,
`ch.duartesantos.opengym`, `opengym-` Health Connect record IDs,
`_opengym_pack`, `opengym_r_server`, `openGym` release filenames, and the old
app IDs in `website/.well-known/apple-app-site-association`,
`website/.well-known/assetlinks.json` and the release docs. Localisation source
keys keep those names byte-for-byte.

## Verification

All commands ran from the repository root unless stated otherwise.

```text
git diff --check                                        PASS, clean
node scripts/catalogue/build.mjs --check                PASS
node scripts/build-coach-assets.mjs --check             PASS
node scripts/build-api-docs.mjs --check                 PASS
cd frontend && node scripts/check-locales.mjs            PASS, 19 locales, 3702 keys each
cd frontend && node scripts/check-source-strings.mjs --strict
                                                        PASS, 3023 strings
cd frontend && npm run build                            PASS
cd frontend && npm test                                 8093/8095 passed
cd api && npm test                                      799/809 passed
cd mcp && npm test                                      137/138 passed
```

Frontend full-suite failures were `src/lib/backup-media.test.js` at the 5 s
limit and one debounce assertion in `src/views/GymReminder.test.jsx` with
happy-dom iframe load errors. Neither test nor its source module has a diff in
this change. A targeted rerun of those two files passed 40/40.

API failures are Windows permission and socket cases, plus one existing
OpenAPI error-code mismatch. Five file-mode assertions saw 438 instead of
384 or 448, one health check saw 200 instead of 503 for an unwritable data
directory, one push-prune check missed an expected log line, two recovery
tests could not use the admin socket, and `api/test/openapi-routes.test.js`
reported `/api/register/password` missing from the spec. `api/openapi.yaml`,
the failing API tests and all API source files have no content diff in this
change.

The MCP failure is a Windows `chmod 0o600` case that still allowed the read;
the test expected `EACCES`. `mcp/README.md` is the only changed file under
`mcp/`.

Checks not run locally: Android and iOS native builds, Nix flake evaluation and
Docker image builds. There is no Android, macOS or Nix toolchain in this
environment, and no native source or build logic changed. The iOS CI workflow
was only aligned with constants already present in the native source.

## Decisions still open

No replacement product domain was supplied. `https://opengym.ch` and its
subdomains stay live. If JelloGym has a new domain, a follow-up can replace the
URLs together with DNS, PWA, OAuth and associated-domains, and store metadata.

No replacement upstream repository was supplied. Provenance links stay pointing
at the existing GitHub, GitLab and Gitea history.
