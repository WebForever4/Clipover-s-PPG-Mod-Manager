const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

function sanitizeFileName(name) {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim();
  return clean || 'download.bin';
}

function nameFromDisposition(h) {
  if (!h) return null;
  const star = h.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch {}
  }
  const plain = h.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

function nameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base} (${n})${ext}`);
  return candidate;
}

async function downloadFile(url, destDir, { fileName, onProgress, signal, fetchImpl } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const res = await (fetchImpl || globalThis.fetch)(url, { signal });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const name = sanitizeFileName(
    fileName || nameFromDisposition(res.headers.get('content-disposition')) || nameFromUrl(url) || 'download.bin',
  );
  const dest = uniquePath(destDir, name);
  const part = dest + '.part';
  let received = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (onProgress) onProgress({ received, total });
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part), { signal });
    fs.renameSync(part, dest);
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw e;
  }
  return dest;
}

module.exports = { downloadFile, sanitizeFileName };
