#!/usr/bin/env node
/* Run after `npm run build:mobile`'s `cap sync`: is what went into the native shells the phone
 * build, whole?
 *
 * A web `vite build` that runs into the same dist/ between the mobile build and `cap sync` (two
 * builds in one worktree) leaves the web index.html beside the mobile chunks, and the APK then
 * opens the web app: no Android-only settings, a service worker, the passkey login screen. A
 * build that skipped stage-media.mjs ships the phone shell with no exercise pictures at all —
 * a 1.4.4 test APK went to a phone exactly like that. Each copy is checked for
 *   - the flavour tag the mobile build writes into index.html (vite.config.js, `jellogym-flavor`),
 *   - every script and stylesheet index.html loads, present beside it,
 *   - a stamped service worker (no `__BUILD__` left in sw.js),
 *   - staged exercise media: stills (webp) and animations (mp4 or webp).
 *
 * Usage: node scripts/check-mobile-bundle.mjs [frontend dir]   — exit code 1 on any problem. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COPIES = [
  'dist',
  'android/app/src/main/assets/public',
  'ios/App/App/public',
]

export function checkCopy(dir) {
  const problems = []
  const html = join(dir, 'index.html')
  if (!existsSync(html)) return [`${dir}: no index.html`]
  const text = readFileSync(html, 'utf8')
  if (!/<meta\s+name="jellogym-flavor"\s+content="mobile"/.test(text))
    problems.push(`${dir}/index.html is not the mobile build (no jellogym-flavor meta) — another build ran into dist/?`)
  for (const [, ref] of text.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g))
    if (!existsSync(join(dir, ref))) problems.push(`${dir}/index.html loads ${ref}, which is missing`)
  const sw = join(dir, 'sw.js')
  if (existsSync(sw) && readFileSync(sw, 'utf8').includes('__BUILD__'))
    problems.push(`${dir}/sw.js is not stamped (__BUILD__ left in it)`)
  const hasFiles = (sub, exts) => {
    try { return readdirSync(join(dir, 'exercise-media', sub), { withFileTypes: true }).some(e => e.isFile() && exts.some(x => e.name.endsWith(x))) }
    catch { return false }
  }
  if (!hasFiles('still', ['.webp']))
    problems.push(`${dir}/exercise-media/still has no .webp stills — stage-media.mjs did not run?`)
  if (!hasFiles('clip', ['.mp4', '.webp']))
    problems.push(`${dir}/exercise-media/clip has no animations — stage-media.mjs did not run?`)
  return problems
}

export function checkMobileBundle(root) {
  const copies = COPIES.map(rel => join(root, rel)).filter((dir, i) => i === 0 || existsSync(dir))
  return copies.flatMap(checkCopy)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'))
  const problems = checkMobileBundle(root)
  if (problems.length) {
    for (const p of problems) console.error('✗ ' + p)
    process.exit(1)
  }
  console.log('Mobile bundle OK in ' + COPIES.filter(rel => existsSync(join(root, rel))).join(', ') + '.')
}
