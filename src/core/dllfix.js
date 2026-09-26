const fs = require('fs');
const path = require('path');

const RELATIVE_DLL_PATH = path.join('People Playground_Data', 'Managed', 'Assembly-CSharp.dll');
const BACKUP_SUFFIX = '.pre-fix-backup';

function managedDllPath(gameDir) {
  return path.join(gameDir, RELATIVE_DLL_PATH);
}

function backupPath(target) {
  return `${target}${BACKUP_SUFFIX}`;
}

function filesMatch(a, b) {
  try {
    return Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
  } catch {
    return false;
  }
}

function status({ gameDir, fixedDll }) {
  if (!gameDir) return { ok: false, reason: 'Set the game folder in Settings first.' };
  const target = managedDllPath(gameDir);
  if (!fs.existsSync(target)) return { ok: false, reason: `Could not find Assembly-CSharp.dll at ${target}.` };
  return {
    ok: true,
    target,
    applied: filesMatch(target, fixedDll),
    hasBackup: fs.existsSync(backupPath(target)),
  };
}

function applyFix({ gameDir, fixedDll }) {
  const target = managedDllPath(gameDir);
  if (!fs.existsSync(target)) throw new Error(`Could not find Assembly-CSharp.dll at ${target}. Check the game folder in Settings.`);
  if (!fs.existsSync(fixedDll)) throw new Error('The bundled fixed Assembly-CSharp.dll is missing from this install of Clippy Mod Manager.');
  const backup = backupPath(target);
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  fs.copyFileSync(fixedDll, target);
  return { target, backup };
}

function revertFix({ gameDir }) {
  const target = managedDllPath(gameDir);
  const backup = backupPath(target);
  if (!fs.existsSync(backup)) throw new Error('No backup of the original Assembly-CSharp.dll was found to restore.');
  fs.copyFileSync(backup, target);
  return { target };
}

module.exports = { managedDllPath, backupPath, status, applyFix, revertFix, RELATIVE_DLL_PATH };
