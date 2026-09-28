const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { setup, makeTree } = require('./helpers');
const { Settings } = require('../src/core/settings');
const { ModManagerService } = require('../src/core/service');

function makeService(ctx, extra = {}) {
  const settings = new Settings(ctx.paths.settings, { encrypt: (s) => Buffer.from(s).toString('base64'), decrypt: (s) => Buffer.from(s, 'base64').toString() });
  settings.set({ nexusApiKey: 'KEY' });
  const fixture = makeTree({ 'Mod/mod.json': '{"Name":"Big Gun"}', 'Mod/a.txt': '1' });
  const extract = async (_a, dest) => fs.cpSync(fixture, dest, { recursive: true });
  return new ModManagerService({ paths: ctx.paths, settings, library: ctx.library, defaultModsDir: ctx.gameMods, openExternal() {}, extract, ...extra });
}

test('nxm link -> API calls -> download -> install -> deploy', async () => {
  const ctx = setup();
  const cdn = await new Promise((r) => { const s = http.createServer((_q, res) => res.end('ZIPDATA')).listen(0, '127.0.0.1', () => r(s)); });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url); calls.push(u.pathname + u.search);
    if (u.hostname === '127.0.0.1') return fetch(url, opts);
    const json = (b) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => b, text: async () => '' });
    if (u.pathname.endsWith('/files.json')) return json({ files: [{ file_id: 6, file_name: 'biggun.zip', mod_version: '3.1' }] });
    if (u.pathname.endsWith('/mods/5.json')) return json({ name: 'Big Gun Mod' });
    if (u.pathname.endsWith('download_link.json')) return json([{ URI: `http://127.0.0.1:${cdn.address().port}/biggun.zip` }]);
    throw new Error('unexpected ' + url);
  };
  const svc = makeService(ctx, { fetchImpl });
  const installed = []; svc.on('installed', (e) => installed.push(e));

  const entry = await svc.handleNxm('nxm://peopleplayground/mods/5/files/6?key=k&expires=99');
  cdn.close();
  assert.equal(entry.name, 'Big Gun');
  assert.equal(entry.version, '3.1');
  assert.deepEqual(entry.source, { type: 'nexus', game: 'peopleplayground', modId: 5, fileId: 6 });
  assert.ok(calls.some((c) => c.includes('download_link.json?key=k&expires=99')));
  assert.equal(installed.length, 1);
  assert.equal([...svc.jobs.values()][0].status, 'done');
  assert.equal(fs.readdirSync(ctx.paths.downloads).includes('biggun.zip'), true);

  svc.setEnabled(entry.id, true);
  assert.ok(fs.existsSync(path.join(ctx.gameMods, entry.id, 'a.txt')));
});

test('wrong game, bad link, failed job recorded', async () => {
  const ctx = setup();
  const svc = makeService(ctx, { fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(svc.handleNxm('nxm://skyrim/mods/1/files/2'), /skyrim/);
  await assert.rejects(svc.handleNxm('https://x'), /valid nxm/);
  await assert.rejects(svc.handleNxm('nxm://peopleplayground/mods/1/files/2?key=k'));
  assert.equal([...svc.jobs.values()].at(-1).status, 'failed');
});

test('secrets are encrypted on disk and hidden from the UI view', () => {
  const ctx = setup();
  const svc = makeService(ctx);
  const raw = fs.readFileSync(ctx.paths.settings, 'utf8');
  assert.ok(!raw.includes('KEY') || raw.includes('enc:'));
  assert.ok(!raw.includes('"KEY"'));
  const view = svc.settings.publicView();
  assert.equal(view.nexusApiKey, ''); assert.equal(view.hasNexusKey, true);
});

test('patreon import: validates input, downloads, installs archives, supports cancel', async () => {
  const ctx = setup();
  let seen;
  const patreonDownload = async ({ url, cookie, outDir, onLog, signal }) => {
    seen = { url, cookie, signal };
    onLog('fetching');
    fs.mkdirSync(path.join(outDir, 'post'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'post', 'pack.zip'), 'x');
  };
  const svc = makeService(ctx, { patreonDownload });
  await assert.rejects(svc.importPatreon('https://evil.example/x'), /patreon\.com/);
  await assert.rejects(svc.importPatreon('https://www.patreon.com/posts/1'), /cookie/);
  svc.settings.set({ patreonCookie: 'session_id=abc' });
  const logs = [];
  const out = await svc.importPatreon('https://www.patreon.com/posts/123', (l) => logs.push(l));
  assert.equal(out.length, 1); assert.equal(out[0].source.type, 'patreon');
  assert.equal(seen.cookie, 'session_id=abc'); assert.deepEqual(logs, ['fetching']);
  assert.ok(seen.signal instanceof AbortSignal, 'importPatreon must pass an abort signal through');
});

test('patreon import: cancelling removes the job instead of marking it failed', async () => {
  const ctx = setup();
  let capturedJobId;
  const patreonDownload = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Cancelled')));
  });
  const svc = makeService(ctx, { patreonDownload });
  svc.settings.set({ patreonCookie: 'session_id=abc' });
  svc.on('jobs', (jobs) => { const j = jobs.find((x) => x.label.startsWith('Patreon:')); if (j) capturedJobId = j.id; });
  const promise = svc.importPatreon('https://www.patreon.com/posts/1');
  await new Promise((r) => setImmediate(r));
  assert.ok(capturedJobId);
  svc.cancelJob(capturedJobId);
  await assert.rejects(promise, /Cancelled/);
  assert.equal(svc.listJobs().find((j) => j.id === capturedJobId), undefined);
});

test('patreon import: a download error marks the job failed with that message', async () => {
  const ctx = setup();
  const patreonDownload = async () => { throw new Error('Patreon rejected the cookie'); };
  const svc = makeService(ctx, { patreonDownload });
  svc.settings.set({ patreonCookie: 'session_id=abc' });
  await assert.rejects(svc.importPatreon('https://www.patreon.com/posts/1'), /rejected the cookie/);
  const job = svc.listJobs().at(-1);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /rejected the cookie/);
});

const { EventEmitter } = require('events');
function manualService(ctx, { premium = false, fetchImpl } = {}) {
  const opened = [];
  const svc = makeService(ctx, {
    fetchImpl: fetchImpl || (async (url) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ name: 'Cool Mod' }), text: async () => '' })),
    openExternal: (u) => opened.push(u),
    defaultDownloadsDir: path.join(ctx.paths.root, 'browser-downloads'),
  });
  fs.mkdirSync(svc.watchDir(), { recursive: true });
  svc.user = premium ? { name: 'P', isPremium: true } : { name: 'F', isPremium: false };
  svc.opened = opened;
  return svc;
}
const waitFor = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('free account: opens the Nexus page, then imports the archive the browser saves', async () => {
  const ctx = setup();
  const svc = manualService(ctx);
  svc.watch = (o) => require('../src/core/watcher').watchForArchive({ ...o, pollMs: 20, stablePolls: 1 });
  const r = await svc.nexusDownload({ modId: 42, fileId: 7 });
  assert.equal(r.mode, 'manual');
  assert.equal(svc.opened[0], 'https://www.nexusmods.com/peopleplayground/mods/42?tab=files&file_id=7');
  assert.equal([...svc.jobs.values()][0].status, 'waiting');

  fs.writeFileSync(path.join(svc.watchDir(), 'Cool Mod-42-1-0.zip'), 'zipbytes');
  await waitFor(() => [...svc.jobs.values()][0].status === 'done');
  const mod = ctx.library.list()[0];
  assert.equal(mod.name, 'Big Gun');
  assert.deepEqual(mod.source, { type: 'nexus', game: 'peopleplayground', modId: 42, fileId: 7, manual: true });
});

test('top-mods.com download: opens the mod page in the browser, then imports the archive the browser saves', async () => {
  const ctx = setup();
  const svc = manualService(ctx);
  svc.watch = (o) => require('../src/core/watcher').watchForArchive({ ...o, pollMs: 20, stablePolls: 1 });
  const jobId = await svc.startTopModsDownload({ url: 'https://top-mods.com/mods/people-playground/npc/1-cool-mod.html', title: 'Cool Mod' });
  assert.equal(svc.opened[0], 'https://top-mods.com/mods/people-playground/npc/1-cool-mod.html');
  assert.equal(svc.jobs.get(jobId).status, 'waiting');

  fs.writeFileSync(path.join(svc.watchDir(), 'Cool Mod.zip'), 'zipbytes');
  await waitFor(() => svc.jobs.get(jobId).status === 'done');
  const mod = ctx.library.list()[0];
  assert.equal(mod.name, 'Big Gun');
  assert.deepEqual(mod.source, { type: 'topmods', url: 'https://top-mods.com/mods/people-playground/npc/1-cool-mod.html' });
});

test('cancelling a waiting job removes it', async () => {
  const ctx = setup();
  const svc = manualService(ctx);
  svc.watch = (o) => require('../src/core/watcher').watchForArchive({ ...o, pollMs: 20 });
  await svc.nexusDownload({ modId: 1 });
  const id = [...svc.jobs.keys()][0];
  svc.cancelJob(id);
  await waitFor(() => svc.jobs.size === 0);
});

test('premium account falls back to manual when the API refuses, without a stale failed job', async () => {
  const ctx = setup();
  const fetchImpl = async (url) => {
    const u = String(url);
    const ok = (b) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => b, text: async () => '' });
    if (u.includes('download_link')) return { ok: false, status: 403, headers: { get: () => null }, json: async () => ({}), text: async () => JSON.stringify({ message: 'no' }) };
    if (u.endsWith('files.json')) return ok({ files: [] });
    return ok({ name: 'Cool Mod' });
  };
  const svc = manualService(ctx, { premium: true, fetchImpl });
  svc.watch = () => ({ promise: new Promise(() => {}), cancel() {} });
  const r = await svc.nexusDownload({ modId: 9, fileId: 3 });
  assert.equal(r.mode, 'manual');
  assert.deepEqual([...svc.jobs.values()].map((j) => j.status), ['waiting']);
});

test('launchGame: exe mode starts the exe directly, steam mode uses Steam, bad folder errors clearly', () => {
  const ctx = setup();
  const svc = manualService(ctx);
  const spawned = [];
  svc.spawnImpl = (cmd, args, opts) => { spawned.push({ cmd, opts }); return { unref() {} }; };

  assert.throws(() => svc.launchGame(), /valid game folder/);
  assert.equal(spawned.length, 0);

  const game = path.join(ctx.root, 'People Playground');
  fs.mkdirSync(game, { recursive: true }); fs.writeFileSync(path.join(game, 'People Playground.exe'), '');
  svc.settings.set({ ppGameDir: game });
  assert.equal(svc.launchGame(), 'exe');
  assert.equal(spawned[0].cmd, path.join(game, 'People Playground.exe'));
  assert.equal(spawned[0].opts.cwd, game);
  assert.equal(svc.opened.length, 0, 'exe mode must not touch Steam');

  svc.settings.set({ launchMode: 'steam' });
  assert.equal(svc.launchGame(), 'steam');
  assert.equal(svc.opened.at(-1), 'steam://rungameid/1118200');
  assert.equal(spawned.length, 1, 'steam mode must not spawn the exe');
});

test('patreon login is stored encrypted, user agent kept, logout clears both', () => {
  const ctx = setup();
  const svc = makeService(ctx);
  svc.savePatreonLogin({ cookie: 'session_id=S3CRET', userAgent: 'UA/1' });
  assert.ok(!fs.readFileSync(ctx.paths.settings, 'utf8').includes('S3CRET'));
  assert.equal(svc.settings.get('patreonCookie'), 'session_id=S3CRET');
  assert.equal(svc.settings.get('patreonUserAgent'), 'UA/1');
  svc.patreonLogout();
  assert.equal(svc.settings.publicView().hasPatreonCookie, false);
  assert.equal(svc.settings.get('patreonUserAgent'), '');
});

test('delete-after-install: off by default, on removes downloaded archives, never user-added ones', async () => {
  const ctx = setup();
  const svc = manualService(ctx);
  svc.watch = (o) => require('../src/core/watcher').watchForArchive({ ...o, pollMs: 20, stablePolls: 1 });
  const dl = (name) => path.join(svc.watchDir(), name);

  await svc.nexusDownload({ modId: 1 });
  fs.writeFileSync(dl('keep.zip'), 'a');
  await waitFor(() => [...svc.jobs.values()].at(-1).status === 'done');
  assert.ok(fs.existsSync(dl('keep.zip')), 'default keeps the archive');

  svc.settings.set({ deleteArchivesAfterInstall: 'true' });
  await svc.nexusDownload({ modId: 2 });
  fs.writeFileSync(dl('gone.zip'), 'b');
  await waitFor(() => [...svc.jobs.values()].at(-1).status === 'done');
  assert.ok(!fs.existsSync(dl('gone.zip')), 'option removes it after install');

  const mine = path.join(ctx.root, 'mine.zip');
  fs.writeFileSync(mine, 'c');
  await svc.importArchive(mine);
  assert.ok(fs.existsSync(mine), 'files the user picked are never deleted');
});

test('archive is kept when the install fails', async () => {
  const ctx = setup();
  const svc = manualService(ctx);
  svc.settings.set({ deleteArchivesAfterInstall: 'true' });
  svc.extract = async () => { throw new Error('corrupt'); };
  svc.watch = (o) => require('../src/core/watcher').watchForArchive({ ...o, pollMs: 20, stablePolls: 1 });
  await svc.nexusDownload({ modId: 3 });
  fs.writeFileSync(path.join(svc.watchDir(), 'bad.zip'), 'x');
  await waitFor(() => [...svc.jobs.values()].at(-1).status === 'failed');
  assert.ok(fs.existsSync(path.join(svc.watchDir(), 'bad.zip')));
});

test('mods folder defaults to <game folder>/Mods, an explicit setting wins, and Documents is the last resort', () => {
  const ctx = setup();
  const svc = manualService(ctx);
  assert.equal(svc.modsDir(), ctx.gameMods);
  svc.settings.set({ ppGameDir: path.join(ctx.root, 'Game') });
  assert.equal(svc.modsDir(), path.join(ctx.root, 'Game', 'Mods'));
  svc.settings.set({ ppModsDir: path.join(ctx.root, 'custom') });
  assert.equal(svc.modsDir(), path.join(ctx.root, 'custom'));
});
