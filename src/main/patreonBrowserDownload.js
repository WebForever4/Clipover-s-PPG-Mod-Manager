const { BrowserWindow, session } = require('electron');

const PARTITION = 'persist:patreon-login';

function browserDownload(url, destPath, { referer, timeoutMs = 180000, userAgent } = {}) {
  const ses = session.fromPartition(PARTITION);
  if (userAgent) ses.setUserAgent(userAgent);

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      show: false,
      autoHideMenuBar: true,
      title: 'Patreon download',
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });

    let settled = false;
    let started = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ses.removeListener('will-download', onWillDownload);
      if (!win.isDestroyed()) win.destroy();
      err ? reject(err) : resolve();
    };

    const onWillDownload = (event, item) => {
      started = true;
      item.setSavePath(destPath);
      item.once('done', (_e, state) => {
        if (state === 'completed') finish(null);
        else finish(new Error(`Browser download ${state}`));
      });
    };
    ses.on('will-download', onWillDownload);

    const timer = setTimeout(() => finish(new Error('Timed out waiting for Patreon to start the download.')), timeoutMs);

    win.on('closed', () => { if (!started) finish(new Error('Download window was closed before the file started.')); });

    win.webContents.on('did-finish-load', () => {
      if (!started && !win.isDestroyed()) win.show();
    });

    win.loadURL(url, referer ? { httpReferrer: referer } : undefined).catch(() => {
    });
  });
}

module.exports = { browserDownload };
