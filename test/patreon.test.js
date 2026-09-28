const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const {
  runPatreonDownload, listArchives, normalizePatreonUrl, extractPostId, extractDownloadables, describeIncludedTypes, describeSkippedCandidates,
} = require('../src/core/patreon');
const { tmp } = require('./helpers');

function fakeBootstrap(overrides = {}) {
  return {
    data: { id: '164166583', attributes: { title: 'Age of Olympus' } },
    included: [
      { type: 'attachment', id: 'a1', attributes: { name: 'AgeOfOlympus.zip', url: 'https://c.patreon.com/files/AgeOfOlympus.zip' } },
      {
        type: 'media',
        id: 'm1',
        attributes: { file_name: 'preview.png', download_url: 'https://c.patreon.com/media/preview.png' },
      },
      { type: 'campaign', id: 'c1', attributes: { name: 'Voidanity Studios' } },
    ],
    ...overrides,
  };
}

function fakeFetch({ apiUrlPrefix = 'https://www.patreon.com/api/posts/', bootstrap = fakeBootstrap(), fileBytes = {}, apiStatus = 200 } = {}) {
  const seenRequests = [];
  const fetchImpl = async (url, opts) => {
    seenRequests.push({ url, opts });
    if (url.startsWith(apiUrlPrefix)) {
      return {
        ok: apiStatus >= 200 && apiStatus < 300,
        status: apiStatus,
        json: async () => bootstrap,
      };
    }
    const bytes = fileBytes[url];
    if (bytes === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, body: Readable.toWeb(Readable.from([Buffer.from(bytes)])) };
  };
  return { fetchImpl, seenRequests };
}

test('extractPostId pulls the numeric id out of a vanity-prefixed post link', () => {
  assert.equal(extractPostId('https://www.patreon.com/VoidanityStudios/posts/age-of-olympus-1-164166583'), '164166583');
});

test('extractPostId works on a bare post link with no title slug', () => {
  assert.equal(extractPostId('https://www.patreon.com/posts/164166583'), '164166583');
});

test('extractPostId returns null for a link that is not a specific post', () => {
  assert.equal(extractPostId('https://www.patreon.com/VoidanityStudios/posts'), null);
  assert.equal(extractPostId('https://www.patreon.com/VoidanityStudios'), null);
});

test('extractDownloadables pulls both the attachment and the media preview, with real filenames', () => {
  const files = extractDownloadables(fakeBootstrap());
  const byName = Object.fromEntries(files.map((f) => [f.filename, f]));
  assert.equal(byName['AgeOfOlympus.zip'].url, 'https://c.patreon.com/files/AgeOfOlympus.zip');
  assert.equal(byName['preview.png'].url, 'https://c.patreon.com/media/preview.png');
});

test('extractDownloadables falls back to the URL basename when a media item has no file_name', () => {
  const bootstrap = fakeBootstrap({
    included: [{ type: 'media', id: 'm2', attributes: { file_name: null, download_url: 'https://c.patreon.com/media/x/mystery-file.rar' } }],
  });
  const files = extractDownloadables(bootstrap);
  assert.equal(files[0].filename, 'mystery-file.rar');
});

test('requests the "attachments" relationship (plural) and its own sparse fieldset, not just "media"', async () => {
  const { fetchImpl, seenRequests } = fakeFetch({ fileBytes: { 'https://c.patreon.com/files/AgeOfOlympus.zip': 'z', 'https://c.patreon.com/media/preview.png': 'p' } });
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), fetchImpl });
  const apiCall = seenRequests.find((r) => r.url.startsWith('https://www.patreon.com/api/posts/'));
  const qs = new URL(apiCall.url).searchParams;
  assert.match(qs.get('include'), /\battachments\b/);
  assert.doesNotMatch(qs.get('include').replace('attachments_media', ''), /\battachment\b/);
  assert.ok(qs.get('fields[attachment]'), 'must request attachment attributes explicitly, or Patreon returns id/type-only stubs');
});

test('does not send json-api-use-default-includes, which was found to override the explicit include list entirely', async () => {
  const { fetchImpl, seenRequests } = fakeFetch({ fileBytes: { 'https://c.patreon.com/files/AgeOfOlympus.zip': 'z', 'https://c.patreon.com/media/preview.png': 'p' } });
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), fetchImpl });
  const apiCall = seenRequests.find((r) => r.url.startsWith('https://www.patreon.com/api/posts/'));
  const qs = new URL(apiCall.url).searchParams;
  assert.equal(qs.get('json-api-use-default-includes'), null);
});

test('extractDownloadables also accepts the plural "attachments" resource type', () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'x' } },
    included: [{ type: 'attachments', id: 'a1', attributes: { name: 'Mod.zip', url: 'https://c.patreon.com/files/Mod.zip' } }],
  };
  const files = extractDownloadables(bootstrap);
  assert.equal(files[0].filename, 'Mod.zip');
});

test('extractDownloadables falls back to download_url on an attachment with no plain url', () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'x' } },
    included: [{ type: 'attachment', id: 'a1', attributes: { name: 'Mod.zip', download_url: 'https://c.patreon.com/files/Mod.zip' } }],
  };
  const files = extractDownloadables(bootstrap);
  assert.equal(files[0].url, 'https://c.patreon.com/files/Mod.zip');
});

test('extractDownloadables ignores an included object with no attributes at all, instead of crashing', () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'x' } },
    included: [{ type: 'attachment', id: 'a1' }],
  };
  assert.deepEqual(extractDownloadables(bootstrap), []);
});

test('describeIncludedTypes reports what actually came back, to make a future mismatch debuggable', () => {
  const msg = describeIncludedTypes({
    data: { relationships: {} },
    included: [{ type: 'campaign', id: 'c1' }, { type: 'campaign', id: 'c2' }, { type: 'user', id: 'u1' }],
  });
  assert.match(msg, /campaign \(2\)/);
  assert.match(msg, /user \(1\)/);
});

test('describeIncludedTypes also reports the post\'s own declared relationships (ground truth, independent of what we asked to include)', () => {
  const msg = describeIncludedTypes({
    data: {
      relationships: {
        attachments: { data: [{ type: 'attachment', id: 'a1' }] },
        images: { data: [] },
        campaign: { data: { type: 'campaign', id: 'c1' } },
      },
    },
    included: [],
  });
  assert.match(msg, /attachments \(1\)/);
  assert.match(msg, /images \(0\)/);
  assert.match(msg, /campaign \(1\)/);
});

test('extractDownloadables also finds a metadata-nested download_url as a fallback candidate', () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'x' } },
    included: [{ type: 'media', id: 'm1', attributes: { file_name: 'x.zip', metadata: { download_url: 'https://c.patreon.com/x.zip' } } }],
  };
  assert.equal(extractDownloadables(bootstrap)[0].url, 'https://c.patreon.com/x.zip');
});

test('describeSkippedCandidates prints every attribute of a media/attachment object that had no usable url, for real debugging', () => {
  const bootstrap = {
    included: [{ type: 'media', id: 'm1', attributes: { file_name: null, image_urls: null, display: null, download_url: null, metadata: { size: 42 } } }],
  };
  const msg = describeSkippedCandidates(bootstrap);
  assert.match(msg, /media#m1/);
  assert.match(msg, /"size":42/);
});

test('describeSkippedCandidates returns null when there is no media/attachment object to inspect at all', () => {
  assert.equal(describeSkippedCandidates({ included: [{ type: 'campaign', id: 'c1', attributes: {} }] }), null);
});

test('when a post has a media object but no usable download field, it falls back to the /file endpoint', async () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'Mystery post' }, relationships: { media: { data: { type: 'media', id: 'm1' } } } },
    included: [{ type: 'media', id: 'm1', attributes: { file_name: null, weird_field: 'unexpected' } }],
  };
  const { fetchImpl } = fakeFetch({ bootstrap });
  const logs = [];
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), onLog: (l) => logs.push(l), fetchImpl });
  assert.ok(logs.some((l) => l.includes('file endpoint')));
});

test('when a post really has no downloadables, the log names whatever Patreon did include and the post\'s own relationships', async () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'Text-only update' }, relationships: { campaign: { data: { type: 'campaign', id: 'c1' } } } },
    included: [{ type: 'campaign', id: 'c1', attributes: {} }],
  };
  const { fetchImpl } = fakeFetch({ bootstrap });
  const logs = [];
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), onLog: (l) => logs.push(l), fetchImpl });
  assert.ok(logs.some((l) => l.includes('campaign (1)') && l.includes('relationships')));
});

test('runPatreonDownload downloads every file to outDir and logs progress', async () => {
  const outDir = tmp();
  const { fetchImpl } = fakeFetch({
    fileBytes: {
      'https://c.patreon.com/files/AgeOfOlympus.zip': 'zip-bytes',
      'https://c.patreon.com/media/preview.png': 'png-bytes',
    },
  });
  const logs = [];
  await runPatreonDownload({
    url: 'https://www.patreon.com/VoidanityStudios/posts/age-of-olympus-1-164166583',
    cookie: 'session_id=abc',
    outDir,
    onLog: (l) => logs.push(l),
    fetchImpl,
  });
  assert.equal(fs.readFileSync(path.join(outDir, 'AgeOfOlympus.zip'), 'utf8'), 'zip-bytes');
  assert.equal(fs.readFileSync(path.join(outDir, 'preview.png'), 'utf8'), 'png-bytes');
  assert.ok(logs.some((l) => l.includes('Age of Olympus')));
  assert.ok(logs.some((l) => l.includes('Done')));
});

test('sends the cookie and user agent on every request, including file downloads', async () => {
  const { fetchImpl, seenRequests } = fakeFetch({ fileBytes: { 'https://c.patreon.com/files/AgeOfOlympus.zip': 'z', 'https://c.patreon.com/media/preview.png': 'p' } });
  await runPatreonDownload({
    url: 'https://www.patreon.com/posts/164166583', cookie: 'session_id=abc', outDir: tmp(), userAgent: 'MyUA/1', fetchImpl,
  });
  assert.ok(seenRequests.length >= 3);
  for (const { opts } of seenRequests) {
    assert.equal(opts.headers.Cookie, 'session_id=abc');
    assert.equal(opts.headers['User-Agent'], 'MyUA/1');
  }
});

test('rejects with a clear message when the link is not a specific post', async () => {
  await assert.rejects(
    runPatreonDownload({ url: 'https://www.patreon.com/VoidanityStudios/posts', cookie: 'c', outDir: tmp(), fetchImpl: fakeFetch().fetchImpl }),
    /doesn't look like a link to a specific Patreon post/,
  );
});

test('rejects with a clear message when Patreon responds with a non-OK status', async () => {
  const { fetchImpl } = fakeFetch({ apiStatus: 401 });
  await assert.rejects(
    runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), fetchImpl }),
    /HTTP 401/,
  );
});

test('rejects when Patreon returns no usable post data', async () => {
  const { fetchImpl } = fakeFetch({ bootstrap: { data: null, included: [] } });
  await assert.rejects(
    runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), fetchImpl }),
    /didn't return any post data/,
  );
});

test('logs (rather than throws) when an individual file fails to download, and still finishes', async () => {
  const outDir = tmp();
  const { fetchImpl } = fakeFetch({ fileBytes: { 'https://c.patreon.com/media/preview.png': 'p' } });
  const logs = [];
  await runPatreonDownload({
    url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir, onLog: (l) => logs.push(l), fetchImpl,
  });
  assert.ok(logs.some((l) => l.includes('Failed to download AgeOfOlympus.zip')));
  assert.equal(fs.readFileSync(path.join(outDir, 'preview.png'), 'utf8'), 'p');
});

test('aborting via an already-aborted signal rejects with Cancelled before downloading anything', async () => {
  const controller = new AbortController();
  controller.abort();
  const { fetchImpl, seenRequests } = fakeFetch({ fileBytes: { 'https://c.patreon.com/files/AgeOfOlympus.zip': 'z', 'https://c.patreon.com/media/preview.png': 'p' } });
  await assert.rejects(
    runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir: tmp(), signal: controller.signal, fetchImpl }),
    /Cancelled/,
  );
  assert.equal(seenRequests.length, 1);
});

test('listArchives finds archives recursively and ignores other files', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'a/b'), { recursive: true });
  fs.writeFileSync(path.join(d, 'a/b/m.7z'), '');
  fs.writeFileSync(path.join(d, 'a/notes.txt'), '');
  assert.deepEqual(listArchives(d).map((p) => path.basename(p)), ['m.7z']);
});

test('normalizePatreonUrl strips the creator vanity segment from a real post link', () => {
  assert.equal(
    normalizePatreonUrl('https://www.patreon.com/VoidanityStudios/posts/age-of-olympus-1-164166583'),
    'https://www.patreon.com/posts/age-of-olympus-1-164166583',
  );
});

test('normalizePatreonUrl leaves a bare post URL unchanged', () => {
  assert.equal(normalizePatreonUrl('https://www.patreon.com/posts/1'), 'https://www.patreon.com/posts/1');
});

test('normalizePatreonUrl leaves a creator post-listing URL unchanged', () => {
  assert.equal(normalizePatreonUrl('https://www.patreon.com/VoidanityStudios/posts'), 'https://www.patreon.com/VoidanityStudios/posts');
});

test('normalizePatreonUrl leaves shop links unchanged', () => {
  assert.equal(
    normalizePatreonUrl('https://www.patreon.com/VoidanityStudios/shop/some-item-42'),
    'https://www.patreon.com/VoidanityStudios/shop/some-item-42',
  );
});

test('normalizePatreonUrl leaves non-Patreon URLs alone', () => {
  assert.equal(normalizePatreonUrl('https://example.com/posts/foo-1'), 'https://example.com/posts/foo-1');
});

test('falls back to the /file endpoint when media has no URLs', () => {
  const { extractFileEndpointLinks } = require('../src/core/patreon');
  const bootstrap = {
    data: { relationships: { attachments_media: { data: [{ id: '700985572', type: 'media' }] } },
      attributes: { attachments_preview_metadata: [{ file_name: 'gods - Copy (2).zip' }] } },
    included: [{ type: 'media', id: '700985572', attributes: { file_name: 'gods - Copy (2).zip', display: { state: 'ready' } } }],
  };
  const out = extractFileEndpointLinks(bootstrap, '164166583');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, 'https://www.patreon.com/file?h=164166583&m=700985572');
  assert.ok(out[0].fallbackUrls.includes('https://www.patreon.com/file?h=164166583&i=700985572'));
  assert.strictEqual(out[0].filename, 'gods - Copy (2).zip');
});

test('file endpoint fallback works when the relationship is named "media"', () => {
  const { extractFileEndpointLinks } = require('../src/core/patreon');
  const bootstrap = {
    data: { relationships: { audio: { data: null }, images: { data: [] }, media: { data: [{ id: '700985572', type: 'media' }] } }, attributes: {} },
    included: [{ type: 'media', id: '700985572', attributes: { file_name: 'gods - Copy (2).zip' } }],
  };
  const out = extractFileEndpointLinks(bootstrap, '164166583');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, 'https://www.patreon.com/file?h=164166583&m=700985572');
  assert.ok(out[0].fallbackUrls.includes('https://www.patreon.com/file?h=164166583&i=700985572'));
  assert.strictEqual(out[0].filename, 'gods - Copy (2).zip');
});

test('downloadFetchImpl is used for file downloads with session cookies and no manual Cookie header', async () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'Post' }, relationships: { media: { data: [{ id: '700985572', type: 'media' }] } } },
    included: [{ type: 'media', id: '700985572', attributes: { file_name: 'mod.zip' } }],
  };
  const { fetchImpl } = fakeFetch({ bootstrap });
  const seen = [];
  const downloadFetchImpl = async (u, o) => { seen.push({ u, o }); return { ok: true, status: 200, headers: { get: () => 'application/zip' }, body: new Response('zip').body }; };
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'session_id=abc', outDir: tmp(), fetchImpl, downloadFetchImpl });
  assert.equal(seen[0].u, 'https://www.patreon.com/file?h=164166583&m=700985572');
  assert.equal(seen[0].o.credentials, 'include');
  assert.equal(seen[0].o.headers.Cookie, undefined);
});

test('falls back to the browser download when the direct request is blocked', async () => {
  const bootstrap = {
    data: { id: '1', attributes: { title: 'Post' }, relationships: { media: { data: [{ id: '700985572', type: 'media' }] } } },
    included: [{ type: 'media', id: '700985572', attributes: { file_name: 'mod.zip' } }],
  };
  const { fetchImpl } = fakeFetch({ bootstrap });
  const blocked = async () => ({ ok: false, status: 403, headers: { get: () => null } });
  const calls = [];
  const browserDownloadImpl = async (u, dest) => { calls.push({ u, dest }); fs.writeFileSync(dest, 'zip'); };
  const logs = [];
  const outDir = tmp();
  await runPatreonDownload({ url: 'https://www.patreon.com/posts/164166583', cookie: 'c', outDir, fetchImpl, downloadFetchImpl: blocked, browserDownloadImpl, onLog: (l) => logs.push(l) });
  assert.equal(calls[0].u, 'https://www.patreon.com/file?h=164166583&m=700985572');
  assert.ok(fs.existsSync(path.join(outDir, 'mod.zip')));
  assert.ok(logs.some((l) => l.startsWith('Saved mod.zip')));
});
