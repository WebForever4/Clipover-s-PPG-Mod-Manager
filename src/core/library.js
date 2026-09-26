const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./store');

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

class Library {
  constructor(paths) {
    this.paths = paths;
    this.mods = readJson(paths.library, { mods: [] }).mods;
    const p = readJson(paths.profiles, null);
    this.pdata = p && p.profiles && Object.keys(p.profiles).length
      ? p
      : { active: 'Default', profiles: { Default: { enabled: [] } } };
    if (!this.pdata.profiles[this.pdata.active]) this.pdata.active = Object.keys(this.pdata.profiles)[0];
  }

  _saveMods() { writeJson(this.paths.library, { mods: this.mods }); }
  _saveProfiles() { writeJson(this.paths.profiles, this.pdata); }

  list() { return this.mods.map((m) => ({ ...m, enabled: this.isEnabled(m.id) })); }
  get(id) { return this.mods.find((m) => m.id === id); }

  uniqueId(name) {
    const base = slugify(name) || 'mod';
    let id = base;
    for (let n = 2; this.get(id) || fs.existsSync(path.join(this.paths.mods, id)); n++) id = `${base}-${n}`;
    return id;
  }

  add(fields) {
    const entry = { installedAt: new Date().toISOString(), ...fields };
    this.mods.push(entry);
    this._saveMods();
    return entry;
  }

  remove(id) {
    const idx = this.mods.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    this.mods.splice(idx, 1);
    fs.rmSync(path.join(this.paths.mods, id), { recursive: true, force: true });
    for (const prof of Object.values(this.pdata.profiles)) prof.enabled = prof.enabled.filter((x) => x !== id);
    this._saveMods();
    this._saveProfiles();
    return true;
  }

  profiles() { return { active: this.pdata.active, names: Object.keys(this.pdata.profiles) }; }

  _cleanName(name) {
    const n = String(name || '').trim();
    if (!n) throw new Error('Profile name cannot be empty.');
    return n;
  }

  createProfile(name, copyFrom) {
    const n = this._cleanName(name);
    if (this.pdata.profiles[n]) throw new Error(`A profile named "${n}" already exists.`);
    const src = copyFrom && this.pdata.profiles[copyFrom];
    this.pdata.profiles[n] = { enabled: src ? [...src.enabled] : [] };
    this._saveProfiles();
    return n;
  }

  deleteProfile(name) {
    if (!this.pdata.profiles[name]) return;
    if (Object.keys(this.pdata.profiles).length === 1) throw new Error('You need at least one profile.');
    delete this.pdata.profiles[name];
    if (this.pdata.active === name) this.pdata.active = Object.keys(this.pdata.profiles)[0];
    this._saveProfiles();
  }

  setActive(name) {
    if (!this.pdata.profiles[name]) throw new Error(`No profile named "${name}".`);
    this.pdata.active = name;
    this._saveProfiles();
  }

  isEnabled(id) { return this.pdata.profiles[this.pdata.active].enabled.includes(id); }

  setEnabled(id, on) {
    if (!this.get(id)) throw new Error('Unknown mod.');
    const prof = this.pdata.profiles[this.pdata.active];
    const has = prof.enabled.includes(id);
    if (on && !has) prof.enabled.push(id);
    if (!on && has) prof.enabled = prof.enabled.filter((x) => x !== id);
    this._saveProfiles();
  }

  enabledIds() {
    return this.pdata.profiles[this.pdata.active].enabled.filter((id) => this.get(id));
  }
}

module.exports = { Library, slugify };
