const test = require('node:test');
const assert = require('node:assert/strict');
const { TopModsClient, TopModsError, parseModCards, LISTS } = require('../src/core/topmods');

function fakeFetch(handler) {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    const { status = 200, html = '' } = handler(String(url));
    return { ok: status < 400, status, text: async () => html };
  };
  f.calls = calls;
  return f;
}

const SAMPLE_CARD = (n) => `
  <div class="content_list_item mods_list_item">
    <div class="photo normal">
      <a href="/mods/people-playground/npc/${n}-mod-${n}.html">
        <img src="/upload/mod-${n}.webp" title="Mod ${n}" alt="Mod ${n}" class="img-fluid" />
      </a>
    </div>
    <div class="fields">
      <div class="field ft_caption f_title">
        <h2 class="value">
          <a href="/mods/people-playground/npc/${n}-mod-${n}.html">Mod ${n} for People Playground</a>
        </h2>
      </div>
    </div>
  </div>
`;

test('parseModCards extracts title, url and thumbnail, deduping the two links per card', () => {
  const html = SAMPLE_CARD(1) + SAMPLE_CARD(2);
  const mods = parseModCards(html, 'https://top-mods.com');
  assert.equal(mods.length, 2);
  assert.equal(mods[0].title, 'Mod 1 for People Playground');
  assert.equal(mods[0].url, 'https://top-mods.com/mods/people-playground/npc/1-mod-1.html');
  assert.equal(mods[0].thumbnail, '/upload/mod-1.webp');
});

test('parseModCards handles a real top-mods.com card verbatim', () => {
  const html = `
    <div class="content_list_item mods_list_item">
      <div style="position: relative;" class="photo normal">
        <a href="/mods/people-playground/military-vehicle/16232-panzerhaubitze-2000.html">
          <img src="/upload/011/u1103/d/1/b107db40.webp" title="Panzerhaubitze-2000" alt="Panzerhaubitze-2000"  class="img-fluid " />
        </a>
      </div>
      <div class="fields">
        <div class="field ft_caption f_title">
          <h2 class="value">
            <a href="/mods/people-playground/military-vehicle/16232-panzerhaubitze-2000.html">
              Panzerhaubitze-2000 for People Playground
            </a>
          </h2>
        </div>
        <div class="field ft_html f_content">
          <div class="value">Panzerhaubitze-2000 &mdash; German self-propelled gun.</div>
        </div>
      </div>
    </div>
  `;
  const mods = parseModCards(html, 'https://top-mods.com');
  assert.equal(mods.length, 1);
  assert.equal(mods[0].title, 'Panzerhaubitze-2000 for People Playground');
  assert.equal(mods[0].url, 'https://top-mods.com/mods/people-playground/military-vehicle/16232-panzerhaubitze-2000.html');
  assert.equal(mods[0].thumbnail, '/upload/011/u1103/d/1/b107db40.webp');
});

test('parseModCards decodes HTML entities in titles', () => {
  const html = `<a href="/mods/people-playground/npc/1-x.html"><img src="t.webp" alt="Cars &amp; Trucks"></a>`;
  const mods = parseModCards(html, 'https://top-mods.com');
  assert.equal(mods[0].title, 'Cars & Trucks');
});

test('parseModCards ignores links that are not mod detail pages', () => {
  const html = `<a href="/auth/login">Log in</a>` + SAMPLE_CARD(1);
  const mods = parseModCards(html, 'https://top-mods.com');
  assert.equal(mods.length, 1);
});

test('list() fetches the right path per kind and returns parsed mods', async () => {
  const f = fakeFetch(() => ({ html: SAMPLE_CARD(1) }));
  const c = new TopModsClient({ fetchImpl: f });
  const mods = await c.list('downloaded');
  assert.equal(mods.length, 1);
  assert.equal(f.calls[0], 'https://top-mods.com' + LISTS.downloaded('people-playground'));
});

test('list() rejects an unknown kind', async () => {
  const c = new TopModsClient({ fetchImpl: fakeFetch(() => ({ html: '' })) });
  await assert.rejects(c.list('bogus'), TopModsError);
});

test('list() throws when the page has no recognizable mod cards', async () => {
  const c = new TopModsClient({ fetchImpl: fakeFetch(() => ({ html: '<html>nothing here</html>' })) });
  await assert.rejects(c.list('newest'), TopModsError);
});

test('list() throws a clear error on a non-OK response', async () => {
  const c = new TopModsClient({ fetchImpl: fakeFetch(() => ({ status: 500, html: '' })) });
  await assert.rejects(c.list('newest'), (e) => e instanceof TopModsError && /HTTP 500/.test(e.message));
});
