const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, makeTree } = require('./helpers');
const { installFromFolder } = require('../src/core/installer');
const { deploy, undeploy } = require('../src/core/deploy');

function add(ctx, name) {
  return installFromFolder({ dir: makeTree({ 'mod.json': JSON.stringify({ Name: name }) }), ...ctx });
}

test('deploys enabled mods, removes disabled ones, never touches user mods', () => {
  const ctx = setup();
  const a = add(ctx, 'Alpha'); const b = add(ctx, 'Beta');
  fs.mkdirSync(path.join(ctx.gameMods, 'users-own-mod'), { recursive: true });

  ctx.library.setEnabled(a.id, true); ctx.library.setEnabled(b.id, true);
  let r = deploy({ ...ctx, modsDir: ctx.gameMods });
  assert.deepEqual([...r.linked, ...r.copied].sort(), ['alpha', 'beta']);
  assert.ok(fs.existsSync(path.join(ctx.gameMods, 'alpha', 'mod.json')));

  ctx.library.setEnabled(b.id, false);
  deploy({ ...ctx, modsDir: ctx.gameMods });
  assert.ok(!fs.existsSync(path.join(ctx.gameMods, 'beta')));
  assert.ok(fs.existsSync(path.join(ctx.gameMods, 'alpha')));
  assert.ok(fs.existsSync(path.join(ctx.gameMods, 'users-own-mod')));

  undeploy({ paths: ctx.paths, modsDir: ctx.gameMods });
  assert.ok(!fs.existsSync(path.join(ctx.gameMods, 'alpha')));
  assert.ok(fs.existsSync(path.join(ctx.gameMods, 'users-own-mod')));
  assert.ok(fs.existsSync(path.join(ctx.paths.mods, 'alpha', 'mod.json')), 'library copy must survive undeploy');
});

test('skips a name collision with a user-owned folder instead of overwriting', () => {
  const ctx = setup();
  const a = add(ctx, 'Alpha');
  fs.mkdirSync(path.join(ctx.gameMods, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(ctx.gameMods, 'alpha', 'mine.txt'), 'keep');
  ctx.library.setEnabled(a.id, true);
  const r = deploy({ ...ctx, modsDir: ctx.gameMods });
  assert.equal(r.skipped.length, 1);
  assert.equal(fs.readFileSync(path.join(ctx.gameMods, 'alpha', 'mine.txt'), 'utf8'), 'keep');
  undeploy({ paths: ctx.paths, modsDir: ctx.gameMods });
  assert.ok(fs.existsSync(path.join(ctx.gameMods, 'alpha', 'mine.txt')));
});
