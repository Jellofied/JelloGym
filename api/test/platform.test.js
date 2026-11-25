/* The host gates and the injected write faults behind the Windows-safe API tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { posixOnly, posixModeReason, unixSocketReason, writeFaultFlag } from './helpers.mjs';

test('the POSIX-only gate follows the host and carries a reason', () => {
  assert.equal(posixOnly, process.platform !== 'win32');
  assert.match(posixModeReason, /Windows chmod/);
  assert.match(unixSocketReason, /Unix admin socket/);
  assert.ok(fs.existsSync(writeFaultFlag.slice('--require='.length)));
});

test('write faults are injected only for the marked path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-faults-'));
  try {
    const script = [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "const dir = process.env.DATA_DIR;",
      'const out = {};',
      "try { fs.writeFileSync(path.join(dir, '.health-probe'), ''); out.health = 'ok'; } catch (e) { out.health = e.code; }",
      "try { const fd = fs.openSync(path.join(dir, 'db.json.tmp'), 'w'); fs.closeSync(fd); out.db = 'ok'; } catch (e) { out.db = e.code; }",
      'console.log(JSON.stringify(out));'
    ].join('\n');
    const run = () => JSON.parse(execFileSync(process.execPath, [writeFaultFlag, '--input-type=module', '-e', script], {
      env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8'
    }));
    assert.deepEqual(run(), { health: 'ok', db: 'ok' });
    fs.writeFileSync(path.join(dir, '.fail-health-write'), '');
    assert.deepEqual(run(), { health: 'EACCES', db: 'ok' });
    fs.rmSync(path.join(dir, '.fail-health-write'));
    fs.writeFileSync(path.join(dir, '.fail-db-save'), '');
    assert.deepEqual(run(), { health: 'ok', db: 'EACCES' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
