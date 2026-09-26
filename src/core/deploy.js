const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./store');

function removeEntries(modsDir, entries) {
  for (const e of entries) {
    const p = path.join(modsDir, e.name);
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }
    if (e.kind === 'link' && st.isSymbolicLink()) {
      try { fs.unlinkSync(p); } catch { fs.rmdirSync(p); }
    } else if (e.kind === 'copy' && st.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

function deploy({ library, paths, modsDir }) {
  if (!modsDir) throw new Error('The People Playground mods folder is not set.');
  fs.mkdirSync(modsDir, { recursive: true });
  removeEntries(modsDir, readJson(paths.deployed, { entries: [] }).entries);

  const result = { linked: [], copied: [], skipped: [] };
  const entries = [];
  for (const id of library.enabledIds()) {
    const src = path.join(paths.mods, id);
    const dst = path.join(modsDir, id);
    if (!fs.existsSync(src)) { result.skipped.push({ id, reason: 'its files are missing' }); continue; }
    let occupied = true;
    try { fs.lstatSync(dst); } catch { occupied = false; }
    if (occupied) { result.skipped.push({ id, reason: 'a folder with this name already exists in the game mods folder' }); continue; }
    try {
      fs.symlinkSync(src, dst, 'junction');
      entries.push({ name: id, kind: 'link' });
      result.linked.push(id);
    } catch {
      try {
        fs.cpSync(src, dst, { recursive: true });
        entries.push({ name: id, kind: 'copy' });
        result.copied.push(id);
      } catch (e) {
        result.skipped.push({ id, reason: e.message });
      }
    }
  }
  writeJson(paths.deployed, { entries });
  return result;
}

function undeploy({ paths, modsDir }) {
  removeEntries(modsDir, readJson(paths.deployed, { entries: [] }).entries);
  writeJson(paths.deployed, { entries: [] });
}

module.exports = { deploy, undeploy };
