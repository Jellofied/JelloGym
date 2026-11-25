/* Test-only fault injection for child servers on hosts where chmod cannot deny writes (Windows,
 * root, Windows CI). A marker file in DATA_DIR turns one real write path into an EACCES at the
 * moment under test, so the server's handling is exercised without changing its runtime code. */
const fs = require('node:fs');
const path = require('node:path');
const openSync = fs.openSync;
const writeFileSync = fs.writeFileSync;
const marked = name => !!process.env.DATA_DIR && fs.existsSync(path.join(process.env.DATA_DIR, name));
const denied = (syscall, p) => Object.assign(new Error(`${syscall} ${p}: injected EACCES`), { code: 'EACCES', syscall, path: p });

fs.openSync = function (p, ...rest) {
  if (typeof p === 'string' && p.endsWith('db.json.tmp') && marked('.fail-db-save')) throw denied('open', p);
  return openSync.call(this, p, ...rest);
};
fs.writeFileSync = function (p, ...rest) {
  if (typeof p === 'string' && path.basename(p).startsWith('.health-') && marked('.fail-health-write')) throw denied('write', p);
  return writeFileSync.call(this, p, ...rest);
};
