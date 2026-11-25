/* The platform gates and watcher cleanup behind the MCP test suite. */
import { test, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { permissionDenied, realWatchAllowed, stubWatch, watchReason } from './helpers.js'

test('real watch runs only where the host can support it', () => {
  expect(realWatchAllowed('win32')).toBe(false)
  expect(realWatchAllowed('linux')).toBe(true)
  expect(realWatchAllowed('darwin')).toBe(true)
  expect(watchReason).toMatch(/Windows fs\.watch/)
})

test('an injected EACCES keeps the code and the file it names', () => {
  const file = path.join('data', 'state-alex.json')
  const err = permissionDenied(file)
  expect(err.code).toBe('EACCES')
  expect(err.message).toContain(file)
})

test('the watch stub closes every watcher before it restores fs.watch', () => {
  const watches = stubWatch()
  try {
    const first = fs.watch('state-alex.json')
    const second = fs.watch('db.json')
    expect(watches.watchers).toHaveLength(2)
    watches.restore()
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(second.close).toHaveBeenCalledTimes(1)
  } finally {
    watches.restore()
  }
})

test.skipIf(!realWatchAllowed())('a real watcher is error handled and closed before its temp dir goes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-watch-'))
  const file = path.join(dir, 'state-alex.json')
  fs.writeFileSync(file, '{}')
  const errors = []
  let watcher
  try {
    watcher = fs.watch(file, () => {})
    watcher.on('error', e => errors.push(e))
    expect(errors).toEqual([])
  } finally {
    watcher?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
  expect(errors).toEqual([])
})
