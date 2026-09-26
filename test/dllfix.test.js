const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmp } = require('./helpers');
const { managedDllPath, status, applyFix, revertFix } = require('../src/core/dllfix');

function fakeGame(root, dllContent) {
  const dir = path.join(root, 'People Playground_Data', 'Managed');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Assembly-CSharp.dll'), dllContent);
  return root;
}

function fakeFixedDll(root, content) {
  const file = path.join(root, 'Assembly-CSharp.dll');
  fs.writeFileSync(file, content);
  return file;
}

test('status reports missing game folder or missing dll', () => {
  assert.equal(status({ gameDir: '', fixedDll: 'x' }).ok, false);
  const empty = tmp();
  const st = status({ gameDir: empty, fixedDll: 'x' });
  assert.equal(st.ok, false);
  assert.match(st.reason, /Assembly-CSharp\.dll/);
});

test('status reports not-applied then applied after fix, and detects a backup', () => {
  const gameDir = fakeGame(tmp(), 'buggy-bytes');
  const fixedDll = fakeFixedDll(tmp(), 'fixed-bytes');

  let st = status({ gameDir, fixedDll });
  assert.equal(st.ok, true);
  assert.equal(st.applied, false);
  assert.equal(st.hasBackup, false);

  applyFix({ gameDir, fixedDll });
  st = status({ gameDir, fixedDll });
  assert.equal(st.applied, true);
  assert.equal(st.hasBackup, true);
  assert.equal(fs.readFileSync(managedDllPath(gameDir), 'utf8'), 'fixed-bytes');
});

test('applyFix only backs up the original once, even if applied twice', () => {
  const gameDir = fakeGame(tmp(), 'buggy-bytes');
  const fixedDll = fakeFixedDll(tmp(), 'fixed-bytes');
  applyFix({ gameDir, fixedDll });
  applyFix({ gameDir, fixedDll });
  const backup = `${managedDllPath(gameDir)}.pre-fix-backup`;
  assert.equal(fs.readFileSync(backup, 'utf8'), 'buggy-bytes');
});

test('revertFix restores the original dll from backup', () => {
  const gameDir = fakeGame(tmp(), 'buggy-bytes');
  const fixedDll = fakeFixedDll(tmp(), 'fixed-bytes');
  applyFix({ gameDir, fixedDll });
  revertFix({ gameDir });
  assert.equal(fs.readFileSync(managedDllPath(gameDir), 'utf8'), 'buggy-bytes');
});

test('revertFix throws when there is no backup', () => {
  const gameDir = fakeGame(tmp(), 'buggy-bytes');
  assert.throws(() => revertFix({ gameDir }), /No backup/);
});

test('applyFix throws when the game dll is missing', () => {
  const gameDir = tmp();
  const fixedDll = fakeFixedDll(tmp(), 'fixed-bytes');
  assert.throws(() => applyFix({ gameDir, fixedDll }), /Could not find/);
});
