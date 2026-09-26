const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['jobs', 'library-changed', 'clippy', 'toast', 'patreon-log'];

contextBridge.exposeInMainWorld('cmm', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  },
});
