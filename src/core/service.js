const EventEmitter = require('events');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const { NexusClient, NexusError } = require('./nexus');
const { TopModsClient } = require('./topmods');
const { parseNxm } = require('./nxm');
const { downloadFile } = require('./downloader');
const { installFromArchive, extractArchive } = require('./installer');
const { deploy } = require('./deploy');
const { runPatreonDownload, listArchives } = require('./patreon');
const { validateGameDir } = require('./gamedetect');
const { watchForArchive } = require('./watcher');

class ModManagerService extends EventEmitter {
  constructor({ paths, settings, library, defaultModsDir, defaultDownloadsDir, openExternal, fetchImpl, extract = extractArchive, patreonDownload = runPatreonDownload, patreonDownloadFetch, patreonBrowserDownload, spawnImpl = spawn, watch = watchForArchive }) {
    super();
    Object.assign(this, { paths, settings, library, defaultModsDir, defaultDownloadsDir, openExternal, fetchImpl, extract, patreonDownload, patreonDownloadFetch, patreonBrowserDownload, spawnImpl, watch });
    this._cancels = new Map();
    this.nexus = new NexusClient({ apiKey: settings.get('nexusApiKey'), fetchImpl });
    this.topMods = new TopModsClient({ fetchImpl });
    this.jobs = new Map();
    this.user = null;
  }

  modsDir() {
    const explicit = this.settings.get('ppModsDir');
    if (explicit) return explicit;
    const gameDir = this.settings.get('ppGameDir');
    return gameDir ? path.join(gameDir, 'Mods') : this.defaultModsDir;
  }
  game() { return this.settings.get('nexusGameDomain'); }
  cleanupArchive(file) {
    if (this.settings.get('deleteArchivesAfterInstall') !== 'true') return;
    try { fs.rmSync(file, { force: true }); } catch {}
  }

  watchDir() { return this.settings.get('downloadsWatchDir') || this.defaultDownloadsDir; }

  launchGame() {
    this.applyChanges();
    if (this.settings.get('launchMode') === 'steam') {
      this.openExternal('steam://rungameid/1118200');
      return 'steam';
    }
    const v = validateGameDir(this.settings.get('ppGameDir'));
    if (!v.ok) throw new Error(`Set a valid game folder in Settings to launch the exe directly. ${v.reason}`);
    if (!v.exe) throw new Error('People Playground.exe was not found in the game folder. Choose "Through Steam" in Settings instead.');
    const p = this.spawnImpl(v.exe, [], { cwd: path.dirname(v.exe), detached: true, stdio: 'ignore' });
    if (p && p.unref) p.unref();
    return 'exe';
  }

  _job(label) {
    const job = { id: randomUUID(), label, status: 'starting', received: 0, total: 0, error: null };
    this.jobs.set(job.id, job);
    this._emitJobs();
    return job;
  }
  _update(job, patch) { Object.assign(job, patch); this._emitJobs(); }
  _emitJobs() { this.emit('jobs', [...this.jobs.values()]); }
  listJobs() { return [...this.jobs.values()]; }
  cancelJob(id) {
    const c = this._cancels.get(id);
    if (c) c();
    else this.jobs.delete(id), this._emitJobs();
  }
  clearFinishedJobs() {
    for (const [id, j] of this.jobs) if (j.status === 'done' || j.status === 'failed') this.jobs.delete(id);
    this._emitJobs();
  }

  applyChanges() {
    return deploy({ library: this.library, paths: this.paths, modsDir: this.modsDir() });
  }

  setEnabled(id, on) { this.library.setEnabled(id, on); return this.applyChanges(); }
  removeMod(id) { this.library.remove(id); return this.applyChanges(); }
  setProfile(name) { this.library.setActive(name); return this.applyChanges(); }

  _syncKey() { this.nexus.setApiKey(this.settings.get('nexusApiKey')); }

  async nexusStatus() {
    this._syncKey();
    if (!this.nexus.apiKey) { this.user = null; return null; }
    try {
      const u = await this.nexus.validate();
      this.user = { name: u.name, isPremium: !!u.is_premium, isSupporter: !!u.is_supporter };
    } catch (e) {
      this.user = null;
      if (e.code !== 'BAD_KEY') throw e;
    }
    return this.user;
  }

  async nexusSetKey(key) {
    this.settings.set({ nexusApiKey: key });
    return this.nexusStatus();
  }
  nexusLogout() { this.settings.set({ nexusApiKey: '' }); this._syncKey(); this.user = null; }

  async downloadNexus({ game = this.game(), modId, fileId, key, expires }) {
    this._syncKey();
    const job = this._job(`Nexus mod ${modId}, file ${fileId}`);
    try {
      let fileName, version, modName;
      try {
        const files = await this.nexus.getFiles(game, modId);
        const f = (files.files || []).find((x) => x.file_id === fileId);
        if (f) { fileName = f.file_name; version = f.mod_version || f.version; }
        modName = (await this.nexus.getMod(game, modId)).name;
      } catch {}
      if (modName) this._update(job, { label: modName });

      this._update(job, { status: 'downloading' });
      const url = await this.nexus.getDownloadUrl(game, modId, fileId, { key, expires });
      const file = await downloadFile(url, this.paths.downloads, {
        fileName,
        fetchImpl: this.fetchImpl,
        onProgress: ({ received, total }) => this._update(job, { received, total }),
      });

      this._update(job, { status: 'installing' });
      const entry = await installFromArchive({
        archive: file, library: this.library, paths: this.paths, extract: this.extract,
        meta: { fallbackName: modName, version, source: { type: 'nexus', game, modId, fileId } },
      });
      this.cleanupArchive(file);
      this._update(job, { status: 'done' });
      this.emit('installed', entry);
      return entry;
    } catch (e) {
      this._update(job, { status: 'failed', error: e.message });
      e.jobId = job.id;
      throw e;
    }
  }

  async nexusDownload({ modId, fileId }) {
    if (this.user?.isPremium) {
      try {
        await this.downloadNexus({ modId, fileId });
        return { mode: 'direct' };
      } catch (e) {
        if (!['NXM_REQUIRED', 'FORBIDDEN'].includes(e.code)) throw e;
        if (e.jobId) { this.jobs.delete(e.jobId); this._emitJobs(); }
      }
    }
    await this.startManualDownload({ modId, fileId });
    return { mode: 'manual', watchDir: this.watchDir() };
  }

  async startManualDownload({ modId, fileId }) {
    const game = this.game();
    let modName;
    try { modName = (await this.nexus.getMod(game, modId)).name; } catch {}
    return this._startExternalManualDownload({
      openUrl: `https://www.nexusmods.com/${game}/mods/${modId}?tab=files${fileId ? `&file_id=${fileId}` : ''}`,
      label: modName || `mod ${modId}`,
      source: { type: 'nexus', game, modId, fileId, manual: true },
    });
  }

  async _startExternalManualDownload({ openUrl, label, source }) {
    const job = this._job(`Waiting for "${label}" to finish downloading in ${this.watchDir()}`);
    this._update(job, { status: 'waiting' });
    const w = this.watch({ dir: this.watchDir(), since: Date.now() });
    this._cancels.set(job.id, w.cancel);
    try {
      this.openExternal(openUrl);
    } catch (e) {
      w.cancel();
      this._cancels.delete(job.id);
      this._update(job, { status: 'failed', error: e.message });
      throw e;
    }
    w.promise
      .then(async (file) => {
        this._update(job, { status: 'installing', label: `Installing ${path.basename(file)}` });
        const entry = await installFromArchive({
          archive: file, library: this.library, paths: this.paths, extract: this.extract,
          meta: { fallbackName: label, source },
        });
        this.cleanupArchive(file);
        this._update(job, { status: 'done' });
        this.emit('installed', entry);
      })
      .catch((e) => {
        if (e.message === 'Cancelled') { this.jobs.delete(job.id); this._emitJobs(); }
        else this._update(job, { status: 'failed', error: e.message });
      })
      .finally(() => this._cancels.delete(job.id));
    return job.id;
  }

  async topModsList(kind) {
    return this.topMods.list(kind);
  }

  async startTopModsDownload({ url, title }) {
    return this._startExternalManualDownload({
      openUrl: url,
      label: title || 'top-mods.com mod',
      source: { type: 'topmods', url },
    });
  }

  async handleNxm(link) {
    const p = parseNxm(link);
    if (!p) throw new Error('That is not a valid nxm:// download link.');
    if (p.game !== this.game()) throw new Error(`This link is for "${p.game}", but the manager is set to "${this.game()}". Check Settings.`);
    return this.downloadNexus(p);
  }

  async importArchive(file) {
    const job = this._job(path.basename(file));
    try {
      this._update(job, { status: 'installing' });
      const entry = await installFromArchive({ archive: file, library: this.library, paths: this.paths, extract: this.extract, meta: { source: { type: 'manual' } } });
      this._update(job, { status: 'done' });
      this.emit('installed', entry);
      return entry;
    } catch (e) {
      this._update(job, { status: 'failed', error: e.message });
      throw e;
    }
  }

  savePatreonLogin({ cookie, userAgent }) { this.settings.set({ patreonCookie: cookie, patreonUserAgent: userAgent || '' }); }
  patreonLogout() { this.settings.set({ patreonCookie: '', patreonUserAgent: '' }); }

  async importPatreon(url, onLog = () => {}) {
    const cookie = this.settings.get('patreonCookie');
    if (!/^https:\/\/(www\.)?patreon\.com\//i.test(url)) throw new Error('Enter a patreon.com link.');
    if (!cookie) throw new Error('Add your Patreon cookie in Settings first.');
    const job = this._job(`Patreon: ${url}`);
    const abortController = new AbortController();
    this._cancels.set(job.id, () => abortController.abort());
    try {
      this._update(job, { status: 'downloading' });
      const outDir = path.join(this.paths.downloads, 'patreon', String(Date.now()));
      fs.mkdirSync(outDir, { recursive: true });
      await this.patreonDownload({
        url,
        cookie,
        outDir,
        userAgent: this.settings.get('patreonUserAgent'),
        onLog,
        signal: abortController.signal,
        downloadFetchImpl: this.patreonDownloadFetch,
        browserDownloadImpl: this.patreonBrowserDownload,
      });
      const archives = listArchives(outDir);
      if (!archives.length) throw new Error(`No mod archives (.zip/.7z/.rar) were found in that post. Files are in ${outDir}.`);
      this._update(job, { status: 'installing' });
      const installed = [];
      for (const a of archives) {
        installed.push(await installFromArchive({ archive: a, library: this.library, paths: this.paths, extract: this.extract, meta: { source: { type: 'patreon', url } } }));
        this.cleanupArchive(a);
      }
      this._update(job, { status: 'done' });
      installed.forEach((e) => this.emit('installed', e));
      return installed;
    } catch (e) {
      if (e.message === 'Cancelled') {
        this.jobs.delete(job.id);
        this._emitJobs();
      } else {
        this._update(job, { status: 'failed', error: e.message });
      }
      throw e;
    } finally {
      this._cancels.delete(job.id);
    }
  }
}

module.exports = { ModManagerService };
