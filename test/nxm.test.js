const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNxm } = require('../src/core/nxm');

test('parses a free-account nxm link', () => {
  assert.deepEqual(parseNxm('nxm://PeoplePlayground/mods/123/files/456?key=abc&expires=1700000000&user_id=9'), {
    game: 'peopleplayground', modId: 123, fileId: 456, key: 'abc', expires: 1700000000, userId: 9,
  });
});
test('parses a premium link without key', () => {
  const p = parseNxm('nxm://peopleplayground/mods/1/files/2');
  assert.equal(p.modId, 1); assert.equal(p.key, undefined);
});
test('rejects other links', () => {
  assert.equal(parseNxm('https://nexusmods.com/x'), null);
  assert.equal(parseNxm('nxm://peopleplayground/collections/abc/revisions/1'), null);
  assert.equal(parseNxm('not a url'), null);
});
