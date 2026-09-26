const fs = require('fs');
const os = require('os');
const path = require('path');

const FOLDER = 'People Playground';
const EXE = 'People Playground.exe';

function steamRoots({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    return ['ProgramFiles(x86)', 'ProgramFiles', 'ProgramW6432'].filter((k) => env[k]).map((k) => path.join(env[k], 'Steam'));
  }
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Steam')];
  return [path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam')];
}

function libraryPaths(steamRoot) {
  const libs = [steamRoot];
  try {
    const text = fs.readFileSync(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, '\\'));
  } catch {}
  return [...new Set(libs)];
}

function validateGameDir(dir) {
  if (!dir) return { ok: false, reason: 'No folder selected.' };
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { ok: false, reason: 'That folder does not exist or cannot be read.' };
  }
  const exe = entries.find((n) => n.toLowerCase() === EXE.toLowerCase());
  if (exe) return { ok: true, exe: path.join(dir, exe) };
  if (entries.some((n) => n.toLowerCase() === `${FOLDER.toLowerCase()}_data`)) return { ok: true, exe: null };
  return { ok: false, reason: `"${EXE}" was not found in this folder. Pick the "People Playground" folder inside steamapps/common.` };
}

function detectGame(opts) {
  for (const root of steamRoots(opts)) {
    for (const lib of libraryPaths(root)) {
      const dir = path.join(lib, 'steamapps', 'common', FOLDER);
      if (validateGameDir(dir).ok) return dir;
    }
  }
  return null;
}

module.exports = { detectGame, validateGameDir, steamRoots, libraryPaths };
