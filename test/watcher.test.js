const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmp } = require('./helpers');
const { watchForArchive } = require('../src/core/watcher');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opts = { pollMs: 20, stablePolls: 2 };

test('picks up a new archive only after it stops growing, ignoring old and partial files', async () => {
  const dir = tmp();
  const old = path.join(dir, 'old.zip');
  fs.writeFileSync(old, 'x');
  const past = new Date(Date.now() - 3600_000);
  fs.utimesSync(old, past, past);

  const w = watchForArchive({ dir, ...opts });
  fs.writeFileSync(path.join(dir, 'mod.zip.crdownload'), 'partial');
  const f = path.join(dir, 'mod.zip');
  fs.writeFileSync(f, 'a');
  await sleep(30); fs.appendFileSync(f, 'bb');
  await sleep(30); fs.appendFileSync(f, 'ccc');
  const found = await w.promise;
  assert.equal(found, f);
  assert.equal(fs.readFileSync(f, 'utf8'), 'abbccc');
});

test('cancel and timeout reject', async () => {
  const a = watchForArchive({ dir: tmp(), ...opts });
  a.cancel();
  await assert.rejects(a.promise, /Cancelled/);
  const b = watchForArchive({ dir: tmp(), ...opts, timeoutMs: 60 });
  await assert.rejects(b.promise, /Timed out/);
});
