const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar']);

function findManifestFile(dir) {
  const hit = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isFile() && e.name.toLowerCase() === 'mod.json');
  return hit ? path.join(dir, hit.name) : null;
}

function findModRoot(dir) {
  let level = [dir];
  while (level.length) {
    for (const d of level) if (findManifestFile(d)) return { root: d, hasManifest: true };
    const next = [];
    for (const d of level) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory() && e.name !== '__MACOSX') next.push(path.join(d, e.name));
      }
    }
    level = next;
  }
  let cur = dir;
  for (;;) {
    const entries = fs.readdirSync(cur, { withFileTypes: true }).filter((e) => e.name !== '__MACOSX');
    if (entries.length === 1 && entries[0].isDirectory()) cur = path.join(cur, entries[0].name);
    else break;
  }
  return { root: cur, hasManifest: false };
}

function readManifest(root) {
  const file = findManifestFile(root);
  if (!file) return {};
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
  const pick = (...keys) => {
    for (const k of Object.keys(json)) if (keys.includes(k.toLowerCase()) && json[k] != null) return String(json[k]);
    return undefined;
  };
  return { name: pick('name'), author: pick('author'), version: pick('modversion', 'version'), description: pick('description') };
}

function sevenZipPath() {
  try {
    return require('7zip-bin').path7za.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  } catch {
    return null;
  }
}

function extractArchive(archive, dest, { sevenZip = sevenZipPath(), spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (!sevenZip) return reject(new Error('7-Zip binary not found. Run "npm install" to get 7zip-bin.'));
    fs.mkdirSync(dest, { recursive: true });
    const p = spawnImpl(sevenZip, ['x', '-y', '-bd', `-o${dest}`, archive], { windowsHide: true });
    let out = '';
    if (p.stdout) p.stdout.on('data', (d) => (out += d));
    if (p.stderr) p.stderr.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error(`Could not extract archive (7-Zip exit ${code}). ${out.slice(-300)}`))));
  });
}

function installFromFolder({ dir, library, paths, meta = {} }) {
  const { root, hasManifest } = findModRoot(dir);
  const m = readManifest(root);
  const name = m.name || meta.fallbackName || path.basename(root);
  const id = library.uniqueId(name);
  fs.cpSync(root, path.join(paths.mods, id), { recursive: true });
  return library.add({
    id,
    name,
    author: m.author,
    version: m.version || meta.version,
    description: m.description,
    hasManifest,
    source: meta.source || { type: 'manual' },
  });
}

async function installFromArchive({ archive, library, paths, meta = {}, extract = extractArchive }) {
  const stage = path.join(paths.staging, randomUUID());
  try {
    await extract(archive, stage);
    const fallbackName = meta.fallbackName || path.basename(archive, path.extname(archive));
    return installFromFolder({ dir: stage, library, paths, meta: { ...meta, fallbackName } });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { ARCHIVE_EXTS, findModRoot, readManifest, extractArchive, installFromFolder, installFromArchive };
