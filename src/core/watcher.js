const fs = require('fs');
const path = require('path');
const { ARCHIVE_EXTS } = require('./installer');

function watchForArchive({ dir, since = Date.now(), timeoutMs = 15 * 60 * 1000, pollMs = 1000, stablePolls = 2, exts = ARCHIVE_EXTS } = {}) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    const seen = new Map();
    const finish = (err, file) => {
      clearInterval(timer);
      clearTimeout(timeout);
      err ? reject(err) : resolve(file);
    };
    const tick = () => {
      let names;
      try { names = fs.readdirSync(dir); } catch { return; }
      for (const name of names) {
        if (!exts.has(path.extname(name).toLowerCase())) continue;
        const file = path.join(dir, name);
        let st;
        try { st = fs.statSync(file); } catch { continue; }
        if (!st.isFile() || st.mtimeMs < since - 2000 || st.size === 0) continue;
        const prev = seen.get(file);
        const stable = prev && prev.size === st.size ? prev.count + 1 : 0;
        seen.set(file, { size: st.size, count: stable });
        if (stable >= stablePolls) return finish(null, file);
      }
    };
    const timer = setInterval(tick, pollMs);
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for the download to appear.')), timeoutMs);
    cancel = () => finish(new Error('Cancelled'));
  });
  return { promise, cancel: () => cancel() };
}

module.exports = { watchForArchive };
