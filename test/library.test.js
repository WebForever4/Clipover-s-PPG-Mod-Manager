const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, makeTree } = require('./helpers');
const { Library } = require('../src/core/library');
const { installFromFolder } = require('../src/core/installer');

function addMod(ctx, name) {
  const dir = makeTree({ 'mod.json': JSON.stringify({ Name: name, Author: 'A', ModVersion: '1.2' }), 'x.txt': 'hi' });
  return installFromFolder({ dir, ...ctx });
}

test('unique ids, persistence, profiles and removal', () => {
  const ctx = setup();
  const a = addMod(ctx, 'Cool Mod');
  const b = addMod(ctx, 'Cool Mod');
  assert.equal(a.id, 'cool-mod'); assert.equal(b.id, 'cool-mod-2');

  ctx.library.setEnabled(a.id, true);
  ctx.library.createProfile('Chaos', 'Default');
  ctx.library.setActive('Chaos');
  assert.ok(ctx.library.isEnabled(a.id));
  ctx.library.setEnabled(b.id, true);
  ctx.library.setActive('Default');
  assert.ok(!ctx.library.isEnabled(b.id));

  const reloaded = new Library(ctx.paths);
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.profiles().active, 'Default');

  ctx.library.remove(a.id);
  assert.ok(!fs.existsSync(path.join(ctx.paths.mods, a.id)));
  ctx.library.setActive('Chaos');
  assert.ok(!ctx.library.enabledIds().includes(a.id));
});

test('profile rules', () => {
  const { library } = setup();
  assert.throws(() => library.createProfile('  '), /empty/);
  assert.throws(() => library.createProfile('Default'), /already exists/);
  assert.throws(() => library.deleteProfile('Default'), /at least one/);
});
