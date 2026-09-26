const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const main = read('src/main/index.js');
const preload = read('src/main/preload.js');
const renderer = read('src/renderer/renderer.js');
const uniq = (a) => [...new Set(a)];

test('every channel the renderer calls has a main-process handler', () => {
  const handled = uniq([...main.matchAll(/^\s+'([a-zA-Z]+:[a-zA-Z]+)':/gm)].map((m) => m[1]));
  const called = uniq([...renderer.matchAll(/call\('([a-zA-Z]+:[a-zA-Z]+)'/g)].map((m) => m[1]));
  assert.ok(called.length > 20);
  assert.deepEqual(called.filter((c) => !handled.includes(c)), []);
});

test('every event is allow-listed in preload, sent by main, and listened to by the renderer', () => {
  const allowed = [...preload.match(/EVENTS = \[(.*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const listened = uniq([...renderer.matchAll(/cmm\.on\('([^']+)'/g)].map((m) => m[1]));
  const sent = uniq([...main.matchAll(/send\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(listened.filter((e) => !allowed.includes(e)), []);
  assert.deepEqual(sent.filter((e) => !allowed.includes(e)), []);
  assert.deepEqual(sent.filter((e) => !listened.includes(e)), []);
});

test('renderer never uses innerHTML', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(renderer));
});
