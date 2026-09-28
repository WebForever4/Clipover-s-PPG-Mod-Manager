
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RULE_OUT = 'ClippyModManager-PPG-Isolate-Out';
const RULE_IN = 'ClippyModManager-PPG-Isolate-In';

function requireWindows(platform) {
  if (platform !== 'win32') {
    throw new Error('Security mode uses Windows Firewall rules and is only available on Windows.');
  }
}

function isolateScript(exePath) {
  const esc = (s) => s.replace(/'/g, "''");
  return [
    `netsh advfirewall firewall delete rule name="${RULE_OUT}" | Out-Null`,
    `netsh advfirewall firewall delete rule name="${RULE_IN}" | Out-Null`,
    `netsh advfirewall firewall add rule name="${RULE_OUT}" dir=out action=block program='${esc(exePath)}' enable=yes`,
    `if ($LASTEXITCODE -ne 0) { throw "netsh failed to add the outbound block rule." }`,
    `netsh advfirewall firewall add rule name="${RULE_IN}" dir=in action=block program='${esc(exePath)}' enable=yes`,
    `if ($LASTEXITCODE -ne 0) { throw "netsh failed to add the inbound block rule." }`,
  ].join('\n');
}

function removeScript() {
  return [
    `netsh advfirewall firewall delete rule name="${RULE_OUT}"`,
    `netsh advfirewall firewall delete rule name="${RULE_IN}"`,
  ].join('\n');
}

function runElevated(scriptBody, { spawnImpl = spawn, tmpDir = os.tmpdir() } = {}) {
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scriptPath = path.join(tmpDir, `cmm-firewall-${stamp}.ps1`);
    const resultPath = path.join(tmpDir, `cmm-firewall-${stamp}.result`);
    const full = [
      "$ErrorActionPreference = 'Stop'",
      'try {',
      scriptBody,
      `  Set-Content -LiteralPath '${resultPath}' -Value 'OK'`,
      '} catch {',
      `  Set-Content -LiteralPath '${resultPath}' -Value ("ERROR: " + $_.Exception.Message)`,
      '}',
    ].join('\n');
    try {
      fs.writeFileSync(scriptPath, full, 'utf8');
    } catch (e) {
      return reject(new Error(`Could not write a temporary script: ${e.message}`));
    }
    const cleanup = () => {
      try { fs.rmSync(scriptPath, { force: true }); } catch {}
      try { fs.rmSync(resultPath, { force: true }); } catch {}
    };
    let launcher;
    try {
      launcher = spawnImpl('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath}'`,
      ]);
    } catch (e) {
      cleanup();
      return reject(e);
    }
    let stderr = '';
    launcher.stderr?.on('data', (d) => (stderr += d));
    launcher.on('error', (e) => { cleanup(); reject(e); });
    launcher.on('close', () => {
      let result = null;
      try { result = fs.readFileSync(resultPath, 'utf8').trim(); } catch {}
      cleanup();
      if (result === 'OK') return resolve();
      if (result && result.startsWith('ERROR:')) return reject(new Error(result.slice('ERROR:'.length).trim()));
      reject(new Error(stderr.trim() || 'The Windows administrator (UAC) prompt was cancelled, so nothing was changed.'));
    });
  });
}

async function enable(exePath, { platform = process.platform, ...opts } = {}) {
  requireWindows(platform);
  if (!exePath) throw new Error('Set the game folder in Settings first, so the game\u2019s .exe can be found.');
  await runElevated(isolateScript(exePath), opts);
}

async function disable({ platform = process.platform, ...opts } = {}) {
  requireWindows(platform);
  await runElevated(removeScript(), opts);
}

function status({ spawnImpl = spawn, platform = process.platform } = {}) {
  if (platform !== 'win32') return Promise.resolve({ supported: false, active: false });
  return new Promise((resolve) => {
    let p;
    try {
      p = spawnImpl('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE_OUT}`]);
    } catch {
      return resolve({ supported: true, active: false });
    }
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => resolve({ supported: true, active: false }));
    p.on('close', () => resolve({ supported: true, active: new RegExp(RULE_OUT, 'i').test(out) }));
  });
}

module.exports = { enable, disable, status, isolateScript, removeScript, RULE_OUT, RULE_IN };
