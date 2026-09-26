const { randomUUID } = require('crypto');

const BASE = 'https://api.nexusmods.com/v1';

class NexusError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'NexusError';
    this.status = status;
    this.code = code;
  }
}

class NexusClient {
  constructor({ apiKey = '', appName = 'ClippyModManager', appVersion = '0.1.0', fetchImpl, baseUrl = BASE } = {}) {
    this.apiKey = apiKey;
    this.appName = appName;
    this.appVersion = appVersion;
    this.fetch = fetchImpl || globalThis.fetch;
    this.baseUrl = baseUrl;
    this.rateLimit = {};
  }

  setApiKey(key) {
    this.apiKey = key || '';
  }

  async request(pathname, query) {
    if (!this.apiKey) throw new NexusError('You are not logged in to Nexus Mods.', { code: 'NO_KEY' });
    const url = new URL(this.baseUrl + pathname);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.fetch(url, {
      headers: {
        APIKEY: this.apiKey,
        'Protocol-Version': '1.0.0',
        'Application-Name': this.appName,
        'Application-Version': this.appVersion,
        Accept: 'application/json',
      },
    });
    this.rateLimit = {
      dailyRemaining: res.headers.get('x-rl-daily-remaining'),
      hourlyRemaining: res.headers.get('x-rl-hourly-remaining'),
    };
    if (!res.ok) {
      let message;
      try {
        message = JSON.parse(await res.text()).message;
      } catch {}
      const code = { 401: 'BAD_KEY', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 429: 'RATE_LIMIT' }[res.status];
      throw new NexusError(message || `Nexus returned HTTP ${res.status}`, { status: res.status, code });
    }
    return res.json();
  }

  validate() { return this.request('/users/validate.json'); }
  getMod(game, modId) { return this.request(`/games/${game}/mods/${modId}.json`); }
  getFiles(game, modId) { return this.request(`/games/${game}/mods/${modId}/files.json`); }
  getTrending(game) { return this.request(`/games/${game}/mods/trending.json`); }
  getLatestAdded(game) { return this.request(`/games/${game}/mods/latest_added.json`); }
  getLatestUpdated(game) { return this.request(`/games/${game}/mods/latest_updated.json`); }

  async getDownloadUrl(game, modId, fileId, { key, expires } = {}) {
    let links;
    try {
      links = await this.request(`/games/${game}/mods/${modId}/files/${fileId}/download_link.json`, { key, expires });
    } catch (e) {
      if (e.status === 403 && !key) {
        throw new NexusError(
          'Free accounts must start downloads from the Nexus website ("Mod Manager Download").',
          { status: 403, code: 'NXM_REQUIRED' },
        );
      }
      throw e;
    }
    if (!Array.isArray(links) || !links.length || !links[0].URI) {
      throw new NexusError('Nexus did not return a download link.', { code: 'NO_LINK' });
    }
    return links[0].URI;
  }
}

function ssoLogin({
  appSlug,
  openUrl,
  WebSocketImpl = globalThis.WebSocket,
  url = 'wss://sso.nexusmods.com',
  connectTimeoutMs = 15000,
  browserTimeoutMs = 300000,
}) {
  const id = randomUUID();
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let ws;
    const finish = (err, key) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch {}
      err ? reject(err) : resolve(key);
    };
    const arm = (ms, msg) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new NexusError(msg, { code: 'TIMEOUT' })), ms);
    };
    cancel = () => finish(new NexusError('Login cancelled.', { code: 'CANCELLED' }));
    arm(connectTimeoutMs, 'Could not reach the Nexus login server.');
    ws = new WebSocketImpl(url);
    ws.onopen = () => ws.send(JSON.stringify({ id, protocol: 2 }));
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return finish(new NexusError('Bad response from the Nexus login server.'));
      }
      if (!msg.success) return finish(new NexusError(`Nexus login failed: ${msg.error || 'unknown error'}`));
      const data = msg.data || {};
      if (data.connection_token) {
        arm(browserTimeoutMs, 'Timed out waiting for approval in the browser.');
        try {
          openUrl(`https://www.nexusmods.com/sso?id=${id}&application=${encodeURIComponent(appSlug)}`);
        } catch (e) {
          finish(e);
        }
      } else if (data.api_key) {
        finish(null, data.api_key);
      }
    };
    ws.onerror = () => finish(new NexusError('Connection to the Nexus login server failed.'));
    ws.onclose = () => finish(new NexusError('The Nexus login server closed the connection.', { code: 'CLOSED' }));
  });
  return { id, promise, cancel: () => cancel() };
}

module.exports = { NexusClient, NexusError, ssoLogin };
