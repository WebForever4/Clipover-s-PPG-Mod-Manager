'use strict';

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}
const view = () => document.getElementById('view');
const alpha = () => h('span', { class: 'alpha', text: 'ALPHA', title: 'Alpha: still being tested, expect problems' });

async function call(name, ...args) {
  const r = await window.cmm.invoke(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
async function safe(fn) {
  try { return await fn(); } catch (e) { toast(e.message, 'error'); }
}

function toast(text, kind = 'info') {
  const t = h('div', { class: `toast ${kind}`, text });
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 9000 : 4500);
}
function setStatus(text) { document.getElementById('status').textContent = text; }

const TIPS = [
  'It looks like you\'re modding a ragdoll. Would you like help?',
  'Toggle a checkbox and the mod is in the game folder straight away.',
  'Profiles let you keep a "chaos" setup and a "vanilla" setup side by side.',
  'Nexus only offers Manual Download for this game. Save the file and it gets imported from your Downloads folder.',
  'A ⚠ next to a mod means it has no mod.json, so the game may ignore it.',
  'Right-click Clippy to hide it. Bring it back from Settings.',
];
const clippy = {
  box: document.getElementById('clippy'),
  bubble: document.getElementById('bubble'),
  timer: null,
  i: 0,
  say(text, ms = 9000) {
    this.bubble.textContent = text;
    this.bubble.classList.remove('hidden');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.bubble.classList.add('hidden'), ms);
  },
  next() { this.say(TIPS[this.i++ % TIPS.length]); },
};
clippy.box.addEventListener('click', () => clippy.next());
document.addEventListener('mousemove', (e) => {
  const svg = clippy.box.querySelector('svg');
  const r = svg.getBoundingClientRect();
  const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 300)) * 3;
  const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 3)) / 300)) * 3;
  svg.querySelectorAll('.pupil').forEach((p) => p.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`));
});
clippy.box.addEventListener('contextmenu', (e) => { e.preventDefault(); clippy.box.classList.add('hidden'); });
setInterval(() => { if (!clippy.box.classList.contains('hidden') && Math.random() < 0.5) clippy.next(); }, 60000);

(function setUpPaperclipUnravel() {
  const CURLED = [
    [46, 80], [46, 36], [46, 14], [74, 14], [74, 36], [74, 104],
    [74, 134], [26, 134], [26, 104], [26, 42], [26, 2], [90, 2], [90, 42], [90, 98],
  ];
  const N = CURLED.length;
  const start = CURLED[0];

  function pathFor(points) {
    const p = points;
    return `M ${p[0][0]} ${p[0][1]} `
      + `L ${p[1][0]} ${p[1][1]} `
      + `C ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]} ${p[4][0]} ${p[4][1]} `
      + `L ${p[5][0]} ${p[5][1]} `
      + `C ${p[6][0]} ${p[6][1]} ${p[7][0]} ${p[7][1]} ${p[8][0]} ${p[8][1]} `
      + `L ${p[9][0]} ${p[9][1]} `
      + `C ${p[10][0]} ${p[10][1]} ${p[11][0]} ${p[11][1]} ${p[12][0]} ${p[12][1]} `
      + `L ${p[13][0]} ${p[13][1]}`;
  }

  const wires = ['wire', 'wire-mid', 'wire-hi'].map((id) => document.getElementById(id)).filter(Boolean);
  const handle = document.getElementById('wire-end-handle');
  if (!wires.length || !handle) return;

  const setPoints = (points) => {
    const d = pathFor(points);
    wires.forEach((w) => w.setAttribute('d', d));
    handle.setAttribute('cx', points[N - 1][0]);
    handle.setAttribute('cy', points[N - 1][1]);
  };

  let audioCtx = null;
  function playScream() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      const dur = 0.9;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(300, now + dur);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch {}
  }

  const svg = clippy.box.querySelector('svg');
  const rig = document.getElementById('clippy-rig');
  let dragging = false;
  let screamed = false;
  let animId = null;
  const MAX_DRAG = 200;

  function svgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = rig.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: clientX, y: clientY };
  }

  function onMove(e) {
    if (!dragging) return;
    const p = svgPoint(e.clientX, e.clientY);
    const target = [p.x, p.y];
    const dragDist = Math.hypot(target[0] - CURLED[N - 1][0], target[1] - CURLED[N - 1][1]);
    const alpha = Math.max(0, Math.min(1, dragDist / MAX_DRAG));
    const points = CURLED.map((pt, i) => {
      const t = i / (N - 1);
      const straightX = start[0] + t * (target[0] - start[0]);
      const straightY = start[1] + t * (target[1] - start[1]);
      return [pt[0] + (straightX - pt[0]) * alpha, pt[1] + (straightY - pt[1]) * alpha];
    });
    setPoints(points);
    if (alpha >= 0.98 && !screamed) {
      screamed = true;
      playScream();
      clippy.say('AAAAAAAH!', 3000);
    } else if (alpha < 0.98) {
      screamed = false;
    }
  }

  function springBack() {
    cancelAnimationFrame(animId);
    const from = [handle.cx.baseVal.value, handle.cy.baseVal.value];
    const startTime = performance.now();
    const duration = 350;
    const dragDist = Math.hypot(from[0] - CURLED[N - 1][0], from[1] - CURLED[N - 1][1]);
    const releaseAlpha = Math.max(0, Math.min(1, dragDist / MAX_DRAG));
    const releasePoints = CURLED.map((pt, i) => {
      const t = i / (N - 1);
      const straightX = start[0] + t * (from[0] - start[0]);
      const straightY = start[1] + t * (from[1] - start[1]);
      return [pt[0] + (straightX - pt[0]) * releaseAlpha, pt[1] + (straightY - pt[1]) * releaseAlpha];
    });
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const points = CURLED.map((pt, i) => [
        releasePoints[i][0] + (pt[0] - releasePoints[i][0]) * t,
        releasePoints[i][1] + (pt[1] - releasePoints[i][1]) * t,
      ]);
      setPoints(points);
      if (t < 1) animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    screamed = false;
    clippy.box.classList.remove('unraveling');
    springBack();
  }

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    screamed = false;
    clippy.box.classList.add('unraveling');
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
})();

const state = { tab: 'mods', lib: { mods: [], profiles: { active: '', names: [] } }, settings: null, user: null, jobs: [], nexus: { list: [], mod: null, files: [], modId: '' }, topmods: { list: [], kind: null }, patreonLog: [], patreon: { loggingIn: false } };

const TABS = [['mods', 'Mods'], ['nexus', 'Nexus Mods'], ['topmods', 'Top Mods'], ['patreon', 'Patreon'], ['downloads', 'Downloads'], ['arcade', 'Arcade'], ['settings', 'Settings']];
function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `tab ${state.tab === id ? 'active' : ''}`, onclick: () => go(id) }, label, id === 'patreon' ? alpha() : null)));
}
function go(tab) { state.tab = tab; renderTabs(); render(); }
function render() { ({ mods: renderMods, nexus: renderNexus, topmods: renderTopMods, patreon: renderPatreon, downloads: renderDownloads, arcade: renderArcade, settings: renderSettings })[state.tab](); }

async function renderArcade() {
  const box = view();
  box.replaceChildren(h('div', { class: 'panel' }, h('h3', { text: 'Arcade' }), h('div', { class: 'hint', text: 'Checking the game folder…' })));
  let files = [];
  try { files = await call('arcade:list'); } catch {}
  box.replaceChildren(
    h('div', { class: 'panel' },
      h('h3', { text: 'Arcade' }),
      h('div', { class: 'hint' }, 'Drop an HTML5 game into the folder below \u2014 any .html file inside it (at any depth) shows up here to play.'),
      h('div', { class: 'row' }, h('button', { text: 'Open game folder', onclick: () => safe(() => call('arcade:openGameFolder')) })),
      files.length
        ? h('div', { class: 'row' }, ...files.map((f) => h('button', { text: `Play ${f}`, onclick: () => safe(() => call('arcade:play', f)) })))
        : h('div', { class: 'empty', text: 'No .html files found in the game folder yet.' }),
    ),
  );
}

function reportDeploy(r) {
  if (r && r.skipped && r.skipped.length) toast(r.skipped.map((s) => `${s.id}: ${s.reason}`).join('\n'), 'error');
}

async function refreshLibrary() {
  state.lib = await call('library:list');
  if (state.tab === 'mods') renderMods();
}

function renderMods() {
  const { mods, profiles } = state.lib;
  const newName = h('input', { type: 'text', placeholder: 'New profile name', style: 'width:160px' });
  const copy = h('input', { type: 'checkbox', id: 'copyprof', checked: true });

  const toolbar = h('div', { class: 'row' },
    h('b', { text: 'Profile:' }),
    h('select', { onchange: (e) => safe(async () => { reportDeploy(await call('profile:set', e.target.value)); await refreshLibrary(); }) },
      profiles.names.map((n) => h('option', { value: n, text: n, selected: n === profiles.active }))),
    newName, h('label', { for: 'copyprof', style: 'display:inline;font-weight:normal;margin:0' }, copy, ' copy current'),
    h('button', { text: 'Create', onclick: () => safe(async () => { reportDeploy(await call('profile:create', newName.value, copy.checked)); await refreshLibrary(); }) }),
    h('button', { text: 'Delete profile', onclick: () => safe(async () => { await call('profile:delete', profiles.active); await refreshLibrary(); }) }),
  );

  const actions = h('div', { class: 'row' },
    h('button', { class: 'primary', text: '▶ Play People Playground', onclick: () => safe(() => call('game:launch')) }),
    h('button', { text: 'Add archive…', onclick: () => safe(async () => { const n = await call('app:pickArchive'); if (n) { await refreshLibrary(); clippy.say(`Added ${n} mod${n > 1 ? 's' : ''}. Tick the box to enable.`); } }) }),
    h('button', { text: 'Re-apply', onclick: () => safe(async () => { reportDeploy(await call('library:apply')); toast('Game mods folder is up to date.'); }) }),
    h('button', { text: 'Open game mods folder', onclick: () => safe(() => call('app:openModsFolder')) }),
    h('button', { text: 'Open game folder', onclick: () => safe(() => call('app:openGameFolder')) }),
  );

  const table = mods.length
    ? h('table', {},
        h('thead', {}, h('tr', {}, ['On', 'Name', 'Version', 'Author', 'Source', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, mods.map((m) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: m.enabled, onchange: (e) => safe(async () => { reportDeploy(await call('library:setEnabled', m.id, e.target.checked)); await refreshLibrary(); }) })),
          h('td', {}, m.name, m.hasManifest === false ? h('span', { class: 'warn', title: 'No mod.json found. The game may ignore this mod.', text: ' ⚠' }) : null),
          h('td', { text: m.version || '' }),
          h('td', { text: m.author || '' }),
          h('td', {}, h('span', { class: 'tag', text: m.source?.type || 'manual' })),
          h('td', {}, h('button', { text: 'Remove', onclick: () => { if (confirm(`Remove "${m.name}" from the library?`)) safe(async () => { await call('library:remove', m.id); await refreshLibrary(); }); } })),
        ))))
    : h('div', { class: 'empty' }, 'No mods yet. Add an archive, or grab one from the Nexus Mods or Patreon tab.');

  view().replaceChildren(toolbar, actions, table);
  setStatus(`${mods.length} mod(s), ${mods.filter((m) => m.enabled).length} enabled in "${profiles.active}".`);
}

async function refreshNexusStatus() {
  try { state.user = await call('nexus:status'); } catch (e) { state.user = null; toast(e.message, 'error'); }
  if (state.tab === 'nexus') renderNexus();
}

const fmtKb = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

function modCard(m) {
  return h('div', { class: 'card' },
    m.picture_url ? h('img', { src: m.picture_url, alt: '' }) : null,
    h('div', { class: 'meta' },
      h('div', { class: 'name', text: m.name }),
      h('div', { class: 'hint', text: `by ${m.author || 'unknown'} · ID ${m.mod_id}` }),
      h('div', { class: 'summary', text: m.summary || '' }),
      h('button', { text: 'Files…', onclick: () => lookupMod(String(m.mod_id)) })));
}

function extractNexusModId(input) {
  const raw = (input || '').trim();
  const urlMatch = raw.match(/nexusmods\.com\/[^/\s]+\/mods\/(\d+)/i);
  return urlMatch ? Number(urlMatch[1]) : Number(raw);
}

async function lookupMod(id) {
  const n = extractNexusModId(id);
  if (!Number.isInteger(n) || n <= 0) return toast('Enter a numeric mod ID, or paste a Nexus mod page link.', 'error');
  await safe(async () => {
    const [mod, files] = await Promise.all([call('nexus:mod', n), call('nexus:files', n)]);
    state.nexus.mod = mod; state.nexus.modId = String(n);
    state.nexus.files = (files.files || []).filter((f) => !['ARCHIVED', 'DELETED'].includes(f.category_name));
    renderNexus();
  });
}

function downloadNexus(modId, file) {
  const premium = !!state.user?.isPremium;
  if (premium) clippy.say(`Trying a direct download of ${file.name}…`);
  call('nexus:download', modId, file.file_id)
    .then((r) => {
      refreshLibrary();
      if (r.mode === 'manual') {
        clippy.say(`On the Nexus page click "Manual Download", then save the file. It gets picked up from ${r.watchDir} and installed.`, 16000);
        go('downloads');
      } else clippy.say(`Installed ${file.name}!`);
    })
    .catch((e) => toast(e.message, 'error'));
  if (premium) go('downloads');
}

function renderNexus() {
  const s = state.settings;
  const key = h('input', { type: 'password', placeholder: 'Paste your personal API key' });
  const status = state.user
    ? h('div', {}, `Logged in as `, h('b', { text: state.user.name }), state.user.isPremium ? ' (Premium: tries direct downloads)' : ' (free: click Manual Download on the site and the file is imported automatically)', ' ',
        h('button', { text: 'Log out', onclick: () => safe(async () => { await call('nexus:logout'); state.user = null; renderNexus(); }) }))
    : h('div', {},
        h('div', { text: 'Not logged in.' }),
        h('div', { class: 'row' },
          h('button', { class: 'primary', text: 'Get API key from Nexus (opens browser)', onclick: () => safe(() => call('nexus:openApiKeyPage')) }),
          h('div', { class: 'grow' }, key),
          h('button', { text: 'Use API key', onclick: () => safe(async () => { state.user = await call('nexus:setKey', key.value); if (!state.user) toast('That key was not accepted.', 'error'); renderNexus(); }) })),
        h('div', { class: 'hint', text: 'Click "Get API key from Nexus" to open your account\'s API key page in the browser, then paste the key here.' }));

  const idInput = h('input', {
    type: 'text', placeholder: 'Mod ID, or paste a mod page link', value: state.nexus.modId, style: 'width:220px',
    onpaste: (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (/nexusmods\.com\/[^/\s]+\/mods\/\d+/i.test(pasted)) {
        e.preventDefault();
        const n = extractNexusModId(pasted);
        idInput.value = String(n);
        lookupMod(idInput.value);
      }
    },
  });
  const lookup = h('div', { class: 'panel' }, h('h3', { text: 'Look up a mod' }),
    h('div', { class: 'row' }, idInput, h('button', { text: 'Look up', onclick: () => lookupMod(idInput.value.trim()) })));

  if (state.nexus.mod) {
    const m = state.nexus.mod;
    lookup.append(
      h('div', {}, h('b', { text: m.name }), ` by ${m.author || 'unknown'} `, h('button', { text: 'Open page', onclick: () => safe(() => call('nexus:openModPage', m.mod_id)) })),
      h('div', { class: 'hint', text: m.summary || '' }),
      state.nexus.files.length ? h('div', { class: 'hint', text: state.user?.isPremium ? 'Premium: a direct download is tried first, with the manual flow as the fallback if Nexus refuses.' : `Nexus only offers Manual Download for this game. Click Get, use Manual Download on the page, and the file is imported from ${state.settings?.effectiveDownloadsDir || 'your Downloads folder'}.` }) : null,
      state.nexus.files.length ? h('table', {},
        h('thead', {}, h('tr', {}, ['File', 'Version', 'Type', 'Size', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, state.nexus.files.map((f) => h('tr', {},
          h('td', { text: f.name }), h('td', { text: f.mod_version || f.version || '' }), h('td', { text: f.category_name || '' }), h('td', { text: fmtKb(f.size_kb || 0) }),
          h('td', {}, h('button', { class: 'primary', text: state.user?.isPremium ? 'Download' : 'Get (manual)', onclick: () => downloadNexus(m.mod_id, f) })))))) : h('div', { class: 'hint', text: 'No downloadable files.' }));
  }

  const browse = h('div', { class: 'panel' }, h('h3', { text: 'Browse' }),
    h('div', { class: 'row' }, [['trending', 'Trending'], ['added', 'Latest added'], ['updated', 'Latest updated']].map(([k, label]) =>
      h('button', { text: label, disabled: !state.user, onclick: () => safe(async () => { state.nexus.list = await call('nexus:list', k); renderNexus(); }) }))),
    state.nexus.list.length ? h('div', { class: 'cards' }, state.nexus.list.slice(0, 24).map(modCard)) : h('div', { class: 'hint', text: state.user ? 'Pick a list above.' : 'Log in to browse.' }));

  view().replaceChildren(h('div', { class: 'panel' }, h('h3', { text: 'Account' }), status), lookup, browse);
  setStatus(`Nexus game: ${s?.nexusGameDomain || '?'}`);
}

function topModCard(m) {
  return h('div', { class: 'card' },
    m.thumbnail ? h('img', { src: m.thumbnail, alt: '' }) : null,
    h('div', { class: 'meta' },
      h('div', { class: 'name', text: m.title }),
      h('button', { class: 'primary', text: 'View \u0026 get (opens browser)', onclick: () => safe(async () => {
        const r = await call('topmods:download', m.url, m.title);
        clippy.say('On the mod page, click through to the file host and download it \u2014 it gets picked up from your Downloads folder and installed.', 16000);
        go('downloads');
        return r;
      }) })));
}

async function renderTopMods() {
  const loadList = async (kind) => {
    state.topmods.kind = kind;
    renderTopMods();
    try {
      state.topmods.list = await call('topmods:list', kind);
    } catch (e) {
      state.topmods.list = [];
      toast(e.message, 'error');
    }
    renderTopMods();
  };
  view().replaceChildren(
    h('div', { class: 'panel' }, h('h3', { text: 'Top Mods (top-mods.com)' }),
      h('div', { class: 'hint', text: 'An unofficial, fan-run mod site \u2014 not affiliated with People Playground or Nexus. Files are hosted on third-party file lockers, so clicking a mod opens its page in your browser; download it there like usual and it is imported from your Downloads folder, same as a manual Nexus download.' }),
      h('div', { class: 'row' }, [['newest', 'Newest'], ['downloaded', 'Top downloaded'], ['rated', 'Top rated'], ['commented', 'Most commented']].map(([k, label]) =>
        h('button', { class: state.topmods.kind === k ? 'primary' : '', text: label, onclick: () => loadList(k) }))),
      state.topmods.list.length ? h('div', { class: 'cards' }, state.topmods.list.slice(0, 30).map(topModCard))
        : h('div', { class: 'hint', text: state.topmods.kind ? 'No mods found.' : 'Pick a list above.' })));
  setStatus('Top Mods');
}

function renderPatreon() {
  const s = state.settings || {};
  const url = h('input', { type: 'text', placeholder: 'https://www.patreon.com/posts/…' });
  const log = h('pre', { class: 'log', id: 'plog', text: state.patreonLog.join('\n') });
  const btn = h('button', { class: 'primary', text: 'Download and install', disabled: !s.hasPatreonCookie, onclick: () => {
    state.patreonLog = []; log.textContent = ''; btn.disabled = true;
    call('patreon:import', url.value.trim())
      .then((added) => { refreshLibrary(); clippy.say(`Installed ${added.length} mod${added.length === 1 ? '' : 's'} from Patreon!`); })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => (btn.disabled = false));
  } });

  const account = state.patreon.loggingIn
    ? h('div', { class: 'row' }, h('span', { text: 'Waiting for you to log in in the Patreon window\u2026' }), h('button', { text: 'Cancel', onclick: () => safe(() => call('patreon:cancelLogin')) }))
    : s.hasPatreonCookie
    ? h('div', { class: 'row' }, h('span', { text: '\u2714 Logged in to Patreon.' }),
        h('button', { text: 'Log in again', onclick: () => patreonLogin() }),
        h('button', { text: 'Log out', onclick: () => safe(async () => { await call('patreon:logout'); state.settings = await call('settings:get'); renderPatreon(); }) }))
    : h('div', {},
        h('div', { class: 'row' }, h('button', { class: 'primary', text: 'Log in with Patreon', onclick: () => patreonLogin() })),
        h('div', { class: 'hint', text: 'A Patreon login window opens inside the app. Email login and Google sign-in both work there.' }));

  view().replaceChildren(
    h('div', { class: 'panel' }, h('h3', { text: 'Patreon account' }), account,
      h('div', { class: 'hint', text: 'Your password goes to patreon.com only. The app keeps the session cookie (encrypted) to download posts you can access.' })),
    h('div', { class: 'panel' }, h('h3', { text: 'Download a mod from a Patreon post' }, alpha()),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, url), btn), log));
  setStatus('Ready.');
}

function renderDownloads() {
  const jobs = state.jobs;
  view().replaceChildren(
    h('div', { class: 'row' }, h('button', { text: 'Clear finished', onclick: () => safe(() => call('jobs:clear')) })),
    jobs.length ? h('table', {},
      h('thead', {}, h('tr', {}, ['Item', 'Status', 'Progress', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, jobs.slice().reverse().map((j) => h('tr', {},
        h('td', { text: j.label }),
        h('td', {}, j.status === 'failed' ? h('span', { class: 'err', text: `failed: ${j.error}` }) : j.status),
        h('td', {}, j.status === 'downloading' && j.total ? h('div', { class: 'progress' }, h('div', { style: `width:${Math.min(100, (j.received / j.total) * 100)}%` })) : j.status === 'downloading' ? `${fmtKb(Math.round(j.received / 1024))}` : ''),
        h('td', {}, (j.status === 'waiting' || (j.status === 'downloading' && j.label.startsWith('Patreon:'))) ? h('button', { text: 'Cancel', onclick: () => safe(() => call('jobs:cancel', j.id)) }) : null)))))
      : h('div', { class: 'empty', text: 'Nothing downloaded yet.' }));
}

async function renderDllFixPanel() {
  const box = document.getElementById('dllfixbox');
  if (!box) return;
  box.replaceChildren(h('div', { class: 'hint', text: 'Checking…' }));
  let st;
  try {
    st = await call('dllfix:status');
  } catch (e) {
    box.replaceChildren(h('div', { class: 'hint err', text: e.message }));
    return;
  }
  if (!st.ok) {
    box.replaceChildren(h('div', { class: 'hint err', text: st.reason }));
    return;
  }
  box.replaceChildren(
    h('div', { class: st.applied ? 'hint' : 'hint err', text: st.applied ? '✔ Fix is applied.' : '✖ Fix is not applied.' }),
    h('div', { class: 'row' },
      h('button', { text: st.applied ? 'Re-apply fix' : 'Apply fix', onclick: () => safe(async () => {
        await call('dllfix:apply'); toast('Assembly-CSharp.dll replaced. Restart the game if it is running.'); renderDllFixPanel();
      }) }),
      st.hasBackup ? h('button', { text: 'Revert to original', onclick: () => safe(async () => {
        await call('dllfix:revert'); toast('Original Assembly-CSharp.dll restored.'); renderDllFixPanel();
      }) }) : null));
}

async function renderFirewallPanel() {
  const box = document.getElementById('firewallbox');
  if (!box) return;
  box.replaceChildren(h('div', { class: 'hint', text: 'Checking\u2026' }));
  let st;
  try {
    st = await call('firewall:status');
  } catch (e) {
    box.replaceChildren(h('div', { class: 'hint err', text: e.message }));
    return;
  }
  if (!st.supported) {
    box.replaceChildren(h('div', { class: 'hint', text: 'Security mode uses Windows Firewall rules and is only available on Windows.' }));
    return;
  }
  box.replaceChildren(
    h('div', { class: st.active ? 'hint' : 'hint', text: st.active ? '\u2714 People Playground is network-isolated.' : 'People Playground has normal network access.' }),
    h('div', { class: 'row' },
      h('button', { class: st.active ? '' : 'primary', text: 'Turn on (block network)', disabled: st.active, onclick: () => safe(async () => {
        clippy.say('Windows will ask you to approve an administrator prompt \u2014 that\u2019s to create the firewall rule.', 12000);
        await call('firewall:enable'); toast('People Playground is now blocked from the network.'); renderFirewallPanel();
      }) }),
      h('button', { text: 'Turn off', disabled: !st.active, onclick: () => safe(async () => {
        clippy.say('Windows will ask you to approve an administrator prompt \u2014 that\u2019s to remove the firewall rule.', 12000);
        await call('firewall:disable'); toast('Network access restored.'); renderFirewallPanel();
      }) })));
}

async function renderSettings() {
  state.settings = await call('settings:get');
  const s = state.settings;
  const f = {
    ppGameDir: h('input', { type: 'text', value: s.ppGameDir, placeholder: 'e.g. C:\\Program Files (x86)\\Steam\\steamapps\\common\\People Playground' }),
    launchMode: h('select', {},
      h('option', { value: 'exe', text: 'Directly (People Playground.exe)', selected: s.launchMode !== 'steam' }),
      h('option', { value: 'steam', text: 'Through Steam', selected: s.launchMode === 'steam' })),
    downloadsWatchDir: h('input', { type: 'text', value: s.downloadsWatchDir, placeholder: s.effectiveDownloadsDir }),
    ppModsDir: h('input', { type: 'text', value: s.ppModsDir, placeholder: s.effectiveModsDir }),
    nexusGameDomain: h('input', { type: 'text', value: s.nexusGameDomain }),
    nexusApiKey: h('input', { type: 'password', placeholder: s.hasNexusKey ? '(saved, leave blank to keep)' : 'personal API key' }),
    patreonCookie: h('input', { type: 'password', placeholder: s.hasPatreonCookie ? '(saved, leave blank to keep)' : 'session_id=…' }),
  };
  const check = async () => {
    const r = await call('game:validate', f.ppGameDir.value.trim());
    const el = document.getElementById('gamecheck');
    if (el) { el.textContent = r.ok ? '✔ Game found' : `✖ ${r.reason}`; el.className = r.ok ? '' : 'err'; }
  };
  f.ppGameDir.addEventListener('change', check);
  const del = h('input', { type: 'checkbox', id: 'delzips', checked: s.deleteArchivesAfterInstall === 'true' });
  const field = (label, key, hint) => [h('label', { text: label }), f[key], hint ? h('div', { class: 'hint', text: hint }) : null];
  view().replaceChildren(
    h('div', { class: 'panel' }, h('h3', { text: 'Game' }),
      ...field('People Playground game folder', 'ppGameDir', 'The "People Playground" folder inside Steam\\steamapps\\common.'),
      ...field('Play button launches', 'launchMode', 'Directly starts the exe from the game folder without Steam. Through Steam uses your Steam client.'),
      h('div', { class: 'row' },
        h('button', { text: 'Browse…', onclick: () => safe(async () => { const d = await call('app:pickFolder'); if (d) { f.ppGameDir.value = d; check(); } }) }),
        h('button', { text: 'Auto-detect', onclick: () => safe(async () => { const d = await call('game:detect'); if (d) { f.ppGameDir.value = d; check(); } else toast('Could not find it in your Steam libraries. Use Browse.', 'error'); }) }),
        h('span', { id: 'gamecheck' })),
      ...field('People Playground mods folder', 'ppModsDir', `Default: ${s.effectiveModsDir} (the Mods folder inside the game folder)`),
      h('div', { class: 'row' }, h('button', { text: 'Browse…', onclick: () => safe(async () => { const d = await call('app:pickFolder'); if (d) f.ppModsDir.value = d; }) }))),
    h('div', { class: 'panel' }, h('h3', { text: 'Bug fixes' }),
      h('div', { class: 'hint', text: 'The latest People Playground update shipped a broken Assembly-CSharp.dll that stops mods from working. This replaces it with a fixed copy bundled with Clippy Mod Manager.' }),
      h('div', { id: 'dllfixbox' })),
    h('div', { class: 'panel' }, h('h3', { text: 'Security mode' }, alpha()),
      h('div', { class: 'hint', text: 'Blocks People Playground.exe from the network entirely (Windows Firewall), in case a future update or mod tries to phone home. Needs an administrator prompt to turn on or off, and stops the game from reaching Steam too \u2014 so Steam can\u2019t auto-update it while it\u2019s on, and you\u2019ll want "Launch directly" in Game settings above rather than "Through Steam".' }),
      h('div', { id: 'firewallbox' })),
    h('div', { class: 'panel' }, h('h3', { text: 'Installing' }),
      h('div', { class: 'row' }, del, h('label', { for: 'delzips', style: 'display:inline;margin:0', text: 'Delete downloaded archives (.zip/.7z/.rar) after they install' })),
      h('div', { class: 'hint', text: 'Only affects files downloaded through this app (Nexus and Patreon). Archives you add yourself with "Add archive" are never deleted.' })),
    h('div', { class: 'panel' }, h('h3', { text: 'Nexus Mods' }),
      ...field('Nexus game domain', 'nexusGameDomain', 'The part of the Nexus URL after nexusmods.com/'),
      ...field('API key', 'nexusApiKey'),
      ...field('Browser downloads folder', 'downloadsWatchDir', 'Where your browser saves files. Manual Nexus downloads are picked up from here.')),
    h('div', { class: 'panel' }, h('h3', { text: 'Patreon' }, alpha()),
      ...field('Cookie', 'patreonCookie', 'Copied from your logged-in browser session.')),
    h('div', { class: 'row' },
      h('button', { class: 'primary', text: 'Save', onclick: () => safe(async () => {
        await call('settings:set', { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), deleteArchivesAfterInstall: String(del.checked) });
        toast('Settings saved.'); refreshNexusStatus(); renderSettings();
      }) }),
      h('button', { text: 'Use this app for nxm:// links', onclick: () => safe(async () => { await call('app:registerNxm'); toast('Done. "Mod Manager Download" buttons now open here.'); }) }),
      h('button', { text: 'Bring back Clippy', onclick: () => { clippy.box.classList.remove('hidden'); clippy.next(); } })),
    s.secureStorage ? null : h('div', { class: 'hint err', text: 'Secure storage is unavailable on this system, so keys and cookies are saved unencrypted.' }));
  setStatus('Settings');
  if (s.ppGameDir) check();
  renderDllFixPanel();
  renderFirewallPanel();
}

window.cmm.on('jobs', (jobs) => { state.jobs = jobs; if (state.tab === 'downloads') renderDownloads(); const active = jobs.filter((j) => j.status === 'downloading' || j.status === 'installing').length; if (active) setStatus(`${active} download(s) in progress…`); });
window.cmm.on('library-changed', refreshLibrary);
window.cmm.on('clippy', (t) => clippy.say(t));
window.cmm.on('toast', (t) => toast(t.text, t.kind));
window.cmm.on('patreon-log', (line) => { state.patreonLog.push(line); const el = document.getElementById('plog'); if (el) { el.textContent += (el.textContent ? '\n' : '') + line; el.scrollTop = el.scrollHeight; } });

async function patreonLogin() {
  setStatus('Waiting for you to log in to Patreon\u2026');
  state.patreon.loggingIn = true;
  renderPatreon();
  try {
    await call('patreon:login');
    state.settings = await call('settings:get');
    clippy.say('Logged in to Patreon! Paste a post link to grab a mod.');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.patreon.loggingIn = false;
    renderPatreon();
  }
}

function showDiscordBanner() {
  const banner = h('div', { class: 'discord-banner' },
    h('span', { text: '\ud83c\udfae Join our Discord community!' }),
    h('button', { text: 'Join', onclick: () => safe(() => call('app:openDiscord')) }),
    h('button', { class: 'discord-close', text: '\u00d7', 'aria-label': 'Dismiss', onclick: (e) => e.currentTarget.closest('.discord-banner').remove() }),
  );
  document.querySelector('.window').prepend(banner);
}

(async function boot() {
  renderTabs();
  await safe(async () => { state.settings = await call('settings:get'); state.jobs = await call('jobs:list'); await refreshLibrary(); });
  render();
  refreshNexusStatus();
  showDiscordBanner();
  clippy.say('Hi! It looks like you\'re installing mods. Would you like help?');
})();
