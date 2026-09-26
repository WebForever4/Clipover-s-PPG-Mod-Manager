const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, makeTree } = require('./helpers');
const { findModRoot, readManifest, installFromFolder, installFromArchive } = require('../src/core/installer');

test('finds mod.json inside wrapper folders (shallowest wins)', () => {
  const dir = makeTree({ 'Wrapper/MyMod/mod.json': '{}', 'Wrapper/MyMod/sub/mod.json': '{}', 'Wrapper/readme.txt': 'x' });
  const r = findModRoot(dir);
  assert.equal(r.hasManifest, true);
  assert.equal(r.root, path.join(dir, 'Wrapper', 'MyMod'));
});

test('no manifest: unwraps single folder and flags it', () => {
  const dir = makeTree({ 'OnlyFolder/a.dll': 'x' });
  const r = findModRoot(dir);
  assert.equal(r.hasManifest, false);
  assert.equal(r.root, path.join(dir, 'OnlyFolder'));
});

test('manifest parsing tolerates BOM and key casing', () => {
  const dir = makeTree({ 'mod.json': '\uFEFF{"name":"N","AUTHOR":"Me","ModVersion":"2.0"}' });
  assert.deepEqual(readManifest(dir), { name: 'N', author: 'Me', version: '2.0', description: undefined });
});

test('install from archive uses injected extractor and cleans staging', async () => {
  const ctx = setup();
  const fixture = makeTree({ 'Pack/mod.json': '{"Name":"Ragdoll Pack"}', 'Pack/data.bin': '1' });
  const extract = async (_archive, dest) => fs.cpSync(fixture, dest, { recursive: true });
  const entry = await installFromArchive({ archive: '/x/Ragdoll.zip', ...ctx, extract, meta: { source: { type: 'nexus', modId: 1 } } });
  assert.equal(entry.name, 'Ragdoll Pack');
  assert.ok(fs.existsSync(path.join(ctx.paths.mods, 'ragdoll-pack', 'data.bin')));
  assert.equal(fs.readdirSync(ctx.paths.staging).length, 0);
});
