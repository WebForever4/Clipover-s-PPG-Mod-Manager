const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmp } = require('./helpers');
const { detectGame, validateGameDir } = require('../src/core/gamedetect');

function fakeGame(root) {
  const dir = path.join(root, 'steamapps', 'common', 'People Playground');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'People Playground.exe'), '');
  return dir;
}

test('finds the game in the main Steam library', () => {
  const pf = tmp(); const steam = path.join(pf, 'Steam');
  const dir = fakeGame(steam);
  assert.equal(detectGame({ platform: 'win32', env: { 'ProgramFiles(x86)': pf } }), dir);
});

test('finds the game in a second library listed in libraryfolders.vdf (Windows-style escapes)', () => {
  const pf = tmp(); const steam = path.join(pf, 'Steam'); const second = tmp();
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'),
    `"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"${second.replace(/\\/g, '\\\\')}"\n\t}\n}\n`);
  const dir = fakeGame(second);
  assert.equal(detectGame({ platform: 'win32', env: { 'ProgramFiles(x86)': pf } }), dir);
});

test('returns null when not installed; validates folders', () => {
  assert.equal(detectGame({ platform: 'win32', env: { 'ProgramFiles(x86)': tmp() } }), null);
  assert.equal(validateGameDir('').ok, false);
  assert.equal(validateGameDir('/definitely/not/here').ok, false);
  const empty = tmp();
  assert.match(validateGameDir(empty).reason, /People Playground\.exe/);
  const good = fakeGame(tmp());
  const v = validateGameDir(good);
  assert.ok(v.ok && v.exe.endsWith('People Playground.exe'));
});
