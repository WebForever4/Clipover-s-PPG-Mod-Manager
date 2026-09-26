const { readJson, writeJson } = require('./store');

const DEFAULTS = {
  ppGameDir: '',
  launchMode: 'exe',
  deleteArchivesAfterInstall: 'false',
  downloadsWatchDir: '',
  ppModsDir: '',
  nexusGameDomain: 'peopleplayground',
  nexusApiKey: '',
  nexusAppSlug: '',
  patreonCookie: '',
  patreonUserAgent: '',
};
const SECRETS = new Set(['nexusApiKey', 'patreonCookie']);
const PREFIX = 'enc:';

class Settings {
  constructor(file, codec = {}) {
    this.file = file;
    this.codec = codec;
    this.data = { ...DEFAULTS, ...readJson(file, {}) };
  }

  get(key) {
    const v = this.data[key];
    if (SECRETS.has(key) && typeof v === 'string' && v.startsWith(PREFIX)) {
      return this.codec.decrypt ? this.codec.decrypt(v.slice(PREFIX.length)) : '';
    }
    return v;
  }

  set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULTS) || typeof v !== 'string') continue;
      this.data[k] = SECRETS.has(k) && v && this.codec.encrypt ? PREFIX + this.codec.encrypt(v) : v.trim();
    }
    writeJson(this.file, this.data);
  }

  publicView() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = SECRETS.has(k) ? '' : this.data[k];
    out.hasNexusKey = !!this.get('nexusApiKey');
    out.hasPatreonCookie = !!this.get('patreonCookie');
    return out;
  }
}

module.exports = { Settings, DEFAULTS };
