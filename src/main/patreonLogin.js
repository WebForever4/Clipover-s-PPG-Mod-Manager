const { BrowserWindow, session } = require('electron');
const { buildCookieHeader, looksLoggedIn } = require('../core/patreon');

const PARTITION = 'persist:patreon-login';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function loginToPatreon(parent) {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(DESKTOP_CHROME_UA);

  const win = new BrowserWindow({
    width: 480,
    height: 760,
    parent,
    modal: !!parent,
    autoHideMenuBar: true,
    title: 'Log in to Patreon',
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const promise = new Promise((resolve, reject) => {
    let finished = false;

    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      err ? reject(err) : resolve(value);
      if (!win.isDestroyed()) win.close();
    };

    const check = async () => {
      if (finished || win.isDestroyed()) return;
      try {
        const cookies = await ses.cookies.get({ domain: 'patreon.com' });
        const header = buildCookieHeader(cookies);
        if (looksLoggedIn(header)) finish(null, { cookie: header, userAgent: DESKTOP_CHROME_UA });
      } catch {
      }
    };
    const poll = setInterval(check, 1500);

    win.on('closed', () => finish(new Error('Patreon login was cancelled.')));
    win.webContents.setWindowOpenHandler(({ url }) => {
      win.loadURL(url);
      return { action: 'deny' };
    });
    win.loadURL('https://www.patreon.com/login');
  });

  return { promise, cancel: () => { if (!win.isDestroyed()) win.close(); } };
}

async function clearPatreonSession() {
  await session.fromPartition(PARTITION).clearStorageData();
}

module.exports = { loginToPatreon, clearPatreonSession };
