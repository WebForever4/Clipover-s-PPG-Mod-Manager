const fs = require('fs');
const path = require('path');
const { ARCHIVE_EXTS } = require('./installer');

async function defaultGetDownloaderClass() {
  const mod = await import('patreon-dl');
  return mod.default;
}

function describeTarget(target) {
  return (target && (target.name || target.title)) || 'item';
}

async function runPatreonDownload({
  url,
  cookie,
  outDir,
  userAgent,
  onLog = () => {},
  signal,
  getDownloaderClass = defaultGetDownloaderClass,
}) {
  const PatreonDownloader = await getDownloaderClass();
  const options = {
    cookie,
    outDir,
    useStatusCache: false,
  };
  if (userAgent) options.request = { userAgent };

  const downloader = await PatreonDownloader.getInstance(url, options);
  let endPayload = null;

  downloader.on('targetBegin', (payload) => onLog(`Starting: ${describeTarget(payload && payload.target)}`));
  downloader.on('targetEnd', (payload) => {
    if (payload && payload.isSkipped) {
      onLog(`Skipped: ${payload.skipMessage || payload.skipReason || 'already downloaded'}`);
    }
  });
  downloader.on('phaseBegin', (payload) => {
    if (payload && payload.phase === 'batchDownload' && payload.batch) {
      payload.batch.on('taskProgress', (evt) => {
        const progress = evt && evt.task && typeof evt.task.getProgress === 'function' ? evt.task.getProgress() : null;
        const name = (evt && evt.task && evt.task.resolvedDestFilename) || '';
        if (progress && progress.percent != null) onLog(`Downloading ${name} \u2014 ${Math.round(progress.percent)}%`);
      });
      payload.batch.on('taskError', (evt) => onLog(`Download error: ${(evt && evt.cause && evt.cause.message) || 'unknown error'}`));
    }
  });
  downloader.on('end', (payload) => {
    endPayload = payload || {};
    onLog(endPayload.message || (endPayload.aborted ? 'Cancelled.' : 'Done.'));
  });

  await downloader.start({ signal });

  if (endPayload && endPayload.aborted) {
    throw new Error('Cancelled');
  }
  if (endPayload && endPayload.error) {
    throw endPayload.error instanceof Error ? endPayload.error : new Error(String(endPayload.error));
  }
}

function listArchives(dir) {
  const found = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...listArchives(p));
    else if (ARCHIVE_EXTS.has(path.extname(e.name).toLowerCase())) found.push(p);
  }
  return found;
}

const isPatreonDomain = (d) => !!d && (d === 'patreon.com' || d.endsWith('.patreon.com'));
function patreonCookies(cookies) { return cookies.filter((c) => isPatreonDomain(c.domain)); }
function buildCookieHeader(cookies) { return patreonCookies(cookies).map((c) => `${c.name}=${c.value}`).join('; '); }
function hasPatreonSession(cookies) { return patreonCookies(cookies).some((c) => c.name === 'session_id' && c.value); }

function looksLoggedIn(cookieHeader) {
  const m = /(?:^|;\s*)session_id=([^;]+)/.exec(cookieHeader || '');
  return !!(m && m[1]);
}

module.exports = { runPatreonDownload, listArchives, buildCookieHeader, hasPatreonSession, looksLoggedIn };
