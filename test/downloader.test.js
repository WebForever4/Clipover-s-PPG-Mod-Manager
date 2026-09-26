const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const { tmp } = require('./helpers');
const { downloadFile, sanitizeFileName } = require('../src/core/downloader');

function serve(handler) {
  return new Promise((res) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => res(s)); });
}

test('downloads with progress, header filename, no leftover .part', async () => {
  const body = Buffer.alloc(200000, 7);
  const s = await serve((_q, r) => { r.writeHead(200, { 'content-length': body.length, 'content-disposition': 'attachment; filename="My Mod v2.zip"' }); r.end(body); });
  const dir = tmp(); let last;
  const file = await downloadFile(`http://127.0.0.1:${s.address().port}/cdn/x`, dir, { onProgress: (p) => (last = p) });
  s.close();
  assert.equal(require('path').basename(file), 'My Mod v2.zip');
  assert.equal(fs.statSync(file).size, body.length);
  assert.equal(last.received, body.length); assert.equal(last.total, body.length);
  assert.deepEqual(fs.readdirSync(dir), ['My Mod v2.zip']);
});

test('http error, name clash and sanitising', async () => {
  const s = await serve((q, r) => { if (q.url === '/bad') { r.writeHead(404); return r.end(); } r.end('x'); });
  const port = s.address().port; const dir = tmp();
  await assert.rejects(downloadFile(`http://127.0.0.1:${port}/bad`, dir), /HTTP 404/);
  const a = await downloadFile(`http://127.0.0.1:${port}/f.zip`, dir);
  const b = await downloadFile(`http://127.0.0.1:${port}/f.zip`, dir);
  s.close();
  assert.notEqual(a, b);
  const bad = sanitizeFileName('../../evil:name?.zip');
  assert.ok(!/[\\/:?]/.test(bad) && !bad.startsWith('.'), bad);
  assert.equal(require('path').basename(bad), bad);
});
