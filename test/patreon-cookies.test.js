const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCookieHeader, hasPatreonSession } = require('../src/core/patreon');

const jar = [
  { name: 'session_id', value: 'abc', domain: '.patreon.com' },
  { name: '__cf_bm', value: 'z', domain: 'www.patreon.com' },
  { name: 'lookalike', value: '1', domain: 'notpatreon.com' },
  { name: 'other', value: '2', domain: 'example.com' },
];

test('cookie header contains only patreon.com and its subdomains', () => {
  assert.equal(buildCookieHeader(jar), 'session_id=abc; __cf_bm=z');
});

test('session detection needs a non-empty patreon session_id', () => {
  assert.equal(hasPatreonSession(jar), true);
  assert.equal(hasPatreonSession([{ name: 'session_id', value: 'x', domain: 'example.com' }]), false);
  assert.equal(hasPatreonSession([{ name: 'session_id', value: '', domain: '.patreon.com' }]), false);
  assert.equal(hasPatreonSession([]), false);
});
