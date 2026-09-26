const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const { createPaths } = require('../core/paths');
const { Settings } = require('../core/settings');
const { Library } = require('../core/library');
const { ModManagerService } = require('../core/service');
const { detectGame, validateGameDir } = require('../core/gamedetect');
const dllfix = require('../core/dllfix');
const { loginToPatreon, clearPatreonSession } = require('./patreonLogin');

let win = null;
let service = null;
const pendingNxm = [];
let patreonLoginHandle = null;

function fixedDllPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fixes', 'Assembly-CSharp.dll')
    : path.join(__dirname, '../../resources/fixes/Assembly-CSharp.dll');
}

function openExternal(url) {
  if (!/^(https:|steam:)\/\//i.test(url)) throw new Error('Blocked non-https link.');
  return shell.openExternal(url);
}

const findNxm = (argv) => argv.find((a) => /^nxm:\/\//i.test(a));
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

async function handleNxm(link) {
  if (!service) return void pendingNxm.push(link);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  try {
    const entry = await service.handleNxm(link);
    send('clippy', `Installed "${entry.name}" from Nexus!`);
  } catch (e) {
    send('toast', { kind: 'error', text: e.message });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const link = findNxm(argv);
    if (link) handleNxm(link);
    else if (win) win.focus();
  });
  app.on('open-url', (e, url) => { e.preventDefault(); handleNxm(url); });

  app.whenReady().then(() => {
    const paths = createPaths(path.join(app.getPath('userData'), 'data'));
    const secure = safeStorage.isEncryptionAvailable();
    const settings = new Settings(paths.settings, secure ? {
      encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
      decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
    } : {});
    service = new ModManagerService({
      paths,
      settings,
      library: new Library(paths),
      defaultModsDir: path.join(app.getPath('documents'), 'People Playground', 'mods'),
      defaultDownloadsDir: app.getPath('downloads'),
      openExternal,
    });
    service.on('jobs', (jobs) => send('jobs', jobs));
    service.on('installed', () => send('library-changed'));

    if (!settings.get('ppGameDir')) {
      const found = detectGame();
      if (found) settings.set({ ppGameDir: found });
    }
    registerIpc(settings);
    createWindow();
    const first = findNxm(process.argv);
    if (first) pendingNxm.push(first);
    pendingNxm.splice(0).forEach(handleNxm);
  });
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080, height: 720, minWidth: 820, minHeight: 560,
    title: 'Clippy Mod Manager',
    backgroundColor: '#008080',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { try { openExternal(url); } catch {} return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function registerIpc(settings) {
  const handlers = {
    'settings:get': () => ({ ...settings.publicView(), effectiveModsDir: service.modsDir(), effectiveDownloadsDir: service.watchDir(), secureStorage: safeStorage.isEncryptionAvailable() }),
    'settings:set': (patch) => {
      for (const k of ['nexusApiKey', 'patreonCookie']) if (!patch[k]) delete patch[k];
      settings.set(patch);
    },
    'library:list': () => ({ mods: service.library.list(), profiles: service.library.profiles() }),
    'library:setEnabled': (id, on) => service.setEnabled(id, on),
    'library:remove': (id) => service.removeMod(id),
    'library:apply': () => service.applyChanges(),
    'profile:set': (name) => service.setProfile(name),
    'profile:create': (name, copy) => { service.library.createProfile(name, copy ? service.library.profiles().active : undefined); service.library.setActive(name.trim()); return service.applyChanges(); },
    'profile:delete': (name) => { service.library.deleteProfile(name); return service.applyChanges(); },
    'nexus:status': () => service.nexusStatus(),
    'nexus:login': () => service.nexusLogin(),
    'nexus:cancelLogin': () => service.cancelNexusLogin(),
    'nexus:setKey': (key) => service.nexusSetKey(key),
    'nexus:logout': () => service.nexusLogout(),
    'nexus:openApiKeyPage': () => openExternal('https://www.nexusmods.com/users/myaccount?tab=api'),
    'nexus:mod': (id) => service.nexus.getMod(service.game(), id),
    'nexus:files': (id) => service.nexus.getFiles(service.game(), id),
    'nexus:list': (kind) => ({ trending: () => service.nexus.getTrending(service.game()), added: () => service.nexus.getLatestAdded(service.game()), updated: () => service.nexus.getLatestUpdated(service.game()) }[kind])(),
    'nexus:download': (modId, fileId) => service.nexusDownload({ modId, fileId }),
    'nexus:openFilePage': (modId, fileId) => openExternal(`https://www.nexusmods.com/${service.game()}/mods/${modId}?tab=files&file_id=${fileId}`),
    'nexus:openModPage': (modId) => openExternal(`https://www.nexusmods.com/${service.game()}/mods/${modId}`),
    'patreon:login': async () => {
      patreonLoginHandle = loginToPatreon(win);
      try {
        service.savePatreonLogin(await patreonLoginHandle.promise);
        return true;
      } finally {
        patreonLoginHandle = null;
      }
    },
    'patreon:cancelLogin': () => { if (patreonLoginHandle) patreonLoginHandle.cancel(); },
    'patreon:logout': async () => { service.patreonLogout(); await clearPatreonSession(); },
    'patreon:import': (url) => service.importPatreon(url, (line) => send('patreon-log', line)),
    'jobs:list': () => service.listJobs(),
    'jobs:clear': () => service.clearFinishedJobs(),
    'jobs:cancel': (id) => service.cancelJob(id),
    'game:launch': () => service.launchGame(),
    'game:detect': () => detectGame(),
    'game:validate': (dir) => validateGameDir(dir),
    'dllfix:status': () => dllfix.status({ gameDir: settings.get('ppGameDir'), fixedDll: fixedDllPath() }),
    'dllfix:apply': () => dllfix.applyFix({ gameDir: settings.get('ppGameDir'), fixedDll: fixedDllPath() }),
    'dllfix:revert': () => dllfix.revertFix({ gameDir: settings.get('ppGameDir') }),
    'app:openGameFolder': () => { const d = settings.get('ppGameDir'); if (!d) throw new Error('Set the game folder in Settings first.'); return shell.openPath(d); },
    'app:openModsFolder': () => shell.openPath(service.modsDir()),
    'app:registerNxm': () => (process.defaultApp
      ? app.setAsDefaultProtocolClient('nxm', process.execPath, [path.resolve(process.argv[1])])
      : app.setAsDefaultProtocolClient('nxm')),
    'app:pickArchive': async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Add mod archive', filters: [{ name: 'Mod archives', extensions: ['zip', '7z', 'rar'] }], properties: ['openFile', 'multiSelections'] });
      const added = [];
      for (const f of r.canceled ? [] : r.filePaths) added.push(await service.importArchive(f));
      return added.length;
    },
    'app:pickFolder': async () => {
      const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    },
  };
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(name, async (_e, ...args) => {
      try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message || String(e) }; }
    });
  }
}
