const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { EventEmitter } = require('events');
const { tmp } = require('./helpers');
const { enable, disable, status, isolateScript, removeScript, RULE_OUT, RULE_IN } = require('../src/core/firewall');

test('isolateScript references both rule names and the exe path, and checks netsh exit codes', () => {
  const script = isolateScript('C:\\Games\\People Playground\\People Playground.exe');
  assert.match(script, new RegExp(RULE_OUT));
  assert.match(script, new RegExp(RULE_IN));
  assert.match(script, /dir=out action=block/);
  assert.match(script, /dir=in action=block/);
  assert.match(script, /People Playground\.exe/);
  assert.match(script, /LASTEXITCODE/);
});

test('removeScript deletes both rules by name', () => {
  const script = removeScript();
  assert.match(script, new RegExp(`delete rule name="${RULE_OUT}"`));
  assert.match(script, new RegExp(`delete rule name="${RULE_IN}"`));
});

test('enable() refuses on a non-Windows platform without touching the filesystem', async () => {
  await assert.rejects(enable('C:\\game.exe', { platform: 'darwin' }), /only available on Windows/);
});

test('enable() refuses when no exe path is known', async () => {
  await assert.rejects(enable(null, { platform: 'win32' }), /game folder in Settings/);
});

test('disable() refuses on a non-Windows platform', async () => {
  await assert.rejects(disable({ platform: 'darwin' }), /only available on Windows/);
});

test('status() reports unsupported on a non-Windows platform without spawning', async () => {
  const st = await status({ platform: 'darwin', spawnImpl: () => { throw new Error('should not spawn'); } });
  assert.deepEqual(st, { supported: false, active: false });
});

test('status() parses whether the rule is present from netsh output', async () => {
  const fakeSpawn = (out) => () => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    setImmediate(() => { p.stdout.emit('data', out); p.emit('close', 0); });
    return p;
  };
  const active = await status({ platform: 'win32', spawnImpl: fakeSpawn(`Rule Name: ${RULE_OUT}\nEnabled: Yes\n`) });
  assert.deepEqual(active, { supported: true, active: true });
  const inactive = await status({ platform: 'win32', spawnImpl: fakeSpawn('No rules match the specified criteria.\n') });
  assert.deepEqual(inactive, { supported: true, active: false });
});

function fakeElevation(resultContent) {
  const calls = [];
  const spawnImpl = (cmd, args) => {
    calls.push({ cmd, args });
    const joined = args.join(' ');
    const m = joined.match(/'-File','([^']+)'/);
    const p = new EventEmitter();
    p.stderr = new EventEmitter();
    setImmediate(() => {
      if (m) {
        const resultPath = m[1].replace(/\.ps1$/, '.result');
        if (resultContent !== null) fs.writeFileSync(resultPath, resultContent, 'utf8');
      }
      p.emit('close', 0);
    });
    return p;
  };
  spawnImpl.calls = calls;
  return spawnImpl;
}

test('enable() resolves when the elevated script reports OK, and cleans up its temp files', async () => {
  const dir = tmp();
  const spawnImpl = fakeElevation('OK');
  await enable('C:\\game.exe', { platform: 'win32', spawnImpl, tmpDir: dir });
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.match(spawnImpl.calls[0].cmd, /powershell/);
});

test('enable() rejects with the elevated script\'s error message', async () => {
  const dir = tmp();
  const spawnImpl = fakeElevation('ERROR: netsh failed to add the outbound block rule.');
  await assert.rejects(
    enable('C:\\game.exe', { platform: 'win32', spawnImpl, tmpDir: dir }),
    /netsh failed to add the outbound block rule/,
  );
});

test('enable() rejects with a clear message when the UAC prompt is cancelled (no result file written)', async () => {
  const dir = tmp();
  const spawnImpl = fakeElevation(null);
  await assert.rejects(enable('C:\\game.exe', { platform: 'win32', spawnImpl, tmpDir: dir }), /cancelled/);
});

test('disable() resolves when the elevated script reports OK', async () => {
  const dir = tmp();
  const spawnImpl = fakeElevation('OK');
  await disable({ platform: 'win32', spawnImpl, tmpDir: dir });
});
