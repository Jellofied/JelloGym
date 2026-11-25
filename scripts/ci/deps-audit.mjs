#!/usr/bin/env node
// npm audit for each package directory, split the way it matters: what ships (runtime
// dependencies: in the images, the APK, the IPA) and what only builds and tests it (dev).
// Fails when a shipped dependency has a high or critical advisory; dev findings are listed.
// Reads the lockfiles only, so it needs no `npm ci`.
//
//   node scripts/ci/deps-audit.mjs frontend api mcp
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dirs = process.argv.slice(2)

// Getting npm to run on every machine this script is used on is not one call:
//   - Windows: `npm` is npm.cmd, and CreateProcess will not resolve it (ENOENT); going through a
//     shell works but Node then warns that the arguments are only concatenated (DEP0190), and the
//     warning lands in the job summary this script writes;
//   - Linux and macOS: plain `npm` is fine, and the file next to the node binary is not always
//     there (a distro package puts it under /usr/lib).
// So: run the npm CLI through this very node when it can be found next to it (the npm that ships
// with Node on Windows, and a normal `brew`/nodesource install), and otherwise call `npm` as
// before. Same JSON either way.
const npmEntry = () => {
  const dir = dirname(process.execPath)
  return [
    join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find(p => existsSync(p)) || null
}
const ENTRY = npmEntry()

const audit = (dir, omitDev) => {
  const args = ['audit', '--json', ...(omitDev ? ['--omit=dev'] : [])]
  const cmd = ENTRY ? process.execPath : 'npm'
  const all = ENTRY ? [ENTRY, ...args] : args
  let out
  try {
    out = execFileSync(cmd, all, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = e.stdout // npm audit exits 1 when it finds anything
  }
  try { return JSON.parse(out) } catch { return { error: String(out).slice(0, 300) } }
}
const SEV = ['critical', 'high', 'moderate', 'low', 'info']
const lines = ['### Dependency audit', '', '| Package dir | Shipped: critical / high / moderate / low | Dev only: critical / high / moderate / low |', '|---|---|---|']
const details = []
let fail = false
for (const dir of dirs) {
  const prod = audit(dir, true)
  const all = audit(dir, false)
  const count = (r) => SEV.slice(0, 4).map((s) => r?.metadata?.vulnerabilities?.[s] ?? '?').join(' / ')
  const devOnly = {}
  for (const s of SEV) devOnly[s] = (all?.metadata?.vulnerabilities?.[s] || 0) - (prod?.metadata?.vulnerabilities?.[s] || 0)
  lines.push(`| ${dir} | ${prod.error ? 'audit failed' : count(prod)} | ${SEV.slice(0, 4).map((s) => devOnly[s]).join(' / ')} |`)
  const prodNames = new Set(Object.keys(prod?.vulnerabilities || {}))
  for (const [name, v] of Object.entries(all?.vulnerabilities || {})) {
    const via = (v.via || []).filter((x) => typeof x === 'object').map((x) => `${x.title} (${x.url})`)
    const shipped = prodNames.has(name)
    details.push(`- ${dir}: **${name}** ${v.severity}${shipped ? ' (shipped)' : ' (dev)'}${v.fixAvailable ? ', fix available' : ''}${via.length ? ': ' + via.slice(0, 2).join('; ') : ''}`)
    if (shipped && (v.severity === 'high' || v.severity === 'critical')) fail = true
  }
}
const md = [...lines, '', details.length ? details.join('\n') : 'No known advisories.', ''].join('\n')
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
if (fail) { console.log('::error::a shipped dependency has a high or critical advisory'); process.exit(1) }
