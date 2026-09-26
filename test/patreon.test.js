const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { runPatreonDownload, listArchives } = require('../src/core/patreon');
const { tmp } = require('./helpers');
const fs = require('fs');
const path = require('path');

class FakeBatch extends EventEmitter {}

class FakeDownloader extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
  }

  async start({ signal } = {}) {
    if (signal && signal.aborted) {
      this.emit('end', { aborted: true });
      return;
    }
    this.emit('targetBegin', { target: { name: 'Cool Post' } });
    const batch = new FakeBatch();
    this.emit('phaseBegin', { phase: 'batchDownload', batch });
    batch.emit('taskProgress', { task: { resolvedDestFilename: 'file.zip', getProgress: () => ({ percent: 50 }) } });
    if (signal) {
      await new Promise((resolve) => {
        const onAbort = () => { this.emit('end', { aborted: true }); resolve(); };
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        setImmediate(() => {
          signal.removeEventListener('abort', onAbort);
          this.emit('end', {});
          resolve();
        });
      });
    } else {
      this.emit('end', {});
    }
  }
}

function fakeGetDownloaderClass(behavior = {}) {
  return async () => ({
    getInstance: async (url, options) => {
      if (behavior.instanceError) throw behavior.instanceError;
      const d = new FakeDownloader(url, options);
      if (behavior.endsWithError) {
        const realStart = d.start.bind(d);
        d.start = async (opts) => {
          d.emit('targetBegin', { target: { name: 'Cool Post' } });
          d.emit('end', { error: behavior.endsWithError });
        };
      }
      return d;
    },
  });
}

test('runs a download, forwards progress as log lines, resolves cleanly', async () => {
  const logs = [];
  await runPatreonDownload({
    url: 'https://www.patreon.com/posts/1',
    cookie: 'session_id=abc',
    outDir: tmp(),
    userAgent: 'UA/1',
    onLog: (l) => logs.push(l),
    getDownloaderClass: fakeGetDownloaderClass(),
  });
  assert.ok(logs.some((l) => l.includes('Cool Post')));
  assert.ok(logs.some((l) => l.includes('50%')));
  assert.ok(logs.some((l) => l.includes('Done')));
});

test('passes cookie, outDir and a user agent through to the downloader options', async () => {
  let seenOptions;
  const getDownloaderClass = async () => ({
    getInstance: async (url, options) => {
      seenOptions = options;
      return new FakeDownloader(url, options);
    },
  });
  await runPatreonDownload({
    url: 'https://www.patreon.com/posts/1',
    cookie: 'session_id=abc',
    outDir: '/tmp/out',
    userAgent: 'MyUA/1',
    getDownloaderClass,
  });
  assert.equal(seenOptions.cookie, 'session_id=abc');
  assert.equal(seenOptions.outDir, '/tmp/out');
  assert.equal(seenOptions.request.userAgent, 'MyUA/1');
});

test('omits the request.userAgent option entirely when none is given', async () => {
  let seenOptions;
  const getDownloaderClass = async () => ({
    getInstance: async (url, options) => { seenOptions = options; return new FakeDownloader(url, options); },
  });
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/1', cookie: 'c', outDir: '/tmp/out', getDownloaderClass });
  assert.equal(seenOptions.request, undefined);
});

test('an error end event rejects with that error', async () => {
  const cause = new Error('cookie rejected by Patreon');
  await assert.rejects(
    runPatreonDownload({
      url: 'https://www.patreon.com/posts/1', cookie: 'c', outDir: tmp(),
      getDownloaderClass: fakeGetDownloaderClass({ endsWithError: cause }),
    }),
    /cookie rejected/,
  );
});

test('aborting via the signal rejects with Cancelled, without waiting for a full run', async () => {
  const controller = new AbortController();
  const getDownloaderClass = fakeGetDownloaderClass();
  const promise = runPatreonDownload({
    url: 'https://www.patreon.com/posts/1', cookie: 'c', outDir: tmp(), signal: controller.signal, getDownloaderClass,
  });
  controller.abort();
  await assert.rejects(promise, /Cancelled/);
});

test('listArchives finds archives recursively and ignores other files', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'a/b'), { recursive: true });
  fs.writeFileSync(path.join(d, 'a/b/m.7z'), '');
  fs.writeFileSync(path.join(d, 'a/notes.txt'), '');
  assert.deepEqual(listArchives(d).map((p) => path.basename(p)), ['m.7z']);
});
