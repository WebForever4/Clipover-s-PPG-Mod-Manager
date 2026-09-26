const test = require('node:test');
const assert = require('node:assert/strict');
const { NexusClient, NexusError, ssoLogin } = require('../src/core/nexus');

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url: String(url), headers: opts.headers });
    const { status = 200, body = {}, headers = {} } = handler(String(url));
    return { ok: status < 400, status, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  f.calls = calls;
  return f;
}

test('sends MO2-style headers and records rate limits', async () => {
  const f = fakeFetch(() => ({ body: { name: 'Bob', is_premium: true }, headers: { 'x-rl-daily-remaining': '99' } }));
  const c = new NexusClient({ apiKey: 'KEY', fetchImpl: f });
  const u = await c.validate();
  assert.equal(u.name, 'Bob');
  assert.equal(f.calls[0].headers.APIKEY, 'KEY');
  assert.equal(f.calls[0].headers['Protocol-Version'], '1.0.0');
  assert.match(f.calls[0].url, /api\.nexusmods\.com\/v1\/users\/validate\.json$/);
  assert.equal(c.rateLimit.dailyRemaining, '99');
});

test('requires a key', async () => {
  const c = new NexusClient({ fetchImpl: fakeFetch(() => ({})) });
  await assert.rejects(c.validate(), (e) => e.code === 'NO_KEY');
});

test('download link passes key and expires, returns first URI', async () => {
  const f = fakeFetch(() => ({ body: [{ URI: 'https://cdn.example/a.zip' }, { URI: 'https://cdn2.example/a.zip' }] }));
  const c = new NexusClient({ apiKey: 'K', fetchImpl: f });
  const url = await c.getDownloadUrl('peopleplayground', 5, 6, { key: 'kk', expires: 111 });
  assert.equal(url, 'https://cdn.example/a.zip');
  assert.match(f.calls[0].url, /mods\/5\/files\/6\/download_link\.json\?key=kk&expires=111$/);
});

test('403 without key becomes NXM_REQUIRED', async () => {
  const f = fakeFetch(() => ({ status: 403, body: { message: 'Premium only' } }));
  const c = new NexusClient({ apiKey: 'K', fetchImpl: f });
  await assert.rejects(c.getDownloadUrl('g', 1, 2), (e) => e instanceof NexusError && e.code === 'NXM_REQUIRED');
});

test('maps error statuses', async () => {
  const c = new NexusClient({ apiKey: 'K', fetchImpl: fakeFetch(() => ({ status: 401, body: { message: 'Bad key' } })) });
  await assert.rejects(c.validate(), (e) => e.code === 'BAD_KEY' && e.message === 'Bad key');
});

class FakeWS {
  constructor(url) { FakeWS.last = this; this.url = url; this.sent = []; queueMicrotask(() => this.onopen && this.onopen()); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.closed = true; }
  push(obj) { this.onmessage({ data: JSON.stringify(obj) }); }
}

test('SSO handshake: id+protocol, opens browser, resolves with api key', async () => {
  const opened = [];
  const { promise, id } = ssoLogin({ appSlug: 'myapp', openUrl: (u) => opened.push(u), WebSocketImpl: FakeWS });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(FakeWS.last.sent[0], { id, protocol: 2 });
  FakeWS.last.push({ success: true, data: { connection_token: 't' } });
  assert.equal(opened[0], `https://www.nexusmods.com/sso?id=${id}&application=myapp`);
  FakeWS.last.push({ success: true, data: { api_key: 'SECRET' } });
  assert.equal(await promise, 'SECRET');
  assert.ok(FakeWS.last.closed);
});

test('SSO failure and cancel', async () => {
  const a = ssoLogin({ appSlug: 'x', openUrl() {}, WebSocketImpl: FakeWS });
  await new Promise((r) => setImmediate(r));
  FakeWS.last.push({ success: false, error: 'nope' });
  await assert.rejects(a.promise, /nope/);
  const b = ssoLogin({ appSlug: 'x', openUrl() {}, WebSocketImpl: FakeWS });
  b.cancel();
  await assert.rejects(b.promise, (e) => e.code === 'CANCELLED');
});
