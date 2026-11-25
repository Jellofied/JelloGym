/* Shared platform gates and fault injection for the MCP tests. */
import fs from 'node:fs'
import { vi } from 'vitest'

// Windows fs.watch can raise EPERM when a watched temp file is removed after the test has ended.
// Tests that need a real watcher run off Windows; the rest use the stub below, closed in teardown.
export const realWatchAllowed = (platform = process.platform) => platform !== 'win32'
export const watchReason = 'Windows fs.watch emits EPERM when a watched temp file is removed'

// Windows chmod does not produce EACCES, so give the state reader the same error it gets on POSIX.
export const permissionDenied = file => Object.assign(new Error(`EACCES: permission denied, '${file}'`), { code: 'EACCES' })

export function stubWatch() {
  const watchers = []
  const watch = vi.spyOn(fs, 'watch').mockImplementation(() => {
    const watcher = {
      close: vi.fn(),
      unref: vi.fn(),
      on: vi.fn().mockReturnThis()
    }
    watchers.push(watcher)
    return watcher
  })
  let restored = false
  return {
    watch,
    watchers,
    restore() {
      if (restored) return
      restored = true
      for (const watcher of watchers) watcher.close()
      watch.mockRestore()
    }
  }
}
